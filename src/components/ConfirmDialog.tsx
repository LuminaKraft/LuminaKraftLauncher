import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isLoading = false,
  type = 'danger'
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Scroll to dialog when it appears
  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);
  
  // Usar traducciones como valores por defecto si no se proporcionan
  const finalConfirmText = confirmText || t('app.confirm');
  const finalCancelText = cancelText || t('app.cancel');

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <Trash2 className="w-6 h-6 text-red-500 mr-2" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-lumina-500 mr-2" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700';
      default:
        return 'bg-lumina-600 hover:bg-lumina-700';
    }
  };

  const getLoadingText = () => {
    switch (type) {
      case 'danger':
        return t('modpacks.removing');
      default:
        return t('app.loading');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={dialogRef} className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {getIcon()}
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-dark-400 hover:text-white transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-dark-300 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
            disabled={isLoading}
          >
            {finalCancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${getButtonClass()}`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {getLoadingText()}
              </>
            ) : (
              finalConfirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog; 