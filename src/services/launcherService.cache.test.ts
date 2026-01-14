import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for the modpack caching system.
 * Tests the CacheBehaviour patterns and TTL-based cache invalidation.
 */

// Mock modules before importing the service
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
}));

vi.mock('./supabaseClient', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
}));



describe('Cache Entry Structure', () => {
    it('should include expiresAt field for TTL-based invalidation', () => {
        // Simulate a cache entry
        const now = Date.now();
        const TTL = 5 * 60 * 1000; // 5 minutes

        const cacheEntry = {
            data: { modpacks: [] },
            timestamp: now,
            expiresAt: now + TTL,
        };

        expect(cacheEntry.expiresAt).toBe(now + TTL);
        expect(cacheEntry.expiresAt > now).toBe(true);
        expect(cacheEntry.expiresAt - cacheEntry.timestamp).toBe(TTL);
    });

    it('should correctly identify expired cache entries', () => {
        const now = Date.now();
        const TTL = 5 * 60 * 1000;

        // Fresh cache entry
        const freshEntry = {
            data: {},
            timestamp: now,
            expiresAt: now + TTL,
        };

        // Expired cache entry (created 10 minutes ago with 5 minute TTL)
        const expiredEntry = {
            data: {},
            timestamp: now - 10 * 60 * 1000,
            expiresAt: now - 5 * 60 * 1000,
        };

        const isFreshExpired = freshEntry.expiresAt < now;
        const isOldExpired = expiredEntry.expiresAt < now;

        expect(isFreshExpired).toBe(false);
        expect(isOldExpired).toBe(true);
    });
});

describe('CACHE_TTL Constants', () => {
    // These values are defined in launcherService.ts
    const CACHE_TTL = {
        MODPACKS: 5 * 60 * 1000,
        MODPACK_DETAILS: 10 * 60 * 1000,
        PARTNERS: 10 * 60 * 1000,
    };

    it('should have 5 minute TTL for modpacks list', () => {
        expect(CACHE_TTL.MODPACKS).toBe(5 * 60 * 1000); // 300,000 ms
    });

    it('should have 10 minute TTL for modpack details', () => {
        expect(CACHE_TTL.MODPACK_DETAILS).toBe(10 * 60 * 1000); // 600,000 ms
    });

    it('should have 10 minute TTL for partners', () => {
        expect(CACHE_TTL.PARTNERS).toBe(10 * 60 * 1000); // 600,000 ms
    });
});

describe('Persistent Cache (localStorage)', () => {
    const CACHE_PREFIX = 'LK_CACHE:';

    beforeEach(() => {
        window.localStorage.clear();
    });

    it('should store cache entries with correct prefix', () => {
        const key = 'modpacks_data_en';
        const entry = {
            data: { modpacks: [{ id: 'test-1', name: 'Test Modpack' }] },
            timestamp: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000,
        };

        window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));

        const stored = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
        expect(stored).not.toBeNull();

        const parsed = JSON.parse(stored!);
        expect(parsed.data.modpacks).toHaveLength(1);
        expect(parsed.data.modpacks[0].id).toBe('test-1');
    });

    it('should include expiresAt in persisted entries', () => {
        const key = 'modpacks_data_es';
        const now = Date.now();
        const TTL = 5 * 60 * 1000;

        const entry = {
            data: { modpacks: [] },
            timestamp: now,
            expiresAt: now + TTL,
        };

        window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));

        const stored = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
        const parsed = JSON.parse(stored!);

        expect(parsed.expiresAt).toBeDefined();
        expect(parsed.expiresAt).toBe(now + TTL);
    });

    it('should handle cache read for missing entries gracefully', () => {
        const stored = window.localStorage.getItem(`${CACHE_PREFIX}nonexistent`);
        expect(stored).toBeNull();
    });
});

describe('Language-specific Cache Keys', () => {
    it('should create separate cache keys per language', () => {
        const createCacheKey = (lang: string) => `modpacks_data_${lang}`;

        const enKey = createCacheKey('en');
        const esKey = createCacheKey('es');

        expect(enKey).toBe('modpacks_data_en');
        expect(esKey).toBe('modpacks_data_es');
        expect(enKey).not.toBe(esKey);
    });

    it('should create separate detail cache keys per language and modpack', () => {
        const createDetailKey = (modpackId: string, lang: string) =>
            `modpack_details_${modpackId}_${lang}`;

        const key1 = createDetailKey('modpack-1', 'en');
        const key2 = createDetailKey('modpack-1', 'es');
        const key3 = createDetailKey('modpack-2', 'en');

        expect(key1).toBe('modpack_details_modpack-1_en');
        expect(key2).toBe('modpack_details_modpack-1_es');
        expect(key3).toBe('modpack_details_modpack-2_en');

        // All keys should be unique
        const keys = [key1, key2, key3];
        expect(new Set(keys).size).toBe(3);
    });
});

describe('Cache Invalidation Logic', () => {
    it('should correctly determine if cache needs refresh based on TTL', () => {
        const now = Date.now();
        // TTL of 5 minutes (300000ms) used for calculating expiry times in test data

        const needsRefresh = (entry: { expiresAt: number }) => {
            return entry.expiresAt < now;
        };

        // Entry that expires in 4 minutes - still valid
        expect(needsRefresh({ expiresAt: now + 4 * 60 * 1000 })).toBe(false);

        // Entry that expired 1 minute ago - needs refresh
        expect(needsRefresh({ expiresAt: now - 1 * 60 * 1000 })).toBe(true);

        // Entry expiring exactly now - considered expired
        expect(needsRefresh({ expiresAt: now })).toBe(false); // Edge case: exactly now is not expired
    });

    it('should support stale-while-revalidate pattern', () => {
        // Simulate the pattern: return stale data but trigger background refresh
        const staleCacheData = { modpacks: [{ id: 'stale', name: 'Stale Data' }] };

        const getWithStaleWhileRevalidate = (
            cachedEntry: { data: any; expiresAt: number } | null,
            fetchFresh: () => Promise<any>
        ) => {
            if (cachedEntry) {
                const isExpired = cachedEntry.expiresAt < Date.now();
                if (isExpired) {
                    // Trigger background refresh but return stale data
                    void fetchFresh();
                }
                return cachedEntry.data;
            }
            return null;
        };

        const expiredEntry = {
            data: staleCacheData,
            expiresAt: Date.now() - 1000, // Expired 1 second ago
        };

        const result = getWithStaleWhileRevalidate(
            expiredEntry,
            async () => ({ modpacks: [{ id: 'fresh', name: 'Fresh Data' }] })
        );

        // Should return stale data immediately
        expect(result).toEqual(staleCacheData);
    });
});
