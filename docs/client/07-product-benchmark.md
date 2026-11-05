# Research-platform benchmark and implementation review

Review date: 5 November 2026. This is a source-backed capability comparison, not a claim that one vendor is universally the best or that Beyond now has enterprise feature parity. Sources were discovered through the connected GitHub app and official product documentation. No paid product account was created, and private commercial interfaces were not independently audited.

## Comparable projects and products

| Reference | Why it is relevant | Primary source |
| --- | --- | --- |
| jsPsych | Browser-based behavioural experiments, plugin tasks and experimental timelines. Its documentation covers conditional timelines and randomisation, which are beyond Beyond's current fixed-stage workflow. | [Repository](https://github.com/jspsych/jsPsych), [timeline documentation](https://www.jspsych.org/7.3/overview/timeline/) |
| LimeSurvey | Academic/research surveys, multiple question types, branching, participant access and configurable/self-hosted operation. Its README describes these capabilities; that description is not an independent compliance certification. | [Repository and feature overview](https://github.com/LimeSurvey/LimeSurvey) |
| Formbricks | A comparable open-source survey/feedback product with an editor, templates, shareable links and collaboration. It is a useful reference for researcher-facing management workflows. | [Repository and feature overview](https://github.com/formbricks/formbricks) |
| Qualtrics | A mature commercial reference for organising, copying, distributing and reporting on research surveys. Official documentation describes project creation from copies, libraries and exported design files, plus survey-flow branches. | [Creating a project](https://www.qualtrics.com/support/survey-platform/my-projects/creating-a-project/), [organising projects](https://www.qualtrics.com/support/survey-platform/my-projects/organizing-your-projects/), [survey builder overview](https://www.qualtrics.com/support/survey-platform/survey-module/survey-module-overview/) |

These products have different scopes. jsPsych is an experiment framework rather than a complete hosted researcher-account platform; Formbricks targets feedback as well as surveys; Qualtrics is a broad commercial suite. Popularity or repository stars do not establish research-data integrity or suitability for this specific client.

Beyond already combines a stage editor, participant consent, AI conversations, recordings, timestamped events and Excel/chart exports for its specific human–AI study use case. The gaps below concern reusable study management and broader platform maturity.

## Findings and changes in this delivery

| Priority | Beyond gap observed | Implemented behaviour / verification |
| --- | --- | --- |
| High | There was no reusable experiment-copy/design-transfer workflow; rebuilding a similar study required manual work. | Dashboard actions duplicate a study as a new draft or download a versioned design JSON. Import creates a new owner-scoped draft with fresh experiment/stage/question IDs. Neither route transfers responses, keys, participant codes or uploaded files. Server tests check privacy, schema limits and cross-account isolation. |
| High | Recruitment could not be managed clearly from the experiment list; direct status changes also needed valid state constraints. | Dashboard actions close/reopen recruitment. Closure blocks new participant access but permits already-started sessions using valid existing credentials to finish/resume. Reopening uses the normal publication validation. Existing data is retained. Invalid status values are rejected. |
| High | Sharing meant manually explaining the entry page and experiment code. | Published studies have a participant link and locally generated QR code. The link prefills only the experiment code and still requires a participant code; no token, key or personal code is put into the URL. QR code code is loaded only when needed. |
| High | Browser caches were being presented as usage statistics, so different devices could show different study totals. | An authenticated aggregation endpoint now returns the current researcher's server experiment/session/completion/event/recording counts. It excludes private internal records and other researchers' data. The UI has refresh/error feedback and separately labels this device's cache. |
| Medium | The dashboard said “Active this week” while only counting currently live studies, without checking dates. | The label now says “Open for participation”, matching the actual count. |

## Honest remaining differences

| Capability | Current state | What completion requires |
| --- | --- | --- |
| Conditional branching, randomisation and counterbalancing | Not implemented as a general configurable experiment engine. Existing stages execute through the existing ordered flow. | A versioned design schema, editor controls, participant execution semantics, completion validation, event provenance, and tests covering resumed sessions and skipped required questions. These must preserve the meaning of the study protocol. |
| Multi-researcher collaboration on one study | Ownership isolation and administrator oversight exist; per-study co-editor/commenter invitations and conflict resolution do not. | A collaboration/permissions model, invitation acceptance, edit concurrency controls and an audit trail. Merely showing Members is not this capability. |
| Email verification, forgotten-password recovery and MFA/SSO | Registration, approval and authenticated password change exist. Verified-email recovery and MFA/SSO are not supplied. | Customer-owned mail/identity configuration, expiring one-use tokens, abuse protection and end-to-end acceptance. A field accepting an UNSW email does not prove ownership. |
| Scheduled backups and production operations | Portable Compose/HTTPS configuration and manual database/media migration instructions exist. No complete scheduled backup/restore/alerting service has been installed. | A real managed host, backup destination/schedule, restore drills, monitoring, rate limiting and a named operator. Local tests are not public hosting or capacity acceptance. |
| Automated retention | Policy values are recorded, but there is no automatic data-retention worker. | An approved retention/deletion policy, scheduled enforcement, audit records, backup expiry treatment and deletion acceptance tests. |
| Accessibility and internationalisation | Many native labelled controls and responsive layouts exist. No full WCAG audit or multilingual study system has been completed. | Keyboard/screen-reader/contrast audit, target-browser checks and an explicit language/content model. |
| Large studies and advanced analysis | Current charts/exports and summaries exist. Organisation-wide comparative dashboards, advanced statistics and server-side pagination for large result sets remain limited. | Agreed analysis requirements, bounded API queries, representative performance tests and validated statistical methods. |

These remaining items are documented gaps, not completed features. This iteration concentrates on the operational researcher/participant workflows that can be implemented and tested without selecting a mail provider, buying hosting or redefining the client's experimental protocol. Optional future capabilities must be designed and validated before being advertised.

## Scope and safety of study-design files

Only version 1 `beyond-study-template` files are supported. Imported designs are validated, limited to 20 stages and 100 components per stage, and always become drafts. The browser and server reject imports above 2 MB. Export strips extension fields such as internal file references. Uploaded materials must be provided again; no private AI configuration or historic publication/session data is copied. Design text itself is intended study content: review it before distributing a template.

A design file is not a database backup and cannot restore accounts or recordings. Existing publication snapshots and session data are left in their original study. Closing recruitment does not revoke a participant's existing valid token or delete their answers; existing access-code revocation and token expiry still apply. A closed study cannot issue fresh participant access, so an expired participant token cannot be renewed until recruitment reopens.

## Evidence boundaries

Backend tests use isolated PostgreSQL schemas. Frontend tests and browser checks use synthetic study/accounts for the new actions. Real client data and real external AI credentials were not copied to reference products. No third-party source implementation was copied into Beyond; the implementation follows capability/workflow ideas with original project code. Production browser/device/concurrency and client-material acceptance remain separate from automated tests.
