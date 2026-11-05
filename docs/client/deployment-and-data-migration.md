# Beyond — Deployment and Data Migration Guide

Prepared 5 November 2026 for a technical operator. Workflow baseline: application commit `7157320`, merged through MR !82. Record the exact accepted revision of the deployment configuration at handover. Database migration head: `a0a0a0a0a0a0` (adds administrator-controlled participant-record deletion; delegation to researchers is off by default).

The development data inventory below is a historical snapshot, not a guarantee of current counts. The production stack is separately defined in `docker-compose.production.yml`. Local isolated deployment checks do not establish that a public domain, certificate issuance or client-data migration has been completed. Perform a client-data restore rehearsal before accepting the final data package.

## 1. Choose the delivery mode

| Mode | What the client receives | Data implications |
| --- | --- | --- |
| New local installation | Source, configuration template and guides; Docker installed on the client's computer | Starts with a new database; existing developer-side studies are absent. |
| Local installation with migration | The above plus PostgreSQL dump and all referenced storage files | Preserves the selected installation's accounts, experiments and data after restoration. |
| Hosted service | Client-owned server/domain access and a managed HTTPS deployment | Participants use a URL; database and files remain on the server, not on each visitor's computer. |

Do not describe an HTTP tunnel or a laptop left running overnight as a completed production deployment. No tunnel or public deployment was configured during this documentation task.

## 2. Freeze a source release

Repository: https://gitlab.cse.unsw.edu.au/coursework/comp3900/26t3/capstone-projects/9900-w16d-donut/project

For a code recipient who cannot access the university GitLab, the delivery owner can produce a tracked source archive from the repository:

```bash
git rev-parse HEAD  # Record this accepted revision in the handover manifest.
git archive --format=zip --output=../Beyond-source.zip HEAD
```

This archive includes tracked source and configuration templates. It excludes `.git`, untracked `Material/`, local `.env`, installed dependencies, database volumes and runtime storage. Provide any separately approved client-owned material explicitly; do not assume it is in the archive. Pin the version rather than handing over an unrecorded moving branch.

If the client wants Git history, transfer repository access or a repository copy through their approved channel. A source ZIP is not a Git history transfer. Build images for the destination machine when CPU architecture differs; the current source Dockerfiles are the portable starting point.

## 3. Fresh local installation — empty database

Prerequisites: Docker Desktop on the client's Windows/macOS computer, or Docker Engine with Compose on Linux. Internet access is needed to obtain base images and build dependencies; the configured AI provider also requires connectivity.

Extract the source into a normal local directory, open a terminal in that directory, then:

```bash
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` before starting:

- Set a new strong `JWT_SECRET` and a new database password. Hexadecimal secrets avoid URL-escaping problems in the database connection string.
- Set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` consistently. The template uses `app_user` and `app_database`; these are different from the developer's existing database.
- Use free local ports. The example defaults to database 5432, backend 8000 and frontend 5173; change them if occupied.
- For standard Docker Compose installation, leave `DOCKER_DATABASE_URL` unset unless deliberately supplying a full URL to the Compose backend. The backend's Compose configuration constructs its database URL from `POSTGRES_*` and the `db` service name. The template's host-facing `DATABASE_URL` is for a backend launched outside Compose.
- Leave AI credentials unset until the client provides their own, then configure and test them in Workspace settings. Do not mistake the example endpoint/model placeholders for a working AI service.
- Keep default storage at `/app/storage` for this initial installation. Add explicit persistent mounts for any separate storage root.

For a clean local installation:

```bash
docker compose up -d --build
docker compose ps
```

Open `http://localhost:5173` and check `http://localhost:8000/api/healthz` (adjust ports if changed). The health endpoint should return `{"status":"ok"}`. The default Compose frontend is a development server; this is suitable for local handover/testing, not the final public hosting configuration.

Register the client's first researcher account. To make it the first administrator of this **new** installation:

```bash
docker compose exec backend python -m app.administrator.bootstrap k.alqattan@unsw.edu.au
```

The account must already exist, be active and have a password. The bootstrap refuses to promote a different account if an administrator already exists. Once an administrator exists, use the administration interface. Sign in again after promotion.

Do not bootstrap a new installation before restoring a full historical database: the migration path below restores existing accounts instead. Do not place initial passwords or actual API keys in these documentation files or Git.

### Daily local operation

Start Docker Desktop, then run `docker compose up -d`. To stop without deleting data, use `docker compose stop`. A normal `docker compose down` removes containers but preserves named volumes; **do not add `-v` unless intentionally destroying the stored data**. Changing the project name or volume names can make data appear missing by creating new empty volumes.

