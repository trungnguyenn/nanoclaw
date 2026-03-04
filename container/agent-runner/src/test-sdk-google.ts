import { query } from '@anthropic-ai/claude-agent-sdk';

async function main() {
  const env: Record<string, string> = {
    ...process.env,
    ANTHROPIC_PROVIDER: 'google',
    GOOGLE_API_KEY: 'AIzaSyA15tnyVEUu7OgQIATtMM5Dk1psF76id_g',
    ANTHROPIC_MODEL: 'google/gemini-2.0-flash-001',
  } as any;

  // Ensure no other provider vars leak in
  delete env.ANTHROPIC_BASE_URL;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;

  console.log('Testing SDK with Google provider...');
  try {
    const stream = query({
      prompt: 'Hello, are you Gemini? Reply with "YES_I_AM_GEMINI" if you are.',
      options: {
        env,
        permissionMode: 'bypassPermissions',
      },
    });

    for await (const message of stream) {
      if (message.type === 'result') {
        console.log('Final Result:', (message as any).result);
      } else if (message.type === 'assistant') {
        console.log('Assistant message:', JSON.stringify(message.message.content));
      }
    }
  } catch (err) {
    console.error('SDK Error:', err);
  }
}

main();
