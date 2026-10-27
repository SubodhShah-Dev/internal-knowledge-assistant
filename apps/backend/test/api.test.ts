jest.mock('../src/services/llm', () => {
  const actual = jest.requireActual('../src/services/llm');
  return { ...actual, chat: jest.fn(), chatStream: jest.fn() };
});

import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { chat, chatStream, LlmUnavailableError } from '../src/services/llm';
import { recordProviderLimits, resetProviderLimits } from '../src/services/rateLimits';

const mockChat = chat as jest.MockedFunction<typeof chat>;
const mockChatStream = chatStream as jest.MockedFunction<typeof chatStream>;

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
  mockChatStream.mockReset();
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
  test('returns answer, sources, and a persisted groundedness audit', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('[S1]');
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].label).toBe('S1');
    expect(mockChat).toHaveBeenCalledTimes(2);

    expect(res.body.verification.status).toBe('verified');
    expect(res.body.verification.score).toBe(100);
    expect(res.body.verification.claims[0].status).toBe('supported');

    const history = await pool.query(
      'SELECT q.id, q.question FROM qa_history q WHERE q.question = $1',
      ['How many remote days per week are allowed?']
    );
    expect(history.rows).toHaveLength(1);

    const audit = await pool.query(
      'SELECT status, overall_score, verifier_model, claims FROM answer_verifications WHERE qa_history_id = $1',
      [history.rows[0].id]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].status).toBe('verified');
    expect(Number(audit.rows[0].overall_score)).toBe(100);
    expect(audit.rows[0].claims[0].status).toBe('supported');
  });

  test('still returns the answer when the verifier LLM fails', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    const { LlmUnavailableError: Err } = jest.requireActual('../src/services/llm');
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockRejectedValueOnce(new Err('verifier down'));

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What is the weekly remote work limit?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('[S1]');
    expect(res.body.verification.status).toBe('unverified');

    const audit = await pool.query(
      `SELECT av.status FROM answer_verifications av
       JOIN qa_history q ON q.id = av.qa_history_id
       WHERE q.question = $1`,
      ['What is the weekly remote work limit?']
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].status).toBe('unverified');
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
    expect(res.body.verification).toBeNull();
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

async function* fakeTokenStream() {
  yield 'Employees may work remotely ';
  yield 'three days per week [S1].';
}

describe('chat sessions', () => {
  test('ask creates a conversation, listed newest-first with a derived title', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBeTruthy();
    expect(res.body.messageId).toBeTruthy();

    const list = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(res.body.conversationId);
    expect(list.body[0].title).toContain('How many remote days');
    expect(Number(list.body[0].message_count)).toBe(1);
  });

  test('conversation detail returns turns with stored sources and verification', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const asked = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    const detail = await request(app)
      .get(`/api/conversations/${asked.body.conversationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detail.status).toBe(200);
    expect(detail.body.turns).toHaveLength(1);
    const turn = detail.body.turns[0];
    expect(turn.question).toContain('remote days');
    expect(turn.answer).toContain('[S1]');
    expect(turn.sources).toHaveLength(1);
    expect(turn.sources[0].label).toBe('S1');
    expect(turn.verification.status).toBe('verified');
    expect(turn.verification.score).toBe(100);
  });

  test('follow-up questions include prior turns in the LLM prompt', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const first = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });
    expect(first.status).toBe(200);

    mockChat
      .mockResolvedValueOnce('Three days per week with manager approval [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const second = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'And with whose approval?', conversationId: first.body.conversationId });

    expect(second.status).toBe(200);
    expect(second.body.conversationId).toBe(first.body.conversationId);

    // call index 2 = answer pass of the follow-up (0,1 were first ask's answer+verifier)
    const followUpMessages = mockChat.mock.calls[2][0];
    const contents = followUpMessages.map(m => m.content).join('\n');
    expect(contents).toContain('How many remote days per week are allowed?');
    expect(contents).toContain('Employees may work remotely three days per week [S1].');
    expect(contents).toContain("And with whose approval?");

    const detail = await request(app)
      .get(`/api/conversations/${first.body.conversationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.turns).toHaveLength(2);
  });

  test('rename and delete are owner-scoped; delete cascades turns', async () => {
    const a = await signupUser();
    const b = await signupUser();
    await uploadTxt(a.token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const asked = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ question: 'How many remote days per week are allowed?' });
    const convId = asked.body.conversationId;

    const renameB = await request(app)
      .patch(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ title: 'Stolen title' });
    expect(renameB.status).toBe(404);

    const renameA = await request(app)
      .patch(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: 'Remote work limits' });
    expect(renameA.status).toBe(200);
    expect(renameA.body.title).toBe('Remote work limits');

    const getB = await request(app)
      .get(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(getB.status).toBe(404);

    const deleteB = await request(app)
      .delete(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(deleteB.status).toBe(404);

    const deleteA = await request(app)
      .delete(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(deleteA.status).toBe(200);

    const after = await request(app)
      .get(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(after.status).toBe(404);

    const turns = await pool.query('SELECT id FROM qa_history WHERE conversation_id = $1', [convId]);
    expect(turns.rows).toHaveLength(0);
  });

  test('rejects invalid or foreign conversationId', async () => {
    const a = await signupUser();
    const b = await signupUser();
    await uploadTxt(a.token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');
    const asked = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    const invalid = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ question: 'Anything at all?', conversationId: 'abc' });
    expect(invalid.status).toBe(400);

    const foreign = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ question: 'Anything at all?', conversationId: asked.body.conversationId });
    expect(foreign.status).toBe(404);
  });

  test('rename rejects empty or oversized titles', async () => {
    const { token } = await signupUser();
    mockChat.mockReset();
    const created = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'xylophone quantum zebra expedition' }); // abstention, no LLM
    const convId = created.body.conversationId;

    const empty = await request(app)
      .patch(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' });
    expect(empty.status).toBe(400);

    const huge = await request(app)
      .patch(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x'.repeat(121) });
    expect(huge.status).toBe(400);
  });
});

