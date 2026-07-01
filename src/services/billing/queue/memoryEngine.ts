import { logger } from '../../../config/logger';
import { JobsEngine, JobHandler, JobOpts } from './engine';

interface PendingJob {
  name: string;
  data: any;
  opts: JobOpts;
}

/**
 * In-process job engine. Delayed jobs use `setTimeout`; the repeatable tick uses
 * `setInterval`. Deterministic `jobId`s collapse duplicates while a job is
 * pending/running (exactly like BullMQ). No external services required.
 *
 * Because it is in-process, the producer (API) and the consumer (worker logic)
 * must live in the same Node process — which is how Railpoint runs in the
 * default no-Redis mode (see server.ts).
 */
export class MemoryEngine implements JobsEngine {
  readonly kind = 'memory' as const;
  private handler: JobHandler | null = null;
  private active = new Set<string>(); // jobIds currently pending/running
  private buffered: PendingJob[] = []; // jobs added before a handler was set
  private timers = new Set<NodeJS.Timeout>();

  startWorker(handler: JobHandler): void {
    this.handler = handler;
    const toFlush = this.buffered;
    this.buffered = [];
    for (const j of toFlush) void this.add(j.name, j.data, j.opts);
  }

  async add(name: string, data: any, opts: JobOpts = {}): Promise<void> {
    if (!this.handler) {
      this.buffered.push({ name, data, opts });
      return;
    }
    const jobId = opts.jobId;
    if (jobId) {
      if (this.active.has(jobId)) {
        logger.debug({ jobId }, 'memory-queue: duplicate jobId collapsed');
        return;
      }
      this.active.add(jobId);
    }

    const run = async () => {
      try {
        await this.handler!(name, data);
      } catch (err: any) {
        logger.error({ name, jobId, err: err?.message }, 'memory-queue: job failed');
      } finally {
        if (jobId) this.active.delete(jobId);
      }
    };

    const delay = Math.max(0, opts.delay ?? 0);
    const t = setTimeout(() => {
      this.timers.delete(t);
      void run();
    }, delay);
    // Do not keep the event loop alive purely for a pending job (helps tests).
    if (typeof t.unref === 'function') t.unref();
    this.timers.add(t);
  }

  async registerRepeatable(name: string, everyMs: number): Promise<void> {
    const i = setInterval(() => {
      if (this.handler) void this.handler(name, {}).catch((err) => logger.error({ err: err?.message }, 'tick failed'));
    }, everyMs);
    if (typeof i.unref === 'function') i.unref();
    this.timers.add(i);
  }

  async close(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.active.clear();
  }
}
