/** Creates a new idempotency key (UUID v4, 36 chars: fits both the 50- and 100-char limits). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // randomUUID needs a secure context (HTTPS/localhost); fall back to getRandomValues.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Keeps one idempotency key per user intent.
 *
 * - `keyFor(payload)` returns the same key while the payload is unchanged
 *   (retries and double-clicks are safe), and a fresh key once the payload changes.
 * - Call `reset()` after a successful operation so the next one gets a new key.
 */
export class IdempotencyKeyHolder {
  private key: string | null = null;
  private fingerprint: string | null = null;

  keyFor(payload: unknown): string {
    const fp = JSON.stringify(payload);
    if (this.key === null || fp !== this.fingerprint) {
      this.key = newIdempotencyKey();
      this.fingerprint = fp;
    }
    return this.key;
  }

  reset(): void {
    this.key = null;
    this.fingerprint = null;
  }
}
