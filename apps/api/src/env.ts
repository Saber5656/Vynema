import type { Database } from "./lib/database.js";

export type Env = {
  db: Database;
  environment: "development";
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};

export type AppBindings = {
  Variables: {
    env: Env;
  };
};
