// Yalnız geliştirme: yerel veritabanını örnek veriye döndürür. Uçtan uca testler her testten önce çağırır.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isProduction } from "../auth";
import { db } from "../db";
import { DataError } from "../errors";

/** Üretimde ve yerel olmayan bir veritabanında çalışmaz: gerçek veriyi silmenin hiçbir yolu olmamalı. */
export async function resetDatabase(): Promise<void> {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://invalid").hostname;
  if (isProduction() || !["127.0.0.1", "localhost"].includes(host)) {
    throw new DataError(404, "not_found", "reset is only available on a local development database");
  }
  const seed = await readFile(path.join(process.cwd(), "supabase", "seed.sql"), "utf8");
  await db().begin(async (sql) => {
    await sql`truncate table auth.users, workspaces cascade`;
    await sql.unsafe(seed);
  });
}
