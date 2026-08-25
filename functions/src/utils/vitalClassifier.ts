/**
 * THE vital-sign classifier for the backend.
 *
 * WHY THIS FILE EXISTS AND MUST STAY IN LOCK-STEP WITH THE CLIENT
 * Round 4 found the app shipping two disagreeing classifiers. Fixing that
 * turned up two more, and this was the fourth: `deployments.ts` computed its
 * own `latest_vital_status`, the client consumes it
 * (`MyCareModels.latestVitalStatus`), and the client ALSO classifies the same
 * reading itself. So one reading got a colour from the server and a different
 * colour from the phone, depending on which screen you opened.
 *
 * The old inline thresholds vs the canonical table:
 *
 *   | reading          | old backend | canonical | consequence            |
 *   |------------------|-------------|-----------|------------------------|
 *   | systolic 150     | warning     | RED       | under-reported         |
 *   | diastolic 95     | warning     | RED       | under-reported         |
 *   | pulse 115        | warning     | RED       | under-reported         |
 *   | temperature 101  | warning     | RED       | under-reported         |
 *   | temperature 95   | NORMAL      | RED       | hypothermia read as OK |
 *   | blood sugar      | not scored  | scored    | never flagged at all   |
 *
 * The temperature-95 row is the one that matters most: the old code only ever
 * compared temperature UPWARD, so a hypothermic reading — which in a bedbound
 * or post-operative patient is at least as urgent as a fever — was reported
 * to the family as "normal".
 *
 * The table below is a literal transcription of
 * `housepital_patient_app/lib/utils/vital_classifier.dart`. Both files carry
 * the same table on purpose, and `__tests__/vital-classifier.test.ts` diffs
 * this one against the Dart source so they cannot drift apart silently.
 *
 * Thresholds are PROVISIONAL and need clinical sign-off — see the Dart file.
 *
 * Boundary convention: the boundary value belongs to the MORE SEVERE category.
 */

/** Canonical severities. The API surface uses the normal/warning/critical
 *  vocabulary the client model already expects. */
export type VitalSeverity = "normal" | "warning" | "critical";

/** Green/yellow/red, matching the Dart classifier's return values. */
type Band = "green" | "yellow" | "red";

const BAND_TO_SEVERITY: Record<Band, VitalSeverity> = {
  green: "normal",
  yellow: "warning",
  red: "critical",
};

export type VitalKey =
  | "bp_systolic"
  | "bp_diastolic"
  | "spo2"
  | "pulse"
  | "temperature"
  | "sugar";

function band(key: VitalKey, v: number): Band {
  switch (key) {
    case "bp_systolic":
      if (v >= 140 || v < 90) return "red";
      if (v < 100 || v >= 130) return "yellow";
      return "green"; // 100-130
    case "bp_diastolic":
      if (v >= 90 || v < 60) return "red";
      if (v < 65 || v >= 85) return "yellow";
      return "green"; // 65-85
    case "spo2":
      if (v < 90) return "red";
      if (v < 95) return "yellow"; // 90-94
      return "green"; // 95-100
    case "pulse":
      if (v > 110 || v < 50) return "red";
      if (v >= 100 || v < 60) return "yellow";
      return "green"; // 60-100
    case "temperature":
      if (v > 100.4 || v < 96) return "red";
      if (v >= 99 || v < 97) return "yellow";
      return "green"; // 97-99
    case "sugar":
      if (v > 180 || v < 60) return "red";
      if (v >= 140 || v < 70) return "yellow";
      return "green"; // 70-140
  }
}

/** Classifies one reading. Returns null for a missing/non-finite value so a
 *  blank field is never scored as "normal" — absence of data is not evidence
 *  of health. */
export function classifyVital(
  key: VitalKey,
  value: number | null | undefined
): VitalSeverity | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return BAND_TO_SEVERITY[band(key, value)];
}

const RANK: Record<VitalSeverity, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

/** The most severe of several readings — e.g. a blood pressure pair, where
 *  either number alone can make the reading urgent. Nulls are skipped; if
 *  every input is null the result is null, not "normal". */
export function worstOf(
  ...severities: (VitalSeverity | null)[]
): VitalSeverity | null {
  let worst: VitalSeverity | null = null;
  for (const s of severities) {
    if (s === null) continue;
    if (worst === null || RANK[s] > RANK[worst]) worst = s;
  }
  return worst;
}

/** Blood pressure is reported as one status across both numbers. */
export function classifyBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined
): VitalSeverity | null {
  return worstOf(
    classifyVital("bp_systolic", systolic),
    classifyVital("bp_diastolic", diastolic)
  );
}
