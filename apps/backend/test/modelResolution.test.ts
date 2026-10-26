import { pool } from '../src/db';
import { resolveModelConfig } from '../src/services/modelConfig';

beforeAll(async () => {
  await pool.query('TRUNCATE TABLE models CASCADE');
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await pool.query('TRUNCATE TABLE models CASCADE');
});

describe('resolveModelConfig', () => {
  test('returns undefined when no models exist → env fallback', async () => {
    const config = await resolveModelConfig({ modelId: undefined });
    expect(config).toBeUndefined();
  });

  test('uses the single enabled default model', async () => {
    await pool.query(
      `INSERT INTO models (label, model_id, base_url, api_key, is_enabled, is_default)
       VALUES ('Default', 'provider/default', 'https://api.default.com/v1', 'key-default', true, true)`
    );

    const config = await resolveModelConfig({ modelId: undefined });
    expect(config).toEqual({
      model: 'provider/default',
      baseUrl: 'https://api.default.com/v1',
      apiKey: 'key-default'
    });
  });

  test('ignores a disabled default model', async () => {
    // At most one default may exist (DB unique index). Insert an enabled default.
    await pool.query(
      `INSERT INTO models (label, model_id, base_url, api_key, is_enabled, is_default)
       VALUES ('Enabled Default', 'provider/enabled-default', 'https://api.enabled.com/v1', 'key-enabled', true, true)`
    );
    // A disabled non-default model is ignored by the default lookup.
    await pool.query(
      `INSERT INTO models (label, model_id, is_enabled, is_default)
       VALUES ('Disabled Non-default', 'provider/disabled', false, false)`
    );

    const config = await resolveModelConfig({ modelId: undefined });
    expect(config?.model).toBe('provider/enabled-default');
    expect(config?.baseUrl).toBe('https://api.enabled.com/v1');
  });

  test('resolves an explicit model by UUID', async () => {
    const { rows } = await pool.query(
      `INSERT INTO models (label, model_id, base_url, is_enabled)
       VALUES ('By UUID', 'provider/by-uuid', 'https://api.by-uuid.com/v1', true)
       RETURNING id`
    );

    const config = await resolveModelConfig({ modelId: rows[0].id as string });
    expect(config?.model).toBe('provider/by-uuid');
    expect(config?.baseUrl).toBe('https://api.by-uuid.com/v1');
  });

  test('resolves an explicit model by provider model_id string', async () => {
    await pool.query(
      `INSERT INTO models (label, model_id, base_url, is_enabled)
       VALUES ('By String', 'provider/by-string', 'https://api.by-string.com/v1', true)`
    );

    const config = await resolveModelConfig({ modelId: 'provider/by-string' });
    expect(config?.model).toBe('provider/by-string');
    expect(config?.baseUrl).toBe('https://api.by-string.com/v1');
  });

  test('NULL base_url/api_key are omitted so env survives readConfig spread', async () => {
    await pool.query(
      `INSERT INTO models (label, model_id, base_url, api_key, is_enabled, is_default)
       VALUES ('Null Fields', 'provider/null-fields', NULL, NULL, true, true)`
    );

    const config = await resolveModelConfig({ modelId: undefined });
    expect(config?.model).toBe('provider/null-fields');
    // Keys must be absent entirely, not present as undefined.
    expect('baseUrl' in (config ?? {})).toBe(false);
    expect('apiKey' in (config ?? {})).toBe(false);
    expect(config?.baseUrl).toBeUndefined();
    expect(config?.apiKey).toBeUndefined();
  });

  test('a non-existent modelId returns undefined → env fallback', async () => {
    const config = await resolveModelConfig({ modelId: 'does-not-exist' });
    expect(config).toBeUndefined();
  });

  test('a disabled model is not returned even when matched exactly', async () => {
    await pool.query(
      `INSERT INTO models (label, model_id, base_url, is_enabled)
       VALUES ('Disabled', 'provider/disabled-exact', 'https://api.disabled.com/v1', false)`
    );

    const config = await resolveModelConfig({ modelId: 'provider/disabled-exact' });
    expect(config).toBeUndefined();
  });
});
