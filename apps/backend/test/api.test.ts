jest.mock('../src/services/llm', () => {
  const actual = jest.requireActual('../src/services/llm');
  return { ...actual, chat: jest.fn() };
});

import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { chat, LlmUnavailableError } from '../src/services/llm';

const mockChat = chat as jest.MockedFunction<typeof chat>;

const SAMPLE_TXT =
  'Acme Remote Work Policy. Employees may work remotely up to three days per week with manager approval. ' +
  'Core collaboration hours are 10:00 to 16:00 in your local timezone.';

let userCounter = 0;
async function signupUser() {
  userCounter += 1;
  const email = `test-user-${Date.now()}-${userCounter}@example.com`;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Password123!' });
  expect(res.status).toBe(201);
  return { email, token: res.body.token as string, id: res.body.user.id as string };
}

function uploadTxt(token: string, content = SAMPLE_TXT, filename = 'policy.txt') {
  return request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from(content), filename);
}

beforeAll(async () => {
  await pool.query('TRUNCATE TABLE users, qa_history CASCADE');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  mockChat.mockReset();
});

describe('health', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('authentication', () => {
  test('rejects invalid email or short password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('signup then login round-trips', async () => {
    const { email } = await signupUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toBeTruthy();
  });

  test('duplicate signup returns 409', async () => {
    const { email } = await signupUser();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email, password: 'Password123!' });
    expect(res.status).toBe(409);
  });

  test('wrong password returns 401', async () => {
    const { email } = await signupUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });

  test('protected routes reject missing tokens', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });
});

describe('document upload validation', () => {
  test('rejects unsupported extensions (.md)', async () => {
    const { token } = await signupUser();
    const res = await uploadTxt(token, '# heading\nsome markdown', 'notes.md');
    expect(res.status).toBe(400);
  });

  test('rejects files larger than the limit', async () => {
    const { token } = await signupUser();
    const big = Buffer.alloc(11 * 1024 * 1024, 0x61);
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', big, 'huge.txt');
    expect(res.status).toBe(413);
  }, 30000);

  test('rejects TXT files containing binary data', async () => {
    const { token } = await signupUser();
    const res = await uploadTxt(token, 'text\u0000with null', 'binary.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/plain text/);
  });

  test('rejects files with no usable text', async () => {
    const { token } = await signupUser();
    const res = await uploadTxt(token, 'tiny', 'tiny.txt');
    expect(res.status).toBe(422);
  });

  test('rejects a .pdf that does not start with %PDF-', async () => {
    const { token } = await signupUser();
    const res = await uploadTxt(token, 'this is definitely not a pdf', 'fake.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid PDF/);
  });

  test('accepts a valid PDF and indexes chunks', async () => {
    const { token } = await signupUser();
    const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.pdf'));
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, 'handbook.pdf');
    expect(res.status).toBe(201);
    expect(res.body.chunkCount).toBeGreaterThanOrEqual(1);
    expect(res.body.document.title).toBe('handbook');
  });

  test('accepts a valid TXT and persists chunks', async () => {
    const { token } = await signupUser();
    const res = await uploadTxt(token);
    expect(res.status).toBe(201);
    expect(res.body.chunkCount).toBeGreaterThanOrEqual(1);
  });
});

describe('ownership isolation', () => {
  test('user B cannot see or download user A documents', async () => {
    const a = await signupUser();
    const b = await signupUser();
    const uploaded = await uploadTxt(a.token);
    const documentId = uploaded.body.document.id as string;

    const listB = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${b.token}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toEqual([]);

    const downloadB = await request(app)
      .get(`/api/documents/${documentId}/file`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(downloadB.status).toBe(404);

    const downloadA = await request(app)
      .get(`/api/documents/${documentId}/file`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(downloadA.status).toBe(200);
    expect(downloadA.text).toContain('Acme Remote Work Policy');
  });
});

describe('question answering', () => {
  test('returns answer and sources using the LLM', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat.mockResolvedValue('Employees may work remotely three days per week [S1].');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('[S1]');
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].label).toBe('S1');
    expect(res.body.sources[0].excerpt).toContain('remote');
    expect(mockChat).toHaveBeenCalledTimes(1);

    const history = await pool.query(
      'SELECT question, answer FROM qa_history WHERE question = $1',
      ['How many remote days per week are allowed?']
    );
    expect(history.rows).toHaveLength(1);
  });

  test('abstains honestly when no evidence is retrieved', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'xylophone quantum zebra bicycle expedition' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/couldn't find/i);
    expect(res.body.sources).toEqual([]);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('returns 503 when the LLM provider is down', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat.mockRejectedValue(new LlmUnavailableError('provider offline'));

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/language model is unavailable/i);
  });

  test('rejects empty or too-long questions', async () => {
    const { token } = await signupUser();
    const empty = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '' });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'x'.repeat(501) });
    expect(tooLong.status).toBe(400);
  });

  test('does not retrieve another user documents', async () => {
    const a = await signupUser();
    const b = await signupUser();
    await uploadTxt(a.token);
    mockChat.mockResolvedValue('No evidence available [S1].');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
    expect(mockChat).not.toHaveBeenCalled();
  });
});
