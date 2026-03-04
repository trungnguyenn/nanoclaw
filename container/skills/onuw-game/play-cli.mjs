#!/usr/bin/env node

/**
 * ONUW Game CLI Entry Point
 *
 * Runs the One Night Ultimate Werewolf game skill directly via the Claude Agent SDK
 * without Docker/Telegram. Useful for testing the full agent + skill flow locally.
 *
 * Usage:
 *   node play-cli.mjs "Play game with 5 members: Alice, Bob, Cathy, Drian, Eria"
 *   node play-cli.mjs "Chơi game với 4 thành viên: An, Bình, Châu, Dũng"
 *   node play-cli.mjs  # Interactive mode (reads from stdin)
 *
 * Environment:
 *   ANTHROPIC_API_KEY - Required. Reads from NanoClaw .env if not set.
 *   NODE_PATH - Must include agent-runner/node_modules (set automatically)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = __dirname;
const NANOCLAW_ROOT = path.resolve(__dirname, '../../../..');

// Path to the SDK and MCP SDK
const AGENT_RUNNER_NODE_MODULES = path.join(NANOCLAW_ROOT, 'container/agent-runner/node_modules');

/**
 * Get API key from environment or NanoClaw .env file
 */
function getApiKey() {
  // First check environment variable
  let apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey) {
    // Try to read from .env file
    const envPath = path.join(NANOCLAW_ROOT, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      // Try ANTHROPIC_API_KEY first, then ANTHROPIC_AUTH_TOKEN (OpenRouter)
      let match = envContent.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/);
      if (!match) {
        match = envContent.match(/ANTHROPIC_AUTH_TOKEN\s*=\s*(.+)/);
      }
      if (match) {
        apiKey = match[1].trim();
      }
    }
  }

  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN not found.');
    console.error('Set it via environment or create a .env file');
    process.exit(1);
  }

  return apiKey;
}

/**
 * Create a temporary workspace for the game
 */
