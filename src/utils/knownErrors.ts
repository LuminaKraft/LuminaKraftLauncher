/**
 * Known Errors System
 * 
 * Loads error patterns from remote JSON (with local fallback) and matches
 * them against error messages to provide user-friendly solutions.
 */

export interface KnownError {
    id: string;
    patterns: string[];
    canRetry: boolean;
    isAutoRetryable: boolean;
    en: {
        title: string;
        solution: string;
    };
    es: {
        title: string;
        solution: string;
    };
}

export interface KnownErrorsData {
    version: number;
    lastUpdated: string;
    errors: KnownError[];
}

// Remote URL for known errors JSON
const REMOTE_URL = 'https://raw.githubusercontent.com/LuminaKraft/LuminaKraftLauncher/main/known-errors.json';

// Cache for loaded errors
let cachedErrors: KnownError[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Local fallback errors (in case remote fails)
const LOCAL_FALLBACK: KnownError[] = [
    {
        id: 'eocd',
        patterns: ['could not find eocd', 'invalid zip archive', 'zip.*corrupt'],
        canRetry: true,
        isAutoRetryable: true,
        en: { title: 'Corrupted Download', solution: 'The downloaded file is corrupted. Click Retry to download again.' },
        es: { title: 'Descarga Corrupta', solution: 'El archivo descargado está corrupto. Haz clic en Reintentar.' }
    },
    {
        id: 'os_error_32',
        patterns: ['os error 32', 'being used by another process', 'utilizado por otro proceso'],
        canRetry: true,
        isAutoRetryable: false,
        en: { title: 'File In Use', solution: 'Close Minecraft and any file explorer windows, then try again.' },
        es: { title: 'Archivo en Uso', solution: 'Cierra Minecraft y las ventanas del explorador, luego reintenta.' }
    },
    {
        id: 'decoding_response',
        patterns: ['error decoding response', 'failed to read chunk'],
        canRetry: true,
        isAutoRetryable: true,
        en: { title: 'Connection Error', solution: 'Network error during download. Click Retry.' },
        es: { title: 'Error de Conexión', solution: 'Error de red durante la descarga. Haz clic en Reintentar.' }
    },
    {
        id: 'mojang_connection',
        patterns: ['piston-meta.mojang.com', 'error sending request.*mojang', 'launchermeta.mojang.com'],
        canRetry: true,
        isAutoRetryable: true,
        en: { title: 'Cannot Connect to Mojang', solution: 'Check your internet connection and try again.' },
        es: { title: 'No se Puede Conectar con Mojang', solution: 'Revisa tu conexión a internet e inténtalo de nuevo.' }
    }
];

/**
 * Fetch known errors from remote JSON using Tauri HTTP (bypasses CORS)
 */
async function fetchRemoteErrors(): Promise<KnownError[]> {
    try {
        // Use Tauri's fetch which bypasses CORS
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');

        const response = await tauriFetch(REMOTE_URL, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data: KnownErrorsData = await response.json();
        console.log(`✅ Loaded ${data.errors.length} known errors from remote (v${data.version})`);
        return data.errors;
    } catch (error) {
        console.warn('⚠️ Failed to fetch remote known errors, using local fallback:', error);
        return LOCAL_FALLBACK;
    }
}

/**
 * Get the list of known errors (with caching)
 */
export async function getKnownErrors(): Promise<KnownError[]> {
    const now = Date.now();

    // Return cached if still valid
    if (cachedErrors && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedErrors;
    }

    // Fetch fresh errors
    cachedErrors = await fetchRemoteErrors();
    cacheTimestamp = now;
    return cachedErrors;
}

/**
 * Match an error message against known error patterns (async version)
 * @param errorMessage The error message to check
 * @returns The matching KnownError or null if no match
 */
export async function matchKnownErrorAsync(errorMessage: string): Promise<KnownError | null> {
    if (!errorMessage) return null;

    const errors = await getKnownErrors();
    const lowerMessage = errorMessage.toLowerCase();

    for (const knownError of errors) {
        for (const pattern of knownError.patterns) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(lowerMessage)) {
                    return knownError;
                }
            } catch {
                // If regex is invalid, try simple includes
                if (lowerMessage.includes(pattern.toLowerCase())) {
                    return knownError;
                }
            }
        }
    }

    return null;
}

/**
 * Sync version that uses cached errors (for immediate matching)
 * Falls back to local errors if cache is empty
 */
export function matchKnownError(errorMessage: string): KnownError | null {
    if (!errorMessage) return null;

    const errors = cachedErrors || LOCAL_FALLBACK;
    const lowerMessage = errorMessage.toLowerCase();

    for (const knownError of errors) {
        for (const pattern of knownError.patterns) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(lowerMessage)) {
                    return knownError;
                }
            } catch {
                if (lowerMessage.includes(pattern.toLowerCase())) {
                    return knownError;
                }
            }
        }
    }

    return null;
}

/**
 * Initialize the known errors cache (call on app startup)
 */
export async function initKnownErrors(): Promise<void> {
    await getKnownErrors();
}
