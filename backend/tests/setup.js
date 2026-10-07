// Runs before every test file. Integration tests need a real PostgreSQL (TEST_DATABASE_URL).
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.SEED_DEMO = 'true';
process.env.ADMIN_EMAIL = 'admin@orgflow.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'orgflow-test-uploads');
process.env.SMTP_HOST = '';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
