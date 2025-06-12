import React from 'react';
import { AlertTriangle, Terminal } from 'lucide-react';

const TauriWarning: React.FC = () => {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600/90 backdrop-blur-sm border-b border-yellow-500/50">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center justify-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-yellow-100 flex-shrink-0" />
          <div className="flex-1 text-center">
            <p className="text-yellow-100 font-medium">
              Modo de Desarrollo - Solo Vista Previa
            </p>
            <p className="text-yellow-200 text-sm">
              Para usar todas las funciones, ejecuta:
              <code className="bg-yellow-700/50 px-2 py-1 rounded mx-2 font-mono text-xs">
                npm run tauri:dev
              </code>
            </p>
          </div>
          <Terminal className="w-5 h-5 text-yellow-100 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
};

export default TauriWarning; 