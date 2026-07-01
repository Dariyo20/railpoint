/**
 * Nomba amounts are NAIRA decimal strings (e.g. "10000.00"), NOT kobo.
 * We store whole-naira integers internally and format here at the boundary.
 */
export function toNombaAmount(naira: number): string {
  return naira.toFixed(2);
}

export function fromNombaAmount(value: string | number): number {
  return Math.round(Number(value));
}
