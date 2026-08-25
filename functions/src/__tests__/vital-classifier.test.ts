/**
 * Keeps the backend classifier identical to the client's.
 *
 * The app has now had FOUR vital-threshold tables: vital_classifier.dart,
 * AppConstants.vitalRanges (deleted), a prose table in docs/BUSINESS_RULES.md,
 * and inline ternaries in deployments.ts. Each was written in good faith and
 * each disagreed with the others, so a reading's colour depended on which
 * screen — or which side of the network — you happened to be on.
 *
 * Copying the table into a second language is a deliberate trade: the
 * alternative is a shared codegen step for six numbers. The trade only holds
 * if a drift FAILS, so the last test here parses the Dart source and diffs the
 * two implementations across the whole range. If someone edits one file and
 * not the other, this goes red.
 */

import * as fs from "fs";
import * as path from "path";
import {
  classifyVital,
  classifyBloodPressure,
  worstOf,
  VitalKey,
} from "../utils/vitalClassifier";

const DART = path.join(
  __dirname,
  "../../../../housepital_patient_app/lib/utils/vital_classifier.dart"
);

describe("the published table is what the code does", () => {
  const cases: [VitalKey, number, string][] = [
    ["bp_systolic", 140, "critical"],
    ["bp_systolic", 139, "warning"],
    ["bp_systolic", 130, "warning"],
    ["bp_systolic", 129, "normal"],
    ["bp_systolic", 100, "normal"],
    ["bp_systolic", 99, "warning"],
    ["bp_systolic", 89, "critical"],
    ["bp_diastolic", 90, "critical"],
    ["bp_diastolic", 85, "warning"],
    ["bp_diastolic", 70, "normal"],
    ["bp_diastolic", 59, "critical"],
    ["spo2", 95, "normal"],
    ["spo2", 94, "warning"],
    ["spo2", 90, "warning"],
    ["spo2", 89, "critical"],
    ["pulse", 111, "critical"],
    ["pulse", 110, "warning"],
    ["pulse", 99, "normal"],
    ["pulse", 49, "critical"],
    ["temperature", 100.5, "critical"],
    ["temperature", 100.4, "warning"],
    ["temperature", 98.6, "normal"],
    ["temperature", 96.5, "warning"],
    ["temperature", 95.9, "critical"],
    ["sugar", 181, "critical"],
    ["sugar", 180, "warning"],
    ["sugar", 120, "normal"],
    ["sugar", 59, "critical"],
  ];

  it.each(cases)("%s %s -> %s", (key, value, want) => {
    expect(classifyVital(key, value)).toBe(want);
  });
});

describe("the regressions this file was written for", () => {
  it("a hypothermic 95F is critical, not normal", () => {
    // The old inline check was `temperature > 103 ? critical : > 100 ?
    // warning : normal` — it never looked downward at all, so the family was
    // told a hypothermic reading was fine.
    expect(classifyVital("temperature", 95)).toBe("critical");
  });

  it("systolic 150 is critical, not warning", () => {
    expect(classifyVital("bp_systolic", 150)).toBe("critical");
  });

  it("pulse 115 is critical, not warning", () => {
    expect(classifyVital("pulse", 115)).toBe("critical");
  });

  it("blood sugar is scored at all", () => {
    // The backend did not classify sugar, so a diabetic patient's reading was
    // never flagged server-side however high it went.
    expect(classifyVital("sugar", 400)).toBe("critical");
  });
});

describe("missing data is never scored as healthy", () => {
  it.each([null, undefined, NaN])("%p returns null, not normal", (v) => {
    expect(classifyVital("spo2", v as number)).toBeNull();
  });

  it("a blood pressure with only one number still scores", () => {
    expect(classifyBloodPressure(150, null)).toBe("critical");
    expect(classifyBloodPressure(null, 95)).toBe("critical");
  });

  it("a blood pressure with no numbers is null", () => {
    expect(classifyBloodPressure(null, null)).toBeNull();
  });

  it("worstOf takes the most severe, ignoring nulls", () => {
    expect(worstOf("normal", null, "critical", "warning")).toBe("critical");
    expect(worstOf(null, null)).toBeNull();
  });
});

describe("the Dart and TypeScript tables agree", () => {
  // Parses the boundary numbers straight out of the Dart source rather than
  // trusting a copy of them here — a copy would drift with the same silence
  // this test exists to prevent.
  const dart = fs.readFileSync(DART, "utf8");

  function dartBand(key: VitalKey, v: number): string {
    const body = dart.split(`_classify${toDartName(key)}(double value) {`)[1];
    if (!body) throw new Error(`no Dart branch for ${key}`);
    // Terminate at the function's OWN closing brace. These are top-level
    // Dart functions, so that is "\n}" at column 0 — not the indented "\n  }"
    // this first tried, which ran straight past the end of _classifyPulse and
    // into _classifyTemperature and reported four phantom mismatches at 96,
    // 97, 99 and 100.4: temperature's boundaries, attributed to pulse.
    const lines = body.split("\n}")[0].split("\n");
    for (const line of lines) {
      const m = /if \((.+?)\) return '(\w+)';/.exec(line.trim());
      if (!m) continue;
      // The conditions are simple numeric comparisons on `value`.
      // eslint-disable-next-line no-new-func
      const test = new Function("value", `return (${m[1]});`);
      if (test(v)) return m[2];
    }
    return "green";
  }

  function toDartName(key: VitalKey): string {
    return {
      bp_systolic: "BpSystolic",
      bp_diastolic: "BpDiastolic",
      spo2: "Spo2",
      pulse: "Pulse",
      temperature: "Temperature",
      sugar: "Sugar",
    }[key];
  }

  const BAND: Record<string, string> = {
    green: "normal",
    yellow: "warning",
    red: "critical",
  };

  const keys: VitalKey[] = [
    "bp_systolic",
    "bp_diastolic",
    "spo2",
    "pulse",
    "temperature",
    "sugar",
  ];

  it("the Dart file is where we think it is", () => {
    expect(dart).toContain("String classifyVital(");
  });

  it.each(keys)("%s matches across the whole range", (key) => {
    const mismatches: string[] = [];
    for (let v = 0; v <= 400; v += 0.5) {
      const ts = classifyVital(key, v);
      const dt = BAND[dartBand(key, v)];
      if (ts !== dt) mismatches.push(`${key} ${v}: ts=${ts} dart=${dt}`);
    }
    expect(mismatches).toEqual([]);
  });
});
