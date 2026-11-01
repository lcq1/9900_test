# Client New Requirements · Development Task List (P13 · Beyond)

> **Project**: P13 — Multimodal Web Platform for Studying How Students Use AI in Engineering Design
> **Source**: Client 2026-10 new requirements (screenshots + verbal list) + 2026-10-24 client email feedback
> **Version**: v1.3 · 2026-10-24 · **PO**: Xuhui Wang (Hennessy)
> **Scope**: In-course delivery version (export is CSV only; audio/video stored locally as temporary storage first; AI uses a free key)
> **v1.1 changes**: Backend tasks split into two (V / Senhao each take half); AI Interface → Senhao; Data Visualization → Anoak; **V's portion is written entirely in English** (V does not read Chinese).
> **v1.2 changes (2026-10-24 client email)**: Compared against the 8 requirements in v1.1, added items omitted/extended in the email, newly added **T-21 ~ T-31 (11 items total, all marked with 🆕)** and assigned owners. The complete omission list is at the end in "§9 Client Email New/Supplementary Requirement Analysis".
> **v1.3 changes (2026-10-24 load rebalancing)**: At the PO's request, 4 frontend tasks were reassigned from James to SM Yinqjia Xie (Chara) to relieve FE overload — Chara takes over T-07, T-27, T-28, T-29; James retains T-05, T-06, T-08, T-09, T-21, T-22. See §0 role table and §3 owner column for details.

---

## 0. Usage Instructions

