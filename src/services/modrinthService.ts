/**
 * Modrinth API Service
 * 
 * Unlike CurseForge, Modrinth's API is public and doesn't require authentication.
 * We can call it directly without a proxy.
 */

import type {
    ModrinthProject,
    ModrinthVersion,
    ModrinthSearchResult
} from '../types/modrinth';

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'LuminaKraftLauncher/1.0 (https://luminakraft.com)';

export class ModrinthService {
    private static instance: ModrinthService;

    private constructor() { }

    public static getInstance(): ModrinthService {
        if (!ModrinthService.instance) {
            ModrinthService.instance = new ModrinthService();
        }
        return ModrinthService.instance;
    }

    /**
     * Make a request to the Modrinth API
     */
    private async fetchApi<T>(endpoint: string, options?: any): Promise<T | null> {
        try {
            const response = await fetch(`${MODRINTH_API_BASE}${endpoint}`, {
                ...options,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json',
                    ...options?.headers,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                console.error(`[ModrinthService] API error: ${response.status}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('[ModrinthService] Request failed:', error);
            return null;
        }
    }

    /**
     * Get project info by slug or ID
     */
    async getProject(idOrSlug: string): Promise<ModrinthProject | null> {
        console.log(`[ModrinthService] Fetching project: ${idOrSlug}`);
        return this.fetchApi<ModrinthProject>(`/project/${idOrSlug}`);
    }

    /**
     * Get version info by hash (sha1 or sha512)
     */
    async getVersionByHash(hash: string, algorithm: 'sha1' | 'sha512' = 'sha1'): Promise<ModrinthVersion | null> {
        console.log(`[ModrinthService] Fetching version by hash: ${hash.substring(0, 16)}...`);
        return this.fetchApi<ModrinthVersion>(`/version_file/${hash}?algorithm=${algorithm}`);
    }

    /**
     * Batch get versions by hashes
     */
    async getVersionsByHashes(hashes: string[], algorithm: 'sha1' | 'sha512' = 'sha1'): Promise<Record<string, ModrinthVersion>> {
        console.log(`[ModrinthService] Fetching ${hashes.length} versions by hashes`);

        const response = await this.fetchApi<Record<string, ModrinthVersion>>('/version_files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                hashes,
                algorithm,
            }),
        });

        return response || {};
    }

    /**
     * Get a specific version by ID
     */
    async getVersion(versionId: string): Promise<ModrinthVersion | null> {
        console.log(`[ModrinthService] Fetching version: ${versionId}`);
        return this.fetchApi<ModrinthVersion>(`/version/${versionId}`);
    }

    /**
     * Get all versions for a project
     */
    async getProjectVersions(projectId: string): Promise<ModrinthVersion[]> {
        console.log(`[ModrinthService] Fetching versions for project: ${projectId}`);
        const response = await this.fetchApi<ModrinthVersion[]>(`/project/${projectId}/version`);
        return response || [];
    }

    /**
     * Search for projects (mods, modpacks, etc.)
     */
    async search(query: string, options?: {
        facets?: string[][];
        index?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
        offset?: number;
        limit?: number;
    }): Promise<ModrinthSearchResult | null> {
        console.log(`[ModrinthService] Searching: ${query}`);

        const params = new URLSearchParams();
        params.set('query', query);

        if (options?.facets) {
            params.set('facets', JSON.stringify(options.facets));
        }
        if (options?.index) {
            params.set('index', options.index);
        }
        if (options?.offset) {
            params.set('offset', options.offset.toString());
        }
        if (options?.limit) {
            params.set('limit', options.limit.toString());
        }

        return this.fetchApi<ModrinthSearchResult>(`/search?${params.toString()}`);
    }

    /**
     * Get multiple projects by IDs
     */
    async getProjects(ids: string[]): Promise<ModrinthProject[]> {
        if (ids.length === 0) return [];

        console.log(`[ModrinthService] Fetching ${ids.length} projects`);
        const response = await this.fetchApi<ModrinthProject[]>(`/projects?ids=${JSON.stringify(ids)}`);
        return response || [];
    }

    /**
     * Get multiple versions by IDs
     */
    async getVersions(ids: string[]): Promise<ModrinthVersion[]> {
        if (ids.length === 0) return [];

        console.log(`[ModrinthService] Fetching ${ids.length} versions`);
        const response = await this.fetchApi<ModrinthVersion[]>(`/versions?ids=${JSON.stringify(ids)}`);
        return response || [];
    }

    /**
     * Test if the Modrinth API is reachable
     */
    async testConnection(): Promise<boolean> {
        try {
            console.log('[ModrinthService] Testing connection...');
            // Try to fetch a known project (Sodium)
            const testProject = await this.getProject('sodium');
            console.log('[ModrinthService] Connection test successful:', !!testProject);
            return !!testProject;
        } catch (error) {
            console.error('[ModrinthService] Connection test failed:', error);
            return false;
        }
    }
}

export default ModrinthService;
