// src/services/ai/security/promptSanitizer.ts

import { SanitizationRedactions, SanitizationResult } from "../types/aiTypes.js";

/**
 * Prompt Injection & Data Sanitization Module
 *
 * NOTE: Regex-based sanitization and PII redaction provide defense-in-depth to
 * scrub untrusted resume data before it is presented to an LLM context.
 * However, strict prompt framing (XML containment tags), bounded schemas, and
 * tool-permission guardrails remain the primary defense against adversarial jailbreaks.
 */

export interface SanitizerOptions {
  maxCharacterLimit?: number; // Default: 10,000 characters
}

const DEFAULT_MAX_CHARS = 10000;

// Patterns for PII redaction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

// Matches US/International street addresses with city/state/zip
const ADDRESS_REGEX = /\b\d{1,5}\s+[A-Za-z0-9\s.,#-]+?\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Suite|Apt|Unit)\b[\s\S]*?\b\d{5}(?:-\d{4})?\b/gi;

// Patterns for potential instruction delimiters and role markers
const INJECTION_PATTERNS = [
  /<\s*\|\s*im_start\s*\|>/gi,
  /<\s*\|\s*im_end\s*\|>/gi,
  /```\s*(?:system|prompt|instruction)/gi,
  /###\s*(?:SYSTEM|INSTRUCTION|PROMPT|ASSISTANT|USER)/gi,
  /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)\b/gi,
  /\b(?:system\s*prompt|you\s+are\s+now|act\s+as\s+an?\s+unrestricted)\b/gi,
  /\b(?:System|Human|Assistant|User)\s*:\s*(?=[A-Z])/g,
];

// Control characters (excluding \n [0x0A], \r [0x0D], \t [0x09])
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * Sanitizes untrusted resume text, removing control characters, neutralizing
 * delimiter injections, redacting PII, and enforcing length bounds.
 */
export function sanitizeResumeText(
  rawText: string,
  options: SanitizerOptions = {}
): SanitizationResult {
  const maxChars = options.maxCharacterLimit ?? DEFAULT_MAX_CHARS;
  
  if (!rawText || typeof rawText !== "string") {
    return {
      sanitizedText: "",
      characterCount: 0,
      truncated: false,
      redactions: {
        emailsRedacted: 0,
        phonesRedacted: 0,
        addressesRedacted: 0,
        delimitersNeutralized: 0,
        controlCharsRemoved: 0,
      },
    };
  }

  let text = rawText;
  let controlCharsRemoved = 0;
  let emailsRedacted = 0;
  let phonesRedacted = 0;
  let addressesRedacted = 0;
  let delimitersNeutralized = 0;

  // 1. Remove non-printable and control characters
  text = text.replace(CONTROL_CHARS_REGEX, () => {
    controlCharsRemoved++;
    return "";
  });

  // 2. Normalize whitespace (collapse multiple spaces/tabs, limit consecutive newlines to 2)
  text = text.replace(/[^\S\r\n]+/g, " ");
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  // 3. Neutralize known instruction injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, (match) => {
      delimitersNeutralized++;
      return `[FILTERED_INSTRUCTION: ${match.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20)}]`;
    });
  }

  // 4. Redact PII (Address, Email, Phone)
  text = text.replace(ADDRESS_REGEX, () => {
    addressesRedacted++;
    return "[ADDRESS_REDACTED]";
  });

  text = text.replace(EMAIL_REGEX, () => {
    emailsRedacted++;
    return "[EMAIL_REDACTED]";
  });

  text = text.replace(PHONE_REGEX, () => {
    phonesRedacted++;
    return "[PHONE_REDACTED]";
  });

  // 5. Enforce character count bounds
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }

  return {
    sanitizedText: text,
    characterCount: text.length,
    truncated,
    redactions: {
      emailsRedacted,
      phonesRedacted,
      addressesRedacted,
      delimitersNeutralized,
      controlCharsRemoved,
    },
  };
}
