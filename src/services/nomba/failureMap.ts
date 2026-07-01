import { FailureReason } from '../../models/Charge';

/**
 * Map a Nomba charge response (message / code) onto a normalized failure
 * reason. The Smart Recovery engine branches on `insufficient_funds`
 * (soft -> keep retrying) vs the hard card errors (-> stop card retries,
 * go to virtual-account fallback).
 *
 * Nomba's tokenized-charge response is `{ status, message }`; ISO-8583 style
 * response codes also surface on webhook transactions (e.g. "51" = insufficient).
 */
export function mapFailureReason(message?: string | null, code?: string | null): FailureReason {
  const m = (message ?? '').toLowerCase();
  const c = (code ?? '').trim();

  // Response-code based (when available, e.g. from webhook responseCode).
  if (c === '51') return 'insufficient_funds';
  if (c === '54' || c === '14' || c === '57') return 'card_error'; // expired / invalid / not permitted
  if (c === '05' || c === '91') return 'do_not_honor';

  // Message based.
  if (/insufficient|not enough|no fund|low balance/.test(m)) return 'insufficient_funds';
  if (/do not honou?r/.test(m)) return 'do_not_honor';
  if (/expired|invalid card|blocked|restricted|stolen|lost|pick ?up|card error/.test(m))
    return 'card_error';
  if (/timed out|timeout|otp/.test(m)) return 'timeout';

  return 'unknown';
}

/**
 * Is this failure a "hard" card problem that should skip straight to the
 * virtual-account fallback rather than scheduling more card retries?
 */
export function isHardCardError(reason: FailureReason): boolean {
  return reason === 'card_error' || reason === 'do_not_honor';
}
