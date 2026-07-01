import { buildRecoverySchedule, nextPayday } from '../src/services/billing/recovery';

const DAY = 24 * 3600 * 1000;

describe('payday-aware recovery scheduling', () => {
  it('computes the next payday strictly after now', () => {
    // June 10, payday 25 -> June 25 (this month, still ahead)
    expect(nextPayday(new Date('2026-06-10T08:00:00Z'), 25).getUTCMonth()).toBe(5); // June
    // June 30, payday 25 -> July 25 (June 25 already passed)
    expect(nextPayday(new Date('2026-06-30T08:00:00Z'), 25).getUTCMonth()).toBe(6); // July
  });

  it('anchors attempt 2 on payday when payday is inside the window, then +2d steps', () => {
    const now = new Date('2026-06-20T08:00:00Z');
    const deadline = new Date(now.getTime() + 10 * DAY);
    const sched = buildRecoverySchedule(now, deadline, 25);
    expect(sched.map((s) => s.attemptNumber)).toEqual([2, 3, 4]);
    // attempt 2 lands on the 25th (payday)
    expect(sched[0].scheduledFor.getUTCDate()).toBe(25);
    // strictly increasing, all within the window
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].scheduledFor.getTime()).toBeGreaterThan(sched[i - 1].scheduledFor.getTime());
      expect(sched[i].scheduledFor.getTime()).toBeLessThanOrEqual(deadline.getTime());
    }
  });

  it('never collapses attempts onto one timestamp when payday is beyond the window', () => {
    const now = new Date('2026-06-30T08:00:00Z'); // payday 25 already passed -> next is 25 days out
    const deadline = new Date(now.getTime() + 10 * DAY); // 10-day window
    const sched = buildRecoverySchedule(now, deadline, 25);
    const times = sched.map((s) => s.scheduledFor.getTime());
    expect(new Set(times).size).toBe(times.length); // all distinct
    times.forEach((t) => {
      expect(t).toBeGreaterThan(now.getTime());
      expect(t).toBeLessThanOrEqual(deadline.getTime());
    });
  });
});
