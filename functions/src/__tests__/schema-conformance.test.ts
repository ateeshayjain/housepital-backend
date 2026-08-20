/**
 * Schema conformance.
 *
 * WHY THIS TEST EXISTS
 * Round 4 compared every `db("table")` chain in functions/src against the SQL
 * migrations and found ~20 sites referencing columns and tables that had never
 * existed: `payments.updated_at` (five write sites), `medications.
 * schedule_times`, `medication_logs.patient_id`, `bookings.base_amount`,
 * `equipment_catalog.is_active`, `notification_log.is_read`, and four whole
 * tables — staff_reviews, staff_documents, equipment_deployments,
 * health_manager_assignments.
 *
 * MySQL rejects an unknown column outright, so not one of those routes had
 * ever returned success. Nothing noticed because the Flutter client falls back
 * to bundled sample data whenever the API is unreachable, and
 * api.housepital.in does not resolve — so a backend where 20 endpoints were
 * structurally incapable of responding presented, from the app, as a backend
 * that was merely offline.
 *
 * A test that needed a live database would never have run here. This one reads
 * the migrations as text and the routes as text, so it runs anywhere and fails
 * the moment the two drift again.
 *
 * It is a lint, not a proof: it cannot see dynamic column names or validate
 * joins. It catches the exact class of defect that shipped.
 */

import * as fs from "fs";
import * as path from "path";

const SQL_DIR = path.join(__dirname, "../../../sql");
const SRC_DIR = path.join(__dirname, "..");

/** Column names that are keys of a JSON document, not table columns. */
const JSON_DOCUMENT_KEYS = new Set([
  // notification_preferences JSON, written in family.ts
  "attendance",
  "vitals_alert",
  "daily_report",
  "payment_reminder",
  "weekly_summary",
  "booking_update",
]);

function readSql(): string {
  const raw = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(SQL_DIR, f), "utf8"))
    .join("\n");

  // Strip `--` line comments BEFORE parsing. Statement splitting keys on `;`,
  // and a prose comment containing a semicolon (". . . toJson();") truncated
  // the ALTER TABLE that followed it, so a column that had been added read as
  // missing. Found by this test failing on its own fixture.
  return raw.replace(/--[^\n]*/g, "");
}

/** Parses CREATE TABLE bodies and applies ALTER TABLE ... ADD COLUMN. */
function parseSchema(sql: string): Record<string, Set<string>> {
  const tables: Record<string, Set<string>> = {};

  const createRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql))) {
    const name = m[1];
    let depth = 1;
    let i = createRe.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
      i++;
    }
    const body = sql.slice(createRe.lastIndex, i - 1);
    const cols = new Set<string>();
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/^`/, "");
      const cm = /^(\w+)\s+[A-Za-z]/.exec(line);
      if (!cm) continue;
      const w = cm[1].toUpperCase();
      if (
        ["PRIMARY", "KEY", "UNIQUE", "INDEX", "CONSTRAINT", "FOREIGN",
         "CHECK", "FULLTEXT"].includes(w)
      ) {
        continue;
      }
      cols.add(cm[1]);
    }
    tables[name] = cols;
  }

  const alterRe = /ALTER TABLE\s+(\w+)([\s\S]*?);/gi;
  while ((m = alterRe.exec(sql))) {
    const name = m[1];
    if (!tables[name]) continue;
    for (const am of m[2].matchAll(/ADD COLUMN\s+(\w+)/gi)) {
      tables[name].add(am[1]);
    }
  }

  return tables;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

interface Usage {
  file: string;
  line: number;
  table: string;
  columns: string[];
}

function collectUsages(files: string[]): Usage[] {
  const usages: Usage[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/db\(\s*"(\w+)"\s*\)/g)) {
      const table = m[1];
      const start = (m.index ?? 0) + m[0].length;
      let chunk = src.slice(start, start + 900);
      // Do not bleed into the next query on a different table.
      for (const stop of ['db("', 'trx("']) {
        const at = chunk.indexOf(stop);
        if (at > 0) chunk = chunk.slice(0, at);
      }
      const cols = new Set<string>();
      const clause =
        /\.(where|andWhere|orWhere|whereIn|orderBy|groupBy|sum|count|max|min|increment|decrement)\(\s*"([\w.]+)"/g;
      for (const c of chunk.matchAll(clause)) cols.add(c[2]);
      for (const c of chunk.matchAll(/\.(insert|update)\(\s*\{([^}]{0,800})/g)) {
        for (const k of c[2].matchAll(/(?:^|\n)\s*(\w+)\s*:/g)) cols.add(k[1]);
      }
      usages.push({
        file: path.relative(SRC_DIR, file),
        line: src.slice(0, m.index ?? 0).split("\n").length,
        table,
        columns: [...cols],
      });
    }
  }
  return usages;
}

describe("every table the code queries exists in the migrations", () => {
  const schema = parseSchema(readSql());
  const usages = collectUsages(walk(SRC_DIR));

  it("parses a non-trivial schema (guards the parser itself)", () => {
    expect(Object.keys(schema).length).toBeGreaterThanOrEqual(25);
    expect(schema.payments).toBeDefined();
    expect(schema.payments.has("updated_at")).toBe(true);
  });

  it("finds query sites to check (guards the scanner itself)", () => {
    expect(usages.length).toBeGreaterThan(30);
  });

  it("references no unknown table", () => {
    const bad = usages
      .filter((u) => !schema[u.table])
      .map((u) => `${u.file}:${u.line} — db("${u.table}")`);
    expect(bad).toEqual([]);
  });

  it("references no unknown column", () => {
    const bad: string[] = [];
    for (const u of usages) {
      const cols = schema[u.table];
      if (!cols) continue;
      for (const c of u.columns) {
        const qualifier = c.includes(".") ? c.split(".")[0] : null;
        // A qualified reference to another table belongs to that table's join.
        if (qualifier && qualifier !== u.table) continue;
        const base = c.split(".").pop() as string;
        if (!base || base === "*") continue;
        if (JSON_DOCUMENT_KEYS.has(base)) continue;
        if (!cols.has(base)) {
          bad.push(`${u.file}:${u.line} — ${u.table}.${base}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
