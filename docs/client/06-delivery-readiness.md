# Client requirements and delivery acceptance

Review date: 5 November 2026. This review uses the client's supplied email as the current scope. A capability present in code is distinguished from a client-environment acceptance test.

| Client request | Implementation / evidence | Remaining acceptance |
| --- | --- | --- |
| Platform-independent, practical, documented deployment | Docker images plus development Compose; standalone production Compose now specifies Caddy HTTPS, runtime Nginx frontend, FastAPI and PostgreSQL. Settings are externalised in env files and storage overrides. | Run on the selected client/organisation host and record its OS/CPU/browser. Actual Windows/macOS/Linux installations have not all been independently accepted. |
| Configurable/adaptable hosting | Domain/origin, gateway interface/ports, secrets, database URL, volume names, AI and local storage mounts can change without rewriting application code. Migration/rollback steps are documented. | Host/domain/billing/operator ownership and a real migration rehearsal. Host replacement needs backup/restore and DNS cutover; no automatic zero-downtime migration is promised. |
| Client account `k.alqattan@unsw.edu.au` | The inspected local database has an active administrator account. The production env template permits this email; a fresh database needs registration and bootstrap or restoration. | Client verifies the password and role on the delivered installation. The Markdown backslash in the email is not part of the actual address. |
| Researcher-selectable LOCAL storage for current testing | Persistent local root, researcher folder creation/selection and server-configured extra locations; optional bind-mount override and Windows/macOS/Linux path guidance supplied. Existing files retain their original location. | Verify write/read/playback on the actual target folder and include every used root in backups. A named folder on the same root is not an additional disk. OneDrive is not required for this phase. |
| Ethical approval under review | Consent/disclosure configuration and recorded acceptance are supported. | Study owner confirms permitted demonstration/collection scope. Application deployment/publication is not ethical approval. |
| Reference example uploaded to Teams/example | Prior checklist exists in `04-reference-platform-review.md`. | The email establishes that an upload was reported, not that the team has independently inspected it. Retrieve/review actual authorised material and record the comparison. No unsupported claim of matching that reference is made. |
| Research materials uploaded to Teams/doc; complete end-to-end scenario | Builder/publish, participant entry/consent/answers/AI/recording, session results, media playback and exports exist. User guide and corrected session runbook supplied. | Verify the actual Teams files and approved wording, configure client-owned AI, then rehearse and sign off the entire scenario on the delivered environment. Automated checks do not establish that the exact supplied materials were used. |
| Bar, line, scatter and histogram; organised by experiment and researcher | All four chart types are implemented, with donut/timeline extras. Researcher results are scoped by account ownership and selected experiment; administrator oversight is separate. | Client verifies chart interpretation on their data. A cross-researcher comparative chart selector is not implemented by displaying the current researcher's name. If a single administrator chart comparing researchers is intended, confirm it as an additional acceptance requirement. |

## Deployment interpretation

The client's wording authorises the team to select and document a practical reference approach. It does not assign the student an indefinite hosting bill, require a particular cloud vendor, or promise instant live movement between servers. Deliver the infrastructure definition, configuration template, account/data transfer process and named operating owner. A continuous public service still requires a real host, DNS/TLS, credentials, backups, monitoring and actual browser/concurrency acceptance.

The selected single-server container approach is intentionally modest. It is suitable as a maintainable baseline and can later be adapted to a different host, external database or existing institutional HTTPS ingress. Those adaptations need configuration and migration work, not an application rewrite. This baseline is not high availability, automatic failover, managed backups or a production load-test result.

## Handover sign-off

Record the exact source revision, target address, host/OS, browser, account/data scope, AI/storage ownership, workflow results, backup restoration evidence, outstanding items and support owner. Keep any data package and real secrets out of Git.

## Local verification of the hosting baseline

The new production definition was started as an isolated temporary Compose project with fresh credentials, loopback-only HTTP ports and synthetic data. Checks passed for the runtime frontend, Caddy configuration, gateway-to-API routing, private backend/database host ports, researcher registration/login, study publication, participant consent/answer/completion, logout token invalidation, PostgreSQL logical dump/restore, backend restart, and an additional named host-folder read/write mount. Temporary resources were removed after verification.

This did not request a real public certificate, migrate existing client data, exercise a client-owned AI credential or complete a recorded research session using the Teams materials. Those remain target-environment acceptance checks. No new hosted service or paid resource was created.
