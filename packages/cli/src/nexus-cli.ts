#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerDecisionCommands } from './commands/decisions.js';
import { registerCompileCommand } from './commands/compile.js';
import { registerDistillCommand } from './commands/distill.js';
import { registerAgentCommands } from './commands/agents.js';
import { registerNotificationCommands } from './commands/notifications.js';
import { registerStatusCommands } from './commands/status.js';

const program = new Command();

program
  .name('nexus')
  .description('Nexus — AI team memory, decision tracking, and context compilation')
  .version('0.1.0');

registerInitCommand(program);
registerDecisionCommands(program);
registerCompileCommand(program);
registerDistillCommand(program);
registerAgentCommands(program);
registerNotificationCommands(program);
registerStatusCommands(program);

program.parse(process.argv);

if (process.argv.length < 3) {
  program.outputHelp();
}
