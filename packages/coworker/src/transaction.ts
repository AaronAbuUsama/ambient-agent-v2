import type { DatabaseSync } from "node:sqlite";

export function immediateTransaction<Result>(
  database: DatabaseSync,
  operation: () => Result,
): Result {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
