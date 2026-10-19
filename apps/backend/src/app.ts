import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth.routes';
import { documentsRouter } from './routes/documents.routes';
import { questionsRouter } from './routes/questions.routes';
import { LlmUnavailableError } from './services/llm';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API is running' });
});

app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/questions', questionsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Maximum file size is ${process.env.MAX_UPLOAD_MB || 10} MB.` });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: 'Invalid upload.' });
  }
  if (err instanceof LlmUnavailableError) {
    return res.status(503).json({ error: 'The language model is unavailable right now. Please try again in a moment.' });
  }
  res.status(500).json({ error: err.message || 'Unexpected server error.' });
});
