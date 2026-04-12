export interface ToolCallInfo {
  tool_name: string;
  tool_emoji?: string;
  args_preview?: string;
  result_preview?: string;
  status: 'started' | 'completed' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent_name?: string;
  timestamp: number;
  tool_calls?: ToolCallInfo[];
  isStreaming?: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// WebSocket protocol messages (server -> client)
export interface WsStreamStart {
  type: 'stream_start';
  conversation_id: string;
  agent_name: string;
  model: string;
}

export interface WsStreamDelta {
  type: 'stream_delta';
  content: string;
}

export interface WsToolCall {
  type: 'tool_call';
  tool_name: string;
  tool_emoji?: string;
  args_preview?: string;
  status: 'started' | 'completed' | 'error';
  result_preview?: string;
}

export interface WsStreamEnd {
  type: 'stream_end';
  conversation_id: string;
  tokens: { input?: number; output?: number; chunks?: number };
  duration_seconds: number;
}

export interface WsError {
  type: 'error';
  message: string;
  recoverable: boolean;
}

export type ProcessingStatus = 'idle' | 'compiling' | 'thinking' | 'capturing';

export interface WsStatusMessage {
  type: 'status';
  status: ProcessingStatus;
}

export interface WsHipp0Event {
  type: 'hipp0_event';
  event: 'compile' | 'capture' | 'recall' | 'prune';
  detail: string;
  duration_ms?: number;
}

export interface ActiveToolCall {
  tool_name: string;
  tool_emoji?: string;
  args_preview?: string;
  result_preview?: string;
  status: 'started' | 'completed' | 'error';
  started_at: number;
  completed_at?: number;
}

export interface Hipp0Activity {
  message: string;
  timestamp: number;
}

export type WsServerMessage =
  | WsStreamStart
  | WsStreamDelta
  | WsToolCall
  | WsStreamEnd
  | WsError
  | WsStatusMessage
  | WsHipp0Event;

// Agent info from HIPP0 API
export interface AgentInfo {
  name: string;
  agent_id?: string;
  status?: string;
}
