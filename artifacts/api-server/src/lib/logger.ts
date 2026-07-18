import pino from "pino";

const usePrettyLogs = process.env["PRETTY_LOGS"] === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      // PII / secrets — masked wherever they appear in a logged object.
      "password", "senha", "token", "access_token", "refresh_token", "apiKey", "api_key",
      "*.password", "*.senha", "*.token", "*.access_token", "*.refresh_token", "*.apiKey", "*.api_key",
      "req.body.password", "req.body.senha", "req.body.token",
      "*.email", "req.body.email",
    ],
    censor: "[REDACTED]",
  },
  ...(usePrettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
