import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';

let adminToken: string;
let regularToken: string;

async function signupAdmin() {
  const email = `admin-${Date.now()}@example.com`;
  await request(app).post('/api/auth/signup').send({ email, password: 'Password123!' });
  await pool.query("UPDATE users SET role='admin' WHERE email=$1", [email]);
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return login.body.token as string;
}

async function signupRegular() {
  const email = `regular-${Date.now()}@example.com`;
  await request(app).post('/api/auth/signup').send({ email, password: 'Password123!' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return login.body.token as string;
}

beforeAll(async () => {
  adminToken = await signupAdmin();
  regularToken = await signupRegular();
  await pool.query('TRUNCATE TABLE models CASCADE');
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await pool.query('TRUNCATE TABLE models CASCADE');
});

describe('admin models API', () => {
  test('GET /api/admin/models returns empty list initially', async () => {
    const res = await request(app)
      .get('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/admin/models creates a model without leaking api_key', async () => {
    const res = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        label: 'Test Model',
        model_id: 'provider/test',
        base_url: 'https://api.test.com/v1',
        api_key: 'secret-key-123',
        is_enabled: true
      });
    expect(res.status).toBe(201);
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.label).toBe('Test Model');
    expect(res.body.model_id).toBe('provider/test');
    expect(res.body.base_url).toBe('https://api.test.com/v1');
  });

  test('GET /api/admin/models includes has_api_key and omits api_key', async () => {
    await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'M', model_id: 'provider/m', api_key: 'k' });

    const res = await request(app)
      .get('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].has_api_key).toBe(true);
    expect(res.body[0].api_key).toBeUndefined();
  });

  test('PATCH /api/admin/models/:id does not return api_key', async () => {
    const created = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'M', model_id: 'provider/m', api_key: 'k' });
    const modelId = created.body.id;

    const res = await request(app)
      .patch(`/api/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.has_api_key).toBe(true);
    expect(res.body.label).toBe('Renamed');
  });

  test('GET /api/admin/models/:id omits api_key', async () => {
    const created = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'M', model_id: 'provider/m', api_key: 'k' });
    const modelId = created.body.id;

    const res = await request(app)
      .get(`/api/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.api_key).toBeUndefined();
  });

  test('setting a model as default clears other defaults', async () => {
    const a = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'A', model_id: 'provider/a', is_default: true });
    const b = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'B', model_id: 'provider/b' });

    const set = await request(app)
      .post(`/api/admin/models/${b.body.id}/default`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(set.status).toBe(200);

    const aRes = await request(app)
      .get(`/api/admin/models/${a.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(aRes.body.is_default).toBe(false);

    const bRes = await request(app)
      .get(`/api/admin/models/${b.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bRes.body.is_default).toBe(true);
  });

  test('DELETE /api/admin/models/:id returns 409 when deleting the default', async () => {
    const created = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Default', model_id: 'provider/default', is_default: true });
    const modelId = created.body.id;

    const res = await request(app)
      .delete(`/api/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);

    // model still exists
    const get = await request(app)
      .get(`/api/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(200);
  });

  test('DELETE /api/admin/models/:id succeeds for a non-default model', async () => {
    const created = await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Non-default', model_id: 'provider/nodefault' });
    const modelId = created.body.id;

    const res = await request(app)
      .delete(`/api/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  test('GET /admin/current-model returns database source when a default exists', async () => {
    await request(app)
      .post('/api/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Cur', model_id: 'provider/cur', base_url: 'https://api.cur.com/v1', is_default: true });

    const res = await request(app)
      .get('/api/admin/current-model')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('database');
    expect(res.body.model_id).toBe('provider/cur');
    expect(res.body.base_url).toBe('https://api.cur.com/v1');
    expect(res.body.provider).toBe('api.cur.com');
  });

  test('GET /admin/current-model returns environment source when no default exists', async () => {
    const res = await request(app)
      .get('/api/admin/current-model')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('environment');
    expect(res.body.model_id).toBe(process.env.LLM_MODEL);
    expect(res.body.base_url).toBe(process.env.LLM_BASE_URL);
  });

  test('regular user gets 403 on admin model routes', async () => {
    const res = await request(app)
      .get('/api/admin/models')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});