describe('streaming (SSE)', () => {
  test('streams sources, tokens, verification, then done and persists the turn', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChatStream.mockImplementation(() => fakeTokenStream());
    mockChat.mockResolvedValue('[{"id": 0, "status": "supported"}]');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const body = res.text as string;
    expect(body).toContain('event: sources');
    expect(body).toContain('event: token');
    expect(body).toContain('three days per week [S1].');
    expect(body).toContain('event: verification');
    expect(body).toContain('event: done');

    const doneLine = body.split('\n').find(line => line.startsWith('data:') && line.includes('conversationId'));
    expect(doneLine).toBeTruthy();

    const detail = await request(app)
      .get(`/api/conversations/${JSON.parse((doneLine as string).slice(5)).conversationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.turns).toHaveLength(1);
    expect(detail.body.turns[0].answer).toContain('[S1]');
    expect(detail.body.turns[0].verification.status).toBe('verified');
  });

  test('SSE abstention streams the canned answer without calling the LLM', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ question: 'xylophone quantum zebra bicycle expedition' });

    expect(res.status).toBe(200);
    const body = res.text as string;
    expect(body).toContain('event: sources');
    expect(body).toContain("couldn't find");
    expect(body).toContain('event: done');
    expect(mockChatStream).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('SSE provider outage emits an error event', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChatStream.mockImplementation(async function* () {
      throw new LlmUnavailableError('provider offline');
      yield ''; // unreachable; keeps the generator typed
    });

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.text as string).toContain('event: error');
    expect(res.text as string).toContain('language model is unavailable');
  });
});

describe('documents view and search', () => {
  test('GET /api/documents/:id returns ordered chunks; owner-scoped; invalid id 404s', async () => {
    const a = await signupUser();
    const b = await signupUser();
    const uploaded = await uploadTxt(a.token);
    const documentId = uploaded.body.document.id as string;

    const view = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(view.status).toBe(200);
    expect(view.body.document.id).toBe(documentId);
    expect(view.body.totalChunks).toBeGreaterThanOrEqual(1);
    expect(view.body.chunks[0].chunk_index).toBe(0);
    expect(view.body.chunks[0].content).toContain('Acme Remote Work Policy');

    const viewB = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(viewB.status).toBe(404);

    const invalid = await request(app)
      .get('/api/documents/not-a-uuid')
      .set('Authorization', `Bearer ${a.token}`);
    expect(invalid.status).toBe(404);
  });

  test('list includes chunk_count; search matches title and content with excerpts', async () => {
    const { token } = await signupUser();
    await uploadTxt(
      token,
      'Acme Remote Work Policy. Employees may work remotely up to three days per week with manager approval.',
      'remote.txt'
    );
    await uploadTxt(
      token,
      'Quarterly budget report. Revenue grew by four percent in Q3 after the price changes.',
      'budget.txt'
    );

    const list = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    for (const row of list.body) {
      expect(Number(row.chunk_count)).toBeGreaterThanOrEqual(1);
    }

    const byTitle = await request(app)
      .get('/api/documents?q=budget')
      .set('Authorization', `Bearer ${token}`);
    expect(byTitle.status).toBe(200);
    expect(byTitle.body).toHaveLength(1);
    expect(byTitle.body[0].title).toBe('budget');

    const byContent = await request(app)
      .get('/api/documents?q=remotely')
      .set('Authorization', `Bearer ${token}`);
    expect(byContent.status).toBe(200);
    const match = byContent.body.find((row: any) => row.title === 'remote');
    expect(match).toBeTruthy();
    expect(match.match_excerpt).toBeTruthy();
    expect(match.match_excerpt).toContain('<<remotely>>');

    const noMatch = await request(app)
      .get('/api/documents?q=zxqqaall')
      .set('Authorization', `Bearer ${token}`);
    expect(noMatch.body).toEqual([]);
  });
});

describe('provider limits reporting', () => {
  beforeEach(() => {
    resetProviderLimits();
  });

  test('GET /api/usage reports the provider rate-limit snapshot', async () => {
    const { token } = await signupUser();
    recordProviderLimits(
      'openai/gpt-oss-120b',
      'https://api.groq.com/openai/v1',
      new Headers({
        'x-ratelimit-limit-requests': '30',
        'x-ratelimit-remaining-requests': '28',
        'x-ratelimit-reset-requests': '42s',
        'x-ratelimit-limit-tokens': '12000',
        'x-ratelimit-remaining-tokens': '9500',
        'x-ratelimit-reset-tokens': '42s'
      })
    );

    const res = await request(app).get('/api/usage').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.model).toBe('openai/gpt-oss-120b');
    expect(res.body.provider).toBe('api.groq.com');
    expect(res.body.requests.limit).toBe(30);
    expect(res.body.requests.remaining).toBe(28);
    expect(res.body.requests.resetAt).toBeTruthy();
    expect(res.body.tokens.limit).toBe(12000);
    expect(res.body.tokens.remaining).toBe(9500);
  });

  test('reports no limits until the provider sends them', async () => {
    const { token } = await signupUser();
    const res = await request(app).get('/api/usage').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  test('asking a question is never blocked by a limit', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('[S1]');
  });
});

describe('conversational memory', () => {
  async function seedGroundedTurn(token: string) {
    await uploadTxt(token);
    mockChat
      .mockResolvedValueOnce('Employees may work remotely three days per week [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');
    const first = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'How many remote days per week are allowed?' });
    expect(first.status).toBe(200);
    return first.body.conversationId as number;
  }

  test('zero-hit follow-up rewrites the query via history and answers from evidence', async () => {
    const { token } = await signupUser();
    const conversationId = await seedGroundedTurn(token);

    // Follow-up tokens (signs/zzzq/quixotic/plan) match nothing; the rewrite
    // call resolves the context so retrieval can find the policy chunk.
    mockChat
      .mockResolvedValueOnce('remote days per week approval')
      .mockResolvedValueOnce('Manager approval is required for remote work [S1].')
      .mockResolvedValueOnce('[{"id": 0, "status": "supported"}]');

    const second = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        question: 'and who signs off on zzzq quixotic plans?',
        conversationId
      });

    expect(second.status).toBe(200);
    expect(second.body.sources).toHaveLength(1);

    // calls[2] is the rewrite prompt; it must carry the prior conversation.
    const rewriteMessages = mockChat.mock.calls[2][0];
    const rewriteJoined = rewriteMessages.map((m: any) => m.content).join('\n');
    expect(rewriteJoined).toContain('How many remote days per week are allowed?');
    expect(rewriteJoined).toContain('and who signs off on zzzq quixotic plans?');

    // calls[3] is the grounded answer pass of the follow-up.
    const ragMessages = mockChat.mock.calls[3][0];
    expect(ragMessages.some((m: any) => m.content.includes('and who signs off'))).toBe(true);
  });

  test('fallback answers from conversation when even the rewrite finds nothing', async () => {
    const { token } = await signupUser();
    const conversationId = await seedGroundedTurn(token);

    mockChat
      .mockResolvedValueOnce('zzq waldo frobnicate') // rewrite: still no evidence
      .mockResolvedValueOnce('You asked how many remote days are allowed — three per week.');

    const second = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'zzq waldo quixotic frobnicate', conversationId });

    expect(second.status).toBe(200);
    expect(second.body.answer).toContain('You asked how many');
    expect(second.body.sources).toEqual([]);
    expect(second.body.verification).toBeNull();

    const fallbackMessages = mockChat.mock.calls[3][0];
    const joined = fallbackMessages.map((m: any) => m.content).join('\n');
    expect(joined).toContain('No document excerpts matched');
    expect(joined).toContain('How many remote days per week are allowed?');
    expect(mockChat).toHaveBeenCalledTimes(4); // t1 answer, t1 verifier, rewrite, fallback
  });

  test('first-turn zero-hit still returns the canned abstention without any LLM call', async () => {
    const { token } = await signupUser();
    await uploadTxt(token);
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'xylophone quantum zebra bicycle expedition' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/couldn't find/i);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('SSE conversational fallback streams, skips verification, and persists', async () => {
    const { token } = await signupUser();
    const conversationId = await seedGroundedTurn(token);

    mockChat.mockResolvedValueOnce('zzq waldo frobnicate'); // rewrite: no evidence
    mockChatStream.mockImplementation(() =>
      (async function* () {
        yield 'From the conversation: ';
        yield 'three days per week.';
      })()
    );

    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ question: 'zzq waldo quixotic frobnicate', conversationId });

    expect(res.status).toBe(200);
    expect(res.text as string).toContain('three days per week');
    expect(res.text as string).not.toContain('event: verification');
    expect(res.text as string).toContain('event: done');
    expect(mockChat).toHaveBeenCalledTimes(3); // t1 answer, t1 verifier, rewrite

    const detail = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.turns).toHaveLength(2);
    expect(detail.body.turns[1].sources).toEqual([]);
    expect(detail.body.turns[1].verification).toBeNull();
  });
});
