import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import type { Source } from './questions.types';

export const conversationsRouter = Router();

conversationsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT count(*) FROM qa_history q WHERE q.conversation_id = c.id) AS message_count
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 100`,
      [req.user?.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

conversationsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const { rows: conversations } = await pool.query(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2',
      [id, req.user?.id]
    );
    const conversation = conversations[0];
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const { rows: turns } = await pool.query(
      `SELECT q.id, q.question, q.answer, q.sources, q.created_at,
              v.overall_score AS verification_score,
              v.status AS verification_status,
              v.claims AS verification_claims
       FROM qa_history q
       LEFT JOIN answer_verifications v ON v.qa_history_id = q.id
       WHERE q.conversation_id = $1 AND q.user_id = $2
       ORDER BY q.id ASC`,
      [id, req.user?.id]
    );

    res.json({
      ...conversation,
      turns: turns.map(row => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        sources: (row.sources ?? []) as Source[],
        verification: row.verification_status
          ? {
              status: row.verification_status,
              score: Number(row.verification_score),
              claims: row.verification_claims
            }
          : null,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 120) {
      return res.status(400).json({ error: 'Title must be between 1 and 120 characters.' });
    }

    const { rows } = await pool.query(
      `UPDATE conversations SET title = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, updated_at`,
      [id, req.user?.id, title]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

conversationsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user?.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
