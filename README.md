# Beyond

## Table of Contents

- [Quick Start](#quick-start)
- [Client Handover and Workflows](#client-handover-and-workflows)
- [Configurable Hosting](#configurable-hosting)
- [Data Ownership, Backup, and Migration](#data-ownership-backup-and-migration)
- [File Tree and Responsibilities](#file-tree-and-responsibilities)
- [Exported Files](#exported-files)
  - [Downloading and Opening Files](#downloading-and-opening-files)
  - [Excel Workbook Structure](#excel-workbook-structure)
  - [Excel Field Reference](#excel-field-reference)
  - [CSV Views and Field Reference](#csv-views-and-field-reference)
  - [Values, Timestamps, and Limitations](#values-timestamps-and-limitations)
- [Environment Configuration](#environment-configuration)
  - [Configuration Files and Precedence](#configuration-files-and-precedence)
  - [Database and Container Variables](#database-and-container-variables)
  - [Authentication and Access Variables](#authentication-and-access-variables)
  - [AI Variables](#ai-variables)
  - [Storage Variables](#storage-variables)
  - [Frontend Variables](#frontend-variables)

## Quick Start

Prerequisites: Docker Desktop on Windows/macOS, or Docker Engine with the Compose plugin on Linux. A local Node.js or Python installation is not required.

```bash
cp .env.example .env    # PowerShell: Copy-Item .env.example .env
# Edit .env: set JWT_SECRET and POSTGRES_PASSWORD, plus any optional AI_* or access values.
docker compose up -d --build
```

| Service | Default address | Notes |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | Researcher sign-in, experiment builder and participant runtime. |
| Backend API | `http://localhost:8000/api` | Health probe: `http://localhost:8000/api/healthz`. |
| PostgreSQL | `localhost:5432` | Change `POSTGRES_PORT` (for example to `5433`) when the host port is already in use; the container port stays `5432`. |

Verify the stack, then open the frontend and register the first researcher account:

```bash
curl http://localhost:8000/api/healthz   # {"status":"ok"}
```

The backend image runs `alembic upgrade head` before serving, so the schema is created on first boot. Stop the stack with `docker compose down`; add `-v` only when you intend to discard stored data. Every supported variable is documented under [Environment Configuration](#environment-configuration); deployment-specific values belong in `.env` and must never be committed.

## Client Handover and Workflows

- [Client user guide](docs/client/user-guide.md): researcher, participant and administrator operations, AI/storage setup, charts, exports and troubleshooting.
- [Deployment and data migration guide](docs/client/deployment-and-data-migration.md): fresh installation, admin bootstrap, database AND media backup/restore, hosting and future migration.
- [Client requirements / acceptance status](docs/client/06-delivery-readiness.md): what is implemented, what still needs target-environment acceptance, and what is outside the current phase.
- [Session runbook](docs/client/05-nov06-session-runbook.md): researcher-to-participant demonstration and material checks.

Researchers sign up through **Researcher → Create an account** on the login page. The registration page checks platform policy, validates name/email/password confirmation and shows pending-approval or ready-to-sign-in status. Passwords are required (6 or more characters, up to 72 UTF-8 bytes). Administrators can close self-registration or require approval; email allowlists also apply. Registration creates a researcher, never an administrator. See the [registration guide](docs/client/user-guide.md#researcher-registration).

A fresh installation has no existing developer-side accounts or studies. Register the first permitted researcher, then grant the first administrator role from the operator's terminal:

```bash
docker compose exec backend python -m app.administrator.bootstrap k.alqattan@unsw.edu.au
```

Use the real address without the email's Markdown escape (`unsw.edu.au`, not a literal backslash). Bootstrap requires an existing active account with a password and refuses to create another initial administrator once one exists. Sign in again after promotion; later account management uses the administrator dashboard. Account credentials must be delivered separately, never committed to Git.

Click the signed-in avatar/name in the sidebar for **Your account**: server-saved name, read-only account information, password change with current-password verification, workspace shortcuts and sign-out. A password change renews the current session and invalidates earlier account tokens. Registration, sign-in and password-change forms offer an optional password visibility checkbox.

For the client's requested demonstration, create/save/preview/publish a study, enter as a participant with a unique code, complete consent, questions, AI and permitted recording, finish, then inspect charts, play media and download Excel. Use the material supplied by the client and record target-browser acceptance. The client's email states that ethical approval is under review; the application does not grant that approval.

### Research management workflows

The experiment action menu provides **Duplicate as draft**, **Download study design**, **Share participant link** (with a locally generated QR code), and **Close/Reopen recruitment**. **Import study design** creates an owner-scoped draft from a Beyond version 1 JSON file (maximum 2 MB). Designs transfer configuration only: no responses, API keys, participant codes or uploaded materials. Stage/question IDs are regenerated. Review and re-upload study materials before publishing.

Closing recruitment blocks fresh participant access but lets already-started sessions continue using valid existing credentials. Expired/revoked access is still rejected. Reopening uses publication validation. Workspace usage is aggregated from saved server records for the signed-in researcher, with local browser caches separately labelled.

See the [client workflow guide](docs/client/user-guide.md#reuse-transfer-and-recruit-participants) and [source-backed product benchmark](docs/client/07-product-benchmark.md) for comparison evidence, delivered improvements and remaining capabilities.

## Configurable Hosting

The reference approach is a single Docker host running **Caddy HTTPS → built Nginx frontend → FastAPI → PostgreSQL**, with persistent local storage. No particular cloud vendor is required. Docker supports local operation on Windows/macOS/Linux; use a continuously running approved server for public hosting. Rebuild Linux images for the destination architecture and validate the actual browser/OS, particularly recording.

The default `docker-compose.yml` runs a development frontend. The separate **standalone** `docker-compose.production.yml` builds the runtime frontend, publishes only gateway ports, keeps backend/database ports private, adds restart policies/health checks and bounds container logs. Do not merge it with the development file.

```bash
cp deploy/production.env.example .env.production
# PowerShell: Copy-Item deploy/production.env.example .env.production
# Set SITE_ADDRESS, PUBLIC_ORIGIN and independent strong JWT/database secrets.
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --wait
```

A real domain must resolve to the server and public TCP ports 80/443 must reach Caddy for the usual automatic HTTPS setup. Persistent Caddy volumes retain certificate state. Starting containers alone does not establish public certificate issuance. Camera/microphone/screen capture needs a secure browser context for hosted use. See [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) and the [hosting procedure](docs/client/deployment-and-data-migration.md#7-configurable-single-server-hosting).

Domain, public origin, ports, credentials, database connection, volume names, storage mounts and AI settings are configurable without application-code changes. A separate server/cloud remains a **planned migration**: back up database/files, restore and verify the target, switch DNS, and retain rollback data. This does not provide automatic zero-downtime switching. Recreate services with `up -d` after environment changes; `restart` alone does not apply new environment values. Use the same env-file/Compose flags for subsequent commands. The production default project is `beyond-production`; it deliberately does not attach the development data volumes.

The client currently requests local storage; OneDrive is not a current-phase requirement. Public acceptance still requires a host/domain, approved credentials, client-device workflow testing, automated backups/restore drills, monitoring, request/login rate limits, an account-recovery process and a load test matched to expected recording concurrency. Retention days and platform session-duration values currently record policy; they do not schedule deletion or enforce a separate global timer. These operational tasks are not automatically installed by the Compose file.

## Data Ownership, Backup, and Migration

**Source code and Docker images do not contain the running database or stored recordings.** On a new machine, existing volume names do not copy old data. A complete migration needs a PostgreSQL logical backup plus every referenced storage root; use the [backup/restore guide](docs/client/deployment-and-data-migration.md#4-what-must-be-migrated).

- Database: accounts/password hashes, roles, experiments, publication history, sessions, answers/events and private AI configuration.
- Storage: uploaded materials and recording bytes, separate from database metadata. A database-only restore can display recordings whose files are missing.
- Browser: progress not yet synchronised is not included in server backups. Synchronise/finish sessions before copying data.
- Excel/CSV/SVG: analysis/report outputs, not backups that can restore the website.

Database backups can include saved AI keys; restrict/encrypt transfer and agree credential ownership. Do not commit data dumps, real `.env` files or recordings. Changing JWT_SECRET requires sign-in again; application password hashes remain valid after a full restore. Changing `POSTGRES_PASSWORD` in an env file does not reset an existing PostgreSQL role.

## File Tree and Responsibilities

Paths are relative to this directory. Generated dependencies, build output, runtime data, Git internals, and document-folder contents are omitted. Python `__init__.py` files mark packages.

```text
project/
|-- README.md                              # File responsibilities, exports, and environment reference
|-- Plan.md                                # Project requirements and implementation plan
|-- .env                                   # Local deployment values and secrets; not for source control
|-- .env.example                           # Configuration template with placeholders
|-- .gitignore                             # Source-control exclusions
|-- .gitlab-ci.yml                         # Continuous integration configuration
|-- docker-compose.yml                     # Local development stack
|-- docker-compose.production.yml          # Standalone configurable HTTPS hosting stack
|-- deploy/                                # Caddyfile, production env template, optional disk mount
|-- Meeting Minutes/                       # Meeting records
|-- frontend/
|   |-- Dockerfile                         # Development and production frontend images
|   |-- .dockerignore                      # Frontend image build exclusions
|   |-- .oxlintrc.json                      # Frontend lint rules
|   |-- nginx.conf                         # Production web serving and API proxy configuration
|   |-- index.html                         # Browser HTML entry point
|   |-- package.json                       # Frontend dependencies and scripts
|   |-- package-lock.json                  # Locked dependency versions
|   |-- tsconfig.json                      # TypeScript compiler settings
|   |-- vite.config.ts                     # React tooling, test discovery, and development API proxy
|   |-- playwright.config.ts               # Browser test configuration
|   |-- public/
|   |   `-- favicon.svg                    # Browser icon
|   |-- src/
|   |   |-- main.tsx                       # React application entry point
|   |   |-- App.tsx                        # Routes, access boundaries, and experiment editing workflow
|   |   |-- styles.css                     # Shared application styles
|   |   |-- types.ts                       # Experiment/stage types, defaults, and publication checks
|   |   |-- vite-env.d.ts                  # Vite environment type declarations
|   |   |-- api/
|   |   |   |-- http.ts                    # Authentication headers, response errors, and file downloads
|   |   |   |-- auth.ts                    # Researcher authentication requests
|   |   |   |-- experiments.ts             # Experiment CRUD, export, storage, and experiment AI key requests
|   |   |   |-- participant.ts             # Participant access, sessions, answers, recordings, and AI requests
|   |   |   `-- administrator.ts           # Administrator and workspace data requests
|   |   |-- auth/
|   |   |   |-- sessionStore.ts            # Researcher and participant authentication state
|   |   |   `-- tabIdentity.ts             # Browser-tab identity helpers
|   |   |-- pages/
|   |   |   |-- LoginPage.tsx              # Role selection and sign-in forms
|   |   |   |-- ResearcherRegisterPage.tsx # Researcher registration form
|   |   |   |-- ResearcherDashboardPage.tsx # Dashboard, filters, result charts, and workspace settings
|   |   |   |-- ExperimentEditorPage.tsx   # Experiment editor layout and controls
|   |   |   |-- ParticipantPage.tsx        # Participant entry and experiment flow
|   |   |   `-- AdministratorPage.tsx      # Researcher, experiment, participant, and policy administration
|   |   |-- researcher/
|   |   |   |-- StageBuilder.tsx           # Stage list, selection, ordering, and stage actions
|   |   |   |-- StageContentEditor.tsx     # Stage name/type, question stem, components, and study materials
|   |   |   |-- StageFeatureEditor.tsx     # Applicable stage feature and recording controls
|   |   |   `-- ExportDialog.tsx           # Completion counts and experiment Excel download
|   |   `-- participant/
|   |       |-- StageRenderer.tsx          # Stage rendering, answer validation, submission, and preview
|   |       |-- ConsentView.tsx            # Consent text, signature, and consent decision
|   |       |-- ProgressStore.ts           # Participant draft progress persistence
|   |       |-- TimerController.ts         # Timer state and transient notice helpers
|   |       |-- EventQueue.ts              # Timestamped participant events and event queue persistence
|   |       |-- RecordingController.ts     # Recording permissions, capture, and recording lifecycle
|   |       `-- AIChat.tsx                 # Participant text chat and streamed replies
|   `-- tests/
|       |-- auth.test.tsx                  # Authentication and route behavior
|       |-- stage-builder.test.tsx         # Stage editing, publication, dashboard filters, and AI key settings
|       |-- participant.test.tsx           # Participant controls, recording, AI, and result behavior
|       |-- participant-access.test.tsx    # Participant entry and access behavior
|       `-- end-to-end.spec.ts             # Experiment workflow tests
`-- backend/
    |-- Dockerfile                         # Backend image and migration/startup command
    |-- .dockerignore                      # Backend image build exclusions
    |-- .gitkeep                           # Directory placeholder
    |-- requirements.txt                   # Backend dependency versions
    |-- alembic.ini                        # Database migration configuration
    |-- app/
    |   |-- __init__.py                    # Application package marker
    |   |-- main.py                        # FastAPI application, routers, CORS, and database connectivity check
    |   |-- core/
    |   |   |-- __init__.py                # Core package marker
    |   |   |-- config.py                  # Backend environment settings and account allowlist checks
    |   |   |-- database.py                # SQLAlchemy engine, base, and database sessions
    |   |   |-- clock.py                   # Server clock helpers
    |   |   |-- models.py                  # Shared identifiers and timestamp mixin
    |   |   |-- security.py                # Password hashing, JWTs, and researcher/admin authentication
    |   |   |-- routes.py                  # Root, health, and server-time endpoints
    |   |   |-- schemas.py                 # Shared camelCase schema base classes
    |   |   |-- logging.py                 # Logging configuration helpers
    |   |   `-- storage.py                 # Local/named storage paths and optional Graph storage helpers
    |   |-- researcher/
    |   |   |-- __init__.py                # Researcher package marker
    |   |   |-- models.py                  # Researcher and experiment database models
    |   |   |-- schemas.py                 # Authentication, experiment, storage, and AI key request schemas
    |   |   |-- repository.py              # Persistence, audit history, publication versions, and session binding
    |   |   |-- service.py                 # Authentication and experiment business rules
    |   |   |-- routes.py                  # Researcher, experiment, export, storage, and AI key endpoints
    |   |   |-- attachments.py             # Attachment storage helper
    |   |   `-- ai_config.py               # Default AI prompt and private experiment API key persistence
    |   |-- participant/
    |   |   |-- __init__.py                # Participant package marker
    |   |   |-- models.py                  # Sessions, answers, events, consent, recordings, and AI conversation models
    |   |   |-- schemas.py                 # Participant session, stage, event, and AI schemas
    |   |   |-- repository.py              # Participant data and idempotent AI turn persistence
    |   |   |-- service.py                 # Session submission, answer checks, and AI turn generation
    |   |   |-- routes.py                  # Participant access, session, stage, AI, export, and recording endpoints
    |   |   |-- events.py                  # Event handling helpers
    |   |   |-- consent.py                 # Consent handling helpers
    |   |   |-- recording.py               # Recording chunk handling
    |   |   |-- time_sync.py               # Time synchronization helpers
    |   |   |-- ai_proxy.py                # Server-side AI providers, payloads, streaming, and sanitized errors
    |   |   `-- export_csv.py              # CSV views, versioned Excel workbooks, and export formatting
    |   `-- administrator/
    |       |-- __init__.py                # Administrator package marker
    |       |-- models.py                  # Platform policy database model
    |       |-- service.py                 # Administrator operations and policies
    |       `-- routes.py                  # Administration and workspace endpoints
    |-- migrations/
    |   |-- env.py                         # Alembic database migration environment
    |   `-- versions/
    |       |-- 0001_researcher_schema.py   # Initial researcher and experiment schema
    |       |-- 0002_participant_schema.py  # Participant data schema
    |       |-- 0003_administrator_schema.py # Platform administration schema
    |       |-- 0004_overlay_compatibility.py # Compatibility migration
    |       |-- 0005_ai_conversations.py    # AI conversation and turn schema
    |       |-- 0006_researcher_storage.py  # Per-researcher storage preference
|       |-- 0007_session_client_lease.py # Browser-tab session ownership
|       |-- 0008_platform_access.py     # Account approval, access codes and storage notice
|       `-- 0009_token_revocation.py    # Signed-out token revocation
    `-- tests/
        |-- __init__.py                    # Test package marker
        |-- conftest.py                    # Isolated PostgreSQL schemas, API clients, and authentication fixtures
        |-- test_auth.py                   # Authentication and account tests
        |-- test_experiments.py            # Experiment operations and authorization tests
        |-- test_participant.py            # Participant data submission tests
        |-- test_participant_access.py     # Participant access restrictions
        |-- test_events_media_ai.py        # Events, recordings, AI providers, and experiment API keys
        `-- test_admin_export.py           # Administration, CSV/Excel exports, publication versions, and concurrency
```

## Exported Files

### Downloading and Opening Files

Use an experiment's export action on the Dashboard and select **Download Excel**. The **Visualization results** page also provides **Download Excel** on each session card. That session-card action exports the entire experiment containing the session, rather than only that session.

The workbook is named after the experiment code, for example `EXP-12345678.xlsx`. The frontend uses the server-provided filename and falls back to `experiment.xlsx` when that header is unavailable. Open the workbook in Excel or another compatible spreadsheet application. Enable cell wrapping to read long AI histories and activity timelines.

CSV remains available through authenticated export endpoints:

| Endpoint | Scope |
| --- | --- |
| `/api/experiments/{experiment_id}/results.csv?view=answers` | Answers for the researcher's experiment. |
| `/api/experiments/{experiment_id}/results.csv?view=activity` | Activity for the researcher's experiment. |
| `/api/admin/experiments/{experiment_id}/results.csv?view=answers` | Administrator experiment export; `activity` is also supported. |
| `/api/participant/sessions/{session_id}/csv?view=answers` | One session; `activity` is also supported and researcher authorization is required. |

Omitting `view` selects `answers`. CSV files use UTF-8 with a byte-order mark and CRLF line endings. Import them as UTF-8 comma-separated text when an application does not detect the format automatically.

### Excel Workbook Structure

| Sheet | Purpose |
| --- | --- |
| `Study information` | Experiment identity, creation/export times, publication records, and published stage/component snapshots. |
| `V1`, `V2`, ... | One sheet per published version, with one row per participation session bound to that version. A version without sessions still has its header row. |
| `Unknown legacy version` | Sessions whose original published version cannot be established. Appears only when needed. |

The first publication creates `V1`. A later Publish creates the next version only when the experiment name, stage configuration, or full-screen setting differs from the immediately preceding publication. Saving Draft does not create a version. Repeated publication, or unpublishing and republishing unchanged content, reuses the existing version. Draft changes reverted before publication do not create a version. Returning to an older configuration after a different publication does create a new version because it differs from the latest publication.

Sessions remain bound to their captured publication snapshot. Later edits do not move their data to a newer sheet. Existing historical versions are retained; the current rule does not merge older sheets retroactively. Draft saves update the current editable experiment but do not write configuration-history snapshots. Unchanged republications do not write new history records. The workbook excludes draft-change and unchanged-republication records from older installations. Experiment API key changes are separate from experiment content and do not create publication versions.

### Excel Field Reference

`Study information` has these columns:

| Field | Meaning |
| --- | --- |
| `Category` | Metadata category, publication, published stage, or published component. |
| `Version` | Published version number associated with the record, when applicable. |
| `Time (Australia/Sydney)` | Record time in Sydney local time, displayed to the second with its UTC offset. |
| `Content / Full configuration` | Metadata value, explanatory text, or JSON configuration snapshot. |
| `Actor ID` | Researcher identifier recorded for the operation, when available. |

Version and legacy sheets have these columns:

| Field | Meaning |
| --- | --- |
| `Participant code` | Participant-supplied identifier. Multiple sessions can use the same code. |
| `Session ID` | Unique participation-session identifier; use it to distinguish repeated participation. |
| `Version` | `V1`, `V2`, etc., or `Unknown legacy version`. |
| `Completion status` | `Completed` when a completion timestamp exists; otherwise `In progress`. This field does not separately label aborted sessions. |
| `Started at (Australia/Sydney)` | Session start time, displayed to the second. |
| `Completed at (Australia/Sydney)` | Completion time, displayed to the second; blank if no completion timestamp exists. |
| Dynamic question columns | Published stage/question text followed by the component ID in square brackets. Each cell contains the saved response, updated by captured answer-change events when available. |
| `Successful AI turns` | Number of explicitly linked, successfully saved AI request/reply pairs. Legacy counts may be `Unknown (legacy record)`. |
| `AI history` | Chronological linked AI turns, including time, stage, provider/model, request ID, user prompt, and AI reply. Unconfirmed legacy browser events are marked accordingly. |
| `Activity timeline` | Chronological activity records stored as formatted JSON blocks. Fields follow the activity CSV reference below. |

Unknown historical questions are labeled `Original question ID (legacy question unknown): {component_id}`. They are not relabeled using the current experiment configuration.

### CSV Views and Field Reference

The `answers` view contains one row per session. Its fixed columns are:

| Field | Meaning |
| --- | --- |
| `Study` | Experiment name. |
| `Study code` | Experiment access code. |
| `Participant` | Participant code. |
| `Completion status` | `Completed` or `In progress`, based on whether a completion timestamp exists. |
| `Started at (Australia/Sydney)` | Session start time, including milliseconds. |
| `Completed at (Australia/Sydney)` | Completion time, including milliseconds; blank when absent. |
| `Session reference` | Session ID. |

Additional columns use `Stage {position} - {stage name} / Q{number} - {question text}` as their general naming pattern; the actual separator is an en dash. A response component label is appended in parentheses when it differs from the preceding text prompt. Unmatched answer components use `Unmatched question - {component_id}`, also with an en dash. Unlike the Excel workbook, CSV does not create separate version sheets and its question map comes from the current experiment configuration.

The `activity` view contains individual event, consent, and recording records:

| Field | Meaning |
| --- | --- |
| `Study` | Experiment name. |
| `Study code` | Experiment access code. |
| `Participant` | Participant code. |
| `Completion status` | Session completion marker. |
| `Time (Australia/Sydney)` | Record timestamp converted to Sydney local time; milliseconds in CSV, seconds in the workbook timeline. |
| `Stage` | Resolved stage label, or an unmatched-stage reference. |
| `Question` | Resolved question label, or an unmatched-question reference. |
| `Activity` | Human-readable event name, such as `Stage opened`, `Answer changed`, or `Recording saved`. |
| `Content` | Main text/value associated with the event. |
| `Details` | Remaining event metadata flattened into readable lines. |
| `Recording file` | Recording filename, when the record is associated with a saved recording. |
| `Recording download reference` | Authenticated recording API path; not an embedded recording or a public URL. |
| `Event order` | Captured event sequence number within the session; blank for standalone records without one. |
| `Unix time (ms)` | Captured Unix epoch milliseconds. |
| `Performance time (ms)` | Captured monotonic browser performance time for relative timing. |
| `Session reference` | Session ID. |
| `Record reference` | Event, consent, or recording record ID. |
| `Original event type` | Original event key, such as `stage_view`, `answer`, or `ai_prompt`. |
| `Original timestamp` | Original stored timestamp, retained for timing checks and analysis. |

### Values, Timestamps, and Limitations

- Export-generated labels are English. Experiment names, question text, answers, filenames, and AI conversation content retain their original language.
- Sydney timestamps include a UTC offset and follow daylight-saving changes. Use `Original timestamp`, `Unix time (ms)`, and `Performance time (ms)` for detailed timing analysis rather than the workbook's second-resolution display.
- Boolean values are written as `Yes` or `No`; arrays become newline-separated values; missing values are blank. A numeric zero remains `0`.
- Attachments are represented by their filename when available, or `Attachment recorded`. Embedded base64 file content is not included in readable export cells. Recordings remain separate files.
- Excel stores exported cells as text. CSV values that could be interpreted as spreadsheet formulas receive a leading apostrophe; this is intentional formula protection.
- Long workbook cells are split across adjacent columns with suffixes such as `1 / 2` and `2 / 2`. Rejoin those parts in column order when processing the full text.
- The workbook removes API keys, credential fields, and private storage paths from configuration metadata. Per-experiment API keys are stored separately and are not exported.
- If workbook row/column capacity or unsupported characters prevent a complete export, the backend returns an error instead of silently truncating the content.

## Environment Configuration

### Configuration Files and Precedence

`.env.example` is a template and is not loaded automatically. Use a project-root `.env` with deployment-specific values. Do not commit credentials or copy real `.env` values into documentation.

For a directly started backend, settings are loaded from the project-root `.env` and then a `.env` in the current working directory, if different. Process environment variables take precedence. Settings are cached for the process lifetime, so backend configuration changes require a restart.

Docker Compose uses the project `.env` for interpolation and also passes it to the backend through `env_file`. Explicit backend `environment` entries override that file. In particular, the container's database connection uses `DOCKER_DATABASE_URL`, or a generated URL using `POSTGRES_*` and hostname `db`; it does not directly use the host-oriented `DATABASE_URL` value. The backend image does not bind-mount source code in the supplied Compose configuration.

The tables below describe backend/development defaults. The production template is `deploy/production.env.example`: `SITE_ADDRESS`, `PUBLIC_ORIGIN`, `PUBLIC_BIND_ADDRESS`, `HTTP_PORT`, `HTTPS_PORT`, `COMPOSE_PROJECT_NAME` and `BEYOND_ENV_FILE` control its hosting environment. Production uses `PUBLIC_ORIGIN` for CORS and does not publish database/backend host ports. Keep both the interpolation env-file and backend `BEYOND_ENV_FILE` aligned.

### Database and Container Variables

| Variable | Purpose and default behavior |
| --- | --- |
| `DATABASE_URL` | Direct backend PostgreSQL connection. Backend default: `postgresql+psycopg://postgres:postgres@127.0.0.1:5432/experiment_platform`. PostgreSQL with psycopg is required. |
| `DOCKER_DATABASE_URL` | Optional full database URL for the backend container. When absent, Compose builds one from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` using `db:5432`. |
| `POSTGRES_USER` | Database role initialized for a new PostgreSQL volume; Compose default `postgres`. |
| `POSTGRES_PASSWORD` | Password initialized for that role; Compose default `postgres`. Replace default credentials for a real deployment. |
| `POSTGRES_DB` | Database initialized for a new volume; Compose default `experiment_platform`. |
| `POSTGRES_PORT` | Host PostgreSQL port; Compose default `5432`. Does not change the internal container port. |
| `BACKEND_PORT` | Host backend port; Compose default `8000`. |
| `FRONTEND_PORT` | Host development frontend port; Compose default `5173`. |
| `COMPOSE_PROJECT_NAME` | Compose project identifier used when resolving default persistent volume names. The Compose file declares `comp9900-beyond` as its project name. |
| `POSTGRES_VOLUME_NAME` | Optional explicit existing PostgreSQL volume name; otherwise derived from the Compose project name. |
| `BACKEND_STORAGE_VOLUME_NAME` | Optional explicit backend storage volume name; otherwise derived from the project name. Mounted at `/app/storage`. |
| `BACKEND_LOGS_VOLUME_NAME` | Optional explicit backend log volume name; otherwise derived from the project name. Mounted at `/app/logs`. |
| `TEST_DATABASE_URL` | Test-only PostgreSQL URL read by `backend/tests/conftest.py`. Default: `postgresql+psycopg://postgres:postgres@127.0.0.1:5432/experiment_platform_test`. Set it in the test process environment; it is not a backend Settings field automatically loaded from `.env`. |

`POSTGRES_*` initialize a new database volume only. Editing them does not reset users, passwords, or databases in an existing volume. Use the explicit volume-name variables when reusing data from an older Compose project.

### Authentication and Access Variables

| Variable | Purpose and default behavior |
| --- | --- |
| `JWT_SECRET` | JWT signing secret. Default is a development placeholder; replace it with a strong random secret. Changing it invalidates tokens signed with the previous secret. |
| `JWT_ALGORITHM` | JWT algorithm; backend default `HS256`. |
| `JWT_EXPIRE_MINUTES` | Token lifetime in minutes; backend default `1440`. |
| `CORS_ORIGINS` | Comma-separated allowed browser origins. Backend default `http://localhost:5173`; Compose supplies localhost and loopback origins for its frontend port when the variable is unset. Include the browser's actual scheme, host, and port. |
| `ACCESS_ALLOWLIST_ENABLED` | Enable account email/domain restrictions; default `false`. |
| `ALLOWED_EMAILS` | Comma-separated exact email addresses; default empty. Matching ignores case. |
| `ALLOWED_DOMAINS` | Comma-separated exact email domains; default empty. Matching ignores case and does not automatically include subdomains. |

When the allowlist is enabled, an email must match an allowed address or domain. Empty lists deny all accounts, including requests using existing researcher tokens.

#### Client access

To admit the client account while keeping registration otherwise closed:

```dotenv
ACCESS_ALLOWLIST_ENABLED=true
ALLOWED_EMAILS=k.alqattan@unsw.edu.au
```

Exact-address matching ignores case and surrounding whitespace. `ALLOWED_DOMAINS=unsw.edu.au` admits the whole domain; subdomains such as `ad.unsw.edu.au` are matched separately and must be listed explicitly. Settings are cached for the process lifetime, so restart the backend after editing `.env`. Registration and login both apply the same check, and a rejected address receives `403` with a message naming the allowlist.

### AI Variables

| Variable | Purpose and default behavior |
| --- | --- |
| `AI_PROVIDER` | Current setup choices: `openai_compatible` (default) or `google`. The backend retains a legacy WorkBuddy adapter for older installations; it is not offered for new UI configurations. |
| `AI_API_KEY` | Server fallback API key; empty/unset means no server key. Workspace settings can override it in the researcher's common configuration or an experiment's independent configuration. |
| `AI_API_BASE` | Full Chat Completions URL, including its endpoint path. Backend default `https://api.openai.com/v1/chat/completions`; the template uses a placeholder endpoint. |
| `AI_MODEL` | Provider model identifier; backend default `gpt-4o-mini`. Replace the template model placeholder. |
| `AI_STREAM` | Request streaming responses; default `true`. Use `false` for JSON-only providers. |
| `AI_TIMEOUT_SECONDS` | Upstream request timeout; default `60`, allowed range greater than `0` through `600`. |
| `AI_TEMPERATURE` | Optional provider temperature, from `0` to `2`; omitted by default. |
| `AI_SYSTEM_PROMPT` | Optional replacement for the built-in research assistant instructions. Quote a value containing spaces or special characters according to dotenv syntax. |
| `AI_MAX_PROMPT_CHARS` | Maximum user prompt length; default `4000`, range `1`-`20000`. |
| `AI_HISTORY_MESSAGES` | Maximum retained user/assistant history messages; default `8`, range `0`-`100`. Counts messages, not conversation pairs. |
| `AI_HISTORY_MESSAGE_CHARS` | Maximum characters per retained history message; default `2000`, range `1`-`20000`. |

Workspace settings > AI API keys supports all AI parameters in the table above. Select Common configuration (all my experiments) to edit the signed-in researcher's shared provider, completion URL, model, API key, streaming, timeout, prompt, and context limits. For a specific experiment, check Use independent configuration to display and edit that experiment's own settings. Leave it unchecked to follow the common configuration and its future updates, with the experiment's configuration fields hidden. Switching sources retains the saved independent settings and key. New experiments use common configuration; previously configured experiments retain independent mode. Common configurations are isolated between researchers.

The main form presents the provider/key and preset information; custom endpoint/model controls are relevant to compatible services, while Advanced settings contains optional controls. Independent parameter fields initially copy common values when no independent settings exist; the common key is not copied. A blank key input keeps the existing key or the server default. Unconfigured independent fields inherit server defaults, not subsequent common changes. A blank temperature omits that parameter; a blank system prompt uses the built-in research assistant instructions. In common configuration, Use server default removes the custom common settings and key and reloads `.env` defaults without changing independent experiments. Saving settings does not perform a live provider test. Keys are never returned to the browser, and AI configuration is not included in published experiment snapshots or exports.

For Google, select Google in Workspace settings and enter a Google API key, or set `AI_PROVIDER=google` for server defaults. The current Google adapter applies its endpoint/model preset from `backend/app/researcher/ai_config.py`; custom compatible services use the OpenAI-compatible option. A key authenticates an account/project, while provider, endpoint and model determine how and where requests are sent. Save and test the actual configuration; no free quota or model availability is guaranteed by this repository.

### Storage Variables

| Variable | Purpose and default behavior |
| --- | --- |
| `LOCAL_STORAGE_DIR` | Default local storage root. Empty uses `backend/storage`; relative paths are resolved from `backend/`. Container deployments interpret paths inside the container. |
| `STORAGE_LOCATIONS` | JSON object mapping named storage locations to absolute server directories; default `{}`. Example: `{"research":"F:/BeyondData"}` on a Windows backend, or a mounted container path on Docker. |
| `STORAGE_DEFAULT_LOCATION` | Default storage location identifier; default `legacy`, which refers to the root selected by `LOCAL_STORAGE_DIR`. |
| `ONEDRIVE_CLIENT_ID` | Optional Microsoft Graph application client ID used by the storage helper. |
| `ONEDRIVE_CLIENT_SECRET` | Optional Microsoft Graph client secret. |
| `ONEDRIVE_TENANT_ID` | Optional Microsoft Graph tenant ID. |

Researchers select a configured location or create a named workspace folder in Workspace settings → Storage. Workspace folders live under the existing server storage root; they do not attach a disk, connect a cloud account or change capacity. Additional server directories are configured by the operator. The choice is stored per researcher and validated against the server configuration, and the backend probes it for writability before accepting it (422 for an unknown name, 507 when the directory is not writable). Only new files use the new location; previously saved files stay where they are. A directory outside the default storage volume needs its own persistent mount in a container deployment. For a second local disk/host directory, see `deploy/storage.compose.example.yml` and the [local storage mount procedure](docs/client/deployment-and-data-migration.md#researcher-selectable-local-storage). Paths entered for Docker are container paths; the operator mounts the real Windows/macOS/Linux host folder. The optional Graph helper is not an accepted OneDrive integration and is not required for the client's current local-storage phase.

### Frontend Variables

These belong to the frontend process or build environment. The supplied Compose frontend service explicitly sets only the proxy target and polling variables; a root `.env` value is not automatically passed into that service unless the Compose configuration maps it.

| Variable | Purpose and default behavior |
| --- | --- |
| `VITE_API_BASE` | Browser API base URL; default `/api`. Vite reads frontend environment values at development startup/build time. Use the frontend's environment location or pass it to the frontend process. |
| `API_PROXY_TARGET` | Vite development proxy destination; default `http://127.0.0.1:8000`. Compose sets `http://backend:8000`. Not a production browser setting. |
| `VITE_USE_POLLING` | Enables Vite file-watch polling when exactly `true`. Compose sets it to `true` for the bind-mounted frontend. |

Do not place API keys, database passwords, JWT secrets, or other server credentials in `VITE_*` variables: those values can be exposed to the browser.
