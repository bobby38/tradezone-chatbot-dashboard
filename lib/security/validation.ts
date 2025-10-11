/**
 * Input validation for ChatKit endpoints
 * Prevents token abuse and malicious payloads
 */

export const VALIDATION_LIMITS = {
  MAX_MESSAGE_LENGTH: 1000, // Max characters per message
  MAX_HISTORY_LENGTH: 20,    // Max conversation turns to include
  MAX_SESSION_ID_LENGTH: 100,
  MIN_MESSAGE_LENGTH: 1,
  MAX_TOOL_ARGS_LENGTH: 500,
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
    public sanitized?: any
  ) {}

  static success(sanitized?: any): ValidationResult {
    return new ValidationResult(true, [], sanitized);
  }

  static failure(errors: ValidationError[]): ValidationResult {
    return new ValidationResult(false, errors);
  }
}

/**
 * Validate chat message input
 */
export function validateChatMessage(input: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Check message exists
  if (!input.message) {
    errors.push({
      field: 'message',
      message: 'Message is required',
    });
  }

  // Check message type
  if (typeof input.message !== 'string') {
    errors.push({
      field: 'message',
      message: 'Message must be a string',
      value: typeof input.message,
    });
  }

  // Check message length
  if (input.message && input.message.length < VALIDATION_LIMITS.MIN_MESSAGE_LENGTH) {
    errors.push({
      field: 'message',
      message: `Message is too short (min ${VALIDATION_LIMITS.MIN_MESSAGE_LENGTH} character)`,
      value: input.message.length,
    });
  }

  if (input.message && input.message.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH) {
    errors.push({
      field: 'message',
      message: `Message is too long (max ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} characters)`,
      value: input.message.length,
    });
  }

  // Check session ID
  if (!input.sessionId) {
    errors.push({
      field: 'sessionId',
      message: 'Session ID is required',
    });
  }

  if (input.sessionId && typeof input.sessionId !== 'string') {
    errors.push({
      field: 'sessionId',
      message: 'Session ID must be a string',
      value: typeof input.sessionId,
    });
  }

  if (input.sessionId && input.sessionId.length > VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH) {
    errors.push({
      field: 'sessionId',
      message: `Session ID is too long (max ${VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH} characters)`,
      value: input.sessionId.length,
    });
  }

  // Validate history if provided
  if (input.history !== undefined) {
    if (!Array.isArray(input.history)) {
      errors.push({
        field: 'history',
        message: 'History must be an array',
        value: typeof input.history,
      });
    } else if (input.history.length > VALIDATION_LIMITS.MAX_HISTORY_LENGTH) {
      // Don't error, just truncate and warn
      console.warn(
        `[Validation] History too long (${input.history.length} turns), truncating to ${VALIDATION_LIMITS.MAX_HISTORY_LENGTH}`
      );
    }
  }

  if (errors.length > 0) {
    return ValidationResult.failure(errors);
  }

  // Sanitize and return
  const sanitized = {
    message: input.message.trim(),
    sessionId: input.sessionId.trim(),
    history: Array.isArray(input.history)
      ? input.history.slice(-VALIDATION_LIMITS.MAX_HISTORY_LENGTH) // Keep only last N turns
      : [],
  };

  return ValidationResult.success(sanitized);
}

/**
 * Validate session ID format
 */
export function validateSessionId(sessionId: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!sessionId || typeof sessionId !== 'string') {
    errors.push({
      field: 'sessionId',
      message: 'Valid session ID is required',
      value: sessionId,
    });
  }

  if (sessionId && sessionId.length > VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH) {
    errors.push({
      field: 'sessionId',
      message: `Session ID is too long (max ${VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH} characters)`,
      value: sessionId.length,
    });
  }

  // Check for suspicious patterns
  if (sessionId && /[<>\"'&]/.test(sessionId)) {
    errors.push({
      field: 'sessionId',
      message: 'Session ID contains invalid characters',
      value: sessionId,
    });
  }

  if (errors.length > 0) {
    return ValidationResult.failure(errors);
  }

  return ValidationResult.success(sessionId.trim());
}

/**
 * Sanitize message content to prevent injection attacks
 */
export function sanitizeMessage(message: string): string {
  // Remove control characters except newlines and tabs
  let sanitized = message.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize whitespace
  sanitized = sanitized.trim();

  // Remove excessive newlines (max 3 consecutive)
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

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
  maxTokens: number = 3000
): ValidationResult {
  const messageTokens = estimateTokens(message);
  const historyText = history
    .map((h) => (h.content || '').toString())
    .join(' ');
  const historyTokens = estimateTokens(historyText);

  const totalEstimate = messageTokens + historyTokens;

  if (totalEstimate > maxTokens) {
    return ValidationResult.failure([
      {
        field: 'tokens',
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
  status: number = 400
): Response {
  return Response.json(
    {
      error: 'Validation failed',
      details: errors,
    },
    { status }
  );
}
