import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// 120 req/min por IP para a API geral; buscas têm limite próprio mais baixo.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "too_many_requests", message: "Muitas requisições. Tente novamente em 1 minuto." },
});
const searchLimiter = rateLimit({
  windowMs: 60_000,
  max: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Limite de buscas atingido. Aguarde 1 minuto." },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Expose the request id so the client can correlate a failure with server logs.
app.use((req, res, next) => {
  if (req.id !== undefined) res.setHeader("X-Request-Id", String(req.id));
  next();
});

app.use("/api", apiLimiter);
app.use("/api/providers/search", searchLimiter);
app.use("/api", router);

// Central error handler: log with the request-scoped logger (carries requestId)
// and return a generic payload — never leak internal error details to the client.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err }, "unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error", requestId: req.id });
});

export default app;
