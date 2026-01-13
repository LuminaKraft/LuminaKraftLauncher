/**
 * Types for Modrinth integration
 * Based on the modrinth.index.json format and Modrinth API v2
 */

/**
 * Modrinth modpack manifest structure (modrinth.index.json)
 */
export interface ModrinthManifest {
    formatVersion: number;
    game: string;
    versionId: string;
    name: string;
    summary?: string;
    files: ModrinthFile[];
    dependencies: Record<string, string>; // e.g., { "minecraft": "1.20.1", "fabric-loader": "0.15.0" }
}

/**
 * A file entry in the Modrinth modpack manifest
 */
export interface ModrinthFile {
    path: string;           // e.g., "mods/sodium-fabric-0.5.8+mc1.20.4.jar"
    hashes: ModrinthHashes;
    env?: ModrinthEnv;
    downloads: string[];    // Direct download URLs (CDN links)
    fileSize: number;
}

/**
 * Hash values for file verification
 */
export interface ModrinthHashes {
    sha1: string;
    sha512: string;
}

/**
 * Environment specification (client/server side requirements)
 */
export interface ModrinthEnv {
    client?: 'required' | 'optional' | 'unsupported';
    server?: 'required' | 'optional' | 'unsupported';
}

/**
 * Known dependency keys in Modrinth manifests
 */
export const MODRINTH_DEPENDENCIES = {
    MINECRAFT: 'minecraft',
    FORGE: 'forge',
    NEOFORGE: 'neoforge',
    FABRIC_LOADER: 'fabric-loader',
    QUILT_LOADER: 'quilt-loader',
} as const;

/**
 * Modrinth API response for a version file lookup
 */
export interface ModrinthVersionFile {
    hashes: Record<string, string>;
    url: string;
    filename: string;
    primary: boolean;
    size: number;
}

/**
 * Modrinth API response for a version
 */
export interface ModrinthVersion {
    id: string;
    project_id: string;
    name: string;
    version_number: string;
    files: ModrinthVersionFile[];
    game_versions: string[];
    loaders: string[];
}

/**
 * Modrinth API response for a project
 */
export interface ModrinthProject {
    id: string;
    slug: string;
    title: string;
    description: string;
    icon_url?: string;
    project_type: 'mod' | 'modpack' | 'resourcepack' | 'shader';
    downloads: number;
    client_side: 'required' | 'optional' | 'unsupported';
    server_side: 'required' | 'optional' | 'unsupported';
}

/**
 * Modrinth search result
 */
export interface ModrinthSearchResult {
    hits: ModrinthSearchHit[];
    offset: number;
    limit: number;
    total_hits: number;
}

export interface ModrinthSearchHit {
    project_id: string;
    slug: string;
    title: string;
    description: string;
    icon_url?: string;
    project_type: string;
    downloads: number;
    author: string;
    versions: string[];
}
