import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

export const adminRouter = Router();

// ----- Admin-only: models CRUD -----

adminRouter.get('/admin/models', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, model_id, base_url, is_enabled, is_default, sort_order, created_at
       FROM models
       ORDER BY sort_order ASC, label ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/models', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { label, model_id, base_url, api_key, is_enabled, is_default, sort_order } = req.body;
    if (!label || !model_id) {
      return res.status(400).json({ error: 'label and model_id are required.' });
    }
    if (is_default) {
      await pool.query('UPDATE models SET is_default = false WHERE is_default = true');
    }
    const { rows } = await pool.query(
      `INSERT INTO models (label, model_id, base_url, api_key, is_enabled, is_default, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, label, model_id, base_url, is_enabled, is_default, sort_order, created_at`,
      [label, model_id, base_url ?? null, api_key ?? null, is_enabled ?? true, is_default ?? false, sort_order ?? 0]
    );
    res.status(201).json({ ...rows[0], has_api_key: Boolean(rows[0].api_key) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/models/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, model_id, base_url, is_enabled, is_default, sort_order, created_at
       FROM models WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/admin/models/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, model_id, base_url, api_key, is_enabled, is_default, sort_order } = req.body;

    if (is_default) {
      await pool.query('UPDATE models SET is_default = false WHERE is_default = true');
    }

    const { rows } = await pool.query(
      `UPDATE models
       SET label = COALESCE($2, label),
           model_id = COALESCE($3, model_id),
           base_url = COALESCE($4, base_url),
           api_key = COALESCE($5, api_key),
           is_enabled = COALESCE($6, is_enabled),
           is_default = COALESCE($7, is_default),
           sort_order = COALESCE($8, sort_order)
       WHERE id = $1
       RETURNING id, label, model_id, base_url, is_enabled, is_default, sort_order, created_at`,
      [id, label, model_id, base_url, api_key, is_enabled, is_default, sort_order]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    res.json({ ...rows[0], has_api_key: Boolean(rows[0].api_key) });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/admin/models/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM models WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/models/:id/test', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT base_url, api_key, model_id FROM models WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    const { base_url, api_key, model_id } = rows[0];
    const base = (base_url || process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (api_key) headers['Authorization'] = `Bearer ${api_key}`;
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model: model_id || process.env.LLM_MODEL || 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'ping' }],
          temperature: 0.1,
          stream: false,
          max_tokens: 1
        })
      });
      if (!response.ok) {
        return res.status(200).json({ ok: false, error: `Provider responded ${response.status}` });
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(200).json({ ok: false, error: error?.message ?? 'Request failed' });
    }
  } catch (error) {
    next(error);
  }
});

// ----- Admin-only: settings -----

adminRouter.get('/admin/settings', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/admin/settings', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(updates)) {
        await client.query(
          `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, String(value)]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// ----- Public (authenticated): enabled models for picker -----

adminRouter.get('/models', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, model_id, is_default
       FROM models
       WHERE is_enabled = true
       ORDER BY sort_order ASC, label ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
