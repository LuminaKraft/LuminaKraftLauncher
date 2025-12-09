import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderOpen, X, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import LauncherService from '../services/launcherService';

interface UnknownErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    modpackId?: string;
    errorMessage: string;
}

export function UnknownErrorModal({
    isOpen,
    onClose,
    modpackId,
    errorMessage,
}: UnknownErrorModalProps) {
    const { t } = useTranslation();

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

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
                <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border-b border-dark-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">
                                {t('errors.errorOccurred')}
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
                    {/* Error Message */}
                    <div className="bg-dark-700/50 rounded-xl p-4 border border-dark-600">
                        <p className="text-dark-200 text-sm whitespace-pre-line">
                            {errorMessage}
                        </p>
                    </div>

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

export default UnknownErrorModal;
