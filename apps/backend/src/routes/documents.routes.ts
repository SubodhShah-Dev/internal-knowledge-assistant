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
    const { rows } = await pool.query(
      `SELECT id, title, original_name, byte_size, created_at
       FROM documents
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [req.user?.id]
    );
    res.json(rows);
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
