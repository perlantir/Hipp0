import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from './types';

interface MessageThreadProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageThread({ messages, isStreaming }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messages.length > 0 ? messages[messages.length - 1]?.content : '']);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          padding: 32,
          textAlign: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48, opacity: 0.5 }}>{'\uD83D\uDCAC'}</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Start a conversation</div>
        <div style={{ fontSize: 13 }}>
          Type a message below to chat with your agent.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Typing indicator */}
      {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 0',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          <span className="typing-dots">
            <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0s' }}>{'\u2022'}</span>
            <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.2s' }}>{'\u2022'}</span>
            <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.4s' }}>{'\u2022'}</span>
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
