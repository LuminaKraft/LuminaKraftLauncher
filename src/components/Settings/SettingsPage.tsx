import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, HardDrive, Coffee, Globe, Save, FolderOpen, CheckCircle, Wifi, WifiOff, RefreshCw, Trash2, Server, Languages, Shield, XCircle } from 'lucide-react';
import { FaHdd } from 'react-icons/fa';
import { useLauncher } from '../../contexts/LauncherContext';
import LauncherService from '../../services/launcherService';
import MicrosoftAuth from './MicrosoftAuth';
import MetaStorageSettings from './MetaStorageSettings.tsx';
import type { MicrosoftAccount } from '../../types/launcher';

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings, currentLanguage, changeLanguage } = useLauncher();
  
  const [formData, setFormData] = useState(userSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedNotification, setSavedNotification] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiInfo, setApiInfo] = useState<any>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);


  useEffect(() => {
    setFormData(userSettings);
  }, [userSettings]);

  useEffect(() => {
    const isDifferent = JSON.stringify(formData) !== JSON.stringify(userSettings);
    setHasChanges(isDifferent);
  }, [formData, userSettings]);

  useEffect(() => {
    checkAPIStatus();
    fetchAPIInfo();
    fetchAvailableLanguages();
  }, []);

  const checkAPIStatus = async () => {
    setApiStatus('checking');
    try {
      const isHealthy = await LauncherService.getInstance().checkAPIHealth();
      setApiStatus(isHealthy ? 'online' : 'offline');
    } catch (error) {
      setApiStatus('offline');
    }
  };

  const fetchAPIInfo = async () => {
    try {
      const info = await LauncherService.getInstance().getAPIInfo();
      setApiInfo(info);
    } catch (error) {
      console.error('Error fetching API info:', error);
    }
  };

  const fetchAvailableLanguages = async () => {
    try {
      const languageData = await LauncherService.getInstance().getAvailableLanguages();
      // TODO: Implement dynamic language loading
      console.log('Available languages:', languageData.availableLanguages);
    } catch (error) {
      console.error('Error fetching available languages:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLanguageChange = async (language: string) => {
    try {
      await changeLanguage(language);
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 3000);
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  const handleSave = () => {
    updateUserSettings(formData);
    setHasChanges(false);
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  const handleSelectJavaPath = async () => {
    try {
      // In a real implementation, this would open a file dialog
      // For now, we'll show a placeholder
      console.log('Open file dialog for Java path');
    } catch (error) {
      console.error('Error selecting Java path:', error);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    await checkAPIStatus();
    await fetchAPIInfo();
    setIsTestingConnection(false);
  };

  const handleClearCache = () => {
    LauncherService.getInstance().clearCache();
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
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
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
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
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  const handleAuthError = (error: string) => {
    setAuthError(error);
    setTimeout(() => setAuthError(null), 5000);
  };

  const ramOptions = [
    { value: 2, label: '2 GB' },
    { value: 4, label: '4 GB' },
    { value: 6, label: '6 GB' },
    { value: 8, label: '8 GB' },
    { value: 12, label: '12 GB' },
    { value: 16, label: '16 GB' },
    { value: 32, label: '32 GB' }
  ];

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
    switch (apiStatus) {
      case 'checking':
        return t('settings.checking');
      case 'online':
        return t('settings.connected');
      case 'offline':
        return t('settings.disconnected');
    }
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

        {/* Success notification */}
        {savedNotification && (
          <div className="mb-6 p-4 bg-green-600/20 border border-green-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400 font-medium">
                {t('settings.saved')}
              </span>
            </div>
          </div>
        )}

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

        <div className="max-w-4xl space-y-8">
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
                      {apiInfo?.name || 'LuminaKraft Launcher API'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="btn-secondary"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  {t('settings.testConnection')}
                </button>
              </div>

              {apiInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-dark-700 rounded-lg">
                    <p className="text-dark-300 text-sm font-medium mb-1">{t('settings.apiVersion')}</p>
                    <p className="text-white">{apiInfo.version}</p>
                  </div>
                  <div className="p-4 bg-dark-700 rounded-lg">
                    <p className="text-dark-300 text-sm font-medium mb-1">{t('settings.description')}</p>
                    <p className="text-white text-sm">{apiInfo.description}</p>
                  </div>
                </div>
              )}



              <div className="flex items-center space-x-4">
                <button
                  onClick={handleClearCache}
                  className="btn-secondary"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('settings.clearCache')}
                </button>
                <p className="text-dark-400 text-sm">
                  {t('settings.clearCacheDesc')}
                </p>
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
                  className="input-field w-full max-w-md"
                  disabled={formData.authMethod === 'microsoft'}
                />
                <p className="text-dark-400 text-xs mt-1">
                  {formData.authMethod === 'microsoft' 
                    ? t('auth.usernameFromMicrosoft')
                    : t('settings.usernameDescription')
                  }
                </p>
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
                <div className="flex items-center space-x-4">
                  <select
                    value={formData.allocatedRam}
                    onChange={(e) => handleInputChange('allocatedRam', parseInt(e.target.value))}
                    className="input-field"
                  >
                    {ramOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-dark-400 text-sm">
                    <p>{t('settings.ramRecommended')}</p>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-dark-700 rounded-lg">
                  <p className="text-dark-300 text-sm">
                    <strong>{t('app.note')}:</strong> {t('settings.ramNote')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Java Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Coffee className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.java')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.javaPathOptional')}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={formData.javaPath || ''}
                    onChange={(e) => handleInputChange('javaPath', e.target.value)}
                    placeholder={t('settings.javaPathAuto')}
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleSelectJavaPath}
                    className="btn-secondary"
                    title={t('settings.selectFolder')}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-dark-400 text-xs mt-1">
                  {t('settings.javaPathDescription')}
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Globe className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.advanced')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.dataUrl')}
                </label>
                <input
                  type="url"
                  value={formData.launcherDataUrl}
                  onChange={(e) => handleInputChange('launcherDataUrl', e.target.value)}
                  placeholder="https://api.luminakraft.com/v1/launcher_data.json"
                  className="input-field w-full"
                />
                <p className="text-dark-400 text-xs mt-1">
                  {t('settings.dataUrlDescription')}
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
            
            <div className="bg-dark-700 rounded-lg p-4">
              <MetaStorageSettings />
            </div>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className="sticky bottom-0 bg-dark-900 border-t border-dark-700 p-4 -mx-6">
              <div className="flex justify-between items-center">
                <p className="text-dark-400 text-sm">
                  {t('settings.unsavedChanges')}
                </p>
                <button
                  onClick={handleSave}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.saveChanges')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 