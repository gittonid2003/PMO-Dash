-- ============================================================
-- AOne PMO Command Deck — cloud database schema
-- One shared workspace for the whole team; individual accounts
-- for login/audit, not for data isolation (everyone who's a
-- member sees the same clients/projects, matching how the
-- desktop version worked with its single shared login).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------- Users & sessions ----------

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A row per active login. The JWT cookie carries this id; every
-- request checks the row still exists, so logout (delete the row) and
-- "log out everywhere" (delete all rows for a user, e.g. on password
-- change) actually revoke access instead of relying on token expiry
-- alone.
CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------- Workspace-level settings (single row) ----------

CREATE TABLE workspace (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforces a single row
  name         TEXT NOT NULL DEFAULT 'AOne PMO',
  accent_color TEXT NOT NULL DEFAULT '#3B4FF0'
);
INSERT INTO workspace (id) VALUES (1);

CREATE TABLE department_template (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_team TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'layers',
  sort_order INTEGER NOT NULL
);

-- ---------- Clients ----------

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  industry        TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  photo_data      BYTEA,
  photo_mime_type TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ---------- Projects ----------

CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  start_date        DATE,
  expected_end_date DATE,
  deadline_date     DATE,
  actual_end_date   DATE,
  budget            NUMERIC(14,2),
  rag_override      TEXT NOT NULL DEFAULT 'Auto' CHECK (rag_override IN ('Auto','Green','Amber','Red')),
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_projects_client ON projects(client_id);

-- A dedicated sequence backs the P001-style project codes so
-- concurrent creations from different devices can never collide.
CREATE SEQUENCE project_code_seq START 1;

-- ---------- Per-project pipeline stages ----------

CREATE TABLE project_departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  owner_team      TEXT NOT NULL DEFAULT '',
  color           TEXT NOT NULL,
  icon            TEXT NOT NULL DEFAULT 'layers',
  sort_order      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','Blocked','Completed')),
  percent         INTEGER NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  flag            TEXT NOT NULL DEFAULT 'Green' CHECK (flag IN ('Green','Amber','Red')),
  notes           TEXT NOT NULL DEFAULT '',
  stakeholder     TEXT NOT NULL DEFAULT '',
  deadline        DATE,
  estimated_days  INTEGER,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_on    TIMESTAMPTZ
);
CREATE INDEX idx_deptartments_project ON project_departments(project_id);

-- ---------- Documents ----------
-- File bytes live in Postgres (bytea) rather than a separate object-
-- storage service, so hosting this needs nothing but a database to
-- get started. See the deployment notes for moving to S3-compatible
-- storage later if document volume grows large.

CREATE TABLE project_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT NOT NULL,
  file_data    BYTEA NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_documents_project ON project_documents(project_id);
