import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { extractText } from '../services/extractText';
import { splitIntoChunks } from '../services/chunkText';

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.txt'];
    cb(null, allowed.includes(ext));
  }
});

// Resolve uploads against the backend package root so the directory does not
// depend on the process CWD (npm -w scripts run from apps/backend, but tsx may
// run from the repo root). Absolute UPLOAD_DIR values are used as-is.
const backendRoot = path.resolve(__dirname, '../..');
const configuredUploadDir = process.env.UPLOAD_DIR || 'uploads';
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(backendRoot, configuredUploadDir);

documentsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const chunkCount = `(SELECT count(*)::int FROM document_chunks cc WHERE cc.document_id = d.id) AS chunk_count`;

    if (!q) {
      const { rows } = await pool.query(
        `SELECT d.id, d.title, d.original_name, d.byte_size, d.created_at,
                ${chunkCount}
         FROM documents d
         WHERE d.owner_id = $1
         ORDER BY d.created_at DESC`,
        [req.user?.id]
      );
      return res.json(rows);
    }

    // Search: title substring match OR full-text match over chunk content.
    // ts_headline highlights terms as <<term>> in the best-ranked chunk.
    const tsQuery = `websearch_to_tsquery('english', $2)`;
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.original_name, d.byte_size, d.created_at,
              ${chunkCount},
              (SELECT ts_headline('english', c.content, ${tsQuery},
                   'StartSel=<<, StopSel=>>, MaxWords=35, MinWords=15, MaxFragments=1')
               FROM document_chunks c
               WHERE c.document_id = d.id AND c.search_vector @@ ${tsQuery}
               ORDER BY ts_rank(c.search_vector, ${tsQuery}) DESC
               LIMIT 1) AS match_excerpt
       FROM documents d
       WHERE d.owner_id = $1
         AND (strpos(lower(d.title), lower($2)) > 0
              OR EXISTS (
                SELECT 1 FROM document_chunks c
                WHERE c.document_id = d.id AND c.search_vector @@ ${tsQuery}
              ))
       ORDER BY (strpos(lower(d.title), lower($2)) > 0) DESC, d.created_at DESC`,
      [req.user?.id, q]
    );
    return res.json(rows);
  } catch (error) {
    next(error);
  }
});

documentsRouter.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Upload a PDF or TXT file.' });
  }

  let savedPath: string | undefined;
  const client = await pool.connect();

  try {
    const ext = path.extname(file.originalname).toLowerCase() as '.pdf' | '.txt';
    const fileBuffer = file.buffer;

    if (ext === '.pdf' && fileBuffer.subarray(0, 5).toString() !== '%PDF-') {
      return res.status(400).json({ error: 'Invalid PDF file.' });
    }

    if (ext === '.txt' && fileBuffer.includes(0)) {
      return res.status(400).json({ error: 'TXT files must be plain text.' });
    }

    const text = await extractText(fileBuffer, ext);
    if (text.length < 20) {
      return res.status(422).json({ error: 'No usable text found in the uploaded file.' });
    }

    const chunks = splitIntoChunks(text);
    await mkdir(uploadDir, { recursive: true });
    savedPath = path.join(uploadDir, `${randomUUID()}${ext}`);
    await writeFile(savedPath, fileBuffer, { flag: 'wx' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO documents(owner_id, title, original_name, stored_path, mime_type, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, original_name, created_at`,
      [req.user?.id, path.basename(file.originalname, ext), file.originalname, savedPath, ext === '.pdf' ? 'application/pdf' : 'text/plain', file.size]
    );

    const document = rows[0];
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        'INSERT INTO document_chunks(document_id, chunk_index, content) VALUES ($1, $2, $3)',
        [document.id, index, chunk]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ document, chunkCount: chunks.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (savedPath) {
      await unlink(savedPath).catch(() => undefined);
    }
    next(error);
  } finally {
    client.release();
  }
});

documentsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const { rows } = await pool.query(
      `SELECT id, title, original_name, byte_size, created_at
       FROM documents
       WHERE id = $1 AND owner_id = $2`,
      [id, req.user?.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const MAX_CHUNKS = 200;
    const { rows: chunkRows } = await pool.query(
      `SELECT chunk_index, content
       FROM document_chunks
       WHERE document_id = $1
       ORDER BY chunk_index`,
      [id]
    );
    return res.json({
      document: rows[0],
      chunks: chunkRows.slice(0, MAX_CHUNKS),
      totalChunks: chunkRows.length
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.get('/:id/file', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT stored_path, original_name FROM documents WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user?.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    return res.download(rows[0].stored_path, rows[0].original_name);
  } catch (error) {
    next(error);
  }
});

documentsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING stored_path`,
      [id, req.user?.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const { stored_path } = rows[0];
    if (!stored_path.startsWith('seed://')) {
      await unlink(stored_path).catch(() => undefined);
    }
    await client.query('COMMIT');
    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});
