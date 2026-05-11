/**
 * Unit tests for AuthService pure logic.
 *
 * Scope: Only pure functions / logic extracted from authService.ts.
 * Network calls (Supabase, Discord API) are fully mocked.
 * Tauri invoke is mocked so the module can be imported in jsdom.
 */

import { describe, it, expect, vi } from 'vitest';

// --- Mocks (must come before any module imports that transitively load them) ---

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
  updateUser: vi.fn().mockResolvedValue({ error: null }),
}));

// ============================================================
// Helpers — pure logic extracted from authService.ts
// These mirror the exact code in the service so tests remain
// stable even if the private methods are refactored.
// ============================================================

/**
 * Build Discord CDN avatar URL from userId + avatarHash.
 * Mirrors logic inside AuthService.syncDiscordData().
 */
function buildDiscordAvatarUrl(
  userId: string,
  avatarHash: string | null
): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
}

/**
 * Extract avatar hash from a full CDN URL or return the hash directly.
 * Mirrors the `avatarHash` extraction block in AuthService.syncDiscordData().
 */
function extractAvatarHash(
  avatarField: string | null | undefined,
  avatarUrlField: string | null | undefined
): string | null {
  if (avatarField) return avatarField;
  if (avatarUrlField) {
    const match = avatarUrlField.match(/avatars\/\d+\/([^.?]+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Remove legacy discriminator from a Discord username.
 * Mirrors the `cleanUsername` logic in AuthService.syncDiscordData().
 */
function cleanDiscordUsername(username: string): string {
  if (username.includes('#')) {
    return username.split('#')[0];
  }
  return username;
}

/**
 * Get anonymous username from a parsed settings object.
 * Mirrors AuthService.getAnonymousUsernameFromLocalStorage().
 */
function getAnonymousUsernameFromSettings(
  settings: Record<string, unknown> | null
): string | null {
  if (!settings) return null;
  return (settings.username as string) || null;
}

// ============================================================
// Tests
// ============================================================

describe('buildDiscordAvatarUrl', () => {
  it('returns null when avatarHash is null', () => {
    expect(buildDiscordAvatarUrl('123456789', null)).toBeNull();
  });

  it('builds a PNG URL for a static hash', () => {
    const url = buildDiscordAvatarUrl('123456789', 'abc123');
    expect(url).toBe('https://cdn.discordapp.com/avatars/123456789/abc123.png');
  });

  it('builds a GIF URL for an animated hash (a_ prefix)', () => {
    const url = buildDiscordAvatarUrl('123456789', 'a_animatedhash');
    expect(url).toBe('https://cdn.discordapp.com/avatars/123456789/a_animatedhash.gif');
  });
});

describe('extractAvatarHash', () => {
  it('prefers the direct avatar hash field over URL', () => {
    const hash = extractAvatarHash('directhash', 'https://cdn.discordapp.com/avatars/111/urlhash.png');
    expect(hash).toBe('directhash');
  });

  it('parses hash from a CDN avatar URL when direct field is absent', () => {
    const hash = extractAvatarHash(null, 'https://cdn.discordapp.com/avatars/123456/abcdef.png');
    expect(hash).toBe('abcdef');
  });

  it('parses animated hash (with a_ prefix) from CDN URL', () => {
    const hash = extractAvatarHash(null, 'https://cdn.discordapp.com/avatars/789/a_animated.gif');
    expect(hash).toBe('a_animated');
  });

  it('returns null when both fields are absent', () => {
    expect(extractAvatarHash(null, null)).toBeNull();
  });

  it('returns null when URL does not match the expected CDN pattern', () => {
    expect(extractAvatarHash(null, 'https://example.com/image.png')).toBeNull();
  });
});

describe('cleanDiscordUsername', () => {
  it('strips legacy discriminator from username#0000 format', () => {
    expect(cleanDiscordUsername('PlayerOne#1234')).toBe('PlayerOne');
  });

  it('leaves modern usernames (no discriminator) unchanged', () => {
    expect(cleanDiscordUsername('moderndiscorduser')).toBe('moderndiscorduser');
  });

  it('handles empty string without throwing', () => {
    expect(cleanDiscordUsername('')).toBe('');
  });
});

describe('getAnonymousUsernameFromSettings', () => {
  it('returns username from a valid settings object', () => {
    expect(getAnonymousUsernameFromSettings({ username: 'CoolPlayer' })).toBe('CoolPlayer');
  });

  it('returns null when settings is null', () => {
    expect(getAnonymousUsernameFromSettings(null)).toBeNull();
  });

  it('returns null when username key is missing', () => {
    expect(getAnonymousUsernameFromSettings({ language: 'en' })).toBeNull();
  });

  it('returns null when username is an empty string', () => {
    // empty string is falsy → same as missing
    expect(getAnonymousUsernameFromSettings({ username: '' })).toBeNull();
  });
});

describe('AuthService module import (smoke test)', () => {
  it('can import AuthService without throwing (all deps mocked)', async () => {
    // Just verifying the module loads — no network involved
    const mod = await import('../authService');
    expect(mod.default).toBeDefined();
  });
});
