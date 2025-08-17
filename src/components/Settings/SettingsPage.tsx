import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, HardDrive, Save, Wifi, WifiOff, RefreshCw, Trash2, Server, Languages, Shield, XCircle, CheckCircle, Zap } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import LauncherService from '../../services/launcherService';
import MicrosoftAuth from './MicrosoftAuth';
import MetaStorageSettings from './MetaStorageSettings';
import type { MicrosoftAccount } from '../../types/launcher';
import toast from 'react-hot-toast';

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings, currentLanguage, changeLanguage } = useLauncher();
  
  const [formData, setFormData] = useState(userSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('LK_lastApiStatus') : null;
    return saved === 'online' || saved === 'offline' ? saved : 'offline';
  });
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('LK_lastApiCheckAt') : null;
    return saved ? Number(saved) : null;
  });
  const [apiInfo, setApiInfo] = useState<any>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Java runtime handled internally by Lyceris; no user-facing settings.

  useEffect(() => {
    setFormData(userSettings);
  }, [userSettings]);

  useEffect(() => {
    const isDifferent = JSON.stringify(formData) !== JSON.stringify(userSettings);
    setHasChanges(isDifferent);
  }, [formData, userSettings]);

  useEffect(() => {
    fetchAPIInfo();
    fetchAvailableLanguages();
  }, []);

  const checkAPIStatus = async () => {
    setApiStatus('checking');
    try {
      const isHealthy = await LauncherService.getInstance().checkAPIHealth();
      const status: 'online' | 'offline' = isHealthy ? 'online' : 'offline';
      setApiStatus(status);
      const now = Date.now();
      setLastCheckedAt(now);
      if (typeof window !== 'undefined') {
        localStorage.setItem('LK_lastApiStatus', status);
        localStorage.setItem('LK_lastApiCheckAt', String(now));
      }
    } catch (_error) {
      const status: 'online' | 'offline' = 'offline';
      setApiStatus(status);
      const now = Date.now();
      setLastCheckedAt(now);
      if (typeof window !== 'undefined') {
        localStorage.setItem('LK_lastApiStatus', status);
        localStorage.setItem('LK_lastApiCheckAt', String(now));
      }
    }
  };

  const fetchAPIInfo = async () => {
    try {
      const info = await LauncherService.getInstance().getAPIInfo();
      setApiInfo(info);
    } catch (_error) {
      console.error('Error fetching API info:', _error);
    }
  };

  const fetchAvailableLanguages = async () => {
    try {
      const languageData = await LauncherService.getInstance().getAvailableLanguages();
      // TODO: Implement dynamic language loading
      console.log('Available languages:', languageData.availableLanguages);
    } catch (_error) {
      console.error('Error fetching available languages:', _error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (field === 'username') {
      const trimmed = value.trim();
      if (trimmed === '') {
        setUsernameError(t('settings.usernameRequired'));
      } else if (trimmed.length > 16) {
        setUsernameError(t('settings.usernameTooLong'));
      } else {
        setUsernameError(null);
      }
    }
  };

  const handleLanguageChange = async (language: string) => {
    try {
      await changeLanguage(language);
      toast.success(t('settings.saved'));
    } catch (_error) {
      console.error('Error changing language:', _error);
    }
  };

  const handleSave = () => {
    if (usernameError) {
      toast.error(t('settings.usernameInvalidToast'));
      return;
    }
    updateUserSettings(formData);
    setHasChanges(false);
    toast.success(t('settings.saved'));
  };

  const handleDiscard = () => {
    setFormData(userSettings);
    setHasChanges(false);
    toast(t('settings.changesDiscarded'));
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    await checkAPIStatus();
    await fetchAPIInfo();
    setIsTestingConnection(false);
  };

  const handleClearCache = () => {
    LauncherService.getInstance().clearCache();
    toast.success(t('settings.saved'));
  };

  const handleMicrosoftAuthSuccess = (account: MicrosoftAccount) => {
    setAuthError(null);
    const newSettings = {
      ...formData,
      authMethod: 'microsoft' as const,
      microsoftAccount: account,
      username: account.username
    };
    setFormData(newSettings);
    updateUserSettings(newSettings);
    toast.success(t('settings.saved'));
  };

  const handleMicrosoftAuthClear = () => {
    setAuthError(null);
    const newSettings = {
      ...formData,
      authMethod: 'offline' as const,
      microsoftAccount: undefined,
      username: 'Player'
    };
    setFormData(newSettings);
    updateUserSettings(newSettings);
    toast.success(t('settings.saved'));
  };

  const handleAuthError = (error: string) => {
    setAuthError(error);
    setTimeout(() => setAuthError(null), 5000);
  };

  const MIN_RAM = 1;
  const MAX_RAM = 64;
  
  const handleRamSliderChange = (value: number) => {
    const clampedValue = Math.max(MIN_RAM, Math.min(MAX_RAM, value));
    handleInputChange('allocatedRam', clampedValue);
  };

  const handleRamTextChange = (value: string) => {
    // Allow empty string for better UX while typing
    if (value === '') {
      return;
    }
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(MIN_RAM, Math.min(MAX_RAM, numValue));
      const roundedValue = Math.round(clampedValue * 2) / 2; // Round to nearest 0.5
      handleInputChange('allocatedRam', roundedValue);
    }
  };

  const handleRamTextBlur = (value: string) => {
    // On blur, ensure we have a valid value
    const numValue = parseFloat(value);
    if (isNaN(numValue) || value === '') {
      // Reset to current value if invalid
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = formData.allocatedRam.toString();
      }
    }
  };

  const languageOptions = [
    { value: 'es', label: '🇪🇸 Español', name: 'Español' },
    { value: 'en', label: '🇺🇸 English', name: 'English' }
  ];

  const getStatusIcon = () => {
    switch (apiStatus) {
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'online':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    let base = '';
    switch (apiStatus) {
      case 'checking':
        base = t('settings.checking');
        break;
      case 'online':
        base = t('settings.connected');
        break;
      case 'offline':
        base = t('settings.disconnected');
        break;
    }
    if (apiStatus !== 'checking' && lastCheckedAt) {
      const time = new Date(lastCheckedAt).toLocaleString();
      return `${base} (${time})`;
    }
    return base;
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'checking':
        return 'text-yellow-400';
      case 'online':
        return 'text-green-400';
      case 'offline':
        return 'text-red-400';
    }
  };

  // Java runtime handled internally by Lyceris; no user-facing settings.

  const isSaveDisabled = !!usernameError;

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">{t('settings.title')}</h1>
          <p className="text-dark-400">
            {t('settings.settingsDescription')}
          </p>
        </div>

        {/* Error notification */}
        {authError && (
          <div className="mb-6 p-4 bg-red-600/20 border border-red-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-400 font-medium">
                {authError}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* Language Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Languages className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.language')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.selectLanguage')}
                </label>
                <div className="flex items-center space-x-4">
                  <select
                    value={currentLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="input-field"
                  >
                    {languageOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-dark-400 text-sm">
                    <p>{t('settings.currentLanguage', { language: languageOptions.find(l => l.value === currentLanguage)?.name })}</p>
                  </div>
                </div>
                <p className="text-dark-400 text-xs mt-1">
                  {t('settings.languageDescription')}
                </p>
              </div>
            </div>
          </div>

          {/* Authentication Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('auth.title')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-dark-300 text-sm mb-4">
                  {t('auth.description')}
                </p>
                
                <MicrosoftAuth
                  userSettings={formData}
                  onAuthSuccess={handleMicrosoftAuthSuccess}
                  onAuthClear={handleMicrosoftAuthClear}
                  onError={handleAuthError}
                />
              </div>
              
              {formData.authMethod === 'offline' && (
                <div className="p-4 bg-yellow-600/20 border border-yellow-600/30 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-yellow-500" />
                    <span className="text-yellow-400 font-medium">
                      {t('auth.offlineMode')}
                    </span>
                  </div>
                  <p className="text-yellow-300 text-sm mt-2">
                    {t('auth.offlineModeDescription')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* API Status */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Server className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.api')}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <p className={`font-medium ${getStatusColor()}`}>
                      {getStatusText()}
                    </p>
                    <p className="text-dark-400 text-sm">
                      {(apiInfo?.name || 'LuminaKraft Launcher API')}{apiInfo?.version ? `/${apiInfo.version}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  {t('settings.testConnection')}
                </button>
              </div>

              {/* Description & separate version box removed per design update */}

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleClearCache}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('settings.clearCache')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* User Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <User className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.general')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.username')}
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder={t('settings.usernamePlaceholder')}
                  className="input-field w-full"
                  disabled={formData.authMethod === 'microsoft'}
                  maxLength={16}
                />
                <p className="text-dark-400 text-xs mt-1">
                  {formData.authMethod === 'microsoft' 
                    ? t('auth.usernameFromMicrosoft')
                    : t('settings.usernameDescription')
                  }
                </p>
                {usernameError && (
                  <p className="text-red-500 text-xs mt-1 flex items-center"><XCircle className="w-4 h-4 mr-1" /> {usernameError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Performance Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <HardDrive className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.performance')}</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.ramAllocationLabel')}
                </label>
                
                {/* RAM allocation display with inline editing */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={MIN_RAM}
                      max={MAX_RAM}
                      step="0.5"
                      value={formData.allocatedRam}
                      onChange={(e) => handleRamTextChange(e.target.value)}
                      onBlur={(e) => handleRamTextBlur(e.target.value)}
                      className="bg-transparent border-0 text-white text-lg font-medium w-16 text-center focus:outline-none focus:bg-dark-700 rounded px-1"
                    />
                    <span className="text-white text-lg font-medium">GB</span>
                  </div>
                  <div className="text-dark-400 text-sm">
                    <p>{t('settings.ramRecommended')}</p>
                  </div>
                </div>

                {/* Slider */}
                <div className="mb-4">
                  <input
                    type="range"
                    min={MIN_RAM}
                    max={MAX_RAM}
                    step="0.5"
                    value={formData.allocatedRam}
                    onChange={(e) => handleRamSliderChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((formData.allocatedRam - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 ${((formData.allocatedRam - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-dark-400 mt-1">
                    <span>{MIN_RAM} GB</span>
                    <span>{MAX_RAM} GB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animation Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Zap className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.animations')}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-dark-300 text-sm font-medium mb-1">
                    {t('settings.enableAnimations')}
                  </label>
                  <p className="text-dark-400 text-xs">
                    {t('settings.enableAnimationsDesc')}
                  </p>
                </div>
                <div className="flex items-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enableAnimations !== false}
                      onChange={(e) => handleInputChange('enableAnimations', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-lumina-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lumina-600"></div>
                  </label>
                </div>
              </div>
              
              <div className={`p-3 rounded-lg ${formData.enableAnimations !== false ? 'bg-green-600/20 border border-green-600/30' : 'bg-orange-600/20 border border-orange-600/30'}`}>
                <p className={`text-sm ${formData.enableAnimations !== false ? 'text-green-300' : 'text-orange-300'}`}>
                  {formData.enableAnimations !== false ? t('settings.animationsEnabled') : t('settings.animationsDisabled')}
                </p>
              </div>
            </div>
          </div>

          {/* Meta Storage Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <HardDrive className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('metaStorage.title')}</h2>
            </div>
            
            <MetaStorageSettings />
          </div>

          {/* Prereleases Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.prereleases')}</h2>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center space-x-3 p-3 rounded-lg border border-dark-600 hover:border-dark-500 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enablePrereleases || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, enablePrereleases: e.target.checked }))}
                  className="w-5 h-5 text-lumina-600 bg-dark-700 border-dark-600 rounded focus:ring-lumina-500 focus:ring-2"
                />
                <div className="flex-1">
                  <div className="text-white font-medium">{t('settings.enablePrereleases')}</div>
                  <div className="text-dark-300 text-sm">{t('settings.enablePrereleasesDesc')}</div>
                </div>
              </label>
            </div>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className="sticky bottom-0 bg-dark-900 border-t border-dark-700 p-4 -mx-6">
              <div className="flex justify-between items-center">
                <p className="text-dark-400 text-sm">
                  {t('settings.unsavedChanges')}
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleDiscard}
                    className="btn-secondary inline-flex items-center space-x-2"
                  >
                    {t('settings.discardChanges')}
                  </button>
                  <button
                    onClick={handleSave}
                    className={`btn-primary inline-flex items-center space-x-2 ${isSaveDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isSaveDisabled}
                  >
                    <Save className="w-4 h-4" />
                    <span>{t('settings.saveChanges')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 