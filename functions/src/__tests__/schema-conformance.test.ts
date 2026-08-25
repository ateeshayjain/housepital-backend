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
      // Table-level clauses, and SQL keywords that can begin a CONTINUATION
      // line of a multi-line column definition. A multi-line
      // `status ENUM(\n  'a', 'b'\n) NOT NULL DEFAULT 'x'` wraps so that a
      // line starts with `NOT NULL DEFAULT ...`, and the naive rule read
      // `NOT` as a column name. That direction of error is the quiet one: a
      // phantom column makes this guard MORE permissive, so a genuinely wrong
      // reference to `staff_documents.NOT` would have passed.
      if (
        ["PRIMARY", "KEY", "UNIQUE", "INDEX", "CONSTRAINT", "FOREIGN",
         "CHECK", "FULLTEXT", "NOT", "NULL", "DEFAULT", "ON", "ENGINE",
         "REFERENCES", "AUTO_INCREMENT", "UNSIGNED", "CHARACTER",
         "COLLATE"].includes(w)
      ) {
        continue;
      }
      cols.add(cm[1]);
    }
    tables[name] = cols;
  }

  // Plain `ALTER TABLE ... ADD COLUMN`.
  const alterRe = /ALTER TABLE\s+`?(\w+)`?([\s\S]*?);/gi;
  while ((m = alterRe.exec(sql))) {
    const name = m[1];
    if (!tables[name]) continue;
    for (const am of m[2].matchAll(/ADD COLUMN\s+`?(\w+)`?/gi)) {
      tables[name].add(am[1]);
    }
  }

  // Guarded adds: `CALL hpl_add_column_if_missing('table', 'column', '...')`.
  //
  // Migration 005 uses these instead of bare ALTERs because MySQL 8 has no
  // `ADD COLUMN IF NOT EXISTS`, and a migration that cannot be re-run is
  // unsafe when it fails part way. This parser has to know about the form or
  // it reports every guarded column as missing — which is exactly what it did
  // the moment 005 was rewritten, correctly refusing to pass on input it no
  // longer understood.
  const callRe =
    /CALL\s+hpl_add_column_if_missing\s*\(\s*'(\w+)'\s*,\s*'(\w+)'/gi;
  while ((m = callRe.exec(sql))) {
    const [, table, column] = m;
    if (tables[table]) tables[table].add(column);
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
  });

  it("sees columns added by BOTH migration forms", () => {
    // A parser that silently understands only one form is worse than no
    // parser: it reports real columns as missing and trains people to ignore
    // it. payments.updated_at arrives via a guarded CALL;
    // notification_log.is_read too; equipment_catalog.sort_order too.
    expect(schema.payments.has("updated_at")).toBe(true);
    expect(schema.medications.has("reminders_enabled")).toBe(true);
    expect(schema.notification_log.has("is_read")).toBe(true);
    expect(schema.notification_log.has("read_at")).toBe(true);
    expect(schema.equipment_catalog.has("sort_order")).toBe(true);
  });

  it("does not invent columns from wrapped definitions", () => {
    // staff_documents.status is a multi-line ENUM whose continuation line
    // begins `NOT NULL DEFAULT`. Cross-checked against a real MySQL 8
    // database built from these migrations: 25 tables, 351 columns, and this
    // was the only disagreement.
    expect(schema.staff_documents.has("NOT")).toBe(false);
    expect(schema.staff_documents.has("NULL")).toBe(false);
    expect(schema.staff_documents.has("status")).toBe(true);
  });

  it("does not blacklist words that are also real column names", () => {
    // The first version of the keyword list included COMMENT, which deleted
    // `daily_ratings.comment` and `staff_reviews.comment` — real columns the
    // routes read. Only keywords that can plausibly BEGIN a wrapped
    // continuation line belong on that list; `comment` needs backticks to be
    // a keyword there, `not`/`null`/`default` do not.
    expect(schema.daily_ratings.has("comment")).toBe(true);
    expect(schema.staff_reviews.has("comment")).toBe(true);
  });

  it("sees the four tables migration 005 creates", () => {
    for (const t of [
      "staff_reviews",
      "staff_documents",
      "equipment_deployments",
      "health_manager_assignments",
    ]) {
      expect(schema[t]).toBeDefined();
    }
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
