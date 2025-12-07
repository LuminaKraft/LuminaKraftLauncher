import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Copy, Check, Download, Search, X, Filter } from 'lucide-react';
import { useAnimation } from '../../../../contexts/AnimationContext';
import toast from 'react-hot-toast';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

interface LogsSectionProps {
  logs: string[];
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LogsSection: React.FC<LogsSectionProps> = ({ logs }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [levelFilters, setLevelFilters] = useState<Record<LogLevel, boolean>>({
    error: true,
    warn: true,
    info: true,
    debug: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Determine log level from line content
  const getLogLevel = (line: string): LogLevel => {
    const lower = line.toLowerCase();
    if (lower.includes('/error') || lower.includes('exception:') || lower.includes('error:')) {
      return 'error';
    } else if (lower.includes('/warn') || lower.includes('warn:')) {
      return 'warn';
    } else if (lower.includes('/debug') || lower.includes('debug:')) {
      return 'debug';
    }
    return 'info';
  };

  // Filter logs based on search and level filters
  const filteredLogs = useMemo(() => {
    return logs.filter(line => {
      // Check level filter
      const level = getLogLevel(line);
      if (!levelFilters[level]) return false;

      // Check search filter
      if (searchFilter && !line.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [logs, searchFilter, levelFilters]);

  // Auto-scroll to bottom when new logs arrive (if enabled)
  useEffect(() => {
    if (containerRef.current && autoScroll) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Handle scroll - disable auto-scroll if user scrolls up
  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  // Copy all logs to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      toast.success(t('modpacks.logsCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t('modpacks.logsCopyFailed'));
    }
  };

  // Download logs as file using Tauri dialog
  const handleDownload = async () => {
    try {
      const content = logs.join('\n');
      const defaultName = `minecraft-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Log files', extensions: ['log', 'txt'] }]
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        toast.success(t('modpacks.logsDownloaded'));
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error(t('modpacks.logsDownloadFailed'));
    }
  };

  // Toggle level filter
  const toggleLevelFilter = (level: LogLevel) => {
    setLevelFilters(prev => ({ ...prev, [level]: !prev[level] }));
  };

  // Get color class for log line
  const getColorClass = (line: string): string => {
    const level = getLogLevel(line);
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-green-400';
    }
  };

  // Level filter button component
  const LevelButton = ({ level, label, color }: { level: LogLevel; label: string; color: string }) => (
    <button
      type="button"
      onClick={() => toggleLevelFilter(level)}
      className={`px-2 py-1 text-xs font-medium rounded transition-all ${levelFilters[level]
        ? `${color} ring-1 ring-current`
        : 'bg-dark-700 text-dark-400'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`space-y-4 ${getAnimationClass('transition-all duration-200')}`}
      style={getAnimationStyle({
        animation: `fadeInUp 0.3s ease-out 0.1s backwards`
      })}
    >
      {logs.length === 0 ? (
        <div className="text-center py-12">
          <Terminal className="w-12 h-12 text-dark-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">{t('modpacks.noLogsAvailable')}</h3>
          <p className="text-dark-400">{t('modpacks.logsWillAppear')}</p>
        </div>
      ) : (
        <>
          {/* Header with actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Terminal className="w-5 h-5" />
                <span>{t('modpacks.executionLogs')}</span>
              </h3>
              <span className="text-xs bg-dark-700 px-2 py-1 rounded-full text-dark-300">
                {filteredLogs.length}/{logs.length} {t('modpacks.lines')}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center space-x-1 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm rounded-lg transition-colors"
                title={t('modpacks.copyLogs')}
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? t('modpacks.copied') : t('modpacks.copy')}</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center space-x-1 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm rounded-lg transition-colors"
                title={t('modpacks.downloadLogs')}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{t('modpacks.download')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center space-x-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${showFilters
                  ? 'bg-lumina-600 text-white'
                  : 'bg-dark-700 hover:bg-dark-600 text-dark-200'
                  }`}
                title={t('modpacks.filterLogs')}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">{t('modpacks.filter')}</span>
              </button>
            </div>
          </div>

          {/* Search and filters */}
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-3 p-3 bg-dark-800 rounded-lg border border-dark-700">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={t('modpacks.searchLogs')}
                  className="w-full pl-9 pr-8 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-400 focus:ring-2 focus:ring-lumina-500 focus:border-transparent"
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Level filters */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-dark-400 mr-1">{t('modpacks.levels')}:</span>
                <LevelButton level="error" label="Error" color="bg-red-900/50 text-red-400" />
                <LevelButton level="warn" label="Warn" color="bg-yellow-900/50 text-yellow-400" />
                <LevelButton level="info" label="Info" color="bg-green-900/50 text-green-400" />
                <LevelButton level="debug" label="Debug" color="bg-gray-700 text-gray-400" />
              </div>
            </div>
          )}

          {/* Log output */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="bg-[#0d1117] font-mono text-sm p-4 rounded-lg h-[500px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent border border-dark-700"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-dark-400 text-center py-8">
                {t('modpacks.noMatchingLogs')}
              </div>
            ) : (
              filteredLogs.map((line, idx) => {
                const colorClass = getColorClass(line);
                return (
                  <div key={idx} className={`whitespace-pre-wrap break-words leading-relaxed hover:bg-dark-800/50 ${colorClass}`}>
                    <span className="text-dark-500 select-none mr-3 inline-block w-8 text-right">
                      {String(idx + 1).padStart(3, '0')}
                    </span>
                    <span className="select-text">{line}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Auto-scroll indicator */}
          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                if (containerRef.current) {
                  containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }
              }}
              className="fixed bottom-6 right-6 px-4 py-2 bg-lumina-600 hover:bg-lumina-500 text-white text-sm rounded-full shadow-lg transition-colors flex items-center space-x-2"
            >
              <span>↓</span>
              <span>{t('modpacks.scrollToBottom')}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default LogsSection; 