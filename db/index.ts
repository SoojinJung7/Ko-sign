import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import { schema } from "@/db/schema";

/**
 * A syntactically-valid placeholder so that constructing the client never
 * throws at import time when DATABASE_URL is unset in local dev. Any query
 * against it will fail only at execution time, which is the desired behaviour.
 */
const PLACEHOLDER_URL =
  "postgresql://user:pass@localhost:5432/signflow_placeholder";

const connectionString = env.DATABASE_URL || PLACEHOLDER_URL;

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { schema };
