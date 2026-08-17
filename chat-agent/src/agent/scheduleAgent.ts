import { ToolLoopAgent, isStepCount } from 'ai';
import { createModelFromClientConfig, type ClientLlmConfig } from '../config/loadModelConfig.js';
import { createScheduleTools } from './tools.js';
import {
  mergeSoftConstraintSettings,
  serializeSoftConstraintSettings,
  SOFT_CONSTRAINT_DEFINITIONS,
} from '../timetable/softConstraints.js';
import {
  createSessionContext,
  type AgentSessionContext,
  type ChatAttachment,
} from '../timetable/types.js';
import type { SoftConstraintSetting, SoftConstraintSettings } from '../timetable/softConstraints.js';

/** Default Quarkus Timefold base URL when running locally. */
export const DEFAULT_TIMEFOLD_BASE_URL = process.env.TIMEFOLD_BASE_URL ?? 'http://localhost:8080';

const AGENT_INSTRUCTIONS = `You are a school timetabling assistant for the VTC AI Timetabling System.

You may ONLY work with timetable data through the provided tools. These tools call the Timefold Quarkus REST API and helper logic scoped to the timefold/ project.

Capabilities:
- Create subject cards and unsolved timetables
- Load demo data (dataset1, dataset2)
- Solve timetables and report scores
- Enable, disable, or weight optional soft constraints before solving (listSoftConstraints, configureSoftConstraints)
- Check constraints / violations without solving
- Summarize and analyze timetables (busiest teacher, violations, feasibility, load)
- Find common free timeslots across teachers and student groups
- Find replacement-teacher windows when someone is on sick leave

Rules:
- Prefer using tools instead of guessing timetable data.
- When the user asks analytical questions ("what is wrong", "busiest teacher", "summarize", "why infeasible"), call analyzeTimetable and explain using the returned metrics.
- When the user asks to solve with preferences (room stability, consecutive lessons, lunch breaks, subject variety), call configureSoftConstraints then solveTimetable.
- Soft constraints are disabled by default (same as Demo UI). Tell the user which soft constraints are active when solving.
- After solving or scoring, mention the score and whether hard constraints are feasible (0hard).
- When creating cards, ensure rooms, teachers, and student groups are consistent.
- For sick-leave replacement, treat the target teacher as unavailable and search potential replacements.
- Keep answers concise and actionable for school administrators.
- Never claim you edited files or ran shell commands; you only use timetable tools.`;

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponsePayload {
  text: string;
  attachments: ChatAttachment[];
  steps: number;
  activeProvider: string;
  modelId: string;
  softConstraintSettings: SoftConstraintSettings;
}

export interface RunScheduleAgentChatOptions {
  /** OpenAI-compatible LLM credentials from the browser (not stored server-side). */
  llmConfig: ClientLlmConfig;
  softConstraintSettings?: Partial<Record<string, Partial<SoftConstraintSetting>>> | null;
}

/**
 * Runs one chat turn through the ToolLoopAgent with a fresh session context.
 */
export async function runScheduleAgentChat(
  messages: ChatRequestMessage[],
  options: RunScheduleAgentChatOptions,
): Promise<ChatResponsePayload> {
  const { model, activeProvider, modelId } = createModelFromClientConfig(options.llmConfig);
  const sessionContext: AgentSessionContext = createSessionContext(
    DEFAULT_TIMEFOLD_BASE_URL,
    mergeSoftConstraintSettings(options.softConstraintSettings),
  );

  const agent = new ToolLoopAgent({
    model,
    instructions: AGENT_INSTRUCTIONS,
    tools: createScheduleTools(sessionContext),
    stopWhen: isStepCount(25),
  });

  const prompt = formatMessagesAsPrompt(messages);
  const result = await agent.generate({ prompt });

  return {
    text: result.text,
    attachments: sessionContext.attachments,
    steps: result.steps.length,
    activeProvider,
    modelId,
    softConstraintSettings: serializeSoftConstraintSettings(sessionContext.softConstraintSettings),
  };
}

/** Soft constraint metadata for the chat UI (mirrors Demo UI panel). */
export function listSoftConstraintDefinitionsForUi() {
  return SOFT_CONSTRAINT_DEFINITIONS.map(definition => ({
    id: definition.id,
    name: definition.name,
    label: definition.label,
    labelZh: definition.labelZh,
  }));
}

/** Converts chat history into a single prompt string for generate(). */
function formatMessagesAsPrompt(messages: ChatRequestMessage[]): string {
  return messages
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');
}
