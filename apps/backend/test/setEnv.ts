/* Runs before each test file (in the worker) so src/db.ts picks up the test DB. */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://app_user:local_dev_password@localhost:5432/knowledge_assistant_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';
process.env.UPLOAD_DIR = 'test-uploads';
process.env.MAX_UPLOAD_MB = '10';
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://llm.invalid/v1';
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_MODEL = 'test-model';