**Priority definitions**
- **P0**: Blocks delivery; must be completed first (security / permissions / core data pipeline).
- **P1**: Must be delivered this cycle; affects acceptance (including items emphasised in the client's 10/24 email).
- **P2**: Can be deferred; does not affect core acceptance of this stage.

**Roles and Owners**
| Role | Owner | Notes |
|------|--------|------|
| Frontend | James Liu | Owns T-05, T-06, T-08, T-09, T-21, T-22 |
| Frontend (SM also) | Yinqjia Xie (Chara) | Owns T-07, T-27, T-28, T-29 (Stage list remove arrows, widen AI block, review reference platform, import client materials) |
| Backend (Vaibhav) | Vaibhav Vaibhav | Owns T-01, T-02; **this portion is written in English** (V does not read Chinese) |
| Backend (Senhao) | Xinghao Fu (Senhao) | Owns T-03, T-04, T-25, T-26 |
| AI Interface | Xinghao Fu (Senhao) | Owns T-10, T-23 (also serves as Backend) |
| Data Visualization | Anoak Du | Owns T-11, T-12, T-24 (also serves as Testing) |
| Testing & Documentation | Anoak Du | Owns T-13 ~ T-20, T-31 |
| PO / Coordination | Xuhui Wang (Hennessy) | Dependency analysis, acceptance, T-30 external delivery |

**Numbering**: `T-01 … T-31` are sequential and the whole table can be imported into Jira / a kanban board. In the "Depends on" column, `T-xx` means a prerequisite task, and `→T-xx` means a task that depends on it. **🆕 = New/supplementary from the 2026-10-24 client email (not covered by v1.1 or needs extension).**

---

## 1. Backend · Vaibhav (English — V does not read Chinese)

> **Owner: Vaibhav.** This entire section is written in English.

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-01 | Login permission — UNSW email allowlist (exact email or domain) | P0 | Existing auth module | Give the client (Kholoud) usage and testing access with her UNSW email, and support an email allowlist or domain rule so accounts can be added or removed easily later. | Add access-control configuration supporting BOTH exact-email allowlist entries AND domain-suffix rules (e.g. `@ad.unsw.edu.au`); validate on login/registration; return a clear rejection message when not allowed; allow adding/removing via config file or an admin endpoint so it takes effect without code changes (document hot-reload or restart). | An allowlisted email can log in and use the platform; a non-allowlisted one is blocked with a clear message; adding or removing an email/domain takes effect without any code change; the client's email is verified working end-to-end. |
| T-02 | Interaction logging — every user action with precise timestamps | P0 | Existing single-clock requirement | Record every user action on the platform with a precise timestamp, so the log can later be aligned accurately with physiological sensor data. | Define a unified event model (event type, actor, experiment_id, stage_id, session_id, payload); cover navigation, stage enter/exit, AI chat, copy/paste, recording start/stop, consent, pause/resume, page advance; use ONE clock — UTC ISO-8601 with millisecond precision (also store a monotonic counter); persist to DB or structured log; expose query/export by experiment and session. | Every action category above produces a log entry; timestamps are millisecond-precise and alignable to external sensors; event order within a session is correct; exportable by experiment/session; no sensitive plaintext stored. |

---

## 2. Backend · Xinghao Fu / Senhao (Chinese original)

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-03 | Extract AI API Key to unified configuration | P0 | None → T-10, T-13, T-23 | Move the free API key out of the code and inject it uniformly via config items / environment variables, eliminating hardcoding and leakage. | Add a config-reading layer that reads from environment variables (e.g. `AI_API_KEY`) or a local `.env` (not committed to the repo); change all call sites to read from config; gracefully degrade with a clear message when the key is missing, without crashing; provide a `.env.example` placeholder; add `.env` to `.gitignore`; audit and clean up historical hardcoding. | No hardcoded key anywhere in the repo (including historical commits); the service starts and behaves as expected both with and without the environment variable set; the key does not appear in the frontend bundle or runtime logs. |
| T-04 | Storage: local temporary storage for audio/video + configurable path/interface | P1 | Recording feature → T-12, T-18, T-25 | Audio/video data lands in local temporary storage first, with the storage path and access interface configurable, to enable a smooth later migration to UNSW servers. | Abstract a Storage interface (save/read/delete/url); the local implementation is based on a configurable base path (environment variable); decouple file naming from DB references, storing only relative references in the DB; access goes through a unified backend interface without exposing absolute paths; leave a slot for a remote implementation (UNSW server/OneDrive). | The path can be changed via an environment variable; upload/read/delete work normally; the DB stores only relative references; switching storage implementations requires only config changes or adding an implementation, without modifying business code; a migration drill is executable. |
| T-25 🆕 | Researcher can specify storage location (frontend setting) + configuration docs | P1 | T-04 → T-18 | In addition to backend configurability, researchers must be able to specify the data save location themselves; the configuration process must be documented. | Provide a storage location input field in the researcher/administrator settings (persisted to config); the backend reads this setting as the base path (overriding the default); produce a "how to set the storage location" document. | The researcher can set and save the storage path; data lands in that path; the documentation can guide the setup; the migration flow is unaffected. |
| T-26 🆕 | Platform-independent / cross-operating-system | P1 | Existing build/run → T-20 | The solution must be platform-independent and runnable on any operating system. | Review and eliminate OS-specific hardcoding (path separators, native module dependencies, absolute paths); provide cross-platform build/startup instructions; verify on at least two operating systems. | Builds and runs on any of Windows / macOS / Linux; no OS-dependent errors; startup instructions cover mainstream systems. |

---

## 3. Frontend (James Liu + Yinqjia Xie / Chara)

> **Owner split**: James handles core structure/interaction (T-05, T-06, T-08, T-09, T-21, T-22); Chara (SM) takes over the review reference platform, importing client materials, widening the AI block, and removing arrows from the Stage list (T-07, T-27, T-28, T-29), to relieve FE overload.

| ID | Task | Priority | Owner | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|--------|------------|------|------------------------------|---------------------|
| T-05 | Enlarge the AI assistant input box | P2 | James | Coordinate with T-10 UI → T-27 | Enlarge the AI assistant text input box to improve long-text input experience. | Change the input box to multi-line auto-grow height, with sensible min/max heights and scrolling when exceeded; keep the send button and shortcuts (Enter to send / Shift+Enter for newline); keep it in harmony with the overall AI panel layout. | Long text can be entered and viewed comfortably; the input box grows with content up to the limit then scrolls; newline/send behaviour is correct; no overflow at different screen widths. |
| T-06 | Overall font enlargement + visual upgrade | P1 | James | None → T-08, T-17, T-28 | Enlarge the overall font and make the style more attractive and polished, improving readability and a sense of professionalism. | Establish unified design tokens for font size/spacing/colour; raise the overall font size on key pages (researcher builder, participant answering, visualisation); unify card, button, and input box styles; ensure text contrast. | Font size on key pages is clearly larger with clear hierarchy; no text truncation/overflow/misalignment; unified style; passes basic contrast checks. |
| T-07 | Stage list: remove up/down arrows, keep only the six-dot drag handle | P1 | Chara | Existing drag-sort logic → T-17 | Remove the up/down swap arrows from the left stage list, keeping only the six-dot drag handle, freeing space to fully show stage text. | Remove the move-up/move-down buttons; keep the draggable six-dot handle (⋮⋮); drag sorting reuses the existing logic and persists; widen the stage name area so long names display fully (tooltip if necessary). | The list shows only the six-dot handle, no up/down arrows; drag can reorder normally and the order persists; stage text displays fully without truncation. |
| T-08 | Unify Stage type label and dropdown menu fonts | P1 | James | T-06 → T-17, T-28 | Synchronously adjust the Stage type label and dropdown menu fonts to stay consistent with the overall design. | Unify font size/weight/line-height for the Stage type label, dropdown trigger, and option list; reuse the T-06 design tokens. | Label and dropdown fonts, sizes, and spacing are consistent with the whole; expanded options have no truncation; no visual jumps. |
| T-09 | Recording enforcement gate (Stage features new feature) | P1 | James | Recording feature, Stage features config, navigation control → T-16, T-21, T-22 | The researcher can decide whether to enable the recording enforcement gate; once enabled, participants must start screen recording and camera recording before proceeding to the next page, otherwise progress is blocked. | Add a toggle to Stage Features (default off); when enabled, the participant-side "Next page / Continue" button is greyed out until both screen recording and camera recording are in progress; on click, validate and prompt for missing items; the backend performs a second validation on submit to prevent bypass; when disabled, restore the normal flow; state stays consistent after refresh/restore. | The researcher can toggle per stage on/off; once enabled, without both recordings started, the participant cannot advance and gets a clear prompt; once both are started, they can advance; when disabled, behaviour is normal; the backend rejects bypass requests. |
| T-21 🆕 | Researcher decides "mandatory/optional" for features (generalised) | P1 | James | Stage features config, T-09 → T-22 | Beyond recording, the researcher can set "mandatory/optional" for any stage feature; extend to all features (questionnaire, attachment, signature, recording, etc.). | Add a mandatory/optional flag to the Stage Features model; the researcher can set it per feature during build; the participant side uses it to decide skipability; the backend validates mandatory items on submit. | Any feature can be independently set as mandatory or optional; participants skipping optional items get no error, while incomplete mandatory items block submission; persistence is correct. |
| T-22 🆕 | Screen recording auto-start (no participant confirmation needed) | P1 | James | T-09, recording feature → T-16 | When the researcher configures it, screen recording can start automatically upon entering a stage, without requesting confirmation from the participant. | Add an "auto-start / request confirmation" mode to the recording feature; in auto mode, recording begins silently as soon as the page is entered; it can be combined with the T-09 gate (enforcement gate + auto-start). | In auto mode the participant sees no confirmation popup and recording starts immediately; behaviour is correct when combined with the gate logic; auto mode can be turned off and fall back to requesting confirmation. |
| T-27 🆕 | Widen the AI Assistance block overall and make it more prominent | P2 | Chara | T-05, T-06 → T-17 | Beyond enlarging the input box, the entire AI Assistance block should be wider and more prominent to improve usability. | Adjust the AI panel/block layout and grid (widen, increase visual weight); stay consistent with the overall design tokens; no breakage on mobile. | The AI block is clearly wider and more prominent; consistent with the overall style; no overflow at different screen widths. |
| T-28 🆕 | Review the client-provided reference platform (fonts/style/colour scheme/consent form) | P2 | Chara | T-06, T-29 → T-17 | The client will provide an example of another platform; its fonts, style, colour scheme, and consent-form presentation must be reviewed and borrowed from. | After receiving the example, review and compare it; extract borrowable fonts/colour schemes/consent-form layouts; form design suggestions and feed them back into T-06/T-08 and the consent-form UI. | Produce review notes and design suggestions; related improvements are merged into the UI tasks; the consent-form presentation becomes more professional. |
| T-29 🆕 | Import client research materials (consent form / pre-post questionnaires / experimental tasks) | P1 | Chara + PO | Client materials (to be provided), T-09 → T-20 | The client will provide Consent form / pre-Questionnaire / Experimental tasks / post-Questionnaire, which must be able to land in the experiment builder. | Provide a material entry/import entry point; map questionnaires/tasks to stages and components; connect the consent form to the consent gate; support the steps described in the client's PDF workflow. | Client materials can be fully built into a usable experiment; consent form/questionnaire/tasks are chained per the client's flow; a complete scenario can be demoed on 6 Nov. |

---

## 4. AI Interface (Xinghao Fu / Senhao)

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-10 | AI Assistant interface integration with configured-key usage | P1 | T-03 (API key config), T-02 (interaction log) | Stably integrate the AI assistant chat interface, using the unified configured key, supporting streaming/non-streaming responses. | Wrap the AI call service, reading the T-03 config; unify error handling and timeouts; write each interaction to the T-02 log; support context passthrough; the frontend has loading/failure states. | After configuring the key, chat works normally; when unconfigured, the frontend shows a clear prompt; every interaction is logged with a timestamp; exceptions do not crash the page. |
| T-23 🆕 | Pluggable AI Provider abstraction + docs | P1 | T-03 → T-13 | Currently using a free API; the system must be designed to be pluggable so different APIs can be added/replaced in future, and the process must be documented. | Define a unified AI Provider interface (chat/stream methods, etc.); implement the default provider for the free key; reserve a provider registration/switching mechanism; write a "how to add/replace an API provider" document. | Adding a provider only requires implementing the interface and registering it, without changing business code; the documented steps can be performed independently and succeed; the current free provider still works normally. |

---

## 5. Data Visualization (Anoak Du)

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-11 | Generate result charts per experiment independently + multiple chart types | P1 | T-02 (interaction log), questionnaire data schema, backend data interface → T-12, T-19, T-24 | Visualisation results generate charts independently per experiment, and offer as many chart types as possible for the researcher to choose from. | Aggregate data by experiment dimension; provide multiple chart types (bar, line, pie, scatter, histogram, box plot, radar, etc., as many as possible); the researcher can choose/switch per experiment; empty data shows a placeholder. | Each experiment shows its own charts independently; covers at least 5+ chart types; switching types renders correctly; different experiments' data do not mix. |
| T-12 | CSV export (the only export format this stage) | P1 | T-11, T-04 (storage) | This stage's result export supports CSV only, ensuring data is complete and readable. | Export CSV per experiment, with header row and UTF-8 encoding; represent audio/video by reference/file name (no embedded binary); explicitly CSV-only, no PDF/PNG export. | The exported CSV can be correctly parsed by Excel/scripts; fields are complete and encoding correct; audio/video references are traceable; no other export format entry point. |
| T-24 🆕 | Visualisation distinguished by researcher + experiment | P1 | T-11, T-02 → T-19 | Beyond per-experiment independence, visualisation must also clearly distinguish by researcher, so multiple researchers' data/results do not mix. | Add researcher_id to the data aggregation dimension; group each experiment's charts by their owning researcher; the UI clearly labels researcher and experiment ownership. | Different researchers' data/charts do not mix; each experiment's chart ownership is clear; empty/unauthorised cases show a placeholder. |

---

## 6. Testing & Documentation (Anoak Du)

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-13 | API Key replacement/update operation docs | P1 | T-03 | Write the operation doc for replacing/updating the API key, lowering the ops barrier. | Explain the key storage location, update steps, restart/hot-reload method, verification method, and common error troubleshooting; include examples and a rollback method. | Following the doc, one can independently complete the key replacement and verify success; steps are unambiguous; rollback is covered. |
| T-14 | Interaction log timestamp alignment verification | P1 | T-02 | Verify that the interaction log timestamps can be accurately aligned with physiological data. | Design alignment test cases (known event time points); verify timezone/format consistency; output an alignment report. | Sampled events deviate from the external sensor timeline within an acceptable range (millisecond level); timezone consistent; report reproducible. |
| T-15 | Login allowlist / permission testing | P1 | T-01 | Verify that email allowlist/domain config add/remove and blocking work correctly. | Cover in/out of allowlist, domain matching, effect after add/remove, and edge cases (case, subdomain). | All cases pass; no unauthorised access; client email verified working. |
| T-16 | Recording enforcement gate testing | P1 | T-09, T-22 | Verify the gate toggle and enforcement-blocking logic (including auto-start mode). | Cover on/off, only one recording type on, both on, auto-start, refresh-restore, backend bypass. | All branches behave as expected; cannot be bypassed; prompts clear. |
| T-17 | UI adjustment regression testing | P2 | T-06, T-07, T-08, T-27, T-28 | Verify that font enlargement, stage drag, font consistency, AI block widening, and reference-platform borrowing have no regressions. | Multi-screen-width / multi-browser smoke + visual check. | No truncation/misalignment/functional regression; major browsers pass. |
| T-18 | Storage configurability and migration drill | P2 | T-04, T-25 | Verify local temporary storage is configurable and drill migration to a UNSW server path. | Drill switching the base path (including researcher-specified path); verify DB references; output migration steps. | Changing config switches the directory; data readable; migration doc executable. |
| T-19 | Visualisation chart usability testing | P2 | T-11, T-24 | Verify multi-chart-type rendering and data correctness (including researcher distinction). | Cover each chart type plus empty/abnormal data, and multi-researcher isolation. | Rendering correct, no errors, data consistent with source, researchers do not mix. |
| T-20 | End-to-end integration | P1 | T-01 ~ T-29 | End-to-end integration of AI / recording / logging / storage / visualisation / material import; prepare a complete testable scenario for the 6 Nov client meeting. | Walk through a real experiment flow; verify logs and data persistence; cover the full researcher + participant flow. | No end-to-end blocking; complete data pipeline; a full research scenario can be demoed. |
| T-31 🆕 | Recruit testers for usability feedback | P2 | T-20, T-17 | The client suggested having colleagues/friends try it and give feedback on usability issues, errors, and bugs. | Create a small-scale usability test plan; recruit testers; collect and track feedback into a defect list; regression-verify. | Complete at least one round of external usability testing; feedback is closed-looped back to tasks. |

---

## 7. PO / External Delivery (Xuhui Wang)

| ID | Task | Priority | Depends on | Goal | Implementation Requirements | Acceptance Criteria |
|----|------|----------|------------|------|------------------------------|---------------------|
| T-30 🆕 | Provide the client with the service link + access/test instructions | P1 | Deployment environment, T-01 | The client requested the project link and instructions on how to access/test the system. | Deploy an accessible environment (including accounts/allowlist, see T-01); write access and smoke-test guidance for the client. | The client can independently access and test using the guidance; the link works. |

---

## 8. Dependency Overview

### 8.1 Vaibhav (T-01, T-02) · English

- **T-01** (login allowlist) → **T-15** (permission testing) and **T-30** (client access).
- **T-02** (interaction logging) → **T-11 / T-24** (visualisation) and **T-14** (timestamp alignment). It is also a prerequisite of **T-10** (AI interface logs each interaction).

### 8.2 Remaining Tasks (originally Chinese)

- **Config / AI baseline**: T-03 (API key) → T-10 (AI integration), T-13 (docs), T-23 (pluggable provider).
- **Storage chain**: T-04 (storage) → T-12 (CSV export), T-18 (migration drill), T-25 (researcher-specified path).
- **Recording chain**: T-09 (gate) → T-16, T-21, T-22; T-22 (auto-start) → T-16.
- **UI chain**: T-06 (font/tokens) → T-08, T-27, T-28; T-06/T-07/T-08 → T-17. (Note: T-27, T-28 are now owned by Chara but still depend on James's T-06; T-29 is owned by Chara + PO and depends on James's T-09 — cross-owner dependencies need to be synced in standup.)
- **Visualisation chain**: T-11 → T-19, T-24 (by researcher).
- **Material import**: T-29 (client materials) → T-20 (end-to-end).
- **Integration wrap-up**: T-20 depends on T-01 ~ T-29 all being complete; T-30 depends on T-01 allowlist taking effect and deployment.

---

## 9. Client 2026-10-24 Email: New/Supplementary Requirement Analysis (Omission Comparison)

> Comparison target: the 8 requirements in v1.1 (API key / login allowlist / interaction log / visualisation / storage / AI input box / UI layout / recording gate).
> Conclusion: **v1.1 covered most, but there are 9 omissions or items needing extension** (plus 2 coordination actions), all added to the task list and marked 🆕.

| # | Email Key Point | Relation to v1.1 | Added Task | Owner |
|---|--------------|--------------|----------|--------|
| 1 | Researcher can decide mandatory/optional for features (generalised, not just recording) | **Omitted** (v1.1 only had recording gate T-09) | T-21 | James (FE) |
| 2 | Screen recording can auto-start without participant confirmation | **Extended** (v1.1 had no auto-start mode) | T-22 | James (FE) |
| 3 | Free API + future add/replace API, must be documented | **Extended** (v1.1 only extracted key, lacked pluggability) | T-23 | Senhao (AI) |
| 4 | Visualisation separated by researcher + experiment | **Extended** (v1.1 only by experiment) | T-24 | Anoak (DataViz) |
| 5 | Researcher can self-specify storage location + config docs | **Extended** (v1.1 only backend env config) | T-25 | Senhao (BE) + Anoak (doc) |
| 6 | Platform-independent / cross-OS running | **Omitted** (v1.1 did not cover at all) | T-26 | Senhao (BE) |
| 7 | AI Assistance block widened overall and more prominent | **Extended** (v1.1 only enlarged input box T-05) | T-27 | Chara (FE/SM) |
| 8 | Review client reference platform (fonts/style/colour/consent form) | **Omitted** (v1.1 uncovered) | T-28 | Chara (FE/SM) |
| 9 | Import client research materials (consent form / pre-post questionnaires / tasks) | **Omitted** (v1.1 uncovered) | T-29 | Chara (FE/SM) + PO |
| 10 | Provide project link + access/test instructions | Coordination action (non-functional requirement) | T-30 | PO (Hennessy) |
| 11 | Recruit testers for usability feedback | Coordination/testing action | T-31 | Anoak (QA) |

**Already-covered items not added (confirmed in v1.1, email reaffirms)**: free API (T-03), config documentation (T-13), per-experiment visualisation (T-11), local storage configurable (T-04), larger AI block (T-05/part of T-27). No new addition needed.

---

## 10. Open Items / To Be Confirmed

1. **Load rebalancing (v1.3)**: Frontend has reassigned 4 tasks from James to SM Chara (T-07, T-27, T-28, T-29); James now keeps T-05/06/08/09/21/22, relieving FE overload. After Chara takes on new FE load, confirm her SM duties (standup/milestones/risk tracking) do not conflict with development. Anoak still doubles as DataViz (T-11/12/24) + all Testing (T-13~T-20/T-31); Senhao still doubles as half of Backend (T-03/04/25/26) + AI (T-10/23) + cross-platform — both remain high-load points; the PO is advised to monitor them closely.
2. **Client UNSW email / domain**: Confirm the specific email and suffix (`@ad.unsw.edu.au` or `@student.unsw.edu.au`) — blocks T-01 acceptance and T-30 delivery.
3. **Chart type list**: Confirm with the client the specific scope and priority of "as many as possible" — affects T-11 / T-24 effort.
4. **Local temporary storage path and retention policy**: Confirm the temp directory location, capacity limit, and data retention/cleanup rules — affects T-04 / T-25.
5. **Recording "started" determination criterion**: Confirm the criterion for "in progress" in auto-start mode (recording state persists, whether interruption is allowed to pass) — affects T-09 / T-22 / T-16.
6. **Client 6 Nov meeting milestone**: The client expects to see a "complete, testable research experiment scenario (researcher + participant, full features)" by then; and will provide Consent / pre-Questionnaire / Experimental tasks / post-Questionnaire (the team is believed to already have the experiment-flow PDF). → Directly drives the scope and deadline of T-29 and T-20.
7. **Client will attach a reference platform example**: Review its fonts/style/colour scheme/consent-form presentation (T-28), to be started after the client sends it.
8. **Scheduling directive (client)**: Next week focus on high priority (P0/P1), the following week implement the rest (P2) — consistent with existing priorities, usable as standup scheduling basis.
