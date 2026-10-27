/**
 * Resolves the LLM configuration used for a chat turn.
 *
 * Precedence:
 *  1. An explicit modelId (UUID or provider model_id string) → that enabled row.
 *  2. The enabled model marked is_default → that row.
 *  3. Nothing → undefined, letting llm.ts fall back to process.env.
 *
 * NULL base_url/api_key are deliberately omitted so llm.ts readConfig() keeps
 * the environment values instead of being overwritten with undefined.
 */

import { pool } from '../db';
import type { LlmConfig } from './llm';

export async function resolveModelConfig({
  modelId
}: { modelId?: string | null }): Promise<Partial<LlmConfig> | undefined> {
  if (modelId) {
    const { rows } = await pool.query(
      `SELECT model_id, base_url, api_key
       FROM models
       WHERE is_enabled = true AND (
         ($1 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' AND id = $1::uuid)
         OR model_id = $1
       )
       LIMIT 1`,
      [modelId]
    );
    if (!rows[0]) return undefined;
    return modelRowToConfig(rows[0]);
  }

  const { rows } = await pool.query(
    `SELECT model_id, base_url, api_key
     FROM models
     WHERE is_enabled = true AND is_default = true
     LIMIT 1`
  );
  if (!rows[0]) return undefined;
  return modelRowToConfig(rows[0]);
}

function modelRowToConfig(row: { model_id: string; base_url?: string | null; api_key?: string | null }): Partial<LlmConfig> {
  const config: Partial<LlmConfig> = { model: row.model_id };
  if (row.base_url) {
    config.baseUrl = row.base_url.replace(/\/+$/, '');
  }
  if (row.api_key) {
    config.apiKey = row.api_key;
  }
  return config;
}
