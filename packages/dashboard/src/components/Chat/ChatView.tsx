import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageThread } from './MessageThread';
import { ChatInput } from './ChatInput';
import { AgentAvatar } from './MessageBubble';
import type { ChatMessage, ConnectionStatus, AgentInfo, WsServerMessage, ToolCallInfo } from './types';

function getWsUrl(): string {
  const loc = window.location;
  if (loc.hostname === 'app.hipp0.ai') {
    return 'wss://api.hipp0.ai/ws/chat';
  }
  // Local dev
  return `ws://${loc.hostname}:3300`;
}

function getApiBaseUrl(): string {
  const viteUrl = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_URL;
  if (viteUrl) return viteUrl;
  if (window.location.hostname === 'app.hipp0.ai') return 'https://api.hipp0.ai';
  return '';
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('alice');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const streamingMsgIdRef = useRef<string | null>(null);

  // Fetch agent list from HIPP0 API
  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    let apiKey = '';
    try { apiKey = localStorage.getItem('hipp0_api_key') || ''; } catch { /* */ }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const projectId = 'de000000-0000-4000-8000-000000000001';

    fetch(`${baseUrl}/api/hermes/agents?project_id=${projectId}`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data: AgentInfo[] | { agents: AgentInfo[] }) => {
        const list = Array.isArray(data) ? data : (data.agents || []);
        if (list.length > 0) {
          setAgents(list);
        } else {
          // Fallback: at least show alice
          setAgents([{ name: 'alice' }]);
        }
      })
      .catch(() => {
        setAgents([{ name: 'alice' }]);
      });
  }, []);

  // WebSocket connection with reconnection
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      handleWsMessage(msg);
    };

    ws.onclose = () => {
      setConnectionStatus('reconnecting');
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'stream_start': {
        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: '',
          agent_name: msg.agent_name,
          timestamp: Date.now(),
          tool_calls: [],
          isStreaming: true,
        };
        streamingMsgIdRef.current = newMsg.id;
        setMessages((prev) => [...prev, newMsg]);
        setIsStreaming(true);
        break;
      }

      case 'stream_delta': {
        const sid = streamingMsgIdRef.current;
        if (!sid) break;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === sid ? { ...m, content: m.content + msg.content } : m,
          ),
        );
        break;
      }

      case 'tool_call': {
        const sid = streamingMsgIdRef.current;
        if (!sid) break;
        const toolInfo: ToolCallInfo = {
          tool_name: msg.tool_name,
          tool_emoji: msg.tool_emoji,
          args_preview: msg.args_preview,
          result_preview: msg.result_preview,
          status: msg.status,
        };
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== sid) return m;
            const existing = m.tool_calls || [];
            // Update existing tool call or add new one
            const idx = existing.findIndex((t) => t.tool_name === toolInfo.tool_name && t.status === 'started');
            if (idx >= 0 && toolInfo.status !== 'started') {
              const updated = [...existing];
              updated[idx] = toolInfo;
              return { ...m, tool_calls: updated };
            }
            return { ...m, tool_calls: [...existing, toolInfo] };
          }),
        );
        break;
      }

      case 'stream_end': {
        const sid = streamingMsgIdRef.current;
        if (sid) {
          setMessages((prev) =>
            prev.map((m) => (m.id === sid ? { ...m, isStreaming: false } : m)),
          );
        }
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        break;
      }

      case 'error': {
        // Show error as a system message
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `**Error:** ${msg.message}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        if (!msg.recoverable) {
          setIsStreaming(false);
          streamingMsgIdRef.current = null;
        }
        break;
      }
    }
  }, []);

  // Send message
  const handleSend = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      // Add user message to thread
      const userMsg: ChatMessage = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Send over WebSocket
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          agent_name: selectedAgent,
          content,
        }),
      );
    },
    [selectedAgent],
  );

  // New conversation
  const handleNewChat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'command', command: 'new', agent_name: selectedAgent }),
      );
    }
    setMessages([]);
    setIsStreaming(false);
    streamingMsgIdRef.current = null;
  }, [selectedAgent]);

  // Select agent
  const handleSelectAgent = useCallback(
    (name: string) => {
      if (name === selectedAgent) return;
      setSelectedAgent(name);
      setMessages([]);
      setIsStreaming(false);
      streamingMsgIdRef.current = null;
      setSidebarOpen(false);
    },
    [selectedAgent],
  );

  const connectionDot =
    connectionStatus === 'connected'
      ? '#22c55e'
      : connectionStatus === 'reconnecting'
        ? '#eab308'
        : '#ef4444';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Blink animation */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      {/* Mobile agent toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: 'none',
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 100,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
        className="mobile-agent-toggle"
      >
        {'\uD83E\uDD16'}
      </button>

      {/* Agent sidebar */}
      <div
        style={{
          width: 240,
          borderRight: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
        className={`agent-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Agents
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connectionDot,
              }}
              title={connectionStatus}
            />
            <button
              onClick={handleNewChat}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border-light)',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: 16,
              }}
              title="New conversation"
            >
              +
            </button>
          </div>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {agents.map((agent) => {
            const isActive = agent.name === selectedAgent;
            return (
              <button
                key={agent.name}
                onClick={() => handleSelectAgent(agent.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive ? 'var(--bg-active)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <AgentAvatar name={agent.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                      color: 'var(--text-primary)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {agent.name}
                  </div>
                  {agent.status && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {agent.status}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main chat area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: 'var(--bg-primary)',
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-card)',
          }}
        >
          <AgentAvatar name={selectedAgent} size={28} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'capitalize',
            }}
          >
            {selectedAgent}
          </span>
          {connectionStatus !== 'connected' && (
            <span
              style={{
                fontSize: 12,
                color: connectionStatus === 'reconnecting' ? 'var(--accent-warning)' : 'var(--accent-danger)',
                marginLeft: 'auto',
              }}
            >
              {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
            </span>
          )}
        </div>

        <MessageThread messages={messages} isStreaming={isStreaming} />
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || connectionStatus !== 'connected'}
          agentName={selectedAgent}
        />
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .agent-sidebar {
            display: none !important;
          }
          .agent-sidebar.sidebar-open {
            display: flex !important;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 99;
            box-shadow: 4px 0 12px rgba(0,0,0,0.15);
          }
          .mobile-agent-toggle {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
