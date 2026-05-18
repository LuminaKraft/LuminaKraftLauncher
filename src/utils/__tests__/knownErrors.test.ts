import { describe, it, expect } from 'vitest';
import { matchKnownError } from '../knownErrors';

describe('matchKnownError', () => {
  it('returns null for empty input', () => {
    expect(matchKnownError('')).toBeNull();
  });

  it('matches eocd / corrupted zip patterns case-insensitively', () => {
    const e = matchKnownError('Error: Could not find EOCD signature');
    expect(e?.id).toBe('eocd');
    expect(e?.canRetry).toBe(true);
    expect(e?.isAutoRetryable).toBe(true);
  });

  it('matches os_error_32 pattern', () => {
    const e = matchKnownError('failed: os error 32');
    expect(e?.id).toBe('os_error_32');
    expect(e?.isAutoRetryable).toBe(false);
  });

  it('matches decoding_response pattern', () => {
    const e = matchKnownError('Error decoding response from server');
    expect(e?.id).toBe('decoding_response');
  });

  it('matches mojang_connection pattern via regex', () => {
    const e = matchKnownError('failed to connect to piston-meta.mojang.com');
    expect(e?.id).toBe('mojang_connection');
  });

  it('returns null for unknown errors', () => {
    expect(matchKnownError('completely unrelated bug 42')).toBeNull();
  });
});
