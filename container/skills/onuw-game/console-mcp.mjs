#!/usr/bin/env node

/**
 * Console MCP Server for ONUW Game CLI Testing
 *
 * A lightweight MCP server (stdio transport) that replaces the container's
 * ipc-mcp-stdio.ts for CLI mode. It provides the same send_message tool
 * but outputs to stderr with formatted labels instead of writing IPC files.
 *
 * Usage:
 *   node console-mcp.mjs
 *
 * The server reads from stdin and writes to stdout using the MCP stdio protocol.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  {
    text: z.string().describe('The message text to send'),
    sender: z
      .string()
      .optional()
      .describe(
        'Your role/identity name (e.g. "Alice", "Bob"). When set, messages appear with that sender label.',
      ),
  },
  async (args) => {
    const sender = args.sender || 'Game Master';
    const formatted = args.sender
      ? `[${args.sender}] ${args.text}`
      : `[Game Master] ${args.text}`;

    // Write to stderr so it's visible in terminal but doesn't interfere with MCP protocol
    process.stderr.write(`\n${formatted}\n\n`);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

// No-op implementations for schedule_task and list_tasks (so the agent doesn't error)
server.tool(
  'schedule_task',
  'Schedule a recurring or one-time task. (No-op in CLI mode)',
  {
    prompt: z.string().describe('What the agent should do'),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .describe('Type of schedule'),
    schedule_value: z.string().describe('Schedule value'),
  },
  async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Task scheduling is not available in CLI mode. This is a no-op.',
        },
      ],
    };
  },
);

server.tool(
  'list_tasks',
  'List all scheduled tasks. (No-op in CLI mode)',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Task listing is not available in CLI mode.',
        },
      ],
    };
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);