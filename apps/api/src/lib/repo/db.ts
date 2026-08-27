import { randomUUID } from "node:crypto";
import type { SQLInputValue, StatementSync } from "node:sqlite";

import type { Database } from "../database.js";

type TypedStatement<T> = StatementSync & {
  readonly __rowType?: T;
};

export function nowMs(): number {
  return Date.now();
}

export function newId(): string {
  return randomUUID();
}

export function one<T>(
  statement: TypedStatement<T>,
  ...parameters: SQLInputValue[]
): T | undefined {
  return statement.get(...parameters) as T | undefined;
}

export function all<T>(statement: TypedStatement<T>, ...parameters: SQLInputValue[]): T[] {
  return statement.all(...parameters) as T[];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function transaction<T>(database: Database, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();

    if (isPromiseLike(result)) {
      throw new TypeError("SQLite transactions must use a synchronous callback.");
    }

    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "SQLite transaction and rollback both failed.",
      );
    }

    throw error;
  }
}
