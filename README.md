# OrgFlow — Employee & Leave Management

A 3-tier web application for managing people, departments and time off.

| Tier | Technology |
|------|------------|
| Presentation | React 18 + Vite, served by Nginx |
| Application  | Node.js 20 + Express (REST API, JWT auth, Zod validation) |
| Data         | PostgreSQL 16 (SQL migrations, transactions, indexes) |

## Run it (Docker)

```bash
docker compose up --build
```

Open **http://localhost:8080**. Emails sent by the app appear in the local mail inbox at **http://localhost:8025** (MailHog). The database schema is created and seeded automatically on first start.

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@orgflow.local | Admin@12345 |
| Manager | maya.patel@orgflow.local | Manager@12345 |
| Employee | liam.chen@orgflow.local | Employee@12345 |

Demo users exist only when `SEED_DEMO=true` (default in compose). For real use, copy `.env.example` to `.env`, set strong values, and set `SEED_DEMO=false`.

## Run without Docker

```bash
# 1. PostgreSQL running, with a database "orgflow"
cd backend && cp .env.example .env && npm install && npm run dev     # API on :4000
cd frontend && npm install && npm run dev                            # UI on :5173
```

## Look and feel

Midnight-indigo sidebar, brass accent, Newsreader serif headings with the Hanken Grotesk interface font, a **dark mode** (toggle in the sidebar; remembers your choice and follows your system by default), initials avatars, toast confirmations, and a drawer navigation on phones.
Fonts load from Google Fonts and fall back to system fonts if blocked. For an air-gapped network, self-host the two fonts and remove the three `<link>` lines in `frontend/index.html`.

## Features

- Sign-in with JWT, bcrypt password hashing, login rate limiting
- Password reset by email (single-use hashed token, 1-hour expiry, same answer for unknown emails). Changing or resetting a password **signs out every older session**
- Role-based access: **admin**, **manager**, **employee**
- Employees: search, filter, pagination, create/edit, soft-deactivate (disables sign-in), reporting lines with cycle protection, salary visible to admins only
- Departments: CRUD with protection against deleting populated departments
- Leave: balances per type, weekday-only day counting, overlap and balance checks (row-locked, race-safe), manager/admin approval, cancel pending requests, no self-approval
- Email notifications: managers are emailed when a request arrives, employees when it is approved or rejected (SMTP; sending failures never break the request)
- Attachments: requesters can attach up to 3 PDF/PNG/JPG files (5 MB each, e.g. a medical certificate); only the requester, their manager and admins can download them
- Company holidays (admin-managed): not counted as leave days, shown on the team calendar
- Team calendar: month view of approved leave and holidays
- CSV export of employees and leave report (admin); spreadsheet-formula injection is neutralised
- Notifications: a bell with an unread count. Managers are notified of new leave requests, employees of decisions, and everyone of new announcements (the same events also send email when SMTP is set)
- Quick search: press **Ctrl+K** (**⌘K** on Mac) to jump to any page or person
- Reports (admin): leave by month, type and department, who is away most, approval rate and time to decide, tenure bands, hires by year
- Bulk import (admin): upload a CSV of people (template included). The file is checked first, every problem is listed by row, and nothing is saved unless the whole file is valid. Departments must already exist; managers can be existing staff or other rows in the file
- Announcements: admins post and pin company news; everyone reads it (also shown on the dashboard)
- Org chart (collapsible reporting tree) and a profile page for every person
- Dashboard: greeting, leave-by-month chart, headcount ring, who is out, work anniversaries and new joiners
- Dashboard (data): headcount, who is out today, upcoming leave, pending approvals
- Audit log of all important changes (admin only)
- Health endpoint `GET /api/health`, graceful shutdown, Docker healthchecks

## API summary

`POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/change-password`
`GET|POST /api/employees` · `GET|PUT|DELETE /api/employees/:id`
`GET|POST /api/departments` · `PUT|DELETE /api/departments/:id`
`GET /api/leave/types|balance` · `GET|POST /api/leave` · `PATCH /api/leave/:id/review|cancel`
`GET|POST /api/leave/:id/attachments` · `GET|DELETE /api/leave/:id/attachments/:fileId`
`POST /api/auth/forgot-password|reset-password` · `GET|POST /api/holidays` · `DELETE /api/holidays/:id`
`GET /api/leave/calendar?month=YYYY-MM` · `GET /api/leave/export.csv` · `GET /api/employees/export.csv`
`GET|POST /api/announcements` · `PATCH|DELETE /api/announcements/:id` · `GET /api/employees/org-chart`
`GET /api/notifications` · `POST /api/notifications/read-all` · `PATCH /api/notifications/:id/read`
`POST /api/employees/import` · `GET /api/employees/import-template.csv` · `GET /api/reports/summary?year=`
`GET /api/dashboard` · `GET /api/audit`

Full reference: [`docs/openapi.yaml`](docs/openapi.yaml) (open in https://editor.swagger.io).

## Operations

```bash
make up                       # start
make backup                   # database dump to ./backups (also back up the "uploads" volume)
make restore FILE=backups/orgflow-2026-10-06-1200.sql.gz
make test-integration         # full test suite against a throwaway PostgreSQL
make reset                    # delete all data
```

## Tests

Unit tests run anywhere. Integration tests (auth, permissions, leave rules, attachments) run against a real PostgreSQL and are skipped unless `TEST_DATABASE_URL` is set.
**They wipe every table in that database. Use a dedicated test database.**

```bash
cd backend && npm install
# unit tests only
npm test
# full suite
docker run -d --name pgtest -e POSTGRES_USER=orgflow -e POSTGRES_PASSWORD=orgflow -e POSTGRES_DB=orgflow_test -p 5432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://orgflow:orgflow@localhost:5432/orgflow_test npm test
```

CI (`.github/workflows/ci.yml`) runs the full suite with a PostgreSQL service container.

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (see `backend/.env.example`). With no `SMTP_HOST`, email is disabled. Docker Compose points at MailHog by default.

## Kubernetes

Manifests are in `k8s/` (namespace, config, secret, PostgreSQL StatefulSet, backend, frontend, ingress).

```bash
docker build -t <registry>/orgflow-backend:1.0.0 backend && docker push <registry>/orgflow-backend:1.0.0
docker build -t <registry>/orgflow-frontend:1.0.0 frontend && docker push <registry>/orgflow-frontend:1.0.0
# edit image names, k8s/secret.yaml, k8s/configmap.yaml and the ingress host, then:
kubectl apply -k k8s
```

Notes: the backend runs 1 replica because uploads use a ReadWriteOnce volume; to scale out use ReadWriteMany storage or object storage. For production, use a managed PostgreSQL instead of `postgres.yaml`, and keep the secret in a secrets manager.

## Production notes

- Put a TLS-terminating load balancer / ingress in front of the frontend container.
- Use a managed PostgreSQL with backups; keep `JWT_SECRET` in a secrets manager.
- Add new schema changes as new numbered files in `backend/src/db/migrations/` (applied once, in order).
