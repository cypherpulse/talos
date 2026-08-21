import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export interface DbHandle {
  client: postgres.Sql;
  db: PostgresJsDatabase<typeof schema>;
}

export function createDb(url: string, max = 10): DbHandle {
  const client = postgres(url, { max });
  const db = drizzle(client, { schema });
  return { client, db };
}