function createTempWorkspace(timestamp) {
  const workspaceDir = path.join('/tmp', `onuw-cli-${timestamp}`);

  // Create directory structure
  const dirs = [
    workspaceDir,
    path.join(workspaceDir, '.claude'),
    path.join(workspaceDir, '.claude', 'skills', 'onuw-game'),
    path.join(workspaceDir, 'onuw'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create symlink to skill directory
  const skillLink = path.join(workspaceDir, '.claude', 'skills', 'onuw-game');
  if (!fs.existsSync(skillLink)) {
    fs.symlinkSync(SKILL_DIR, skillLink, 'dir');
  }

  // Create symlink to agent-runner node_modules (for SDK access)
  const modulesLink = path.join(workspaceDir, 'node_modules');
  if (!fs.existsSync(modulesLink)) {
    fs.symlinkSync(AGENT_RUNNER_NODE_MODULES, modulesLink, 'dir');
  }

  // Create settings.json with agent teams enabled
  const settings = {
    permissions: {
      allow: ['*'],
      deny: [],
    },
    agentTeams: {
      enabled: true,
    },
  };
  fs.writeFileSync(
    path.join(workspaceDir, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2),
  );

  return workspaceDir;
}

/**
 * Generate CLAUDE.md for the game session
 */
function generateClaudeMd(workspaceDir, prompt) {
  const skillPath = '.claude/skills/onuw-game';
  const statePath = './onuw/state.json';

  const claudeMd = `# One Night Ultimate Werewolf — Game Session

You are the Game Master for One Night Ultimate Werewolf (ONUW).

## Important Paths

The game engine is at: \`${skillPath}/game-engine.mjs\`
The game state is at: \`${statePath}\`

Use relative paths from the working directory.

## Output

Use the MCP tool \`mcp__nanoclaw__send_message\` for ALL game communication:
- Game announcements (phase changes, results)
- Player messages (when you speak as the Game Master)

This outputs to the console so you can see the game flow.

## Skill

Load and follow the skill at: \`${skillPath}/SKILL.md\`

The skill provides the full game protocol for hosting ONUW games with AI agent players.

## Your Task

${prompt}
`;

  fs.writeFileSync(path.join(workspaceDir, 'CLAUDE.md'), claudeMd);
  return claudeMd;
}

/**
 * Run the game using the SDK via child process
 */
function runGame(prompt) {
  const timestamp = Date.now();
  const workspaceDir = createTempWorkspace(timestamp);

  console.error(`\n=== Creating game workspace: ${workspaceDir} ===\n`);

  // Generate CLAUDE.md
  generateClaudeMd(workspaceDir, prompt);

  // Get API key
  const apiKey = getApiKey();

  console.error('=== Starting Claude Agent with game skill ===\n');

  // Console MCP script path (copy to root for access)
  const consoleMcpPath = path.join(SKILL_DIR, 'console-mcp.mjs');
  const consoleMcpCopy = path.join(NANOCLAW_ROOT, 'console-mcp-temp.mjs');

  // Create the runner script content - now with local node_modules symlink
  const runnerScript = `
import { query } from '@anthropic-ai/claude-agent-sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const workspaceDir = process.env.CWD;
const consoleMcpPath = process.env.MCP_PATH;
const prompt = process.env.PROMPT;

async function main() {
  try {
    const result = await query({
      messages: [{ role: 'user', content: prompt }],
      cwd: workspaceDir,
      apiKey: apiKey,
      model: 'sonnet',
      maxTurns: 100,
      mcpServers: {
        nanoclaw: {
          command: 'node',
          args: [consoleMcpPath],
        },
      },
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'Task',
        'mcp__nanoclaw__send_message',
        'mcp__nanoclaw__schedule_task',
        'mcp__nanoclaw__list_tasks',
      ],
      permissionMode: 'bypassPermissions',
    });

    // Output result to stdout
    console.log('===RESULT_START===');
    console.log(JSON.stringify({
      success: true,
      finalMessage: result.message?.content?.[0]?.text || 'No output',
    }));
    console.log('===RESULT_END===');
  } catch (error) {
    console.error('===RESULT_START===');
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
    }));
    console.error('===RESULT_END===');
  }
}

main();
`;

  // Write the runner script in nanoclaw root (where node_modules is accessible)
  const runnerPath = path.join(NANOCLAW_ROOT, 'cli-runner-temp.mjs');
  fs.writeFileSync(runnerPath, runnerScript);

  // Also copy console-mcp.mjs to root for access
  const consoleMcpCopy = path.join(NANOCLAW_ROOT, 'console-mcp-temp.mjs');
  fs.copyFileSync(consoleMcpPath, consoleMcpCopy);

  // Set up environment with NODE_PATH
  const env = { ...process.env };
  env.ANTHROPIC_API_KEY = apiKey;
  env.CWD = workspaceDir;
  env.MCP_PATH = consoleMcpPath;
  env.PROMPT = prompt;
  env.NODE_PATH = AGENT_RUNNER_NODE_MODULES;

  // Spawn the runner from the nanoclaw root so it can find node_modules
  const child = spawn('node', [runnerPath], {
    cwd: NANOCLAW_ROOT,  // Run from root where node_modules exists
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    // Forward to our stdout
    process.stdout.write(text);
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    stderr += text;
    // Forward to our stderr
    process.stderr.write(text);
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      // Try to find the result in stdout
      const resultMatch = stdout.match(/===RESULT_START===([\s\S]*?)===RESULT_END===/);
      if (resultMatch) {
        try {
          const result = JSON.parse(resultMatch[1]);
          if (result.success) {
            // Show game log if exists
            const logPath = path.join(workspaceDir, 'onuw', 'game.log.md');
            if (fs.existsSync(logPath)) {
              console.log('\n--- Game Log ---');
              console.log(fs.readFileSync(logPath, 'utf-8'));
              console.log('--- End Log ---\n');
            }
            console.error(`\nWorkspace preserved at: ${workspaceDir}`);
            resolve(result);
          } else {
            reject(new Error(result.error));
          }
        } catch (e) {
          reject(e);
        }
      } else if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      } else {
        // Show game log if exists
        const logPath = path.join(workspaceDir, 'onuw', 'game.log.md');
        if (fs.existsSync(logPath)) {
          console.log('\n--- Game Log ---');
          console.log(fs.readFileSync(logPath, 'utf-8'));
          console.log('--- End Log ---\n');
        }
        console.error(`\nWorkspace preserved at: ${workspaceDir}`);
        resolve({ success: true });
      }
    });

    child.on('error', reject);
  });
}

/**
 * Main entry point
 */
async function main() {
  let prompt = process.argv[2];

  if (!prompt) {
    // Interactive mode - read from stdin
    console.log('Enter your prompt (Ctrl+D to finish):');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const lines = [];
    for await (const line of rl) {
      lines.push(line);
    }
    prompt = lines.join('\n');
  }

  if (!prompt || prompt.trim() === '') {
    console.error('Error: No prompt provided');
    console.error('Usage: node play-cli.mjs "Play game with 5 members: Alice, Bob, Cathy, Drian, Eria"');
    process.exit(1);
  }

  await runGame(prompt);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
