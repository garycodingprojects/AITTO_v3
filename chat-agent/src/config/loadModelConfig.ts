import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/** LLM credentials supplied by the browser on each chat request (never persisted server-side). */
export interface ClientLlmConfig {
  baseURL: string;
  model: string;
  apiKey?: string;
}

/** One provider entry from models.md frontmatter. */
export interface ModelProviderConfig {
  type: 'openai-compatible';
  baseURL: string;
  model: string;
  apiKeyEnv?: string;
}

/** Parsed models.md configuration. */
export interface ModelsConfig {
  active: string;
  providers: Record<string, ModelProviderConfig>;
}

/** Default markdown body written when models.md does not exist yet. */
const DEFAULT_MODELS_MD_BODY = [
  '',
  '# Chat Agent Model Configuration',
  '',
  'Edit the YAML frontmatter above to point at your local or LAN model server.',
  '',
  'Restart the chat-agent service after editing this file.',
  '',
].join('\n');

/** Default provider map used when creating models.md for the first time. */
const DEFAULT_MODELS_CONFIG: ModelsConfig = {
  active: 'local',
  providers: {
    local: {
      type: 'openai-compatible',
      baseURL: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKeyEnv: 'LOCAL_AI_API_KEY',
    },
  },
};

/**
 * Resolves the chat-agent project root by walking up to package.json (timefold-chat-agent).
 * Falls back to src/config/../.. when started from the TypeScript or dist layout.
 */
function resolveChatAgentRoot(): string {
  if (process.env.CHAT_AGENT_ROOT) {
    return path.resolve(process.env.CHAT_AGENT_ROOT);
  }

  let directory = path.dirname(fileURLToPath(import.meta.url));
  const filesystemRoot = path.parse(directory).root;

  while (directory !== filesystemRoot) {
    const packageJsonPath = path.join(directory, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string };
        if (packageJson.name === 'timefold-chat-agent') {
          return directory;
        }
      } catch {
        // Ignore invalid package.json and keep searching upward.
      }
    }
    directory = path.dirname(directory);
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

const CHAT_AGENT_ROOT = resolveChatAgentRoot();

/**
 * Validates models.md configuration before persisting or creating a model client.
 */
export function validateModelsConfig(config: ModelsConfig): void {
  if (!config.active || typeof config.active !== 'string') {
    throw new Error('Active provider key is required.');
  }
  if (!config.providers || typeof config.providers !== 'object') {
    throw new Error('Providers map is required.');
  }
  if (!config.providers[config.active]) {
    throw new Error(
      `Active model provider "${config.active}" not found. Available: ${Object.keys(config.providers).join(', ')}`,
    );
  }

  for (const [providerKey, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig || typeof providerConfig !== 'object') {
      throw new Error(`Provider "${providerKey}" must be an object.`);
    }
    if (providerConfig.type !== 'openai-compatible') {
      throw new Error(`Provider "${providerKey}" has unsupported type "${providerConfig.type}".`);
    }
    if (!providerConfig.baseURL || typeof providerConfig.baseURL !== 'string') {
      throw new Error(`Provider "${providerKey}" requires a baseURL string.`);
    }
    if (!providerConfig.model || typeof providerConfig.model !== 'string') {
      throw new Error(`Provider "${providerKey}" requires a model string.`);
    }
  }
}

/**
 * Returns the absolute path to models.md in the chat-agent folder.
 * Override with MODELS_CONFIG_PATH when running from a non-standard layout.
 */
export function getModelsConfigPath(configPath?: string): string {
  if (configPath) {
    return path.resolve(configPath);
  }
  if (process.env.MODELS_CONFIG_PATH) {
    return path.resolve(process.env.MODELS_CONFIG_PATH);
  }
  return path.join(CHAT_AGENT_ROOT, 'models.md');
}

/** Returns the chat-agent folder that contains models.md. */
export function getChatAgentRoot(): string {
  return CHAT_AGENT_ROOT;
}

/**
 * Creates models.md with default frontmatter when the file is missing.
 */
