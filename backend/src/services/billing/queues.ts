import { jobsEngine, JobOpts } from './queue';

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

// ─── Deterministic jobIds so duplicate enqueues collapse ────────────────────
export const chargeCycleJobId = (cycleId: string, attempt: number) => `charge:${cycleId}:${attempt}`;
export const recoveryJobId = (cycleId: string, attempt: number) => `recovery:${cycleId}:${attempt}`;

export async function enqueueChargeCycle(job: ChargeCycleJob, opts: JobOpts = {}): Promise<void> {
  await jobsEngine().add(JOB.CHARGE_CYCLE, job, {
    jobId: chargeCycleJobId(job.cycleId, job.attemptNumber),
    ...opts,
  });
}

export async function enqueueRecoveryAttempt(job: RecoveryAttemptJob, opts: JobOpts = {}): Promise<void> {
  await jobsEngine().add(JOB.RECOVERY_ATTEMPT, job, {
    jobId: opts.jobId !== undefined ? opts.jobId : recoveryJobId(job.cycleId, job.attemptNumber),
    ...opts,
  });
}
