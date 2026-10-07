CREATE TABLE announcements (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(120) NOT NULL,
  body       TEXT NOT NULL,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  author_id  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_announcements_order ON announcements(pinned DESC, created_at DESC);