The developer's currently running frontend is a separately launched production Nginx container named `beyond-web`, not the default Compose development frontend. On that original computer, use the existing deployment arrangement; do not launch a second frontend on the already-occupied port 5173. The instructions above target a new client installation.

## 4. What must be migrated

Current source inventory, checked 5 November:

- PostgreSQL 16 container: `comp9900-beyond-db-1`; database `experiment_platform`; role `postgres`.
- Database volume: `comp9900-beyond_postgres_data`.
- Backend container: `comp9900-beyond-backend-1`.
- Storage volume: `comp9900-beyond_backend_storage`, mounted at `/app/storage`.
- Current counts: researchers 2; experiments 3; participant sessions 6; answers 216; recordings 7; completed AI turns 3. Counts may change after this snapshot.
- Local storage: 7 files totalling 39,449,661 bytes at inspection. Compare paths/checksums and playback, not only the database's recording count.

The database contains password hashes, role assignments and internal AI configurations, including one saved key-bearing configuration at inspection. Backups therefore contain credentials as well as research data. Transfer through a client-approved restricted/encrypted channel and agree whether to retain or replace those credentials. Do not commit a dump to Git or distribute it as a public release asset.

Browser-only unsynchronised data is outside the database and these file volumes. Finish or synchronise sessions first. Keep the original environment until the target restore is accepted.

## 5. Export from the original computer

The following is a **macOS/Linux shell example for the inspected source containers**. It intentionally stops backend writes while taking the database and media copies. Schedule this brief interruption; do not run it during a participant session. It is a guide, not an export that has already happened.

Run from a private handover working directory, outside the source repository:

```bash
(
  set -eu
  umask 077
  mkdir handover-data
  mkdir handover-data/storage
  # Restart the original backend even if a later export command fails.
  trap 'docker start comp9900-beyond-backend-1 >/dev/null' EXIT
  docker stop comp9900-beyond-backend-1
  docker exec comp9900-beyond-db-1 pg_dump \
    -U postgres -d experiment_platform \
    --format=custom --no-owner --no-acl \
    --file=/tmp/beyond-handover.dump
  docker cp comp9900-beyond-db-1:/tmp/beyond-handover.dump handover-data/database.dump
  docker cp comp9900-beyond-backend-1:/app/storage/. handover-data/storage/
  docker exec comp9900-beyond-db-1 rm /tmp/beyond-handover.dump
  shasum -a 256 handover-data/database.dump > handover-data/database.sha256
)
```

This creates a PostgreSQL logical archive, not a raw copy of a running PostgreSQL data directory. If storage locations outside `/app/storage` have been added, back up those mounts too and preserve their logical location names on the target. At the inspected snapshot, the only server root is `/app/storage`.

After export, verify that the original backend is healthy again. Record the export time and counts. Secure the data directory and send the agreed version/configuration manifest with it. Do not include runtime `.env` secrets in the public source archive; transfer necessary credentials separately or replace them on the target.

## 6. Restore to a NEW client installation

Use the same application release and PostgreSQL 16 initially. Use a new Compose project/empty database and new volumes, not an existing client installation with valuable data. These commands intentionally do not overwrite or clean an existing database. If a restore reports existing-table errors, stop and identify the target; do not add destructive flags to make it continue.

Prepare `.env` as in section 3, and place `handover-data/` beside the extracted source directory or adjust the paths below. The examples assume `handover-data/` is accessible from the current directory. Do **not** start the backend before the database restore, because its startup creates/migrates tables.

```bash
docker compose build backend frontend
docker compose up -d --wait db
docker compose cp handover-data/database.dump db:/tmp/beyond-handover.dump
docker compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error /tmp/beyond-handover.dump'
docker compose exec -T db rm /tmp/beyond-handover.dump
docker compose create backend
```

Find the new backend container ID using `docker compose ps --all -q backend`, then copy the storage contents into its mounted volume before starting it. macOS/Linux example:

```bash
target_backend=$(docker compose ps --all -q backend)
docker cp handover-data/storage/. "$target_backend:/app/storage/"
docker compose up -d --wait backend
docker compose up -d frontend
```

PowerShell equivalent for the copy step:

```powershell
$targetBackend = docker compose ps --all -q backend
docker cp handover-data/storage/. "${targetBackend}:/app/storage/"
```

Ensure restored files are readable/writable by the backend user. Preserve configured custom storage names and mount paths if any. A new database password controls the PostgreSQL connection; it does not change users' application passwords. A new JWT_SECRET requires users to sign in again.

