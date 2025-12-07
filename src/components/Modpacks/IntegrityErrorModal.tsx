import { ShieldAlert, Wrench } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface IntegrityErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRepair: () => void;
    issues: string[];
    modpackName?: string;
    title?: string; // Optional custom title
}

export function IntegrityErrorModal({
    isOpen,
    onClose,
    onRepair,
    issues,
    modpackName,
    title
}: IntegrityErrorModalProps) {
    const { t } = useTranslation();

    // Handle ESC key
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

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-md bg-dark-900 border border-dark-700/50 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-white/5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex flex-col items-center text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5 ring-1 ring-red-500/20">
                        <ShieldAlert size={32} className="text-red-500" strokeWidth={1.5} />
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-medium text-white mb-2">
                        {title || t('integrity.title', 'Verificación Fallida')}
                    </h2>

                    {/* Subtitle */}
                    <p className="text-dark-300 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
                        {modpackName
                            ? t('integrity.subtitleWithModpack', { modpack: modpackName, defaultValue: `Se han detectado problemas de integridad en "${modpackName}".` })
                            : t('integrity.subtitle', 'Los archivos locales no coinciden con la versión del servidor.')}
                    </p>

                    {/* Issues List or Single Message */}
                    <div className="w-full bg-dark-800/50 rounded-xl border border-dark-700/50 p-4 mb-6 text-left">
                        <ul className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar px-1">
                            {issues.map((issue, index) => (
                                <li key={index} className="text-sm text-red-400/90 flex items-start gap-2.5">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500/80 flex-shrink-0" />
                                    <span className="leading-snug break-words">{issue}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-dark-800 hover:bg-dark-700 text-dark-200 rounded-xl text-sm font-medium transition-colors border border-dark-700 hover:border-dark-600"
                        >
                            {t('common.cancel', 'Cancelar')}
                        </button>
                        <button
                            onClick={() => {
                                onRepair();
                                onClose();
                            }}
                            className="flex-1 px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-xl text-sm font-medium transition-colors shadow-lg shadow-white/5 flex items-center justify-center gap-2"
                        >
                            <Wrench size={16} />
                            {t('integrity.repairAction', 'Reparar')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
