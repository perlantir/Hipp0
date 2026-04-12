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

export type WsServerMessage = WsStreamStart | WsStreamDelta | WsToolCall | WsStreamEnd | WsError;

// Agent info from HIPP0 API
export interface AgentInfo {
  name: string;
  agent_id?: string;
  status?: string;
}
