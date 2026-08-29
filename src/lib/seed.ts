/**
 * Deterministic pseudo-randomness derived from a string.
 *
 * Every visual that needs to look arbitrary but stay put across renders and
 * reloads — a shroud's shape, an orb's animation phase, where a residue sits —
 * derives from an id through here rather than from `Math.random()`.
 */

/** Sums a string's char codes. Small, stable, and good enough for visuals only. */
export function stringSeed(value: string): number {
  let total = 0
  for (const character of value) total += character.charCodeAt(0)
  return total
}

/** A stable integer in `[0, modulo)` for the given string. */
export function seededIndex(value: string, modulo: number): number {
  return stringSeed(value) % modulo
}
