import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The checkout credential's hash (visits.credential_hash) must never reach a screen, an export or a log. These look at the source
 * itself, so a future change that selects it, or selects every column of a visit, fails here before it ships.
 */
const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "scripts"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const sources = SOURCE_DIRS.flatMap((d) => files(join(ROOT, d))).map((path) => ({ file: relative(ROOT, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));

describe("the credential hash stays in the database", () => {
  test("no application code names the credential columns", () => {
    const hits = sources.filter((s) => /credential_hash|credential_expires_at|credential_issued_at/.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  test("nothing selects every column of a visit", () => {
    const hits = sources.filter((s) => /from\(\s*"visits"\s*\)\s*\.select\(\s*["'`]\*["'`]/.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  test("the guard is looking at real files", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some((s) => s.file === "lib/db/qr-checkin.ts")).toBe(true);
  });
});
