import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Wrench, FolderOpen, X, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import type { KnownError } from '../utils/knownErrors';
import LauncherService from '../services/launcherService';

interface KnownErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRepair?: () => void;
    knownError: KnownError;
    modpackId?: string;
    originalError?: string;
}

export function KnownErrorModal({
    isOpen,
    onClose,
    onRepair,
    knownError,
    modpackId,
    originalError,
}: KnownErrorModalProps) {
    const { t, i18n } = useTranslation();

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Don't render if not open or no knownError
    if (!isOpen || !knownError) return null;

    // Get localized content based on current language
    const lang = i18n.language?.startsWith('es') ? 'es' : 'en';
    const localized = knownError[lang] || knownError.en;

    const handleOpenLogsFolder = async () => {
        if (modpackId) {
            try {
                await LauncherService.getInstance().openInstanceFolder(modpackId);
            } catch (error) {
                console.error('Failed to open logs folder:', error);
            }
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-dark-800 rounded-2xl max-w-lg w-full shadow-2xl border border-dark-600 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 border-b border-dark-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-orange-400" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">
                                {localized.title}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-dark-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-4">
                    {/* Solution */}
                    <div className="bg-dark-700/50 rounded-xl p-4 border border-dark-600">
                        <h3 className="text-sm font-medium text-lumina-400 mb-2">
                            {t('knownErrors.solution')}
                        </h3>
                        <p className="text-dark-200 text-sm whitespace-pre-line">
                            {localized.solution}
                        </p>
                    </div>

                    {/* Original Error (collapsed by default) */}
                    {originalError && (
                        <details className="group">
                            <summary className="text-xs text-dark-400 cursor-pointer hover:text-dark-300 transition-colors">
                                {t('knownErrors.showTechnicalDetails')}
                            </summary>
                            <div className="mt-2 p-3 bg-dark-900 rounded-lg text-xs text-dark-400 font-mono overflow-x-auto">
                                {originalError}
                            </div>
                        </details>
                    )}

                    {/* Discord Support */}
                    <div className="flex items-center gap-2 text-sm text-dark-400">
                        <span>{t('knownErrors.needHelp')}</span>
                        <button
                            onClick={() => open('https://discord.gg/UJZRrcUFMj')}
                            className="inline-flex items-center gap-1 text-lumina-400 hover:text-lumina-300 transition-colors"
                        >
                            {t('knownErrors.openTicket')}
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-dark-900/50 border-t border-dark-600 flex gap-3">
                    {knownError.canRetry && onRepair && (
                        <button
                            onClick={() => {
                                onRepair();
                                onClose();
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            <Wrench className="w-4 h-4" />
                            {t('knownErrors.retryButton')}
                        </button>
                    )}

                    {modpackId && (
                        <button
                            onClick={handleOpenLogsFolder}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            <FolderOpen className="w-4 h-4" />
                            {t('knownErrors.openFolder')}
                        </button>
                    )}

                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                        {t('app.close')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default KnownErrorModal;
