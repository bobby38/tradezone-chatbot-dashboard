export interface ToolUsageSummary {
  name: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  error?: string;
}

export interface AgentTelemetryEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  prompt: string;
  responsePreview: string;
  model: string;
  toolCalls: ToolUsageSummary[];
  historyLength: number;
}

const TELEMETRY_BUFFER: AgentTelemetryEntry[] = [];
const BUFFER_LIMIT = 100;

function createId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function recordAgentTelemetry(entry: Omit<AgentTelemetryEntry, "id">) {
  const item: AgentTelemetryEntry = { ...entry, id: createId() };
  TELEMETRY_BUFFER.unshift(item);
  if (TELEMETRY_BUFFER.length > BUFFER_LIMIT) {
    TELEMETRY_BUFFER.length = BUFFER_LIMIT;
  }
}

export function getAgentTelemetry(limit = 20): AgentTelemetryEntry[] {
  return TELEMETRY_BUFFER.slice(0, limit);
}

