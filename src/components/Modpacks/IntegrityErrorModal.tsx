import { AlertTriangle, ShieldAlert, Wrench, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface IntegrityErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRepair: () => void;
    issues: string[];
    modpackName?: string;
}

export function IntegrityErrorModal({
    isOpen,
    onClose,
    onRepair,
    issues,
    modpackName
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-lg bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-red-500/10 border-b border-red-500/10 p-6 flex items-start gap-4">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20">
                        <ShieldAlert size={32} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-white mb-1">
                            {t('integrity.title', 'Integridad Comprometida')}
                        </h2>
                        <p className="text-red-200/80 text-sm">
                            {modpackName
                                ? t('integrity.subtitleWithModpack', { modpack: modpackName, defaultValue: `El modpack "${modpackName}" ha sido modificado.` })
                                : t('integrity.subtitle', 'Se han detectado modificaciones no autorizadas.')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-dark-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="bg-dark-900/50 rounded-xl border border-dark-700 p-4 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
                        <h3 className="text-sm font-medium text-dark-300 mb-3 flex items-center gap-2">
                            <AlertTriangle size={14} className="text-yellow-500" />
                            {t('integrity.issuesDetected', 'Problemas detectados:')}
                        </h3>
                        <ul className="space-y-2">
                            {issues.map((issue, index) => (
                                <li key={index} className="text-sm text-red-300 flex items-start gap-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                    <span className="break-all">{issue}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-dark-300 text-sm mb-6 leading-relaxed">
                        {t('integrity.description', 'Este modpack requiere validación estricta. Para continuar jugando, es necesario reparar la instalación para restaurar los archivos originales.')}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-xl font-medium transition-colors border border-dark-600"
                        >
                            {t('common.cancel', 'Cancelar')}
                        </button>
                        <button
                            onClick={() => {
                                onRepair();
                                onClose();
                            }}
                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-red-900/20 flex items-center justify-center gap-2"
                        >
                            <Wrench size={18} />
                            {t('integrity.repairAction', 'Reparar Modpack')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