### Restoration acceptance

1. Check the API health endpoint and schema version `a0a0a0a0a0a0`.
2. Compare source/target row counts using the export-time manifest, not permanently hard-coded numbers.
3. Sign in with the client's existing account. The inspected source includes active administrator accounts for `k.alqattan@unsw.edu.au` and `hennessy@ad.unsw.edu.au`. Confirm which accounts the client should retain; do not delete accounts without reviewing data ownership.
4. Open every migrated experiment, inspect a completed session, download Excel and play existing recordings.
5. Compare storage file paths and checksums, especially if copying multiple roots.
6. Confirm the intended provider/key ownership and run the saved AI connection test; no credentials need to be displayed for this check.
7. Run a new test participant through consent, AI/recording where required, final submission and export on the target installation.
8. Keep the original backup until the client signs off. Record the target URL, version, data scope and responsible operator.

CSV/Excel/chart downloads cannot substitute for this restoration. Copying Docker images alone does not migrate named volumes.

## 7. Configurable single-server hosting

The selected reference architecture is Docker Compose with Caddy for HTTPS, a built Nginx frontend, FastAPI backend, PostgreSQL 16 and persistent storage. It can run on a Docker host without binding application code to a particular cloud vendor. Desktop local use is supported through Docker on Windows/macOS/Linux; use an approved Docker-capable server for continuous hosting. Cross-platform design does not guarantee compatibility with every browser, Windows-container mode or CPU architecture: rebuild Linux images on the destination and test the actual target.

```text
Browser → HTTPS Caddy gateway → Nginx frontend → FastAPI backend → PostgreSQL
                                                     ↓
                                           persistent file storage
```

Only the gateway publishes host ports. The backend and database are reachable on the Compose network, with no public host-port mapping. All services use `restart: unless-stopped`; database, backend, and frontend have health checks, and container logs have size limits. Restart policies restart stopped processes after failures, not merely unhealthy processes; monitoring and alerts remain an operator responsibility. Certificates and backend data use persistent named volumes. No development source bind mounts are used by this production stack.

### First deployment

Use the standalone file, not a merge with the development Compose file:

```bash
cp deploy/production.env.example .env.production
# PowerShell: Copy-Item deploy/production.env.example .env.production
# Edit the copied file, especially the domain, origin and both secrets.
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --wait
```

Before starting, point a real public DNS name at the host and allow inbound TCP 80/443. Set `SITE_ADDRESS` to that DNS name and `PUBLIC_ORIGIN` to its HTTPS origin. Caddy requests/renews certificates when the domain and challenge routes are reachable. Keep its `/data` volume. An internal-only name or unreachable DNS does not produce a publicly trusted certificate merely because the stack starts. The gateway requires normal outbound certificate-issuer access; the backend requires outbound AI-provider access when AI is enabled.

Replace the two secret placeholders with independent random values. Use a password manager or a secure secret generator; hexadecimal database passwords avoid connection-URL encoding issues. `POSTGRES_*` set credentials only on NEW database volumes. Updating only the environment variable does not change an existing role's password.

