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

  test("nothing that handles the credential writes to a log", () => {
    const handlers = ["lib/exit-cookie.ts", "lib/rules/credential.ts", "lib/db/qr-checkin.ts", "app/c/[area]/qr-actions.ts", "app/c/[area]/out/actions.ts", "app/c/[area]/out/ExitCheckOut.tsx", "app/c/[area]/QrCheckIn.tsx"];
    for (const file of handlers) {
      const source = sources.find((s) => s.file === file);
      expect(source, `${file} exists`).toBeDefined();
      expect(source!.text, `${file} logs`).not.toMatch(/console\.(log|info|warn|error|debug|trace)|\bdebugger\b/);
    }
  });

  test("the credential is never put in an address or returned to the page", () => {
    const actions = sources.find((s) => s.file === "app/c/[area]/qr-actions.ts")!.text;
    // The only thing handed to the browser is the cookie, and the redirect goes to the pass, not to anything holding the credential
    expect(actions).toMatch(/setExitCredential\(credential\.token/);
    expect(actions).not.toMatch(/redirect\([^)]*credential/);
    const exit = sources.find((s) => s.file === "app/c/[area]/out/actions.ts")!.text;
    expect(exit).not.toMatch(/return \{[^}]*\bcredential\b[^}]*\}/);
  });

  test("the guard is looking at real files", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some((s) => s.file === "lib/db/qr-checkin.ts")).toBe(true);
  });
});
