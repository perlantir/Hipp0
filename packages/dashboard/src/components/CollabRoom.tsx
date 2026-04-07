import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Users, Send, Check, X, Link, ChevronRight, MessageSquare, Clock, Wifi, WifiOff } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

// ── Types ────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  display_name: string;
  sender_type: 'human' | 'agent';
  platform: string;
  role: string;
  is_online: boolean;
}

interface Message {
  id: string;
  sender_name: string;
  sender_type: 'human' | 'agent' | 'system';
  message: string;
  message_type: string;
  mentions: string[] | string;
  created_at: string;
}

interface Step {
  id: string;
  step_number: number;
  agent_name: string;
  agent_role: string;
  output_summary: string;
  status: 'complete' | 'in_progress';
  comments_count: number;
  created_at: string;
}

interface Room {
  room_id: string;
  share_token: string;
  title: string;
  task_description: string;
  status: 'open' | 'closed' | 'archived';
  participants: Participant[];
  recent_messages: Message[];
  steps: Step[];
}

interface CreateRoomResult {
  room_id: string;
  share_token: string;
  share_url: string;
  status: string;
}

interface WsEvent {
  event: string;
  data: unknown;
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function platformBadgeColor(platform: string): string {
  switch (platform) {
    case 'openclaw': return '#7c3aed';
    case 'mcp': return '#0891b2';
    case 'sdk': return '#059669';
    case 'api': return '#d97706';
    default: return '#4b5563';
  }
}

function highlightMentions(text: string): React.ReactNode[] {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  );
}

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

/** Build a ws:// or wss:// URL for the collab room WS endpoint. */
function buildWsUrl(token: string): string {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  // Dashboard typically proxies to server on same host, or use VITE_API_URL
  const apiBase = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || loc.origin;
  const base = apiBase.replace(/^http/, 'ws');
  return `${base}/ws/room?token=${encodeURIComponent(token)}`;
}

// ── WebSocket hook ───────────────────────────────────────────────────────

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

