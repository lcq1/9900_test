# The Bureau of Extremely Questionable Inventions

A complete English, 20-stage demonstration study. Fictional potatoes, printers, toasters and terrible meetings provide the comedy; the tasks exercise real application controls. All artifacts are independent of application code. Nothing is automatically imported, published or sent to an AI provider.

## Import and configure

1. Sign in as a researcher and use the study-template import control on the research overview. Select **study-template.json**. The existing import API is `POST /api/experiments/import-template`; send the file itself as the JSON request body if using an authenticated API client. Imported designs receive fresh identifiers.
2. Open the new draft and configure its AI settings. Use your existing working provider, model, endpoint and API credential; copy **ai-system-prompt.txt** into the experiment's custom system prompt. Do not change the workspace-wide prompt. AI must be configured and its connection tested before participants start.
3. For an authenticated API workflow, **ai-settings.patch.json** is a partial body for `PATCH /api/experiments/{experimentId}/ai-key`. It only selects custom experiment settings and sets the prompt. It contains no credentials. Selecting custom settings does not copy workspace-only provider/key overrides: supply the intended provider, endpoint, model and key through the settings UI when necessary. Do not assume that a successful settings save proves connectivity.
4. In stage 09, optionally upload **meeting-rescue-brief.txt** as a researcher material. Portable templates intentionally exclude stored files and file references. The task also works from its on-screen instructions. The participant can upload a new fictional proposal text file.
5. Preview all stages. Review storage, retention and deletion arrangements and update the consent wording for any actual research use. Publish when ready, generate a participant access code, and complete a real participant session to verify saved responses and media. Preview alone does not establish successful recording persistence.

## Feature coverage

- Exactly 20 stages; all eight supported stage types and all nine supported component types. See **coverage.md** for the stage-by-stage inventory.
- AI on 18 stages. Consent excludes AI and capture; the sequential oral stage follows the editor's AI-off preset. The assistant is Professor Wobble, a useful but theatrically bureaucratic potato.
- Timers, elapsed clock, manual expiry, automatic advance (stage 13), one- and two-minute extensions, confirmation, navigation, pause/resume/abort, and full-screen mode.
- Screen recording (10, 18); camera/microphone automatic start (11) and manual sequential oral recording (12). Browser permission is still required. Stage 12 has three questions sharing a ten-minute timer.
- Copy/paste logging on fill-blank and short-answer stages; single choice and multiple choice with an Other explanation (03, 04); true/false; text input; ratings; next/submit buttons.
- Required attachment (09), optional attachment (18), task signature (14), required questionnaires, and handwritten consent (01).
- **study-template-typed-consent.json** is an alternative complete 20-stage design with typed-name consent and four acceptance clauses. Import it separately only to test that alternative. The application allows at most one consent stage; handwritten and typed consent are mutually exclusive modes. A task signature component is not a second legal-name consent form.

## Operator workflow checks

Some functions are researcher/administrator actions, not stage fields. This study supplies content for exercising them but cannot enable them merely through JSON:

1. Duplicate the draft, export its template, and import it again; compare the design, not regenerated IDs.
2. Publish and issue an access code. Test revocation with a separate disposable code.
3. Complete one session; pause/resume another; test abort in a disposable session. Reload after answering to check restoration. Do not abort the only session you need to complete.
4. Inspect results, activity, AI chat, recordings and attachments; export the workbook and answer/activity CSVs. Check the actual session data rather than assuming that a feature toggle proves successful capture.
5. Exercise session deletion or closing collection only on disposable demo data. Account roles, storage administration and AI provider switching are operational settings, not participant questions.

## Rebuild and validate

From the project root:

```text
node experiments/chaos-lab/build.mjs
node experiments/chaos-lab/validate.mjs
```

The validator uses the application's existing frontend publication checks and verifies counts, coverage, IDs and option constraints. It requires the existing frontend dependencies. These checks do not replace an authenticated import, AI connection test or real-browser media test. The generator only rewrites files in this directory.
