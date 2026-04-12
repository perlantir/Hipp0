import { useState, useRef, useCallback, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  agentName: string;
}

export function ChatInput({ onSend, disabled, agentName }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, []);

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-light)',
        padding: '12px 16px',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? `${agentName} is thinking...` : `Message ${agentName}...`}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid var(--border-light)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 14,
          fontFamily: 'var(--font-body)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          outline: 'none',
          lineHeight: 1.5,
          maxHeight: 120,
          overflow: 'auto',
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 'none',
          background: disabled || !text.trim() ? 'var(--bg-secondary)' : 'var(--accent-primary)',
          color: disabled || !text.trim() ? 'var(--text-tertiary)' : '#fff',
          cursor: disabled || !text.trim() ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 18,
          transition: 'background 0.15s',
        }}
        title="Send message"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
