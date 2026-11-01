<!--
File contract
Function: Document setup, running, testing, and result export.
Input: Project configuration, startup commands, test workflows, and export rules.
Output: Usage and collaboration guidance for developers.
Status: The file tree is documented; run and deployment instructions are pending.
-->

# Project File Tree

```text
project/
├── README.md                                  # [Testing / QA] Setup, run, test, and export instructions
├── .gitignore                                 # [Testing / QA] Exclude logs, secrets, caches, and build artifacts
├── .gitlab-ci.yml                             # [Testing / QA] Frontend, backend, and end-to-end test pipeline
├── .env.example                               # [Researcher Backend] Environment variable names and example placeholders
├── docker-compose.yml                         # [Researcher Backend] Frontend, backend, PostgreSQL, and log volumes
│
├── frontend/
│   ├── index.html                             # [Frontend] Vite HTML entry point
│   ├── package.json                           # [Frontend] Frontend dependencies and run scripts
│   ├── package-lock.json                      # [Frontend] Frontend dependency lockfile
│   ├── playwright.config.ts                   # [Testing / QA] Playwright browser and server configuration
│   ├── tsconfig.json                          # [Frontend] TypeScript compiler configuration
│   ├── vite.config.ts                         # [Frontend] Vite build and development proxy
│   ├── src/
│   │   ├── main.tsx                           # [Frontend] React mounting entry point
│   │   ├── App.tsx                            # [Frontend] Page routes and access boundaries
│   │   ├── styles.css                         # [Frontend] Blue-and-white theme and global styles
│   │   ├── types.ts                           # [Frontend] Types shared by APIs and pages
│   │   ├── api/
│   │   │   ├── http.ts                        # [Frontend] Axios, cookies, tab IDs, and shared error handling
│   │   │   ├── auth.ts                        # [Frontend] Registration, login, session, and logout requests
│   │   │   ├── experiments.ts                 # [Frontend] Experiment editing, publishing, attachment, and export requests
│   │   │   ├── participant.ts                 # [Frontend] Answer, event, media, AI, and time-sync requests
│   │   │   └── administrator.ts               # [Frontend] Administrator read and update requests
│   │   ├── auth/
│   │   │   ├── sessionStore.ts                # [Frontend] Zustand login state and refresh recovery
│   │   │   └── tabIdentity.ts                 # [Frontend] Per-tab ID, heartbeat, and release
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx                  # [Frontend] Three-role selector and login forms
│   │   │   ├── ResearcherRegisterPage.tsx     # [Frontend] Registration and return to login
│   │   │   ├── ResearcherDashboardPage.tsx    # [Frontend] Experiment list, filters, sorting, and actions
│   │   │   ├── ExperimentEditorPage.tsx       # [Frontend] Three-column experiment editor
│   │   │   ├── ParticipantPage.tsx            # [Frontend] Consent, welcome, answering, and completion states
│   │   │   └── AdministratorPage.tsx          # [Frontend] Account, experiment, and participant relationships
│   │   ├── researcher/
│   │   │   ├── StageBuilder.tsx               # [Frontend] Add, remove, and reorder 1-20 stages
│   │   │   ├── StageContentEditor.tsx         # [Frontend] Edit and validate content for seven stage types
│   │   │   ├── StageFeatureEditor.tsx         # [Frontend] Per-stage features, attachments, and AI settings
│   │   │   └── ExportDialog.tsx               # [Frontend] Completion counts and CSV download
│   │   └── participant/
│   │       ├── StageRenderer.tsx              # [Frontend] Seven stage types, current time, and answer forms
│   │       ├── ConsentView.tsx                # [Frontend] Consent decision and signature
│   │       ├── ProgressStore.ts                # [Frontend] Draft inputs, three-minute saves, and recovery
│   │       ├── TimerController.ts              # [Frontend] Server timer display, pause, and resume
│   │       ├── EventQueue.ts                   # [Frontend] Post-consent event sequencing, batching, and retry
│   │       ├── RecordingController.ts          # [Frontend] Device permission, preview, recording, and upload
│   │       └── AIChat.tsx                      # [Frontend] Stage-specific text-only AI chat
│   └── tests/
│       ├── auth.test.tsx                      # [Testing / QA] Login, registration, session recovery, and tab notices
│       ├── stage-builder.test.tsx             # [Testing / QA] Stage type, order, and feature validation
│       ├── participant.test.tsx               # [Testing / QA] Consent, answering, pause, and recovery interactions
│       └── end-to-end.spec.ts                 # [Testing / QA] Playwright login-to-completion and export flow
│
└── backend/
    ├── Dockerfile                             # [Researcher Backend] FastAPI container build
    ├── requirements.txt                       # [Researcher Backend] Shared Python dependency versions
    ├── alembic.ini                            # [Researcher Backend] Database migration configuration
    ├── app/
    │   ├── main.py                            # [Researcher Backend] FastAPI application and router registration
    │   ├── core/
    │   │   ├── config.py                      # [Researcher Backend] Environment variables and security settings
    │   │   ├── database.py                    # [Researcher Backend] SQLAlchemy database connection
    │   │   ├── clock.py                       # [Researcher Backend] Authoritative server clock interface
    │   │   ├── models.py                      # [Researcher Backend] Browser Session and active-tab models
    │   │   ├── security.py                    # [Researcher Backend] Argon2id, cookie sessions, and active tabs
    │   │   ├── routes.py                      # [Researcher Backend] Session, tab, and time APIs
    │   │   ├── logging.py                     # [Researcher Backend] JSONL application, security, and audit logging
    │   │   ├── storage.py                     # [Researcher Backend] External storage adapter and restricted reads
    │   │   └── schemas.py                     # [Researcher Backend] Shared request, response, and error schemas
    │   ├── researcher/
    │   │   ├── models.py                      # [Researcher Backend] Researcher, Experiment, Stage, and version models
    │   │   ├── schemas.py                     # [Researcher Backend] Experiment and stage validation schemas
    │   │   ├── repository.py                  # [Researcher Backend] Owner, experiment, and version data access
    │   │   ├── service.py                     # [Researcher Backend] Registration, experiment CRUD, copy, publish, and close
    │   │   ├── attachments.py                 # [Researcher Backend] Stage attachments and storage bindings
    │   │   ├── ai_config.py                   # [Researcher Backend] AI model settings, credentials, and connection tests
    │   │   └── routes.py                      # [Researcher Backend] Researcher identity and experiment APIs
    │   ├── administrator/
    │   │   ├── models.py                      # [Administrator] Administrator credential and audit models
    │   │   ├── service.py                     # [Administrator] Account and experiment management; export authorization
    │   │   └── routes.py                      # [Administrator] Administrator login and management APIs
    │   └── participant/
    │       ├── models.py                      # [Participant Backend] Code, Run, answer, event, and media models
    │       ├── schemas.py                     # [Participant Backend] Answer, consent, event, and media schemas
    │       ├── repository.py                  # [Participant Backend] Participant data access and recovery
    │       ├── service.py                     # [Participant Backend] Code login, stage progression, and timer transactions
    │       ├── routes.py                      # [Participant Backend] Participant login and answering APIs
    │       ├── consent.py                     # [Participant Backend] Consent records and data-capture gate
    │       ├── events.py                      # [Participant Backend] Event deduplication, timeline, and batch intake
    │       ├── recording.py                   # [Participant Backend] Recording upload, status, and media index
    │       ├── ai_proxy.py                    # [Participant Backend] AI request proxy and message persistence
    │       ├── time_sync.py                   # [Participant Backend] Time-sync samples and offset estimates
    │       └── export_csv.py                  # [Participant Backend] Single-file CSV export defined in Section 9.3
    ├── migrations/
    │   ├── env.py                             # [Researcher Backend] Alembic model registration entry point
    │   └── versions/
    │       ├── 0001_researcher_schema.py      # [Researcher Backend] Researcher account, experiment, and version tables
    │       ├── 0002_participant_schema.py      # [Participant Backend] Participant, answering, event, and media tables
    │       └── 0003_administrator_schema.py   # [Administrator] Administrator credential and audit tables
    └── tests/
        ├── conftest.py                        # [Testing / QA] Database, session, and API test fixtures
        ├── test_auth.py                       # [Testing / QA] Login, tab takeover, recovery, logout, and password changes
        ├── test_experiments.py                # [Testing / QA] Ownership, stage validation, publishing, and versions
        ├── test_participant.py                # [Testing / QA] Consent, answering, timers, refresh, and idempotency
        ├── test_events_media_ai.py            # [Testing / QA] Event timeline, recording, and AI conversation
        └── test_admin_export.py               # [Testing / QA] Administrator permissions and CSV fields
```
