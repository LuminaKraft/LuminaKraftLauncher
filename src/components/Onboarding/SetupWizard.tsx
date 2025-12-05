import React, { useState, useEffect } from 'react';
import { User, Check, ArrowRight, ChevronRight, Gamepad2, Monitor, ExternalLink, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useLauncher } from '../../contexts/LauncherContext';
import AuthService from '../../services/authService';
import logo from '../../assets/logo.png';

interface SetupWizardProps {
    onComplete: () => void;
}

type Step = 'welcome' | 'account' | 'profile' | 'finish';

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    const { t, i18n } = useTranslation();
    const { userSettings, updateUserSettings, changeLanguage } = useLauncher();
    const [step, setStep] = useState<Step>('welcome');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // Local state to prevent flickering if context updates are slow/resetting
    const [localMsAccount, setLocalMsAccount] = useState<any>(null); // Type 'any' to avoid import complexity for now, or use MicrosoftAccount if imported

    // Animation state (simple fade/slide effect)
    const [animating, setAnimating] = useState(false);

    // Initialize username from settings if available
    useEffect(() => {
        if (userSettings.username && userSettings.username !== 'Player') {
            setUsername(userSettings.username);
        } else if (userSettings.microsoftAccount?.username) {
            setUsername(userSettings.microsoftAccount.username);
        }
    }, [userSettings]);

    const changeStep = (newStep: Step) => {
        setAnimating(true);
        setTimeout(() => {
            setStep(newStep);
            setAnimating(false);
        }, 300);
    };

    const handleMicrosoftLogin = async () => {
        try {
            setIsLoading(true);
            const authService = AuthService.getInstance();
            const account = await authService.authenticateWithMicrosoftModal();

            if (account) {
                setLocalMsAccount(account);
                await updateUserSettings({
                    authMethod: 'microsoft',
                    microsoftAccount: account,
                    username: account.username
                });
            }
        } catch (error) {
            console.error('Microsoft login failed', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLuminaLogin = async () => {
        try {
            setIsLoading(true);
            const authService = AuthService.getInstance();
            await authService.signInToLuminaKraftAccount();
        } catch (error) {
            console.error('LuminaKraft login failed', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNextFromAccount = () => {
        const msAccount = userSettings.microsoftAccount || localMsAccount;
        if (msAccount) {
            // If logged in with Microsoft, skip profile (username) step
            changeStep('finish');
        } else {
            changeStep('profile');
        }
    };

    const handleBack = () => {
        if (step === 'account') changeStep('welcome');
        if (step === 'profile') changeStep('account');
        if (step === 'finish') {
            // If logged in with Microsoft, go back to account (profile offline step is skipped)
            const msAccount = userSettings.microsoftAccount || localMsAccount;
            if (msAccount) {
                changeStep('account');
            } else {
                changeStep('profile');
            }
        }
    };

    const handleFinish = async () => {
        // If username was set in profile step (offline mode), save it
        if (username && username.trim() !== '' && (!userSettings.microsoftAccount && !userSettings.discordAccount)) {
            await updateUserSettings({
                username: username,
                authMethod: 'offline',
                onboardingCompleted: true
            });
        } else {
            // Just mark as completed
            await updateUserSettings({ onboardingCompleted: true });
        }
        onComplete();
    };

    const handleOpenDiscord = async () => {
        try {
            await invoke('open_url', { url: "https://discord.gg/UJZRrcUFMj" });
        } catch (error) {
            console.warn('Tauri command not available, using fallback:', error);
            window.open("https://discord.gg/UJZRrcUFMj", '_blank', 'noopener,noreferrer');
        }
    };

    const renderWelcome = () => (
        <div className="flex flex-col items-center justify-center text-center space-y-8 animate-fadeIn h-full">
            <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-tr from-lumina-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-lumina-500/20 p-4">
                    <img src={logo} alt="LuminaKraft Logo" className="w-full h-full object-contain drop-shadow-md" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-dark-800 rounded-full flex items-center justify-center border border-dark-700">
                    <Check className="w-5 h-5 text-green-500" />
                </div>
            </div>

            <div className="space-y-2 max-w-md">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                    {t('onboarding.welcome.title')}
                </h1>
                <p className="text-gray-400 text-lg">
                    {t('onboarding.welcome.subtitle')}
                </p>
            </div>

            <button
                onClick={() => changeStep('account')}
                className="group flex items-center gap-2 px-8 py-4 bg-white text-dark-900 rounded-full font-bold text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-white/20 active:scale-95"
            >
                {t('onboarding.welcome.start')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
    );

    const renderAccount = () => {
        const msAccount = userSettings.microsoftAccount || localMsAccount;

        return (
            <div className="flex flex-col h-full animate-fadeIn">
                <div className="mb-8 text-center pt-8">
                    <h2 className="text-2xl font-bold text-white mb-2">{t('onboarding.account.title')}</h2>
                    <p className="text-gray-400">{t('onboarding.account.subtitle')}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 content-center px-4 md:px-12">
                    {/* Microsoft Account Card */}
                    <div className={`relative group p-6 rounded-2xl border transition-all duration-300 ${msAccount
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-dark-800/50 border-dark-700 hover:border-lumina-500/50 hover:bg-dark-700/50'
                        }`}>
                        <div className="flex flex-col items-center space-y-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${msAccount ? 'bg-transparent' : 'bg-[#00A4EF] text-white'
                                }`}>
                                {msAccount ? (
                                    <img
                                        src={`https://mc-heads.net/avatar/${msAccount.uuid}/64`}
                                        alt={msAccount.username}
                                        className="w-full h-full rounded-xl shadow-lg border-2 border-green-500/50"
                                    />
                                ) : (
                                    <Monitor className="w-6 h-6" />
                                )}
                            </div>
                            <div className="text-center">
                                <h3 className="font-semibold text-white mb-1">{t('onboarding.account.microsoft.title')}</h3>
                                <p className="text-sm text-gray-400">{t('onboarding.account.microsoft.description')}</p>
                            </div>

                            {msAccount ? (
                                <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                    {t('onboarding.account.microsoft.connected', { username: msAccount.username })}
                                </div>
                            ) : (
                                <button
                                    onClick={handleMicrosoftLogin}
                                    disabled={isLoading}
                                    className="w-full py-2.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading ? t('onboarding.account.microsoft.connecting') : t('onboarding.account.microsoft.connect')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* LuminaKraft Account Card */}
                    <div className={`relative group p-6 rounded-2xl border transition-all duration-300 ${userSettings.discordAccount // Using discord account as proxy for LuminaKraft linked account for now
                        ? 'bg-lumina-500/10 border-lumina-500/30'
                        : 'bg-dark-800/50 border-dark-700 hover:border-lumina-500/50 hover:bg-dark-700/50'
                        }`}>
                        <div className="flex flex-col items-center space-y-4">
                            <div className="w-12 h-12 rounded-xl bg-lumina-600 flex items-center justify-center text-white p-2">
                                <User className="w-8 h-8 text-white" />
                            </div>
                            <div className="text-center">
                                <h3 className="font-semibold text-white mb-1">{t('onboarding.account.luminakraft.title')}</h3>
                                <p className="text-sm text-gray-400">{t('onboarding.account.luminakraft.description')}</p>
                            </div>

                            {userSettings.discordAccount ? (
                                <div className="flex items-center gap-2 px-3 py-1 bg-lumina-500/20 text-lumina-300 rounded-full text-sm font-medium">
                                    <span className="w-2 h-2 rounded-full bg-lumina-400"></span>
                                    {t('onboarding.account.luminakraft.connected')}
                                </div>
                            ) : (
                                <div className="flex gap-2 w-full">
                                    <button
                                        onClick={handleLuminaLogin}
                                        disabled={isLoading}
                                        className="flex-1 py-2.5 bg-lumina-600 hover:bg-lumina-500 rounded-xl text-white font-medium transition-colors text-sm"
                                    >
                                        {t('onboarding.account.luminakraft.connect')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-between items-center px-4 md:px-12 pb-8">
                    <button
                        onClick={handleNextFromAccount}
                        className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                    >
                        {t('onboarding.account.configureLater')}
                    </button>
                    <button
                        onClick={handleNextFromAccount}
                        className="px-6 py-2.5 bg-white text-dark-900 rounded-xl font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {t('onboarding.account.next')} <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    };

    const renderProfile = () => (
        <div className="flex flex-col h-full animate-fadeIn max-w-lg mx-auto w-full justify-center">
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-dark-700">
                    <User className="w-10 h-10 text-gray-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{t('onboarding.profile.title')}</h2>
                <p className="text-gray-400">{t('onboarding.profile.subtitle')}</p>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('onboarding.profile.usernameLabel')}</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t('onboarding.profile.usernamePlaceholder')}
                        className="w-full bg-dark-800 border-dark-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-lumina-500 focus:border-transparent outline-none transition-all"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        {t('onboarding.profile.usernameDescription')}
                    </p>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={() => changeStep('finish')}
                        disabled={!username.trim()}
                        className="w-full py-3 bg-white text-dark-900 rounded-xl font-bold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('onboarding.profile.continue')}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderFinish = () => (
        <div
            className="flex flex-col h-full animate-fadeIn max-w-2xl mx-auto w-full overflow-y-auto pb-8 custom-scrollbar [&::-webkit-scrollbar]:hidden"
            style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
            <div className="mb-8">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{t('onboarding.finish.title')}</h2>
                <p className="text-gray-400">{t('onboarding.finish.description')}</p>
            </div>

            {/* Discord Support Section */}
            <div className="bg-indigo-500/10 rounded-2xl p-6 mb-8 border border-indigo-500/20">
                <h3 className="text-white font-semibold mb-2">{t('onboarding.finish.joinDiscord.title')}</h3>
                <p className="text-sm text-gray-400 mb-4">{t('onboarding.finish.joinDiscord.description')}</p>
                <button
                    onClick={handleOpenDiscord}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                    <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">D</span>
                    </div>
                    {t('onboarding.finish.joinDiscord.button')}
                    <ExternalLink className="w-4 h-4" />
                </button>
            </div>

            <button
                onClick={handleFinish}
                className="w-full py-4 bg-lumina-600 text-white rounded-xl font-bold text-lg hover:bg-lumina-500 transition-all shadow-lg shadow-lumina-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
                <Gamepad2 className="w-5 h-5" />
                {t('onboarding.finish.startPlaying')}
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-900/90 backdrop-blur-md">
            {/* Background ambience */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-lumina-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            </div>

            <div
                className={`w-full max-w-4xl h-[600px] bg-dark-900 rounded-3xl shadow-2xl overflow-hidden border border-dark-700 flex relative transition-all duration-300 ${animating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
            >
                <div className="relative z-10 w-full h-full p-8 md:p-12">
                    {/* Language Switcher */}
                    <div className="absolute top-8 right-8 z-20">
                        <div className="flex bg-dark-800 rounded-lg p-1 border border-dark-700">
                            <button
                                onClick={() => changeLanguage('en')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${i18n.language.startsWith('en')
                                    ? 'bg-dark-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => changeLanguage('es')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${i18n.language.startsWith('es')
                                    ? 'bg-dark-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                ES
                            </button>
                        </div>
                    </div>

                    {step !== 'welcome' && (
                        <button
                            onClick={handleBack}
                            className="absolute top-8 left-8 p-2 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-white/10"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                    )}

                    {step === 'welcome' && renderWelcome()}
                    {step === 'account' && renderAccount()}
                    {step === 'profile' && renderProfile()}
                    {step === 'finish' && renderFinish()}
                </div>

                {/* Status Bar / Dots */}
                {/* Status Bar / Dots */}
                {step !== 'welcome' && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
                        <div className={`w-2 h-2 rounded-full transition-colors ${step === 'account' ? 'bg-white' : 'bg-dark-600'}`} />
                        {!(userSettings.microsoftAccount || localMsAccount) && (
                            <div className={`w-2 h-2 rounded-full transition-colors ${step === 'profile' ? 'bg-white' : 'bg-dark-600'}`} />
                        )}
                        <div className={`w-2 h-2 rounded-full transition-colors ${step === 'finish' ? 'bg-white' : 'bg-dark-600'}`} />
                    </div>
                )}
            </div>
        </div>
    );
};
