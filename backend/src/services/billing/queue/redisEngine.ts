import { logger } from '../../../config/logger';
import { JobsEngine, JobHandler, JobOpts } from './engine';

/**
 * Optional Redis/BullMQ engine for horizontal scale (multiple worker processes).
 * Only loaded when QUEUE_DRIVER=redis. ioredis and bullmq are imported lazily so
 * the default no-Redis path never touches them.
 */
export class RedisEngine implements JobsEngine {
  readonly kind = 'redis' as const;
  private queue: any = null;
  private worker: any = null;
  private connection: any = null;
  private readonly queueName = 'railpoint-billing';

  constructor(private redisUrl: string) {}

  private async ensureQueue() {
    if (this.queue) return this.queue;
    const { Queue } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    });
    return this.queue;
  }

  startWorker(handler: JobHandler): void {
    void (async () => {
      const { Worker } = await import('bullmq');
      const IORedis = (await import('ioredis')).default;
      const connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
      this.worker = new Worker(
        this.queueName,
        async (job: any) => handler(job.name, job.data),
        { connection, concurrency: 5 }
      );
      this.worker.on('failed', (job: any, err: any) =>
        logger.error({ id: job?.id, name: job?.name, err: err?.message }, 'Job failed')
      );
      logger.info({ queue: this.queueName }, 'Redis/BullMQ worker started');
    })();
  }

  async add(name: string, data: any, opts: JobOpts = {}): Promise<void> {
    const q = await this.ensureQueue();
    await q.add(name, data, { jobId: opts.jobId, delay: opts.delay });
  }

  async registerRepeatable(name: string, everyMs: number): Promise<void> {
    const q = await this.ensureQueue();
    await q.add(name, {}, { repeat: { every: everyMs }, jobId: `${name}-repeatable`, removeOnComplete: true, removeOnFail: true });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit?.();
  }
}
