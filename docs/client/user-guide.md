# Beyond — Client User Guide

Prepared for handover on 6 November 2026. Application workflows were inspected on 5 November 2026; see the deployment guide for the configurable hosting configuration. The deployment owner must supply the approved website address and account credentials separately.

## 1. Before your first session

Ask the delivery team to confirm:

- The website address and who starts/manages the server.
- Your administrator or researcher email and password.
- Whether the installation includes the existing experiments and recordings or starts empty.
- Which AI account and storage destination the installation uses.
- The support contact for account recovery, outages and backups.

For a local installation, start Docker Desktop and the installed application stack, then open `http://localhost:5173`. This address refers to the computer you are using. It will not connect to the developer's computer when opened on your own laptop. Local first-time installation instructions are in [Deployment and data migration guide](deployment-and-data-migration.md).

For a hosted installation, use the supplied HTTPS address. The server must stay running; participants do not install Docker. Test recording on the desktop browser and operating system you will actually use. Screen capture and captured audio differ between browsers; a phone is not an assumed replacement for a desktop recording session.

## Researcher registration

On the sign-in page choose **Researcher → Create an account**. Enter your full name, email, password and matching confirmation. Registration passwords require at least 6 characters and at most 72 UTF-8 bytes. The page checks platform availability and shows any email restrictions before you submit.

If administrator approval is required, the account is created as pending; the success page explains that you must wait for approval before signing in. The administrator approves the account from account management. Otherwise you can return to researcher sign-in immediately, with your email already filled in. Registration never grants administrator access.

If registration is closed, request an account from the administrator. Duplicate emails and invalid passwords are rejected. Email allowlists still apply even when self-registration is open. Creating an account does not verify ownership of the email by sending an email; self-service email verification/password recovery are separate capabilities not provided by this registration flow.

## 2. Roles

| Role | Typical responsibilities |
| --- | --- |
| Researcher | Build and publish their own experiments; configure AI and storage; inspect and export their own participant data. |
| Administrator | Manage researcher accounts; inspect experiments and participant data across the platform; change platform settings. |
| Participant | Enter an experiment code and an assigned participant code, complete the study and submit responses. A researcher account is not required. |

Choose the matching role at sign-in. Administrator status is assigned to an account; selecting the Administrator button does not grant that role.

## Personal account and password visibility

Click your avatar/name at the bottom of the workspace sidebar to open **Your account**. The sidebar uses the current signed-in account's saved name; names entered in earlier browser-only workspace settings are no longer used.

- **Personal details:** edit and save your full name. The change is saved on the server and updates the sidebar. Your sign-in email, role, status and joining date are shown; this page cannot change your role or email.
- **Change password:** enter the current password, then the new password twice. A successful update keeps this browser signed in with a renewed session and invalidates previously issued account sessions. Other browsers must sign in again.
- **Workspace and session:** return to experiments, open AI/storage settings or sign out.

The registration page, sign-in page and password-change form have a **Show password(s)** checkbox. Check it to show the currently entered text, and uncheck it to mask the text again. This does not retrieve an existing stored password. Passwords are masked by default.

## 3. Create and publish an experiment

1. Sign in as a researcher and open the experiment dashboard.
2. Create an experiment and give it a clear name.
3. Add stages. For a first test, use Consent → Instructions → Short answer → Finish/instructions.
4. Select each stage on the left, edit the content in the centre, and configure the available stage options on the right.
5. Use the approved consent wording and signing method. Replace example text and ethics-reference placeholders before real use.
6. Add question labels and choices. Mark required items and check the optional “Other” response where applicable.
7. Enable only the features required by your study: AI, timer, recording, copy/paste capture, navigation or pause controls.
8. Where recording is enabled, complete the participant storage disclosure. Confirm that the disclosed destination matches the actual deployment.
9. Select **Save draft**, then **Preview**. Preview checks the presentation; complete a separate participant test to verify real saving and uploads.
10. Select **Publish**. Share the experiment code after publishing. A draft is not available for participant entry.

