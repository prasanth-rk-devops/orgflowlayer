CREATE TABLE leave_attachments (
  id               SERIAL PRIMARY KEY,
  leave_request_id INT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  original_name    VARCHAR(255) NOT NULL,
  stored_name      VARCHAR(100) NOT NULL UNIQUE,
  mime_type        VARCHAR(100) NOT NULL,
  size_bytes       INT NOT NULL CHECK (size_bytes > 0),
  uploaded_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_request ON leave_attachments(leave_request_id);
