const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const { env } = require('../config/env');
const AppError = require('../utils/AppError');

const ALLOWED = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };
const MAX_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try { fs.mkdirSync(env.uploadDir, { recursive: true }); cb(null, env.uploadDir); } catch (e) { cb(e); }
  },
  // Random server-side name: the client's filename is never used on disk.
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`),
});

module.exports = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED[file.mimetype] ? cb(null, true) : cb(new AppError(400, 'Only PDF, PNG or JPG files are allowed')),
});
