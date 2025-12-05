import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Check } from 'lucide-react';
import { useLauncher } from '../contexts/LauncherContext';

export const UsernameRequiredDialog: React.FC = () => {
    const { t } = useTranslation();
    const { updateUserSettings, setShowUsernameDialog } = useLauncher();
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            setError(t('auth.usernameRequired'));
            return;
        }
        if (username.length < 3) {
            setError(t('auth.usernameTooShort'));
            return;
        }

        try {
            await updateUserSettings({ username: username.trim() });
            setShowUsernameDialog(false);
        } catch (err) {
            console.error('Failed to update username:', err);
            setError(t('common.error'));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <div className="bg-dark-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-dark-600 shadow-2xl">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-lumina-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <User className="w-8 h-8 text-lumina-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                        {t('auth.chooseUsername')}
                    </h2>
                    <p className="text-gray-400">
                        {t('auth.usernameRequiredMessage')}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value);
                                setError('');
                            }}
                            placeholder={t('auth.usernamePlaceholder')}
                            className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lumina-500 transition-all"
                            autoFocus
                        />
                        {error && (
                            <p className="text-red-400 text-sm mt-2 ml-1">{error}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={!username.trim()}
                        className="w-full bg-lumina-600 hover:bg-lumina-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        <Check className="w-5 h-5" />
                        {t('app.continue')}
                    </button>
                </form>
            </div>
        </div>
    );
};
