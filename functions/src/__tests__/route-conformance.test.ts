/**
 * Does every client call have a route to land on?
 *
 * WHY THIS EXISTS
 * A round-5 sweep compared every `_get/_post/_put/_delete` in the Flutter
 * client's api_service.dart against every `router.<verb>` in this directory.
 * THIRTEEN client calls had no backend route at all — including
 * `POST /deployments/:id/replacement`, which is the only control in the app
 * for removing a caregiver from a patient's home.
 *
 * None of them surfaced as a bug, because the client catches the failure and
 * the UI reports success. That is how "Thank you for your review!" came to be
 * printed after a POST to a route that has never existed.
 *
 * Like the schema check, this needs no server and no network: it reads both
 * sides as text. The reason the drift survived is that every check capable of
 * catching it needed something running.
 *
 * KNOWN GAPS are listed explicitly below rather than excluded silently. A
 * route that is missing because nobody has decided what it should do is a
 * product decision, not a passing test — but it must be visible.
 */

import * as fs from "fs";
import * as path from "path";

const ROUTES_DIR = path.join(__dirname, "../routes");
const INDEX = path.join(__dirname, "../index.ts");
const CLIENT = path.join(
  __dirname,
  "../../../../housepital_patient_app/lib/services/api_service.dart"
);

/**
 * Client calls with no route, awaiting a product decision rather than code.
 * Each needs a data model that does not exist and a business rule nobody has
 * written down. Listed so the count is honest and the list can only shrink.
 */
const ACCEPTED_MISSING = new Set([
  "GET /services/:x/slots", // needs a staff-availability / scheduling model
  "GET /patients/:x/equipment-orders", // which store is authoritative: bookings or equipment_deployments?
  "POST /equipment-orders/:x/return", // depends on the above
  "GET /articles", // no CMS; the app bundles its articles and they work offline
  "GET /articles/:x",
]);

function mounts(): Record<string, string> {
  const src = fs.readFileSync(INDEX, "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(
    /app\.use\(\s*"([^"]+)"\s*,\s*\w+\s*,\s*(\w+)/g
  )) {
    // routeVariable -> file stem, e.g. patientRoutes -> patients
    out[m[2]] = m[1];
  }
  return out;
}

function importedAs(): Record<string, string> {
  const src = fs.readFileSync(INDEX, "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(
    /import\s+(\w+)\s+from\s+"\.\/routes\/(\w+)"/g
  )) {
    out[m[1]] = m[2];
  }
  return out;
}

function norm(p: string): string {
  return (
    p
      .replace(/\$\{[^}]+\}/g, ":x") // ${expr}
      .replace(/\$[A-Za-z_]\w*/g, ":x") // $identifier — the client's style
      .replace(/:[A-Za-z_]\w*/g, ":x") // :param
      .replace(/\/+$/, "") || "/"
  );
}

function backendRoutes(): Set<string> {
  const mountByVar = mounts();
  const fileByVar = importedAs();
  const prefixByFile: Record<string, string> = {};
  for (const [v, file] of Object.entries(fileByVar)) {
    if (mountByVar[v] !== undefined) prefixByFile[file] = mountByVar[v];
  }

  const out = new Set<string>();
  for (const f of fs.readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".ts")) continue;
    const stem = f.replace(/\.ts$/, "");
    const prefix = prefixByFile[stem];
    if (prefix === undefined) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, f), "utf8");
    for (const m of src.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g
    )) {
      const full = (prefix === "/" ? "" : prefix) + m[2];
      out.add(`${m[1].toUpperCase()} ${norm(full)}`);
    }
  }
  return out;
}

function clientCalls(): { verb: string; path: string; line: number }[] {
  const src = fs.readFileSync(CLIENT, "utf8");
  const out: { verb: string; path: string; line: number }[] = [];
  for (const m of src.matchAll(/_(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    out.push({
      verb: m[1].toUpperCase(),
      path: m[2].split("?")[0],
      line: src.slice(0, m.index ?? 0).split("\n").length,
    });
  }
  return out;
}

describe("client ↔ backend route conformance", () => {
  const backend = backendRoutes();
  const calls = clientCalls();

  it("finds the client file and its calls (guards the scanner)", () => {
    expect(fs.existsSync(CLIENT)).toBe(true);
    expect(calls.length).toBeGreaterThan(50);
  });

  it("finds the backend routes (guards the scanner)", () => {
    expect(backend.size).toBeGreaterThan(50);
    // Spot-check one from each mount style: prefixed, and root-mounted.
    expect(backend.has("GET /patients/:x/dashboard")).toBe(true);
    expect(backend.has("POST /bookings")).toBe(true);
  });

  it("every client call has a backend route, or is an accepted gap", () => {
    const missing = calls
      .map((c) => ({ ...c, sig: `${c.verb} ${norm(c.path)}` }))
      .filter((c) => !backend.has(c.sig))
      .filter((c) => !ACCEPTED_MISSING.has(c.sig))
      .map((c) => `api_service.dart:${c.line} — ${c.sig}`);
    expect(missing).toEqual([]);
  });

  it("the accepted-gap list has not silently grown", () => {
    // A gap should only ever be closed. Adding one requires editing this
    // number, which is the point: it makes the decision visible in review.
    expect(ACCEPTED_MISSING.size).toBeLessThanOrEqual(5);
  });

  it("every accepted gap is still genuinely missing", () => {
    // Stops the list rotting: once a route is implemented, its entry must go.
    const stale = [...ACCEPTED_MISSING].filter((sig) => backend.has(sig));
    expect(stale).toEqual([]);
  });

  it("the controls the audit named now have routes", () => {
    for (const sig of [
      "POST /deployments/:x/replacement", // the only caregiver-removal control
      "POST /equipment/:x/reviews",
      "GET /equipment/:x/reviews",
      "POST /patients/:x/vitals",
      "POST /bookings/:x/cancel",
      "POST /bookings/:x/rate",
      "PUT /assessments/:x/accept",
      "PUT /assessments/:x/decline",
    ]) {
      expect(backend.has(sig)).toBe(true);
    }
  });
});