Editing a published experiment creates changes that need to be published. Existing sessions use their stored experiment version. Check the version sheets when comparing exported responses across publications. **Load Client study flow** replaces the current draft's stages after confirmation; do not use it casually on an established study.

## 4. Configure the AI assistant

Open **Workspace settings → AI API keys**.

1. Select the common configuration for your experiments, or select a specific experiment.
2. For a specific experiment, enable independent configuration only when it should use different AI settings.
3. Select the provider. Google uses a supplied preset; the OpenAI-compatible option permits a compatible service and its model configuration.
4. Enter a key belonging to the selected provider/project. Use an account approved for the study.
5. Select **Save AI settings**, then **Test saved connection**.
6. Enable AI on the relevant experiment stage and run an actual participant test.

The API key authenticates your account. The provider specifies how the site connects; the model specifies what model the provider should use. A key can permit several models, so the key alone does not identify a model. An endpoint URL is the destination of the request and is relevant for custom compatible services. Use the preset for Google unless the delivery team changes the implementation.

A blank key field can mean a saved key is being retained; it does not prove that no key exists. Changing provider or endpoint requires a matching key. A successful connection test does not guarantee future quota or availability. AI sends the conversation content to the configured external provider; use the data handling arrangement agreed for the study.

### Response delivery and advanced limits

In Advanced settings, **Streaming responses** is in the Response delivery panel. Enabled: the assistant shows text progressively while it is being generated. Disabled: it waits and displays the complete reply. Streaming lets participants start reading earlier; it does not improve answer quality. Turn it off for a provider that only supports complete JSON replies. Save the configuration after changing it. Timeout is beside Characters per history message, below History messages on a wide screen; these controls stack on a narrow screen.

The **Study preparation** card beside Usage statistics shows counts of your published, draft, AI-enabled and recording-enabled studies, with links to review experiments, preview a study and view results. These are configuration counts, not proof that AI or recording was tested. Usage statistics combines your experiment count with this device's cached sessions/events and an approximate browser-cache size; it excludes server recordings and is not a backup.

## 5. Choose storage

Open **Workspace settings → Storage** and select a location.

- **Local server storage** means files are stored on the machine running the backend, not downloaded to each participant's computer.
- A new workspace location creates a named folder under the server's existing storage. It does not connect a new OneDrive account, attach a hard drive or increase disk capacity.
- Server-managed locations require the deployment owner to configure and mount the destination.
- A location change affects new files. Existing recordings remain in their original location and must stay accessible.

## 6. Run a participant session

1. Give each participant the website address, experiment code and their own participant code.
2. Open the participant entry screen and enter both codes.
3. Read the information and consent text, complete the required signature/name and continue.
4. Follow the stages and complete required responses.
5. If asked, grant camera/microphone permission and explicitly select the screen/window/tab to share. The site cannot silently grant these permissions.
6. Use **Pause** if enabled. Confirm that the paused state is visible before leaving the browser.
7. At the last stage, finish the session and wait for successful submission. Do not close the browser while recording uploads or submission are still pending.

Use a distinct code for each person. Re-entering the same code resumes an unfinished session. Keep one active tab per session; another tab may be rejected while the original tab holds the session. If a tab has taken over, the old tab cannot keep writing to that session.

**Abort is not a data-erasure action.** The current implementation records the abort and saves an unfinished session that can be resumed. If the protocol requires permanent withdrawal, exclusion or deletion, contact the study owner and apply the agreed procedure separately.

If the site says progress is saved only on this browser or reports server sync failure, retain that browser data and restore the connection. Do not clear browsing data or switch computers assuming the unsynchronised work has reached the server.

## 7. Review and export results

Open **Visualization results**, choose the experiment and chart type, and inspect the charts and session list.

