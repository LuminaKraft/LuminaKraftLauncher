import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

interface PathAutocompleteInputProps {
  suggestions: string[];
  onAdd: (_path: string) => void;
  placeholder?: string;
}

export default function PathAutocompleteInput({ suggestions, onAdd, placeholder }: PathAutocompleteInputProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : [];

  useEffect(() => {
    setOpen(filtered.length > 0 && value.length > 0);
    setHighlighted(-1);
  }, [value, filtered.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commit = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'Enter') { e.preventDefault(); commit(value); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0) commit(filtered[highlighted]);
      else commit(value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => { if (filtered.length > 0 && value) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'e.g. config, options.txt'}
          className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => commit(value)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg text-xs">
          {filtered.map((s, i) => (
            <li
              key={s}
              onMouseDown={() => commit(s)}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-3 py-1.5 cursor-pointer ${i === highlighted ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
