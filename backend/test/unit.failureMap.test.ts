import { mapFailureReason, isHardCardError } from '../src/services/nomba/failureMap';
import { toNombaAmount, fromNombaAmount } from '../src/services/nomba/amount';

describe('failure reason mapping', () => {
  it('maps insufficient funds (soft) from message and code', () => {
    expect(mapFailureReason('Insufficient funds', '51')).toBe('insufficient_funds');
    expect(mapFailureReason('low balance', '')).toBe('insufficient_funds');
    expect(isHardCardError('insufficient_funds')).toBe(false);
  });

  it('maps hard card errors', () => {
    expect(mapFailureReason('Expired card', '54')).toBe('card_error');
    expect(mapFailureReason('Do not honor', '05')).toBe('do_not_honor');
    expect(isHardCardError('card_error')).toBe(true);
    expect(isHardCardError('do_not_honor')).toBe(true);
  });

  it('maps timeout and unknown', () => {
    expect(mapFailureReason('payment timed out', '')).toBe('timeout');
    expect(mapFailureReason('some weird thing', '')).toBe('unknown');
  });
});

describe('naira amount formatting (NOT kobo)', () => {
  it('formats to a 2dp naira decimal string', () => {
    expect(toNombaAmount(10000)).toBe('10000.00');
    expect(toNombaAmount(2500)).toBe('2500.00');
  });
  it('parses naira decimal strings back to whole naira', () => {
    expect(fromNombaAmount('5000.00')).toBe(5000);
    expect(fromNombaAmount(2500)).toBe(2500);
  });
});
