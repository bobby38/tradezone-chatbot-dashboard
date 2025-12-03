/**
 * Input validation for ChatKit endpoints
 * Prevents token abuse and malicious payloads
 */

import { logSuspiciousActivity } from './monitoring';

export const VALIDATION_LIMITS = {
  MAX_MESSAGE_LENGTH: 1000, // Max characters per message
  MAX_HISTORY_LENGTH: 20, // Max conversation turns to include
  MAX_SESSION_ID_LENGTH: 100,
  MIN_MESSAGE_LENGTH: 1,
  MAX_TOOL_ARGS_LENGTH: 500,
  MAX_IMAGE_LENGTH: 4096,
} as const;

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class ValidationResult {
  constructor(
    public valid: boolean,
    public errors: ValidationError[] = [],
    public sanitized?: any,
  ) {}

  static success(sanitized?: any): ValidationResult {
    return new ValidationResult(true, [], sanitized);
  }

  static failure(errors: ValidationError[]): ValidationResult {
    return new ValidationResult(false, errors);
  }
}

/**
 * Log prompt injection attempt to security monitoring
 */
async function logInjectionAttempt(
  message: string,
  sessionId: string,
  risk: "low" | "medium" | "high",
  patterns: string[],
  clientIp: string = "unknown"
): Promise<void> {
  await logSuspiciousActivity("prompt_injection", {
    sessionId,
    clientIp,
    endpoint: "/api/chatkit/agent",
    metadata: {
      risk,
      patterns: patterns.slice(0, 3), // Limit to first 3 patterns
      messagePreview: message.substring(0, 100),
      messageLength: message.length,
    },
  });
}

/**
 * Validate chat message input
 */
export function validateChatMessage(input: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Check message exists
  if (!input.message) {
    errors.push({
      field: "message",
      message: "Message is required",
    });
  }

  // Check message type
  if (typeof input.message !== "string") {
    errors.push({
      field: "message",
      message: "Message must be a string",
      value: typeof input.message,
    });
  }

  // Check message length
  if (
    input.message &&
    input.message.length < VALIDATION_LIMITS.MIN_MESSAGE_LENGTH
  ) {
    errors.push({
      field: "message",
      message: `Message is too short (min ${VALIDATION_LIMITS.MIN_MESSAGE_LENGTH} character)`,
      value: input.message.length,
    });
  }

  if (
    input.message &&
    input.message.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH
  ) {
    errors.push({
      field: "message",
      message: `Message is too long (max ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} characters)`,
      value: input.message.length,
    });
  }

  // Check session ID
  if (!input.sessionId) {
    errors.push({
      field: "sessionId",
      message: "Session ID is required",
    });
  }

  if (input.sessionId && typeof input.sessionId !== "string") {
    errors.push({
      field: "sessionId",
      message: "Session ID must be a string",
      value: typeof input.sessionId,
    });
  }

  if (
    input.sessionId &&
    input.sessionId.length > VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH
  ) {
    errors.push({
      field: "sessionId",
      message: `Session ID is too long (max ${VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH} characters)`,
      value: input.sessionId.length,
    });
  }

  // Validate history if provided
  if (input.history !== undefined) {
    if (!Array.isArray(input.history)) {
      errors.push({
        field: "history",
        message: "History must be an array",
        value: typeof input.history,
      });
    } else if (input.history.length > VALIDATION_LIMITS.MAX_HISTORY_LENGTH) {
      // Don't error, just truncate and warn
      console.warn(
        `[Validation] History too long (${input.history.length} turns), truncating to ${VALIDATION_LIMITS.MAX_HISTORY_LENGTH}`,
      );
    }
  }

  // Validate optional image reference
  let sanitizedImage: string | undefined;
  if (input.image !== undefined && input.image !== null) {
    if (typeof input.image !== "string") {
      errors.push({
        field: "image",
        message: "Image reference must be a string",
        value: typeof input.image,
      });
    } else {
      const trimmed = input.image.trim();
      if (trimmed.length > 0) {
        if (trimmed.length > VALIDATION_LIMITS.MAX_IMAGE_LENGTH) {
          errors.push({
            field: "image",
            message: `Image reference is too long (max ${VALIDATION_LIMITS.MAX_IMAGE_LENGTH} characters)`,
            value: trimmed.length,
          });
        } else if (
          !/^https?:\/\//i.test(trimmed) &&
          !/^data:image\//i.test(trimmed)
        ) {
          errors.push({
            field: "image",
            message: "Image reference must be an https URL or data URI",
            value: trimmed.slice(0, 64),
          });
        } else {
          sanitizedImage = trimmed;
        }
      }
    }
  }

  if (errors.length > 0) {
    return ValidationResult.failure(errors);
  }

  // Optional mode hint (e.g., "voice")
  let sanitizedMode: string | undefined;
  if (input.mode && typeof input.mode === "string") {
    sanitizedMode = input.mode.trim().toLowerCase();
  }

  // Check for prompt injection attempts
  const injectionCheck = detectPromptInjection(input.message);

  if (injectionCheck.detected) {
    // Log the attempt
    console.warn("[Security] Prompt injection detected:", {
      risk: injectionCheck.risk,
      patterns: injectionCheck.patterns,
      message: input.message.substring(0, 100),
    });

    // Log to security monitoring (async, don't block)
    logInjectionAttempt(
      input.message,
      input.sessionId || "unknown",
      injectionCheck.risk,
      injectionCheck.patterns
    ).catch(err => console.error("[Security] Failed to log injection attempt:", err));

    // Block high-risk attempts
    if (injectionCheck.risk === "high") {
      errors.push({
        field: "message",
        message: "Your message contains patterns that may interfere with the chatbot. Please rephrase your question.",
        value: injectionCheck.risk,
      });
      return ValidationResult.failure(errors);
    }

    // For medium/low risk, sanitize but allow
    console.log("[Security] Allowing medium/low risk message after sanitization");
  }

  // Sanitize and return
  const sanitized = {
    message: sanitizeMessage(input.message.trim()),
    sessionId: input.sessionId.trim(),
    history: Array.isArray(input.history)
      ? input.history.slice(-VALIDATION_LIMITS.MAX_HISTORY_LENGTH) // Keep only last N turns
      : [],
    image: sanitizedImage,
    mode: sanitizedMode,
  };

  return ValidationResult.success(sanitized);
}