function useCollabSocket(
  token: string | null,
  displayName: string | null,
  onEvent: (evt: WsEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null; }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    cleanup();
    setState('connecting');

    const url = buildWsUrl(token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('connected');
      reconnectAttempts.current = 0;

      // Send join with display name
      if (displayName) {
        ws.send(JSON.stringify({ type: 'join_room', token, display_name: displayName }));
      }

      // Start heartbeat every 20s
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 20_000);
    };

    ws.onmessage = (e) => {
      try {
        const evt = JSON.parse(String(e.data)) as WsEvent;
        onEvent(evt);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setState('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [token, displayName, onEvent, cleanup]);

  const scheduleReconnect = useCallback(() => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const attempt = reconnectAttempts.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
    reconnectAttempts.current = attempt + 1;

    reconnectTimer.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  // Send a message through the WebSocket
  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Connect when token changes
  useEffect(() => {
    if (token && displayName) {
      connect();
    }
    return cleanup;
  }, [token, displayName, connect, cleanup]);

  return { state, send };
}

// ── Component ────────────────────────────────────────────────────────────

export function CollabRoom() {
  const { get, post } = useApi();
  const { projectId } = useProject();

  const [phase, setPhase] = useState<'create' | 'room'>('create');
  const [room, setRoom] = useState<Room | null>(null);
  const [token, setToken] = useState('');

  // Create form
  const [title, setTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // In-room state
  const [myName, setMyName] = useState('');
  const [joined, setJoined] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [suggestion, setSuggestion] = useState<{ agent: string; reason: string } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  // ── WebSocket event handler ───────────────────────────────────────────

  const handleWsEvent = useCallback((evt: WsEvent) => {
    switch (evt.event) {
      case 'new_message': {
        const msg = evt.data as Message;
        setRoom(prev => {
          if (!prev) return prev;
          // Deduplicate by id
          if (prev.recent_messages.some(m => m.id === msg.id)) return prev;
          return { ...prev, recent_messages: [...prev.recent_messages, msg] };
        });
        break;
      }

      case 'new_step': {
        const step = evt.data as Step;
        setRoom(prev => {
          if (!prev) return prev;
          if (prev.steps.some(s => s.id === step.id)) return prev;
          return { ...prev, steps: [...prev.steps, step] };
        });
        break;
      }

      case 'participant_joined': {
        const data = evt.data as { participant?: Participant; display_name?: string };
        if (data.participant) {
          setRoom(prev => {
            if (!prev) return prev;
            if (prev.participants.some(p => p.id === data.participant!.id)) return prev;
            return { ...prev, participants: [...prev.participants, data.participant!] };
          });
        }
        break;
      }

      case 'participant_left':
      case 'participant_offline': {
        const data = evt.data as { display_name?: string; online?: string[] };
        if (data.display_name) {
          setRoom(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map(p =>
                p.display_name === data.display_name ? { ...p, is_online: false } : p
              ),
            };
          });
        }
        break;
      }

      case 'typing': {
        const data = evt.data as { sender_name?: string; is_typing?: boolean };
        if (data.sender_name && data.sender_name !== myName) {
          setTypingUsers(prev => {
            const next = new Map(prev);
            if (data.is_typing) {
              next.set(data.sender_name!, Date.now());
            } else {
              next.delete(data.sender_name!);
            }
            return next;
          });
        }
        break;
      }

      case 'suggestion': {
        const data = evt.data as { sender_name?: string; message?: string };
        if (data.message) {
          // Parse agent name from suggestion message if possible
          const match = data.message.match(/Suggesting (\w+) as next agent/);
          const agent = match ? match[1] : 'next-agent';
          setSuggestion({ agent, reason: data.message });
        }
        break;
      }

      case 'action': {
        // Clear suggestion when an action is taken
        setSuggestion(null);
        break;
      }

      case 'room_closed': {
        setRoom(prev => prev ? { ...prev, status: 'closed' } : prev);
        break;
      }

      default:
        break;
    }
  }, [myName]);

  // ── WebSocket connection ──────────────────────────────────────────────

  const { state: wsState, send: wsSend } = useCollabSocket(
    phase === 'room' && joined ? token : null,
    joined ? myName : null,
    handleWsEvent,
  );

  // ── Clean up stale typing indicators every 3s ────────────────────────

  useEffect(() => {
    const timer = setInterval(() => {
      setTypingUsers(prev => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        for (const [name, ts] of next) {
          if (now - ts > 4000) {
            next.delete(name);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // ── Polling fallback (only when WS is disconnected) ──────────────────

  const fetchRoom = useCallback(async (tok: string) => {
    try {
      const data = await get<Room>(`/api/collab/rooms/${tok}`);
      setRoom(data);

      // Simulate Brain suggestion if steps exist but no in_progress
      if (data.steps.length > 0 && !data.steps.some(s => s.status === 'in_progress')) {
        const agents = ['frontend', 'backend', 'security', 'qa', 'devops'];
        const reasons = ['codebase analysis needed', 'auth implementation ready for review', 'test coverage gap detected'];
        if (!suggestion) {
          setSuggestion({
            agent: agents[Math.floor(Math.random() * agents.length)],
            reason: reasons[Math.floor(Math.random() * reasons.length)],
          });
        }
      }
    } catch {
      // silent poll failure
    }
  }, [get, suggestion]);

  useEffect(() => {
    if (phase === 'room' && token) {
      // Always do initial fetch
      fetchRoom(token);

      // Only poll if WebSocket is disconnected
      if (wsState === 'disconnected') {
        pollRef.current = setInterval(() => fetchRoom(token), 3000);
      }

      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    }
  }, [phase, token, wsState, fetchRoom]);

  // Stop polling when WS connects
  useEffect(() => {
    if (wsState === 'connected' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [wsState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.recent_messages.length]);

  // ── Actions ──────────────────────────────────────────────────────────

  async function createRoom() {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: title.trim(), task_description: taskDesc.trim() };
      if (projectId && projectId !== 'default') body.project_id = projectId;
      const result = await post<CreateRoomResult>('/api/collab/rooms', body);
      setToken(result.share_token);
      setPhase('room');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  async function loadRoomByToken() {
    if (!token.trim()) return;
    setError(null);
    try {
      const data = await get<Room>(`/api/collab/rooms/${token.trim()}`);
      setRoom(data);
      setToken(token.trim());
      setPhase('room');
    } catch {
      setError('Room not found. Check the token and try again.');
    }
  }

  async function joinRoom() {
    if (!joinName.trim()) return;
    try {
      await post(`/api/collab/rooms/${token}/join`, { name: joinName.trim(), type: 'human', platform: 'browser' });
      setMyName(joinName.trim());
      setJoined(true);
      fetchRoom(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    }
  }

  async function sendMessage() {
    if (!chatMsg.trim() || !myName) return;
    setSending(true);

    // Clear typing indicator
    wsSend({ type: 'typing', is_typing: false });

    try {
      await post(`/api/collab/rooms/${token}/messages`, {
        sender_name: myName,
        sender_type: 'human',
        message: chatMsg.trim(),
        message_type: 'chat',
      });
      setChatMsg('');
      // WS will deliver the new message; no need for fetchRoom
      if (wsState !== 'connected') fetchRoom(token);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  function handleChatInput(value: string) {
    setChatMsg(value);

    // Throttle typing events to 1 per second
    const now = Date.now();
    if (now - lastTypingSent.current > 1000) {
      wsSend({ type: 'typing', is_typing: value.length > 0 });
      lastTypingSent.current = now;
    }

    // Clear typing after 3s of no input
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsSend({ type: 'typing', is_typing: false });
    }, 3000);
  }

  async function handleAction(action: 'accept' | 'override') {
    if (!suggestion) return;
    try {
      await post(`/api/collab/rooms/${token}/action`, {
        action_type: action,
        agent: suggestion.agent,
        reason: action === 'override' ? 'Manually overridden by operator' : undefined,
      });
      setSuggestion(null);
      if (wsState !== 'connected') fetchRoom(token);
    } catch {
      // silent
    }
  }

  async function seedDemo() {
    setError(null);
    try {
      const result = await post<{ room_id: string; share_token: string }>('/api/collab/rooms/seed-demo', {});
      setToken(result.share_token);
      setPhase('room');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed demo');
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/room/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  // ── Typing indicator text ─────────────────────────────────────────────

  const typingNames = [...typingUsers.keys()];
  const typingText = typingNames.length === 0
    ? null
    : typingNames.length === 1
      ? `${typingNames[0]} is typing...`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} are typing...`
        : `${typingNames[0]} and ${typingNames.length - 1} others are typing...`;

  // ── Styles ───────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 12,
    padding: 20,
  };

  const accentBtn: React.CSSProperties = {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  };

  const ghostBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-light)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  // ── Phase: Create ────────────────────────────────────────────────────

  if (phase === 'create') {
    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Radio size={22} color="var(--accent)" />
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Collab Room</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: '#059669' + '22', color: '#059669', letterSpacing: 1,
          }}>LIVE</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
          Create a shared room where humans and agents collaborate in real time.
          Share the link with any AI agent or team member.
        </p>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15, marginBottom: 16 }}>
            New Room
          </div>

          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
            Room title
          </label>
          <input
            style={{ ...inputStyle, marginBottom: 12 }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Build JWT Auth System"
          />

          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
            Task description (optional)
          </label>
          <textarea
            style={{ ...inputStyle, resize: 'none', marginBottom: 16 }}
            rows={3}
            value={taskDesc}
            onChange={e => setTaskDesc(e.target.value)}
            placeholder="Describe what needs to get done..."
          />

          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#7f1d1d22', border: '1px solid #991b1b44', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={!title.trim() || creating}
            style={{ ...accentBtn, width: '100%', opacity: (!title.trim() || creating) ? 0.6 : 1 }}
          >
            {creating ? 'Creating...' : 'Create Room'}
          </button>
        </div>

        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, marginBottom: 12 }}>
            Join Existing Room
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Room token (e.g. a1b2c3d4e)"
            />
            <button onClick={loadRoomByToken} style={accentBtn}>
              Join <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </button>
          </div>
        </div>

        <button
          onClick={seedDemo}
          style={{ ...ghostBtn, width: '100%', textAlign: 'center' }}
        >
          Load Demo Room
        </button>
      </div>
    );
  }

  // ── Phase: Room ──────────────────────────────────────────────────────

  if (!room) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-tertiary)' }}>
        Loading room...
      </div>
    );
  }

  // Join modal if not yet joined
  if (!joined) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: 20 }}>
        <div style={{ ...card }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>
            {room.title}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
            {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''} · {room.status}
          </div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
            Your display name
          </label>
          <input
            style={{ ...inputStyle, marginBottom: 12 }}
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            placeholder="Enter your name..."
            onKeyDown={e => { if (e.key === 'Enter') joinRoom(); }}
          />
          {error && (
            <div style={{ marginBottom: 12, color: '#fca5a5', fontSize: 13 }}>{error}</div>
          )}
          <button
            onClick={joinRoom}
            disabled={!joinName.trim()}
            style={{ ...accentBtn, width: '100%', opacity: !joinName.trim() ? 0.6 : 1 }}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  const onlineCount = room.participants.filter(p => p.is_online).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-light)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{room.title}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: '#059669' + '22', color: '#059669', letterSpacing: 1,
          }}>
            {room.status === 'open' ? 'LIVE' : room.status.toUpperCase()}
          </span>
          {/* Connection indicator */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: wsState === 'connected' ? '#059669' + '18' : wsState === 'connecting' ? '#d97706' + '18' : '#ef4444' + '18',
            color: wsState === 'connected' ? '#059669' : wsState === 'connecting' ? '#d97706' : '#ef4444',
          }}>
            {wsState === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
            {wsState === 'connected' ? 'WS' : wsState === 'connecting' ? 'Connecting' : 'Polling'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            Token: <code style={{ color: 'var(--text-secondary)' }}>{token}</code>
          </span>
          <button
            onClick={copyShareLink}
            style={{ ...ghostBtn, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Link size={13} />
            {copySuccess ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Main: Timeline + Chat */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Timeline panel */}
        <div style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--border-light)',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
              Timeline
            </span>
            {room.task_description && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                {room.task_description}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {room.steps.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                No steps yet. Accept a Brain suggestion to start.
              </div>
            )}

            {room.steps.map((step, i) => (
              <div key={step.id} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                {/* Dot + line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: step.status === 'in_progress' ? 'var(--accent)' : 'var(--bg-card)',
                    border: `2px solid ${step.status === 'in_progress' ? 'var(--accent)' : 'var(--border-light)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    color: step.status === 'in_progress' ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {step.status === 'in_progress'
                      ? <Clock size={13} />
                      : <Check size={13} color="#059669" />
                    }
                  </div>
                  {i < room.steps.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: 'var(--border-light)', marginTop: 4 }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {step.agent_name[0]?.toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                      {step.agent_name}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '1px 5px', borderRadius: 3,
                      background: step.status === 'in_progress' ? '#d97706' + '22' : '#059669' + '22',
                      color: step.status === 'in_progress' ? '#d97706' : '#059669',
                      fontWeight: 600,
                    }}>
                      {step.status === 'in_progress' ? 'working' : 'done'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
                    {step.output_summary}
                  </div>
                  {step.comments_count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--text-tertiary)', fontSize: 11 }}>
                      <MessageSquare size={11} />
                      {step.comments_count} comment{step.comments_count !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Brain suggestion */}
            {suggestion && room.status === 'open' && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--accent)',
                borderRadius: 10,
                padding: 14,
                marginTop: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 8 }}>
                  BRAIN SUGGESTION
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Next: {suggestion.agent}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
                  {suggestion.reason}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleAction('accept')}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none',
                      background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    <Check size={13} /> Accept
                  </button>
                  <button
                    onClick={() => handleAction('override')}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 6,
                      border: '1px solid var(--border-light)',
                      background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    <X size={13} /> Override
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {room.recent_messages.map(msg => {
              const isSystem = msg.sender_type === 'system';
              const isSuggestionMsg = msg.message_type === 'suggestion';

              if (isSystem) {
                return (
                  <div key={msg.id} style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: 12,
                      background: isSuggestionMsg ? 'var(--accent)' + '22' : 'var(--bg-secondary)',
                      color: isSuggestionMsg ? 'var(--accent)' : 'var(--text-tertiary)',
                      fontSize: 12,
                      border: isSuggestionMsg ? '1px solid var(--accent)' : 'none',
                    }}>
                      {msg.message}
                    </span>
                  </div>
                );
              }

              const isAgent = msg.sender_type === 'agent';
              const isMe = msg.sender_name === myName;

              return (
                <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: isAgent ? '#7c3aed' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                  }}>
                    {msg.sender_name[0]?.toUpperCase()}
                  </div>
                  <div style={{ maxWidth: '72%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        {msg.sender_name}
                      </span>
                      {isAgent && (
                        <span style={{
                          fontSize: 10, padding: '1px 5px', borderRadius: 3,
                          background: '#7c3aed' + '22', color: '#7c3aed', fontWeight: 600,
                        }}>agent</span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(msg.created_at)}</span>
                    </div>
                    <div style={{
                      padding: '9px 13px',
                      borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isMe ? 'var(--accent)' : 'var(--bg-card)',
                      border: isMe ? 'none' : '1px solid var(--border-light)',
                      color: isMe ? '#fff' : 'var(--text-primary)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}>
                      {highlightMentions(msg.message)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator */}
          {typingText && (
            <div style={{
              padding: '4px 20px',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
              flexShrink: 0,
            }}>
              {typingText}
            </div>
          )}

          {/* Input bar */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-card)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={chatMsg}
                onChange={e => handleChatInput(e.target.value)}
                placeholder={`Message as ${myName}... (use @name to mention)`}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={room.status !== 'open'}
              />
              <button
                onClick={sendMessage}
                disabled={!chatMsg.trim() || sending || room.status !== 'open'}
                style={{
                  ...accentBtn,
                  padding: '10px 14px',
                  opacity: (!chatMsg.trim() || sending) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Participants bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px',
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border-light)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12, flexShrink: 0 }}>
          <Users size={13} />
          <span>{onlineCount} online</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflow: 'hidden', flex: 1 }}>
          {room.participants.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px',
              borderRadius: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              flexShrink: 0,
              opacity: p.is_online ? 1 : 0.4,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: p.is_online ? '#059669' : '#9ca3af',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{p.display_name}</span>
              {p.sender_type === 'agent' && (
                <span style={{
                  fontSize: 10, padding: '1px 4px', borderRadius: 3,
                  background: platformBadgeColor(p.platform) + '22',
                  color: platformBadgeColor(p.platform),
                  fontWeight: 600,
                }}>
                  {p.platform}
                </span>
              )}
            </div>
          ))}
        </div>
        {room.status === 'open' && (
          <button
            onClick={async () => {
              try {
                await post(`/api/collab/rooms/${token}/close`, {});
                if (wsState !== 'connected') fetchRoom(token);
              } catch { /* silent */ }
            }}
            style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12, flexShrink: 0, color: '#fca5a5' }}
          >
            Close Room
          </button>
        )}
      </div>
    </div>
  );
}
