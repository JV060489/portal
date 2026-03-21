import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  enableLogs: true,
  integrations: [
    // Edge runtime requires explicit opt-in (not auto-enabled)
    Sentry.vercelAIIntegration(),
  ],
});
