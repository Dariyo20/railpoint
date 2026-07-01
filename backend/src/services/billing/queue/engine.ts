/**
 * Job engine abstraction. Railpoint runs WITHOUT Redis by default using an
 * in-process memory engine (setTimeout/setInterval). A Redis/BullMQ engine is
 * available as an optional scale-up (multiple worker processes) but is never
 * required to run or demo the system.
 */

export interface JobOpts {
  delay?: number; // ms
  jobId?: string; // deterministic id -> duplicates collapse
}

export type JobHandler = (name: string, data: any) => Promise<void>;

export interface JobsEngine {
  readonly kind: 'memory' | 'redis';
  /** Register the single handler that processes all job names. */
  startWorker(handler: JobHandler): void;
  add(name: string, data: any, opts?: JobOpts): Promise<void>;
  registerRepeatable(name: string, everyMs: number): Promise<void>;
  close(): Promise<void>;
}
