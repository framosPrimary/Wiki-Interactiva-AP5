import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

let pool: Pool | undefined;

export function database(): Pool {
  pool ??= new Pool({ connectionString: config().DATABASE_URL, max: 12, connectionTimeoutMillis: 5000 });
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return database().query<T>(text, values);
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
