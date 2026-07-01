import { Queue, JobsOptions } from 'bullmq';
import { sharedRedis } from '../../redis/connection';

export const BILLING_QUEUE = 'railpoint-billing';

// Job names handled by the worker.
export const JOB = {
  TICK: 'billing-tick',
  CHARGE_CYCLE: 'charge-cycle',
  RECOVERY_ATTEMPT: 'recovery-attempt',
} as const;

export interface ChargeCycleJob {
  cycleId: string;
  attemptNumber: number; // 1 = initial scheduled charge
}

export interface RecoveryAttemptJob {
  cycleId: string;
  attemptNumber: number; // 2..N
}

let queue: Queue | null = null;

export function billingQueue(): Queue {
  if (!queue) {
    queue = new Queue(BILLING_QUEUE, {
      connection: sharedRedis(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3, // retries on TRANSPORT errors (declines are not thrown)
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return queue;
}

// ─── Deterministic jobIds so duplicate enqueues collapse ────────────────────
export const chargeCycleJobId = (cycleId: string, attempt: number) => `charge:${cycleId}:${attempt}`;
export const recoveryJobId = (cycleId: string, attempt: number) => `recovery:${cycleId}:${attempt}`;

export async function enqueueChargeCycle(job: ChargeCycleJob, opts: JobsOptions = {}): Promise<void> {
  await billingQueue().add(JOB.CHARGE_CYCLE, job, {
    jobId: chargeCycleJobId(job.cycleId, job.attemptNumber),
    ...opts,
  });
}

export async function enqueueRecoveryAttempt(
  job: RecoveryAttemptJob,
  opts: JobsOptions = {}
): Promise<void> {
  await billingQueue().add(JOB.RECOVERY_ATTEMPT, job, {
    jobId: recoveryJobId(job.cycleId, job.attemptNumber),
    ...opts,
  });
}
