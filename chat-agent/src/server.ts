import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateClientLlmConfig, type ClientLlmConfig } from './config/loadModelConfig.js';
import { runScheduleAgentChat, listSoftConstraintDefinitionsForUi } from './agent/scheduleAgent.js';
import { createDefaultSoftConstraintSettings } from './timetable/softConstraints.js';

/** Chat-agent HTTP server (default port 3001). */
const app = new Hono();

app.use(
  '*',
  cors({
    origin: origin => origin ?? '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

/** Health check for the chat UI status badge. */
app.get('/api/health', context => context.json({ ok: true }));

/**
 * Returns agent metadata (soft constraints). LLM credentials are supplied by the browser per request.
 */
app.get('/api/config', context => {
  return context.json({
    requiresClientLlm: true,
    softConstraints: listSoftConstraintDefinitionsForUi(),
    defaultSoftConstraintSettings: createDefaultSoftConstraintSettings(),
  });
});

/** Runs one chat turn through the ToolLoopAgent using client-supplied LLM credentials. */
app.post('/api/chat', async context => {
  try {
    const body = await context.req.json<{
      messages?: Array<{ role: string; content: string }>;
      llmConfig?: ClientLlmConfig;
      softConstraintSettings?: Record<string, { enabled?: boolean; weight?: number }>;
    }>();

    if (!body.llmConfig) {
      return context.json(
        { message: 'llmConfig is required. Configure your LLM API in the model setup dialog.' },
        400,
      );
    }

    try {
      validateClientLlmConfig(body.llmConfig);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : String(validationError);
      return context.json({ message }, 400);
    }

    const messages = (body.messages ?? [])
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        role: message.role as 'user' | 'assistant',
        content: String(message.content ?? ''),
      }));

    if (messages.length === 0) {
      return context.json({ message: 'messages array is required' }, 400);
    }

    const response = await runScheduleAgentChat(messages, {
      llmConfig: body.llmConfig,
      softConstraintSettings: body.softConstraintSettings,
    });
    return context.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[chat-agent] /api/chat failed:', message);
    return context.json({ message }, 500);
  }
});

const port = Number(process.env.CHAT_AGENT_PORT ?? 3001);

console.log('[chat-agent] LLM credentials are supplied by the browser per request (not stored server-side).');
console.log(`[chat-agent] Listening on http://localhost:${port}`);
const server = serve({ fetch: app.fetch, port });

// Explain EADDRINUSE clearly when a previous chat-agent instance is still running.
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[chat-agent] Port ${port} is already in use. Stop the existing process, then run npm run dev again:`);
    console.error(`  Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    process.exit(1);
  }
  throw error;
});
