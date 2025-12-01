import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingModalProps {
  isOpen: boolean;
  message?: string;
  submessage?: string;
}

export const LoadingModal: React.FC<LoadingModalProps> = ({
  isOpen,
  message = 'Loading...',
  submessage
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-8 shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center space-y-4">
          {/* Spinner */}
          <div className="relative">
            <Loader2 className="w-12 h-12 text-lumina-400 animate-spin" />
            {/* Glow effect */}
            <div className="absolute inset-0 blur-xl bg-lumina-400/30 animate-pulse"></div>
          </div>

          {/* Message */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-white">
              {message}
            </h3>
            {submessage && (
              <p className="text-sm text-dark-300">
                {submessage}
              </p>
            )}
          </div>

          {/* Progress indicator */}
          <div className="w-full bg-dark-700 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-lumina-500 to-lumina-300 animate-loading-bar"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