/**
 * Validate session ID format
 */
export function validateSessionId(sessionId: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!sessionId || typeof sessionId !== "string") {
    errors.push({
      field: "sessionId",
      message: "Valid session ID is required",
      value: sessionId,
    });
  }

  if (sessionId && sessionId.length > VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH) {
    errors.push({
      field: "sessionId",
      message: `Session ID is too long (max ${VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH} characters)`,
      value: sessionId.length,
    });
  }

  // Check for suspicious patterns
  if (sessionId && /[<>\"'&]/.test(sessionId)) {
    errors.push({
      field: "sessionId",
      message: "Session ID contains invalid characters",
      value: sessionId,
    });
  }

  if (errors.length > 0) {
    return ValidationResult.failure(errors);
  }

  return ValidationResult.success(sessionId.trim());
}

/**
 * Detect prompt injection attempts
 * Returns true if suspicious patterns are detected
 */
export function detectPromptInjection(message: string): {
  detected: boolean;
  patterns: string[];
  risk: "low" | "medium" | "high";
} {
  const lowerMessage = message.toLowerCase();
  const detectedPatterns: string[] = [];

  // Critical injection patterns (HIGH RISK)
  const criticalPatterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
    /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
    /forget\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
    /new\s+(instructions|prompt|rules|system\s+message)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /your\s+new\s+(role|purpose|instruction)/i,
    /system:\s*/i,
    /assistant:\s*/i,
    /\[SYSTEM\]/i,
    /\[INST\]/i,
    /\[\/INST\]/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
    /<<SYS>>/i,
    /<\/SYS>/i,
  ];

  // Medium-risk patterns (role-playing/identity confusion)
  const mediumPatterns = [
    /pretend\s+(you're|you\s+are|to\s+be)/i,
    /act\s+(like|as\s+if)\s+you/i,
    /roleplay\s+as/i,
    /simulate\s+(being|a)/i,
    /behave\s+like/i,
    /respond\s+as\s+if\s+you/i,
  ];

  // Low-risk patterns (probing/testing)
  const lowPatterns = [
    /what\s+(are|is)\s+your\s+(instructions|rules|prompt)/i,
    /show\s+me\s+your\s+(instructions|prompt|system\s+message)/i,
    /reveal\s+your\s+(instructions|prompt)/i,
    /tell\s+me\s+your\s+(instructions|rules)/i,
  ];

  // Check critical patterns
  for (const pattern of criticalPatterns) {
    if (pattern.test(message)) {
      detectedPatterns.push(pattern.source);
    }
  }

  if (detectedPatterns.length > 0) {
    return { detected: true, patterns: detectedPatterns, risk: "high" };
  }

  // Check medium-risk patterns
  for (const pattern of mediumPatterns) {
    if (pattern.test(message)) {
      detectedPatterns.push(pattern.source);
    }
  }

  if (detectedPatterns.length > 0) {
    return { detected: true, patterns: detectedPatterns, risk: "medium" };
  }

  // Check low-risk patterns
  for (const pattern of lowPatterns) {
    if (pattern.test(message)) {
      detectedPatterns.push(pattern.source);
    }
  }

  if (detectedPatterns.length > 0) {
    return { detected: true, patterns: detectedPatterns, risk: "low" };
  }

  return { detected: false, patterns: [], risk: "low" };
}

/**
 * Sanitize message content to prevent injection attacks
 */
export function sanitizeMessage(message: string): string {
  // Remove control characters except newlines and tabs
  let sanitized = message.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  // Normalize whitespace
  sanitized = sanitized.trim();

  // Remove excessive newlines (max 3 consecutive)
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n");

  // Remove common instruction delimiters
  sanitized = sanitized.replace(/<\|im_start\|>|<\|im_end\|>|<<SYS>>|<\/SYS>|\[SYSTEM\]|\[INST\]|\[\/INST\]/gi, "");

  return sanitized;
}

/**
 * Calculate token estimate (rough approximation)
 * OpenAI uses ~4 chars per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate token budget for a request
 */
export function validateTokenBudget(
  message: string,
  history: any[],
  maxTokens: number = 3000,
): ValidationResult {
  const messageTokens = estimateTokens(message);
  const historyText = history
    .map((h) => (h.content || "").toString())
    .join(" ");
  const historyTokens = estimateTokens(historyText);

  const totalEstimate = messageTokens + historyTokens;

  if (totalEstimate > maxTokens) {
    return ValidationResult.failure([
      {
        field: "tokens",
        message: `Estimated token usage (${totalEstimate}) exceeds budget (${maxTokens})`,
        value: totalEstimate,
      },
    ]);
  }

  return ValidationResult.success({
    messageTokens,
    historyTokens,
    totalEstimate,
  });
}

/**
 * Validation response helper
 */
export function validationErrorResponse(
  errors: ValidationError[],
  status: number = 400,
  headers?: HeadersInit,
): Response {
  return Response.json(
    {
      error: "Validation failed",
      details: errors,
    },
    { status, headers },
  );
}
