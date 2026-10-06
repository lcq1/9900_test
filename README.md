<!--
文件职责 / File contract
功能 / Function: 说明环境准备、运行、测试与结果导出。 / Document setup, running, testing, and result export.
输入 / Input: 项目配置、启动命令、测试流程和导出约定。 / Project configuration, startup commands, test workflows, and export rules.
输出 / Output: 面向开发者的使用与协作说明。 / Usage and collaboration guidance for developers.
状态 / Status: 文件树已补充；运行和部署说明待完善。 / The file tree is documented; run and deployment instructions are pending.
-->

# 项目文件树 / Project File Tree

以下文件树移植自 `Plan.md` 第 8.2 节，表示目标结构和文件职责。每行依次给出负责人、中文说明和英文说明；`【】` 表示 Administrator 后端的负责人暂未分配。

The tree below follows Section 8.2 of `Plan.md`. It describes the target structure and each file's purpose. Each file line shows its owner, a Chinese description, and an English description. `【】` means the Administrator backend owner is currently unassigned.

```text
project/
├── README.md                                  # 【测试 / QA】环境准备、运行、测试与导出说明 / Setup, run, test, and export instructions
├── .gitignore                                 # 【测试 / QA】排除日志、密钥、缓存和构建产物 / Exclude logs, secrets, caches, and build artifacts
├── .gitlab-ci.yml                             # 【测试 / QA】前端、后端与端到端测试流水线 / Frontend, backend, and end-to-end test pipeline
├── .env.example                               # 【后端-Researcher / Researcher Backend】环境变量名称与占位示例 / Environment variable names and example placeholders
├── docker-compose.yml                         # 【后端-Researcher / Researcher Backend】前端、后端、PostgreSQL 和日志卷 / Frontend, backend, PostgreSQL, and log volumes
│
├── frontend/
│   ├── index.html                             # 【前端 / Frontend】Vite HTML 入口 / Vite HTML entry point
│   ├── package.json                           # 【前端 / Frontend】前端依赖与运行脚本 / Frontend dependencies and run scripts
│   ├── package-lock.json                      # 【前端 / Frontend】前端依赖锁定文件 / Frontend dependency lockfile
│   ├── playwright.config.ts                   # 【测试 / QA】Playwright 浏览器与服务配置 / Playwright browser and server configuration
│   ├── tsconfig.json                          # 【前端 / Frontend】TypeScript 编译配置 / TypeScript compiler configuration
│   ├── vite.config.ts                         # 【前端 / Frontend】Vite 构建与开发代理 / Vite build and development proxy
│   ├── src/
│   │   ├── main.tsx                           # 【前端 / Frontend】React 挂载入口 / React mounting entry point
│   │   ├── App.tsx                            # 【前端 / Frontend】页面路由与权限边界 / Page routes and access boundaries
│   │   ├── styles.css                         # 【前端 / Frontend】蓝白色主题与全局样式 / Blue-and-white theme and global styles
│   │   ├── types.ts                           # 【前端 / Frontend】API 与页面共用类型 / Types shared by APIs and pages
│   │   ├── api/
│   │   │   ├── http.ts                        # 【前端 / Frontend】Axios、Cookie、tab_id 与统一错误处理 / Axios, cookies, tab IDs, and shared error handling
│   │   │   ├── auth.ts                        # 【前端 / Frontend】注册、登录、会话和退出请求 / Registration, login, session, and logout requests
│   │   │   ├── experiments.ts                 # 【前端 / Frontend】实验编辑、发布、附件与导出请求 / Experiment editing, publishing, attachment, and export requests
│   │   │   ├── participant.ts                 # 【前端 / Frontend】答题、事件、媒体、AI 与校时请求 / Answer, event, media, AI, and time-sync requests
│   │   │   └── administrator.ts               # 【前端 / Frontend】管理员查询和修改请求 / Administrator read and update requests
│   │   ├── auth/
│   │   │   ├── sessionStore.ts                # 【前端 / Frontend】Zustand 登录状态及刷新恢复 / Zustand login state and refresh recovery
│   │   │   └── tabIdentity.ts                 # 【前端 / Frontend】每标签页 tab_id、心跳与释放 / Per-tab ID, heartbeat, and release
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx                  # 【前端 / Frontend】三角色中心选择框与登录表单 / Three-role selector and login forms
│   │   │   ├── ResearcherRegisterPage.tsx    # 【前端 / Frontend】注册及返回登录表单 / Registration and return to login
│   │   │   ├── ResearcherDashboardPage.tsx   # 【前端 / Frontend】实验列表、筛选、排序和操作 / Experiment list, filters, sorting, and actions
│   │   │   ├── ExperimentEditorPage.tsx      # 【前端 / Frontend】实验详情三栏编辑页 / Three-column experiment editor
│   │   │   ├── ParticipantPage.tsx            # 【前端 / Frontend】同意、欢迎、答题和结束状态 / Consent, welcome, answering, and completion states
│   │   │   └── AdministratorPage.tsx          # 【前端 / Frontend】账户、实验和 Participant 对应关系 / Account, experiment, and Participant relationships
│   │   ├── researcher/
│   │   │   ├── StageBuilder.tsx               # 【前端 / Frontend】1–20 个 Stage 的增删与排序 / Add, remove, and reorder 1–20 stages
│   │   │   ├── StageContentEditor.tsx        # 【前端 / Frontend】七种 Stage 的内容编辑和校验 / Edit and validate content for seven stage types
│   │   │   ├── StageFeatureEditor.tsx        # 【前端 / Frontend】逐 Stage 功能、附件和 AI 设置 / Per-stage features, attachments, and AI settings
│   │   │   └── ExportDialog.tsx              # 【前端 / Frontend】完成/未完成人数及 CSV 下载 / Completion counts and CSV download
│   │   └── participant/
│   │       ├── StageRenderer.tsx              # 【前端 / Frontend】七种 Stage、当前时间和答案表单 / Seven stage types, current time, and answer forms
│   │       ├── ConsentView.tsx                # 【前端 / Frontend】知情同意决定及签名 / Consent decision and signature
│   │       ├── ProgressStore.ts               # 【前端 / Frontend】未提交输入、每 3 分钟保存和恢复 / Draft inputs, three-minute saves, and recovery
│   │       ├── TimerController.ts             # 【前端 / Frontend】服务端计时状态的显示与暂停/恢复 / Server timer display, pause, and resume
│   │       ├── EventQueue.ts                  # 【前端 / Frontend】同意后的事件序号、批量发送与重试 / Post-consent event sequencing, batching, and retry
│   │       ├── RecordingController.ts         # 【前端 / Frontend】设备授权、预览、录制与上传 / Device permission, preview, recording, and upload
│   │       └── AIChat.tsx                     # 【前端 / Frontend】Stage 内纯文本 AI 聊天 / Stage-specific text-only AI chat
│   └── tests/
│       ├── auth.test.tsx                      # 【测试 / QA】登录、注册、会话恢复和标签页提示 / Login, registration, session recovery, and tab notices
│       ├── stage-builder.test.tsx             # 【测试 / QA】Stage 类型、顺序和 Feature 校验 / Stage type, order, and feature validation
│       ├── participant.test.tsx               # 【测试 / QA】同意、答题、暂停和恢复交互 / Consent, answering, pause, and recovery interactions
│       └── end-to-end.spec.ts                 # 【测试 / QA】Playwright 登录至完成与导出流程 / Playwright login-to-completion and export flow
│
└── backend/
    ├── Dockerfile                             # 【后端-Researcher / Researcher Backend】FastAPI 容器构建 / FastAPI container build
    ├── requirements.txt                       # 【后端-Researcher / Researcher Backend】Python 公共依赖版本 / Shared Python dependency versions
    ├── alembic.ini                            # 【后端-Researcher / Researcher Backend】数据库迁移配置 / Database migration configuration
    ├── app/
    │   ├── main.py                            # 【后端-Researcher / Researcher Backend】FastAPI 应用及各 Router 注册 / FastAPI application and router registration
    │   ├── core/
    │   │   ├── config.py                      # 【后端-Researcher / Researcher Backend】环境变量与安全配置 / Environment variables and security settings
    │   │   ├── database.py                    # 【后端-Researcher / Researcher Backend】SQLAlchemy 数据库连接 / SQLAlchemy database connection
    │   │   ├── clock.py                       # 【后端-Researcher / Researcher Backend】唯一权威服务端时间接口 / Authoritative server clock interface
    │   │   ├── models.py                      # 【后端-Researcher / Researcher Backend】Browser Session 与 active tab 模型 / Browser Session and active-tab models
    │   │   ├── security.py                    # 【后端-Researcher / Researcher Backend】Argon2id、Cookie Session 与 active tab / Argon2id, cookie sessions, and active tabs
    │   │   ├── routes.py                      # 【后端-Researcher / Researcher Backend】会话、标签页与时间 API / Session, tab, and time APIs
    │   │   ├── logging.py                     # 【后端-Researcher / Researcher Backend】JSONL 系统/安全/审计日志写入 / JSONL application, security, and audit logging
    │   │   ├── storage.py                     # 【后端-Researcher / Researcher Backend】外部存储适配与受限读取接口 / External storage adapter and restricted reads
    │   │   └── schemas.py                     # 【后端-Researcher / Researcher Backend】统一请求/响应与错误 Schema / Shared request, response, and error schemas
    │   ├── researcher/
    │   │   ├── models.py                      # 【后端-Researcher / Researcher Backend】Researcher、Experiment、Stage 和版本模型 / Researcher, Experiment, Stage, and version models
    │   │   ├── schemas.py                     # 【后端-Researcher / Researcher Backend】实验及 Stage 校验 Schema / Experiment and Stage validation schemas
    │   │   ├── repository.py                  # 【后端-Researcher / Researcher Backend】owner、实验和版本数据访问 / Owner, experiment, and version data access
    │   │   ├── service.py                     # 【后端-Researcher / Researcher Backend】注册、实验 CRUD、复制、发布和结束 / Registration, experiment CRUD, copy, publish, and close
    │   │   ├── attachments.py                 # 【后端-Researcher / Researcher Backend】Stage 附件和存储绑定 / Stage attachments and storage bindings
    │   │   ├── ai_config.py                   # 【后端-Researcher / Researcher Backend】AI 模型配置、密钥与连接测试 / AI model settings, credentials, and connection tests
    │   │   └── routes.py                      # 【后端-Researcher / Researcher Backend】Researcher 身份及实验 API / Researcher identity and experiment APIs
    │   ├── administrator/
    │   │   ├── models.py                      # 【】Administrator 凭据及审计模型 / Administrator credential and audit models
    │   │   ├── service.py                     # 【】账户、实验管理和导出授权 / Account and experiment management; export authorization
    │   │   └── routes.py                      # 【】Administrator 登录与管理 API / Administrator login and management APIs
    │   └── participant/
    │       ├── models.py                      # 【后端-Participant / Participant Backend】Code、Run、答案、事件和媒体模型 / Code, Run, answer, event, and media models
    │       ├── schemas.py                     # 【后端-Participant / Participant Backend】答题、同意、事件和媒体 Schema / Answer, consent, event, and media schemas
    │       ├── repository.py                  # 【后端-Participant / Participant Backend】Participant 数据访问与恢复 / Participant data access and recovery
    │       ├── service.py                     # 【后端-Participant / Participant Backend】Code 登录、Stage 推进和计时事务 / Code login, Stage progression, and timer transactions
    │       ├── routes.py                      # 【后端-Participant / Participant Backend】Participant 登录及答题 API / Participant login and answering APIs
    │       ├── consent.py                     # 【后端-Participant / Participant Backend】同意记录和采集开关 / Consent records and data-capture gate
    │       ├── events.py                      # 【后端-Participant / Participant Backend】事件去重、时间线与批量接收 / Event deduplication, timeline, and batch intake
    │       ├── recording.py                   # 【后端-Participant / Participant Backend】录制上传、状态与媒体索引 / Recording upload, status, and media index
    │       ├── ai_proxy.py                    # 【后端-Participant / Participant Backend】AI 请求代理和消息保存 / AI request proxy and message persistence
    │       ├── time_sync.py                   # 【后端-Participant / Participant Backend】校时样本保存与偏移估计 / Time-sync samples and offset estimates
    │       └── export_csv.py                  # 【后端-Participant / Participant Backend】第 9.3 节的单文件 CSV 导出 / Single-file CSV export defined in Section 9.3
    ├── migrations/
    │   ├── env.py                             # 【后端-Researcher / Researcher Backend】Alembic 模型注册入口 / Alembic model registration entry point
    │   └── versions/
    │       ├── 0001_researcher_schema.py      # 【后端-Researcher / Researcher Backend】Researcher 账户、实验和版本表 / Researcher account, experiment, and version tables
    │       ├── 0002_participant_schema.py     # 【后端-Participant / Participant Backend】Participant、答题、事件和媒体表 / Participant, answering, event, and media tables
    │       └── 0003_administrator_schema.py   # 【】Administrator 凭据及审计表 / Administrator credential and audit tables
    └── tests/
        ├── conftest.py                        # 【测试 / QA】数据库、Session 与 API 测试夹具 / Database, session, and API test fixtures
        ├── test_auth.py                       # 【测试 / QA】登录、抢占、恢复、注销和改密 / Login, tab takeover, recovery, logout, and password changes
        ├── test_experiments.py                # 【测试 / QA】所有权、Stage 校验、发布与版本 / Ownership, Stage validation, publishing, and versions
        ├── test_participant.py                # 【测试 / QA】同意、答题、计时、刷新和幂等性 / Consent, answering, timers, refresh, and idempotency
        ├── test_events_media_ai.py            # 【测试 / QA】事件时间线、录制和 AI 对话 / Event timeline, recording, and AI conversation
        └── test_admin_export.py               # 【测试 / QA】管理员权限和 CSV 字段内容 / Administrator permissions and CSV fields
```
