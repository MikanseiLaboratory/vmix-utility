/**
 * Value builders for seek commands.
 *
 * vMix's `SetPosition` takes whole milliseconds. A fractional value (which the
 * page produces naturally, because a frame is 1000/30 ms) makes the vMix HTTP
 * API answer with HTTP 500, so every seek payload goes through these helpers.
 */

/** Absolute position in milliseconds, rounded and never negative. */
export function seekMillis(millis: number): string {
  return String(Math.max(0, Math.round(millis)));
}

/**
 * Relative correction such as `+=33`. Keeps vMix's prefix and never emits a
 * zero-length step, which would be a no-op instead of a correction.
 */
export function seekRelative(sign: '+=' | '-=', millis: number): string {
  return `${sign}${Math.max(1, Math.round(Math.abs(millis)))}`;
}
