/**
 * Unit tests for LauncherService logic that doesn't require Tauri/Supabase.
 *
 * We mock everything network-related; this file exercises pure logic:
 *   - clientToken generation format
 *   - settings load/save with localStorage
 *   - RAM migration GB → MB
 *   - cache helpers (limited to behavior visible through public API)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ error: null }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
vi.mock('./authService', () => ({
  default: { getInstance: () => ({ getSupabaseAccessToken: () => Promise.resolve(null) }) },
}));

// localStorage shim — vitest's jsdom env provides one but we want a clean slate per test
beforeEach(() => {
  localStorage.clear();
  // Reset module cache so the singleton re-reads localStorage
  vi.resetModules();
});

describe('LauncherService settings load/save', () => {
  it('generates a clientToken on first load when none exists', async () => {
    const { default: LauncherService } = await import('../launcherService');
    const svc = LauncherService.getInstance();
    const settings = svc.getUserSettings();
    expect(settings.clientToken).toBeTruthy();
    // URL-safe base64 — no +, /, or = padding
    expect(settings.clientToken).toMatch(/^[A-Za-z0-9_-]+$/);
    // 24 random bytes → 32 chars base64 (no padding)
    expect(settings.clientToken!.length).toBeGreaterThanOrEqual(32);
  });

  it('persists settings to localStorage on save', async () => {
    const { default: LauncherService } = await import('../launcherService');
    const svc = LauncherService.getInstance();
    svc.saveUserSettings({ username: 'Steve', allocatedRam: 6144 });
    const saved = JSON.parse(localStorage.getItem('LuminaKraftLauncher_settings')!);
    expect(saved.username).toBe('Steve');
    expect(saved.allocatedRam).toBe(6144);
  });

  it('migrates legacy RAM in GB to MB on load', async () => {
    // Simulate legacy state: 4 GB stored as `4` (not 4096 MB)
    localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify({
      username: 'Player',
      allocatedRam: 4,
      language: 'en',
      authMethod: 'offline',
      clientToken: 'preserved-token',
    }));
    const { default: LauncherService } = await import('../launcherService');
    const svc = LauncherService.getInstance();
    const settings = svc.getUserSettings();
    expect(settings.allocatedRam).toBe(4096);
    expect(settings.clientToken).toBe('preserved-token');
  });

  it('regenerates clientToken if missing in saved settings', async () => {
    localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify({
      username: 'Player',
      allocatedRam: 4096,
      language: 'en',
      authMethod: 'offline',
      // clientToken intentionally absent
    }));
    const { default: LauncherService } = await import('../launcherService');
    const svc = LauncherService.getInstance();
    const settings = svc.getUserSettings();
    expect(settings.clientToken).toBeTruthy();
    expect(settings.clientToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('clearCache dispatches the luminakraft:cache-cleared event', async () => {
    const { default: LauncherService } = await import('../launcherService');
    const svc = LauncherService.getInstance();
    let fired = false;
    const handler = () => { fired = true; };
    window.addEventListener('luminakraft:cache-cleared', handler);
    svc.clearCache();
    window.removeEventListener('luminakraft:cache-cleared', handler);
    expect(fired).toBe(true);
  });
});
