import React from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const OfflineBanner: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 backdrop-blur-sm sticky top-0 z-40">
            <WifiOff className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-200">
                {t('status.offlineMode', 'Modo sin conexión')}
            </span>
        </div>
    );
};
