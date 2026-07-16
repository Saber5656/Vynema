import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import { openDatabase, type Database } from "../src/lib/database.js";

let database: Database | undefined;
let temporaryDirectory: string | undefined;

afterEach(() => {
  database?.close();
  database = undefined;

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe("GET /api/health", () => {
  it("returns the documented local health payload", async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-health-"));
    database = openDatabase(join(temporaryDirectory, "health.sqlite"));

    const env: Env = {
      db: database,
      environment: "development",
    };
    const response = await buildApp(env).request("http://local.test/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      environment: "development",
    });
  });
});
