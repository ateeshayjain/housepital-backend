import knex, { Knex } from "knex";

// Cloud SQL MySQL connection via knex
// In production, use Cloud SQL Auth Proxy or private IP
// Set these via firebase functions:config:set or environment variables

let _db: Knex | null = null;

export function getDb(): Knex {
  if (_db) return _db;

  const config: Knex.Config = {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "housepital",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "housepital",
      // For Cloud SQL socket connection:
      // socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
    },
    pool: {
      min: 0,
      max: 10,
      // Cloud Functions can be cold-started, so we need short idle timeout
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000,
    },
    // Timezone handling for IST
    migrations: {
      directory: "../../sql",
    },
  };

  _db = knex(config);
  return _db;
}

// Helper to close connection (for testing)
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