function ensureModelsConfigFile(resolvedPath: string): void {
  if (fs.existsSync(resolvedPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const output = matter.stringify(DEFAULT_MODELS_MD_BODY, {
    active: DEFAULT_MODELS_CONFIG.active,
    providers: DEFAULT_MODELS_CONFIG.providers,
  });
  fs.writeFileSync(resolvedPath, output, 'utf8');
}

/**
 * Loads and parses models.md YAML frontmatter from the chat-agent folder.
 */
export function loadModelsConfig(configPath?: string): ModelsConfig {
  const resolvedPath = getModelsConfigPath(configPath);
  ensureModelsConfigFile(resolvedPath);

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read models.md at ${resolvedPath}: ${details}`);
  }
  const parsed = matter(raw);

  const active = String(parsed.data.active ?? 'local');
  const providers = (parsed.data.providers ?? {}) as Record<string, ModelProviderConfig>;

  const config: ModelsConfig = { active, providers };
  validateModelsConfig(config);
  return config;
}

/**
 * Writes models.md frontmatter while preserving the markdown body below the YAML block.
 */
export function saveModelsConfig(config: ModelsConfig, configPath?: string): void {
  validateModelsConfig(config);
  const resolvedPath = getModelsConfigPath(configPath);
  ensureModelsConfigFile(resolvedPath);

  let markdownBody = DEFAULT_MODELS_MD_BODY;
  if (fs.existsSync(resolvedPath)) {
    try {
      markdownBody = matter(fs.readFileSync(resolvedPath, 'utf8')).content || DEFAULT_MODELS_MD_BODY;
    } catch {
      markdownBody = DEFAULT_MODELS_MD_BODY;
    }
  }

  const frontmatter = {
    active: config.active,
    providers: config.providers,
  };

  const output = matter.stringify(markdownBody, frontmatter);
  fs.writeFileSync(resolvedPath, output, 'utf8');
}

/**
 * Validates client-supplied LLM settings before building a model client.
 */
export function validateClientLlmConfig(config: ClientLlmConfig): void {
  if (!config || typeof config !== 'object') {
    throw new Error('llmConfig object is required.');
  }
  if (!config.baseURL || typeof config.baseURL !== 'string') {
    throw new Error('llmConfig.baseURL is required.');
  }
  if (!config.model || typeof config.model !== 'string') {
    throw new Error('llmConfig.model is required.');
  }
}

/**
 * Creates an AI SDK language model from per-request client credentials.
 */
export function createModelFromClientConfig(config: ClientLlmConfig): {
  model: LanguageModel;
  activeProvider: string;
  modelId: string;
  baseURL: string;
} {
  validateClientLlmConfig(config);

  const baseURL = config.baseURL.trim();
  const modelId = config.model.trim();
  const apiKey = (config.apiKey ?? '').trim() || 'not-needed';

  const provider = createOpenAICompatible({
    name: 'client',
    baseURL,
    apiKey,
  });

  return {
    model: provider.chatModel(modelId),
    activeProvider: 'client',
    modelId,
    baseURL,
  };
}

/**
 * Creates an AI SDK language model from the active provider in models.md.
 */
export function createModelFromConfig(config?: ModelsConfig): {
  model: LanguageModel;
  activeProvider: string;
  modelId: string;
  baseURL: string;
} {
  const modelsConfig = config ?? loadModelsConfig();
  const providerConfig = modelsConfig.providers[modelsConfig.active];

  if (providerConfig.type !== 'openai-compatible') {
    throw new Error(`Unsupported provider type: ${providerConfig.type}`);
  }

  const apiKeyEnv = providerConfig.apiKeyEnv ?? 'LOCAL_AI_API_KEY';
  const apiKey = process.env[apiKeyEnv] ?? 'not-needed';

  const provider = createOpenAICompatible({
    name: modelsConfig.active,
    baseURL: providerConfig.baseURL,
    apiKey,
  });

  return {
    model: provider.chatModel(providerConfig.model),
    activeProvider: modelsConfig.active,
    modelId: providerConfig.model,
    baseURL: providerConfig.baseURL,
  };
}
