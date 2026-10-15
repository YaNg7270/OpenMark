/**
 * Runtime type guards for values whose shape is not known at compile time.
 *
 * Everything reaching the app from outside the type system — parsed JSON, persisted
 * `localStorage` state, a Tauri IPC payload — has to be checked before use, and doing that
 * check at each call site produces a scatter of near-identical predicates that drift apart.
 * One canonical guard lives here instead.
 *
 * These are deliberately minimal: they prove *that a value is an object*, and nothing about
 * its fields. Field-level validation stays at the boundary that knows the contract, where it
 * can read each property with a `typeof` check and produce a fully typed result.
 */

/** True for a non-null, non-array object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a string that is present and non-empty. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** True for a finite number, which excludes `NaN` and the infinities JSON can smuggle in. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
