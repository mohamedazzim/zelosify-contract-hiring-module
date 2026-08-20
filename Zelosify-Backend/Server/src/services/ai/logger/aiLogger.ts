// src/services/ai/logger/aiLogger.ts

/**
 * Structured JSON Logger for AI Operations
 * Guarantees one-line JSON outputs and strict redaction of sensitive data.
 */

const SENSITIVE_KEYS = new Set([
  "rawtextsanitized",
  "rawresumetext",
  "sanitizedresumetext",
  "prompt",
  "systemprompt",
  "apikey",
  "groq_api_key",
  "authorization",
  "cookie",
  "presignedurl",
  "headers",
  "totpsecret",
  "password",
]);

function sanitizeLogPayload(obj: any, depth = 0): any {
  if (depth > 3 || !obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map((item) => sanitizeLogPayload(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lowerKey = k.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[k] = "[REDACTED_SENSITIVE]";
    } else if (typeof v === "string" && v.length > 200) {
      sanitized[k] = v.slice(0, 200) + "... [TRUNCATED]";
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitizeLogPayload(v, depth + 1);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export const aiLogger = {
  info(event: string, data: Record<string, any> = {}) {
    const entry = {
      level: "INFO",
      event,
      timestamp: new Date().toISOString(),
      ...sanitizeLogPayload(data),
    };
    console.log(JSON.stringify(entry));
  },

  warn(event: string, data: Record<string, any> = {}) {
    const entry = {
      level: "WARN",
      event,
      timestamp: new Date().toISOString(),
      ...sanitizeLogPayload(data),
    };
    console.warn(JSON.stringify(entry));
  },

  error(event: string, data: Record<string, any> = {}) {
    const entry = {
      level: "ERROR",
      event,
      timestamp: new Date().toISOString(),
      ...sanitizeLogPayload(data),
    };
    console.error(JSON.stringify(entry));
  },
};
