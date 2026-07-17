import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { buildApp } from "./app.js";
import type { Env } from "./env.js";
import { openDatabase } from "./lib/database.js";
import { applyMigrations } from "./lib/migrations.js";

const HOST = "127.0.0.1";
const PORT = 8787;

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const webRoot = fileURLToPath(new URL("../../../web/dist/", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
const databasePath = resolve(repositoryRoot, process.env.VYNEMA_DB_PATH ?? ".local/vynema.sqlite");

const database = openDatabase(databasePath);

try {
  const appliedVersions = applyMigrations(database, migrationsDirectory);
  const env: Env = {
    db: database,
    environment: "development",
    GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
    GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  const app = buildApp(env);

  app.use("*", serveStatic({ root: webRoot }));
  app.get("*", serveStatic({ path: resolve(webRoot, "index.html") }));

  const server = serve(
    {
      fetch: app.fetch,
      hostname: HOST,
      port: PORT,
    },
    () => {
      const migrationSummary =
        appliedVersions.length === 0
          ? "no pending migrations"
          : `applied migrations ${appliedVersions.join(", ")}`;
      console.log(`Vynema is running at http://${HOST}:${PORT} (${migrationSummary}).`);
    },
  );

  let shuttingDown = false;

  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    server.close((error) => {
      database.close();

      if (error) {
        console.error(`Vynema failed to stop after ${signal}.`, error);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  database.close();
  throw error;
}
