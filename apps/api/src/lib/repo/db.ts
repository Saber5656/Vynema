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
    ((typeof value === "object" && value !== null) || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function rollbackAndThrow(database: Database, error: unknown): never {
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

function invalidateAsyncTransactionAndThrow(
  database: Database,
  error: unknown,
  promiseLikeResult?: PromiseLike<unknown>,
): never {
  const cleanupErrors: unknown[] = [error];

  try {
    database.exec("ROLLBACK");
  } catch (rollbackError) {
    cleanupErrors.push(rollbackError);
  }

  try {
    database.close();
  } catch (closeError) {
    cleanupErrors.push(closeError);
  }

  if (promiseLikeResult) {
    try {
      // Observe the already-returned thenable only after closing the database,
      // so a second `then` getter or custom then implementation cannot write.
      void Promise.resolve(promiseLikeResult).catch(() => undefined);
    } catch (observationError) {
      cleanupErrors.push(observationError);
    }
  }

  if (cleanupErrors.length > 1) {
    throw new AggregateError(
      cleanupErrors,
      "SQLite async transaction misuse could not be invalidated cleanly.",
    );
  }

  throw error;
}

export function transaction<T>(database: Database, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  let result: T;

  try {
    result = operation();
  } catch (error) {
    rollbackAndThrow(database, error);
  }

  let promiseLikeResult: PromiseLike<unknown> | undefined;
  try {
    promiseLikeResult = isPromiseLike(result) ? result : undefined;
  } catch (error) {
    invalidateAsyncTransactionAndThrow(database, error);
  }

  if (promiseLikeResult) {
    invalidateAsyncTransactionAndThrow(
      database,
      new TypeError(
        "SQLite transactions must use a synchronous callback; the database connection was closed.",
      ),
      promiseLikeResult,
    );
  }

  try {
    database.exec("COMMIT");
  } catch (error) {
    rollbackAndThrow(database, error);
  }

  return result;
}
