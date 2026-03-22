/**
 * Structured JSON logger for Cloud Functions.
 * Outputs JSON lines consumed by Cloud Logging.
 */
export const logger = {
  info: (msg: string, data?: Record<string, any>) =>
    console.log(
      JSON.stringify({ level: "info", msg, ...data, ts: new Date().toISOString() })
    ),

  warn: (msg: string, data?: Record<string, any>) =>
    console.warn(
      JSON.stringify({ level: "warn", msg, ...data, ts: new Date().toISOString() })
    ),

  error: (msg: string, data?: Record<string, any>) =>
    console.error(
      JSON.stringify({ level: "error", msg, ...data, ts: new Date().toISOString() })
    ),
};
