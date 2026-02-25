import { useState, useRef } from 'react';

/**
 * Pill-style tag input with autocomplete.
 *
 * Props:
 *   tags        – string[] currently selected tags
 *   onChange    – (tags: string[]) => void
 *   suggestions – string[] of all existing tags for autocomplete
 */
export default function TagInput({ tags, onChange, suggestions = [] }) {
  const [input,   setInput]   = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const normalise = (s) => s.trim().toLowerCase();

  const addTag = (raw) => {
    const tag = normalise(raw);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
  };

  const removeTag = (tag) => onChange(tags.filter((t) => t !== tag));

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  // Suggestions: match input text, exclude already-selected tags
  const matches = input.trim()
    ? suggestions.filter(
        (s) => s.includes(normalise(input)) && !tags.includes(s)
      ).slice(0, 6)
    : [];

  return (
    <div>
      {/* Chip container — clicking anywhere focuses the hidden input */}
      <div
        className={`flex flex-wrap gap-1 p-2 border rounded-lg bg-white dark:bg-gray-700 min-h-[38px] cursor-text transition-shadow ${
          focused
            ? 'border-brand-400 ring-2 ring-brand-400/30'
            : 'border-gray-300 dark:border-gray-600'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 border border-brand-200 dark:border-brand-500/40 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 leading-none"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? 'Type a tag and press Enter…' : ''}
          className="flex-1 min-w-[140px] bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none placeholder-gray-400 dark:placeholder-gray-500 py-0.5 px-1"
        />
      </div>

      {/* Inline autocomplete suggestions */}
      {focused && matches.length > 0 && (
        <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep input focused
              onClick={() => addTag(s)}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
