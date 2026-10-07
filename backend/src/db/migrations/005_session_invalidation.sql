-- Sessions (JWTs) issued before this moment are rejected.
-- Updated on every password change or reset so a stolen/forgotten session dies with the old password.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();
