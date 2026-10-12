/**
 * cloudConfig.ts — WorkBuddy Cloud Service public config for this application.
 *
 * These two values come straight from the cloud-service activation result
 * (`publicConfig`) for the "Beyond" research-platform application. They are the
 * only values that are safe to ship inside front-end code:
 *
 * - `endpoint`      — the app's release-domain data-plane base URL. It is passed
 *                     explicitly at client initialization, never derived from
 *                     `window.location` and never from an env var.
 * - `publishableKey` — identifies WHICH app is calling. It carries no permission
 *                     by itself; the server enforces an exact Origin match, so a
 *                     request from any other origin (including `localhost`) is
 *                     rejected with an `auth_` error.
 *
 * Both values are public by design. No provider key or environment id is present
 * here, and none should ever be added.
 */
export const cloudPublicConfig = {
  endpoint: 'https://beyond-study-platform.app.workbuddy.host',
  publishableKey: 'wbpk_FQSSd41Q7GRKqWtbHGRsad_Vrwts2kg2LP6lQhHT1pI0tUwLKw6a29w',
} as const