| View | Meaning |
| --- | --- |
| Event counts/bar | Which recorded event types occurred most often. |
| Activity over time/line | When recorded activity occurred and how event volume changes over time. |
| Event mix/donut | Each event type's count and share; hover a segment to identify it. |
| Scatter | Compare the measures named on the axes across sessions. Use the chart's explanatory panel for its specific interpretation. |
| Duration histogram | Distribution of recorded session/event spans; examine the labels and interpretation below the chart. |
| Session timelines | Recorded events in each session aligned by elapsed time, useful for seeing clusters and gaps. |

Recorded event counts include system events. More events do not establish better task performance or stronger engagement. Recorded event spans include gaps and are not a measure of continuous active work.

- Open **View timeline** for an individual session and inspect its events and available recordings.
- **Download chart** opens a choice of an individual chart or all charts. Downloaded SVG files are figures, not database backups.
- Use the experiment export action to download Excel. The workbook has study information and sheets by publication version; legacy data can have an unknown-version sheet.
- On the current results screen, the session-card Excel/export action downloads the experiment workbook, which can contain other sessions in that experiment. Review the workbook before sharing it.
- Recordings are separate files. Excel/CSV does not embed a recoverable copy of the platform, its accounts or all videos.

## 8. Administrator operations

Sign in as Administrator to:

- Create researcher accounts and supply their initial password through a separate channel.
- Approve pending accounts or disable/remove researchers as the interface permits. Review ownership/data implications before using a removal action.
- Inspect experiments and sessions across researchers and export results.
- Set self-registration and researcher approval policy, required consent and the default configured storage destination.

**Retention policy (days)** and **Session duration policy (minutes)** currently record platform policy values. They are not an automatic scheduled deletion system or an independently enforced global timer. Configure study stage timers separately and ask the operator to implement any required automatic retention enforcement.

The current UI has no complete self-service password recovery flow. Obtain account-recovery assistance from the deployment owner; do not assume a “forgot password” email will be sent.

## 9. Common problems

| Symptom | First checks |
| --- | --- |
| Site does not open | Confirm the address and that Docker/server services are running. Your own localhost does not refer to the developer's computer. |
| Cannot sign in | Check the selected role, email/password, approval/disabled status and any configured email allowlist. |
| Experiment code rejected | Check spelling, publication status, participant-code restrictions and whether unpublished changes need review. |
| Session open in another tab | Return to the original tab or close it and allow the short lease to expire before re-entering. Do not run the same code in parallel. |
| Camera/screen unavailable | Check HTTPS for a hosted site, browser/OS permission and the stage's recording settings. Test on the agreed desktop browser. |
| AI unavailable | Check the saved connection test, provider/key match, study stage AI setting, network and provider quota. |
| Existing data missing after installation | Confirm that the database and storage backup were both restored. A source-code installation starts with new data. |
| Video listed but not playable | Ask the operator to verify the original storage location, restored files and their permissions. |
| Policy value changed but no deletion occurred | Retention is currently a recorded policy; deletion needs a separate operator procedure. |

## 10. Handover acceptance record

Record the deployed code version, address, date, browser and responsible operator. Mark each item only after checking it on the client's target environment:

- [ ] Client account signs in with the intended role.
- [ ] A test experiment saves, previews and publishes.
- [ ] A new participant completes consent, answers and final submission.
- [ ] AI returns a real response using the intended client-owned configuration.
- [ ] Camera/screen recording uploads and plays back.
- [ ] Timers, pause/resume and interrupted-session recovery behave as intended.
- [ ] Charts, timelines, Excel and chart downloads work.
- [ ] Historical experiments and videos are present if migration was requested.
- [ ] Administrator and researcher access boundaries are confirmed.
- [ ] The operator has demonstrated backup and recovery and supplied a support contact.

For technical installation, backup and migration, use [Deployment and data migration guide](deployment-and-data-migration.md).
