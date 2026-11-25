import path from "node:path";
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** Database handle shared by every module. Works with Postgres (production) or PGlite (local/tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

let dbPromise: Promise<Db> | null = null;

/**
 * Production: set DATABASE_URL to any Postgres (Neon, Supabase and Vercel Postgres have free tiers).
 * Local development without DATABASE_URL: an embedded PGlite database is stored in ./.data/pglite.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = connect();
  return dbPromise;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), prepare: false });
    return drizzle(client, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error("DATABASE_URL is required in production. Embedded PGlite is for local development only.");
  }
  return createPgliteDb(path.join(process.cwd(), ".data", "pglite"));
}

/** Creates a PGlite-backed database and applies all migrations. Pass no dir for an in-memory database. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** For tests: replace the shared database handle. */
export function setDbForTesting(db: Db | null) {
  dbPromise = db ? Promise.resolve(db) : null;
}

/**
 * Applies pending migrations to the configured database. PGlite databases
 * migrate themselves on connect; for Postgres this uses a short-lived connection.
 */
export async function migrateConfiguredDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    await getDb();
    return;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client.end();
  }
}
