CREATE TABLE holidays (
  id           SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
