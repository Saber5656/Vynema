import type { HealthResponse } from "@vynema/shared";
import { Hono } from "hono";

import type { AppBindings } from "../env.js";

export const healthRoute = new Hono<AppBindings>();

healthRoute.get("/health", (context) => {
  const response: HealthResponse = {
    status: "ok",
    environment: context.get("env").environment,
  };

  return context.json(response);
});
