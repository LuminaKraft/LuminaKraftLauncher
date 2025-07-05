import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

interface LogsSectionProps {
  logs: string[];
}

const LogsSection: React.FC<LogsSectionProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="space-y-4">
      {logs.length === 0 ? (
        <div className="text-center py-12">
          <Terminal className="w-12 h-12 text-dark-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No hay logs disponibles</h3>
          <p className="text-dark-400">Los logs aparecerán aquí cuando se inicie el modpack</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <Terminal className="w-5 h-5" />
              <span>Logs de ejecución</span>
            </h3>
            <span className="text-xs bg-dark-700 px-2 py-1 rounded-full text-dark-300">
              {logs.length} líneas
            </span>
          </div>
          <div
            ref={containerRef}
            className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent"
          >
            {logs.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words leading-relaxed">
                <span className="text-dark-500 select-none mr-2">
                  {String(idx + 1).padStart(3, '0')}:
                </span>
                {line}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LogsSection; 