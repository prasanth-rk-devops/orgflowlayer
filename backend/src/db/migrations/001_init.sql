CREATE TABLE departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id            SERIAL PRIMARY KEY,
  first_name    VARCHAR(80)  NOT NULL,
  last_name     VARCHAR(80)  NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  phone         VARCHAR(30),
  job_title     VARCHAR(120) NOT NULL,
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  manager_id    INT REFERENCES employees(id) ON DELETE SET NULL,
  hire_date     DATE NOT NULL,
  salary        NUMERIC(12,2) CHECK (salary >= 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_manager    ON employees(manager_id);
CREATE INDEX idx_employees_status     ON employees(status);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  employee_id   INT UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_types (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  annual_days INT NOT NULL CHECK (annual_days >= 0)
);

CREATE TABLE leave_requests (
  id            SERIAL PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INT NOT NULL REFERENCES leave_types(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          INT  NOT NULL CHECK (days > 0),
  reason        TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   INT REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_leave_employee ON leave_requests(employee_id, status);
CREATE INDEX idx_leave_dates    ON leave_requests(start_date, end_date);

CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(60) NOT NULL,
  entity_id  INT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
