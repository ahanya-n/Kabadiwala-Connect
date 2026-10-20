/**
 * Client-generated idempotency keys for state-changing requests, same
 * pattern as the Flutter app's IdempotencyKeyGenerator: a screen
 * generates ONE key when an attempt begins and reuses it for retries of
 * that same attempt. `crypto.randomUUID()` is a native browser API
 * (baseline since 2022) — no extra package needed for this, unlike Dart.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}
