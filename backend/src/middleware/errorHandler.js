const AppError = require('../utils/AppError');

const notFound = (req, _res, next) => next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Postgres constraint violations -> friendly errors
  if (err.code === '23505') return res.status(409).json({ error: 'A record with this value already exists', detail: err.detail });
  if (err.code === '23503') return res.status(409).json({ error: 'This record is referenced by other data' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });

  if (err.name === 'MulterError') {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB' : 'Upload failed: ' + err.message });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { notFound, errorHandler };
