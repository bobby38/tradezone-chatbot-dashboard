// RequestInit is a global type from the Fetch API - no import needed

type GraphitiConfig = {
  baseUrl: string;
  apiKey: string;
};

export interface GraphitiContextResult {
  context: string;
  userSummary: string;
  metadata?: Record<string, any>;
}

export interface GraphitiFact {
  uuid: string;
  name: string;
  fact: string;
  valid_at?: string | null;
  invalid_at?: string | null;
  created_at?: string;
  expired_at?: string | null;
}

interface GraphitiSearchResponse {
  facts: GraphitiFact[];
}

interface GraphitiEpisodeResponse {
  uuid?: string;
  content?: string;
  source_description?: string;
  created_at?: string;
}

export type GraphitiNodeSummary = {
  id?: string;
  name?: string;
  labels?: string[];
  data: Record<string, any>;
  summary?: string;
};

export interface GraphitiQueryResult {
  summary: string;
  nodes: GraphitiNodeSummary[];
  facts: GraphitiFact[];
  rateLimited?: boolean;
}

function resolveGraphitiConfig(): GraphitiConfig | null {
  const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.GRAPHTI_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }
  return { baseUrl, apiKey };
}

async function graphitiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const config = resolveGraphitiConfig();
  if (!config) {
    throw new Error(
      "Graphiti is not configured. Set GRAPHTI_BASE_URL and GRAPHTI_API_KEY.",
    );
  }
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    ...(init.headers || {}),
  } as Record<string, string>;

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[Graphiti] Request failed (${response.status} ${response.statusText}): ${body || "no body"}`,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export async function fetchGraphitiContext(
  sessionId: string,
): Promise<GraphitiContextResult> {
  const config = resolveGraphitiConfig();
  if (!config) {
    return { context: "", userSummary: "" };
  }
  try {
    const episodes = await graphitiFetch<GraphitiEpisodeResponse[]>(
      `/episodes/${encodeURIComponent(sessionId)}?last_n=8`,
      { method: "GET" },
    );
    if (!Array.isArray(episodes) || episodes.length === 0) {
      return { context: "", userSummary: "" };
    }
    const lines = episodes
      .map((episode) => {
        const content = episode.content?.trim();
        if (!content) return null;
        const stamp = episode.created_at
          ? ` (${new Date(episode.created_at).toISOString()})`
          : "";
        return `${content}${stamp}`.trim();
      })
      .filter(Boolean) as string[];
    const context = lines.join("\n");
    const summary = lines.slice(-3).join("\n");
    return { context, userSummary: summary || context };
  } catch (error) {
    console.warn("[Graphiti] Failed to fetch memory context", error);
    return { context: "", userSummary: "" };
  }
}

export async function addGraphitiMemoryTurn(
  sessionId: string,
  userContent: string,
  assistantContent?: string,
): Promise<void> {
  const config = resolveGraphitiConfig();
  if (!config) return;

  const messages = [
    buildGraphitiMessage({
      content: userContent,
      roleType: "user",
      roleName: "Customer",
    }),
  ];
  if (assistantContent) {
    messages.push(
      buildGraphitiMessage({
        content: assistantContent,
        roleType: "assistant",
        roleName: "TradeZone Assistant",
      }),
    );
  }

  try {
    await graphitiFetch("/messages", {
      method: "POST",
      body: JSON.stringify({
        group_id: sessionId,
        messages,
      }),
    });
  } catch (error) {
    console.warn("[Graphiti] Failed to store memory turn", error);
  }
}

export async function queryGraphitiContext(
  question: string,
  options?: { groupId?: string; maxFacts?: number },
): Promise<GraphitiQueryResult> {
  const config = resolveGraphitiConfig();
  if (!config) {
    return {
      summary: "Graphiti is not configured.",
      nodes: [],
      facts: [],
    };
  }
  const maxFacts = Math.min(Math.max(options?.maxFacts ?? 10, 1), 20);
  const body: Record<string, unknown> = {
    query: question,
    max_facts: maxFacts,
  };
  const groupId = options?.groupId || process.env.GRAPHTI_DEFAULT_GROUP_ID;
  if (groupId) {
    body.group_ids = [groupId];
  }

  try {
    const response = await graphitiFetch<GraphitiSearchResponse>("/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const facts = Array.isArray(response.facts) ? response.facts : [];
    const nodes = facts.map(convertFactToNode);
    const summary = facts.length
      ? facts
          .slice(0, 3)
          .map((fact) => `• ${fact.name || "fact"}: ${fact.fact}`)
          .join("\n")
      : "No structured data found for that question.";

    return {
      summary,
      nodes,
      facts,
    };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Graphiti] search failed", message);
    return {
      summary: "Encountered an issue retrieving structured data.",
      nodes: [],
      facts: [],
    };
  }
}

function buildGraphitiMessage(params: {
  content: string;
  roleType: "user" | "assistant" | "system";
  roleName: string;
}) {
  return {
    content: params.content,
    role_type: params.roleType,
    role: params.roleName,
    name: params.roleName,
    timestamp: new Date().toISOString(),
    source_description: "chatkit",
  };
}

function convertFactToNode(fact: GraphitiFact): GraphitiNodeSummary {
  const kind = detectFactKind(fact);
  const price = extractPriceFromText(fact.fact);
  const metadata: Record<string, any> = {};
  if (price !== null) {
    if (kind === "trade_in") {
      metadata.trade_in_value_min_sgd = price;
      metadata.trade_in_value_max_sgd = price;
    } else {
      metadata.target_price_sgd = price;
    }
  }
  return {
    id: fact.uuid,
    name: fact.name,
    labels: ["graphiti_fact"],
    summary: fact.fact,
    data: {
      kind,
      fact: fact.fact,
      title: fact.name,
      modelId: fact.name,
      metadata,
      valid_at: fact.valid_at,
      invalid_at: fact.invalid_at,
      created_at: fact.created_at,
      expired_at: fact.expired_at,
    },
  };
}

function detectFactKind(fact: GraphitiFact): "trade_in" | "target" | "fact" {
  const normalized = fact.fact?.toLowerCase() || "";
  if (/trade[-\s]?in|trade\s*value|trade\s*up/.test(normalized)) {
    return "trade_in";
  }
  if (/retail|price|sell|available|cost|top[-\s]?up/.test(normalized)) {
    return "target";
  }
  return "fact";
}

function extractPriceFromText(text: string): number | null {
  if (!text) return null;
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:S?\$)\s*(\d{2,6})(?:\.\d+)?/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  const fallback = normalized.match(/\b(\d{3,6})\b/);
  if (fallback) {
    const value = Number(fallback[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}
