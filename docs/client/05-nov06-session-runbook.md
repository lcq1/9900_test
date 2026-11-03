# Client item 5 — 6 November session runbook

**Status: skeleton, pending client material.** The platform side of this runbook
is executable today. The study content — questions, consent wording, media
requirements, participant numbers — belongs to the client and is listed in
section 6 as outstanding. Nothing below reproduces client material, and the
example stage content is a placeholder to be replaced.

Purpose: run one complete researcher-and-participant session end to end, so the
client can see the exact flow the platform captures on 6 November, and so the
team finds integration problems before that date rather than during it.

## 1. Two days before

- [ ] Backend and database reachable; `curl http://<host>:8000/api/healthz` returns `{"status":"ok"}`.
- [ ] Client account admitted by the allowlist:
      `ACCESS_ALLOWLIST_ENABLED=true` and `ALLOWED_EMAILS=k.alqattan@unsw.edu.au`
      (or `ALLOWED_DOMAINS=unsw.edu.au`). Restart the backend after editing `.env`.
- [ ] Researcher account created and able to sign in.
- [ ] Storage location chosen in Workspace settings → Storage, and the choice
      accepted (a rejected location returns 422 for an unknown name or 507 when
      the directory is not writable).
- [ ] AI configuration present for the experiment, either the common
      configuration or an experiment-specific key, if any stage has AI chat on.
- [ ] One test participant code reserved for the dry run, distinct from the
      codes to be used on the day.

## 2. Researcher: build the experiment

Create the experiment, then add the stages below. The stage content column is a
placeholder; replace it with the client's material when it arrives.

| # | Stage type | Content to add | Features to switch on | Countdown |
| --- | --- | --- | --- | --- |
| 1 | Consent | Information sheet text; signing method per the approved protocol | Signature box only if the protocol requires a signature | none |
| 2 | Single choice or short answer | Screening question | Stage clock | none |
| 3 | Task workspace with AI chat | Design brief plus the embedded AI assistant | AI chat, Stage clock, Copy-paste logging if the brief is copied, Screen recording if the protocol allows | e.g. 20 minutes |
| 4 | Short answer | Reflection on the design decision | Copy-paste logging, Stage clock | e.g. 5 minutes |
| 5 | Rating or multiple choice | Post-task questionnaire | Stage clock, Confirm before changing stage | none |

Notes that matter during the build:

- Copy-paste logging is only offered on fill-in and short-answer stages; the
  switch is intentionally hidden elsewhere.
- "Confirm before changing stage" adds a confirmation dialog on every stage
  change. Use it where an accidental click would lose work, not everywhere.
- "Pause and abort controls" adds Pause and Abort buttons to the participant
  footer. Both are recorded as events; Abort finishes the session.
- Screen recording and camera/microphone capture always need browser
  permission. Automatic recording starts right after permission is granted;
  manual mode shows a start control instead.
- Publish the experiment before the session. A draft cannot be entered.

## 3. Participant: run the session

1. Open the participant entry page and enter the experiment code and the
   participant code. No participant account is needed.
2. Consent stage: read the information sheet, sign or type the full legal name
   as configured, then continue.
3. Each stage shows the stage clock when enabled and the countdown when enabled.
   When a countdown expires the stage follows its configured expiry behaviour.
4. On the AI stage, ask the assistant at least one question. Every prompt and
   reply is recorded with a timestamp.
5. Finish the last stage. The session is submitted to the server on finish and
   also on abort.

Known behaviour to expect:

- The same participant code opened in a second browser tab is rejected with
  "This study is already open in another browser tab" while the first tab is
  active; after the short lease expires the second tab may take over.
- Re-entering with the same participant code resumes the unfinished session
  instead of creating a new one. Do not reuse one code for two people.
- If browser storage fills up, the runtime keeps working and shows a
  degradation notice instead of failing.

## 4. Researcher: verify what was captured

- [ ] Results page shows the session, scoped to the chosen experiment.
- [ ] Bar, line, scatter and histogram views all render for that session.
- [ ] The session opens as a timeline with monotonically increasing timestamps.
- [ ] Export downloads the workbook, and one session's rows belong to that
      session only.
- [ ] AI prompts and replies appear as separate events, in order.
- [ ] Copy and paste events carry the copied text where the browser exposed it.
- [ ] Recordings are listed against the session and play back.

## 5. Dry-run record

| Check | Result | Notes |
| --- | --- | --- |
| Researcher sign-in | | |
| Experiment published | | |
| Participant entry with code | | |
| Consent captured | | |
| AI exchange recorded | | |
| Copy-paste captured | | |
| Recording uploaded | | |
| Session visible in Results | | |
| Export opened | | |

## 6. Pending client input

These items block a faithful 6 November session and are not ours to invent:

1. The stage list and exact wording for each prompt and question.
2. Consent text, and whether a handwritten signature or a typed legal name is
   required; the ethics approval reference covering the session.
3. Whether screen recording, camera and microphone are permitted, and for which
   stages.
4. The number of participants and the codes to be issued, and whether codes may
   be reused across sessions.
5. The AI model or endpoint to use, and any prompt or system instruction the
   study requires.
6. The final storage destination (local directory or OneDrive) and who owns the
   folder.
7. Whether the session may be recorded for the team's own review.

## 7. What this runbook does not cover

- Ethics approval: the platform records what it is told to record; it does not
  grant approval and cannot enforce a protocol it was not configured for.
- OneDrive: the storage location can be selected and validated, but the Graph
  credentials and the destination folder are deployment configuration.
- Long-term retention and deletion policy: administrator-side, not part of this
  session.
