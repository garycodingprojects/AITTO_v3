import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  loadModelsConfig,
  saveModelsConfig,
  validateClientLlmConfig,
  type ModelsConfig,
} from '../src/config/loadModelConfig.js';

describe('client LLM config validation', () => {
  it('requires baseURL and model', () => {
    assert.throws(() => validateClientLlmConfig({ baseURL: '', model: 'm' }), /baseURL/);
    assert.throws(() => validateClientLlmConfig({ baseURL: 'http://x/v1', model: '' }), /model/);
    assert.doesNotThrow(() =>
      validateClientLlmConfig({ baseURL: 'http://localhost:1234/v1', model: 'local-model' }),
    );
  });
});

describe('models.md config persistence', () => {
  it('round-trips frontmatter while preserving markdown body', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-agent-config-'));
    const configPath = path.join(tempDir, 'models.md');
    const body = '\n# Chat Agent Model Configuration\n\nHelp text stays here.\n';

    fs.writeFileSync(
      configPath,
      `---\nactive: local\nproviders:\n  local:\n    type: openai-compatible\n    baseURL: http://localhost:1234/v1\n    model: old-model\n---${body}`,
      'utf8',
    );

    const updated: ModelsConfig = {
      active: 'local',
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:1234/v1',
          model: 'new-model',
          apiKeyEnv: 'LOCAL_AI_API_KEY',
        },
      },
    };

    saveModelsConfig(updated, configPath);
    const loaded = loadModelsConfig(configPath);

    assert.equal(loaded.active, 'local');
    assert.equal(loaded.providers.local.model, 'new-model');
    assert.equal(loaded.providers.local.baseURL, 'http://127.0.0.1:1234/v1');

    const raw = fs.readFileSync(configPath, 'utf8');
    assert.ok(raw.includes('Help text stays here.'));
    assert.ok(raw.includes('new-model'));
  });

  it('creates models.md with defaults when the file is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-agent-config-'));
    const configPath = path.join(tempDir, 'models.md');

    const loaded = loadModelsConfig(configPath);

    assert.equal(loaded.active, 'local');
    assert.equal(loaded.providers.local.type, 'openai-compatible');
    assert.ok(fs.existsSync(configPath));
  });
});
