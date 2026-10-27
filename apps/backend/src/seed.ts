import bcrypt from 'bcrypt';
import { pool } from './db';

async function seed() {
  const passwordHash = await bcrypt.hash('DemoPassword123!', 12);

  const user = await pool.query(
    `INSERT INTO users(email, password_hash, role) VALUES ($1, $2, 'user')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    ['demo@example.com', passwordHash]
  );

  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 12);
  await pool.query(
    `INSERT INTO users(email, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
     RETURNING id`,
    ['admin@example.com', adminPasswordHash]
  );

  const userId = user.rows[0].id;

  await pool.query(
    `DELETE FROM documents WHERE owner_id=$1 AND original_name=$2`,
    [userId, 'seed-handbook.txt']
  );

  const doc = await pool.query(
    `INSERT INTO documents(owner_id, title, original_name, stored_path, mime_type, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, 'Sample Handbook', 'seed-handbook.txt', 'seed://not-a-real-file', 'text/plain', 1]
  );

  const documentId = doc.rows[0].id;

  await pool.query(
    `INSERT INTO document_chunks(document_id, chunk_index, content)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [documentId, 0, 'The sample policy provides 15 days of annual leave per year. Employees must submit time-off requests at least two weeks in advance.']
  );

  console.log('Seed completed. Demo user and admin created.');
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
