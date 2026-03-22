/**
 * Parse a JSON column value from MySQL.
 * MySQL may store JSON as a string; this safely parses it back.
 */
export function parseJsonCol(val: any): any {
  if (val == null) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}
