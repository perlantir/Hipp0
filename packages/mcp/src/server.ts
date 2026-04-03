import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NexusClient } from '../../sdk/src/index.js';
import { registerCaptureTools } from './tools/capture.js';
import { registerDecisionTools } from './tools/decisions.js';
import { registerContextTools } from './tools/context.js';
import { registerGraphTools } from './tools/graph.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerResources } from './resources/index.js';

export interface NexusServerConfig {
  apiUrl: string;
  apiKey?: string;
  projectId: string;
  /** Agent ID used for notification lookups */
  agentId?: string;
}

export function createNexusServer(config: NexusServerConfig): McpServer {
  const client = new NexusClient({
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
  });

  const server = new McpServer(
    {
      name: 'nexus',
      version: '0.1.0',
    },
    {
      instructions:
        'Nexus decision-memory server. Use nexus_compile_context at the start of every task to load relevant decisions. Use nexus_auto_capture or nexus_record_decision to record important choices.',
    },
  );

  registerCaptureTools(server, client, config);
  registerDecisionTools(server, client, config);
  registerContextTools(server, client, config);
  registerGraphTools(server, client, config);
  registerSessionTools(server, client, config);
  registerResources(server, client, config);

  return server;
}

export { McpServer, StdioServerTransport };
