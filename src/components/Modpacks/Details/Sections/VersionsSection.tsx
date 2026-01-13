import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Download, Play, AlertTriangle, Calendar, Loader2, CheckCircle } from 'lucide-react';
import { useAnimation } from '../../../../contexts/AnimationContext';
import { useLauncher } from '../../../../contexts/LauncherContext';
import LauncherService from '../../../../services/launcherService';

interface VersionsSectionProps {
    modpackId: string;
    currentVersion?: string;
}

interface VersionData {
    version: string;
    changelog: string;
    fileUrl: string;
    fileSize: number;
    fileSha256: string;
    minecraftVersion: string;
    modloaderVersion: string;
    createdAt: string;
}

const VersionsSection: React.FC<VersionsSectionProps> = ({ modpackId, currentVersion }) => {
    const { t, i18n } = useTranslation();
    const { getAnimationClass, getAnimationStyle } = useAnimation();
    const { installModpackVersion, modpackStates } = useLauncher();
    const [versions, setVersions] = useState<VersionData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installingVersion, setInstallingVersion] = useState<string | null>(null);

    // Load version history
    useEffect(() => {
        const loadVersions = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const history = await LauncherService.getInstance().getModpackVersionHistory(modpackId);
                setVersions(history);
            } catch (err) {
                console.error('Failed to load version history:', err);
                setError(t('modpacks.versions.loadFailed') || 'Failed to load versions');
            } finally {
                setIsLoading(false);
            }
        };

        loadVersions();
    }, [modpackId]);

    const handleInstall = async (version: VersionData) => {
        if (installingVersion) return;

        // Safety check - simple confirm if downgrading/changing versions
        // In a real app we might want a proper modal
        const isDowngrade = currentVersion && version.version !== currentVersion;
        if (isDowngrade) {
            if (!confirm(t('modpacks.versions.confirmChange', { version: version.version }))) {
                return;
            }
        }

        setInstallingVersion(version.version);
        try {
            await installModpackVersion(modpackId, version);
        } catch (err) {
            console.error('Failed to install version:', err);
        } finally {
            setInstallingVersion(null);
        }
    };

    const formatDate = (dateString: string) => {
        try {
            return new Intl.DateTimeFormat(i18n.language, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(new Date(dateString));
        } catch {
            return dateString;
        }
    };

    const modpackState = modpackStates[modpackId];
    const isBusy = modpackState && ['installing', 'updating', 'repairing', 'reinstalling'].includes(modpackState.status);

    return (
        <div
            className={`space-y-4 ${getAnimationClass('transition-all duration-200')}`}
            style={getAnimationStyle({
                animation: `fadeInUp 0.3s ease-out 0.1s backwards`
            })}
        >
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-dark-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-3 text-lumina-500" />
                    <p>{t('common.loading')}</p>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-red-400">
                    <AlertTriangle className="w-12 h-12 mb-3" />
                    <p>{error}</p>
                </div>
            ) : versions.length === 0 ? (
                <div className="text-center py-12">
                    <History className="w-12 h-12 text-dark-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">{t('modpacks.versions.noVersions')}</h3>
                    <p className="text-dark-400">{t('modpacks.versions.noHistoryAvailable')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-4">
                        {versions.map((version) => {
                            const isCurrent = currentVersion === version.version;
                            const isInstallingThis = installingVersion === version.version;

                            return (
                                <div
                                    key={version.version}
                                    className={`bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-xl p-5 transition-all duration-300 hover:border-lumina-500/30 group ${isCurrent ? 'ring-1 ring-green-500/30 bg-dark-800/80' : ''
                                        }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h4 className="text-xl font-bold text-white tracking-tight">
                                                    {version.version}
                                                </h4>

                                                {isCurrent && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold border border-green-500/20">
                                                        <CheckCircle className="w-3 h-3" />
                                                        {t('modpacks.versions.current').toUpperCase()}
                                                    </span>
                                                )}

                                                <div className="flex items-center gap-1.5 text-xs text-dark-400 bg-dark-900/50 px-2 py-1 rounded-md border border-dark-700/30">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {formatDate(version.createdAt)}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
                                                <span className="px-2.5 py-1 bg-lumina-500/5 text-lumina-400 rounded border border-lumina-500/10">
                                                    Minecraft {version.minecraftVersion}
                                                </span>
                                                <span className="px-2.5 py-1 bg-dark-900/60 text-dark-300 rounded border border-dark-700/50">
                                                    {version.modloaderVersion}
                                                </span>
                                            </div>

                                            {version.changelog && (
                                                <div className="text-sm text-dark-300 bg-dark-900/40 p-4 rounded-lg border border-dark-700/20 leading-relaxed whitespace-pre-wrap">
                                                    {version.changelog}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-shrink-0">
                                            {!isCurrent ? (
                                                <button
                                                    onClick={() => handleInstall(version)}
                                                    disabled={isBusy || installingVersion !== null}
                                                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-md ${isBusy
                                                            ? 'bg-dark-700 text-dark-400 cursor-not-allowed'
                                                            : 'bg-lumina-600 hover:bg-lumina-500 text-white hover:shadow-lumina-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                                        }`}
                                                >
                                                    {isInstallingThis ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            <span>{t('modpacks.installing')}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download className="w-4 h-4" />
                                                            <span>{t('modpacks.versions.install')}</span>
                                                        </>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    disabled
                                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold bg-green-600/10 text-green-400 border border-green-600/30 cursor-default"
                                                >
                                                    <Play className="w-4 h-4" />
                                                    <span>{t('modpacks.versions.installed')}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VersionsSection;
