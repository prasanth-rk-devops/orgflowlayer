require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@orgflow.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  seedDemo: process.env.SEED_DEMO === 'true',
  uploadDir: process.env.UPLOAD_DIR || require('path').join(process.cwd(), 'uploads'),
  appUrl: process.env.APP_URL || 'http://localhost:8080',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.SMTP_FROM || 'OrgFlow <no-reply@orgflow.local>',
  },
};

function assertEnv() {
  const missing = [];
  if (!env.databaseUrl) missing.push('DATABASE_URL');
  if (!env.jwtSecret) missing.push('JWT_SECRET');
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  if (env.nodeEnv === 'production' && env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

module.exports = { env, assertEnv };
