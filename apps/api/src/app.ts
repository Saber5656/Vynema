import type { ApiErrorBody } from "@vynema/shared";
import { Hono } from "hono";

import type { AppBindings, Env } from "./env.js";
import { healthRoute } from "./routes/health.js";

function notFoundBody(): ApiErrorBody {
  return {
    error: {
      code: "NOT_FOUND",
      message: "Not found",
      requestId: "",
    },
  };
}

export function buildApp(env: Env): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use("*", async (context, next) => {
    context.set("env", env);
    await next();
  });

  app.route("/api", healthRoute);
  app.all("/api", (context) => context.json(notFoundBody(), 404));
  app.all("/api/*", (context) => context.json(notFoundBody(), 404));

  return app;
}
