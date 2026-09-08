import type { Database } from "../database.js";
import { all } from "./db.js";
import type { PlatformConfigRow } from "./types.js";

const EXPECTED_KEYS = [
  "uploads_enabled",
  "publication_enabled",
  "public_read_enabled",
  "max_video_bytes",
  "max_thumbnail_bytes",
  "max_declared_duration_seconds",
  "allowed_video_mime",
  "per_agent_daily_intents",
  "per_agent_active_storage_bytes",
  "global_daily_intents",
  "global_active_storage_bytes",
  "per_agent_daily_publications",
  "global_daily_publications",
] as const;

type ExpectedKey = (typeof EXPECTED_KEYS)[number];

export type PlatformConfig = {
  uploads_enabled: boolean;
  publication_enabled: boolean;
  public_read_enabled: boolean;
  max_video_bytes: number;
  max_thumbnail_bytes: number;
  max_declared_duration_seconds: number;
  allowed_video_mime: "video/mp4";
  per_agent_daily_intents: number;
  per_agent_active_storage_bytes: number;
  global_daily_intents: number;
  global_active_storage_bytes: number;
  per_agent_daily_publications: number;
  global_daily_publications: number;
};

export class ConfigUnavailableError extends Error {
  constructor(message = "Required platform configuration is unavailable.") {
    super(message);
    this.name = "ConfigUnavailableError";
  }
}

function parseBoolean(key: ExpectedKey, value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ConfigUnavailableError(`Platform configuration ${key} is invalid.`);
}

function parseInteger(key: ExpectedKey, value: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ConfigUnavailableError(`Platform configuration ${key} is invalid.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new ConfigUnavailableError(`Platform configuration ${key} is invalid.`);
  }

  return parsed;
}

function parseVideoMime(value: string): "video/mp4" {
  if (value !== "video/mp4") {
    throw new ConfigUnavailableError("Platform configuration allowed_video_mime is invalid.");
  }

  return value;
}

export async function getConfig(database: Database): Promise<PlatformConfig> {
  const rows = await Promise.resolve(
    all<Pick<PlatformConfigRow, "key" | "value">>(
      database.prepare("SELECT key, value FROM platform_config"),
    ),
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));

  for (const key of EXPECTED_KEYS) {
    if (!values.has(key)) {
      throw new ConfigUnavailableError(`Platform configuration ${key} is missing.`);
    }
  }

  const value = (key: ExpectedKey): string => {
    const result = values.get(key);

    if (result === undefined) {
      throw new ConfigUnavailableError(`Platform configuration ${key} is missing.`);
    }

    return result;
  };

  return {
    uploads_enabled: parseBoolean("uploads_enabled", value("uploads_enabled")),
    publication_enabled: parseBoolean("publication_enabled", value("publication_enabled")),
    public_read_enabled: parseBoolean("public_read_enabled", value("public_read_enabled")),
    max_video_bytes: parseInteger("max_video_bytes", value("max_video_bytes")),
    max_thumbnail_bytes: parseInteger("max_thumbnail_bytes", value("max_thumbnail_bytes")),
    max_declared_duration_seconds: parseInteger(
      "max_declared_duration_seconds",
      value("max_declared_duration_seconds"),
    ),
    allowed_video_mime: parseVideoMime(value("allowed_video_mime")),
    per_agent_daily_intents: parseInteger(
      "per_agent_daily_intents",
      value("per_agent_daily_intents"),
    ),
    per_agent_active_storage_bytes: parseInteger(
      "per_agent_active_storage_bytes",
      value("per_agent_active_storage_bytes"),
    ),
    global_daily_intents: parseInteger("global_daily_intents", value("global_daily_intents")),
    global_active_storage_bytes: parseInteger(
      "global_active_storage_bytes",
      value("global_active_storage_bytes"),
    ),
    per_agent_daily_publications: parseInteger(
      "per_agent_daily_publications",
      value("per_agent_daily_publications"),
    ),
    global_daily_publications: parseInteger(
      "global_daily_publications",
      value("global_daily_publications"),
    ),
  };
}