Register the first permitted researcher, then bootstrap on this stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend python -m app.administrator.bootstrap k.alqattan@unsw.edu.au
```

Email restrictions in the template permit the client's address. Add other approved researchers before they need access. After bootstrap, close public self-registration or require researcher approval in the administrator settings, according to the client's access policy. Bootstrap does not happen automatically just because an email is in the allowlist.

### Changing settings and hosts

| Change | Configuration/action |
| --- | --- |
| Domain / public URL | Edit `SITE_ADDRESS` and `PUBLIC_ORIGIN`, update DNS, then recreate services with the same Compose command. Users keep application accounts but should sign in through the new origin; unsynchronised browser state is origin-specific. |
| Listening interface / host ports | Change `PUBLIC_BIND_ADDRESS`, `HTTP_PORT`, `HTTPS_PORT`; external certificate validation still needs the appropriate public 80/443 routes. |
| Secrets / account email access | Update the private env file and recreate backend; coordinate database password changes with PostgreSQL. A new JWT_SECRET invalidates existing tokens. |
| AI | Use Workspace settings or backend `AI_*` values. Keys remain server-side. Configure and test a client-owned provider account. |
| Extra local disk/folder | Use the optional storage override below; location names are stable logical identifiers. |
| Existing named volumes on the same host | Set `POSTGRES_VOLUME_NAME`, `BACKEND_STORAGE_VOLUME_NAME`, `BACKEND_LOGS_VOLUME_NAME` deliberately. Do not point two active stacks at the same PostgreSQL volume. |
| Remote/managed PostgreSQL | `DOCKER_DATABASE_URL` changes the backend connection. This reference file still starts its bundled db dependency; an operator should adapt the service/dependency configuration when adopting an external database. |
| Different server/cloud/OS | Install Docker, copy the pinned source/configuration, restore database AND media, validate privately, switch DNS, then retire the old stack. Reusing a volume name on a new machine does not transfer its contents. |

After editing environment settings, use `up -d` to recreate affected containers; `docker compose restart` alone does not apply changed environment values. Keep the same `--env-file` and `-f` flags for every operation on this stack. If renaming the env file, update `BEYOND_ENV_FILE` to match so the backend receives the intended values.

A server migration is a planned maintenance operation: freeze writes, back up PostgreSQL and all file roots, restore on the target, verify counts/playback/access, switch DNS, and keep a rollback copy. Changes to the deployment configuration do not implement automatic live migration or zero downtime. For a production target, use section 6 with `--env-file .env.production -f docker-compose.production.yml` on every Compose command. Start only `db` before restore; restore files before starting backend/gateway. Do not run the development command against the production data by accident.

### Researcher-selectable local storage

Without extra configuration, **Local server storage** uses `/app/storage` in a persistent Docker volume. Researchers can create named workspace folders on that volume. These are separate folders on the same server/disk, not newly attached drives or cloud accounts.

For a researcher-selectable folder on a different disk, create the directory on the Docker host. On Docker Desktop, allow Docker access to that host path. Add `RESEARCH_STORAGE_PATH` to `.env.production`, using an absolute path such as `/srv/beyond-research` on Linux, `/Users/name/BeyondResearch` on macOS, or `D:/BeyondResearch` on Windows. Container paths remain Linux paths on every host OS.

```bash
docker compose --env-file .env.production -f docker-compose.production.yml -f deploy/storage.compose.example.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml -f deploy/storage.compose.example.yml up -d --build --wait
```

The override mounts that host directory at `/data/research` and declares the logical location `research`. Researchers can select it in Workspace settings → Storage. The backend checks writability. The example replaces `STORAGE_LOCATIONS` with one mapping; edit/extend it when multiple existing roots must remain accessible. Include the same override file for future operations. Back up this host directory as well as the default volume. Changing a preference only affects NEW files; preserve old locations and names for existing recordings.

### Local smoke check of the production architecture

For an isolated HTTP test on the same machine, use a separate env file/project, `SITE_ADDRESS=http://localhost`, `PUBLIC_ORIGIN=http://localhost:18080`, `PUBLIC_BIND_ADDRESS=127.0.0.1`, `HTTP_PORT=18080`, `HTTPS_PORT=18443`, fresh secrets and `BEYOND_ENV_FILE` pointing to that test env file. This tests the built frontend/proxy/API/database, not public certificate issuance. Never reuse live volume names for the test. `localhost` is a browser secure-context exception; do not use plain remote HTTP for a recording study.

### Hosting acceptance still required

This configuration is a deployable baseline. A real host/domain, certificate issuance, client-owned credentials, scheduled database/media backups with restore drills, login/request rate limiting, account-recovery support, monitoring and target-concurrency recording tests must be completed before declaring the public service accepted. The current code records retention/global-duration policy values rather than automatically deleting data or enforcing a separate platform-wide deadline. No automatic backup job is installed by the Compose file.

The client explicitly requested local storage for the current phase. OneDrive is not a current-phase acceptance requirement. Do not present the optional Graph helper as an already-validated production storage integration. Ethical approval is under review according to the client; use approved demonstration/test material and confirm permission before collecting real research data.

## 8. Operations ownership to record at handover

| Responsibility | Named owner / contact |
| --- | --- |
| Repository and release updates | To be completed |
| Server, domain and TLS renewal | To be completed |
| Database and media backups; restore checks | To be completed |
| Researcher accounts and recovery | To be completed |
| AI project, keys, quota and billing | To be completed |
| Study content, participant codes and data access | To be completed |
| Incident support and maintenance scope | To be completed |

## Sources

- [PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html) — logical archive/restore mechanism.
- [Microsoft Graph /me authentication limitation](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/users-groups-entra-apis/error-call-me-endpoint-microsoft-graph) — why app-only credentials cannot use the signed-in-user endpoint.
- [Docker volume persistence and backup](https://docs.docker.com/engine/storage/volumes/) — data volumes are separate from images.
- [Docker Compose in production](https://docs.docker.com/compose/how-tos/production/) — deployment-specific production configuration.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) and [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) — secure contexts and browser limitations.
