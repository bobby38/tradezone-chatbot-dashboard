import { ZepClient } from "@getzep/zep-cloud";

let cachedClient: ZepClient | null = null;

function getZepClient(): ZepClient | null {
  if (!process.env.ZEP_API_KEY) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new ZepClient({
      apiKey: process.env.ZEP_API_KEY,
    });
  }
  return cachedClient;
}

const DEFAULT_ZEP_USER_ID =
  process.env.ZEP_USER_ID || process.env.ZEP_CATALOG_GRAPH_ID;

function truncate(text: string, max = 200) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function ensureThreadExists(client: ZepClient, threadId: string) {
  try {
    await client.thread.get(threadId, { limit: 1 });
    return;
  } catch (error: any) {
    if (error?.statusCode !== 404) {
      throw error;
    }
  }

  const userId = DEFAULT_ZEP_USER_ID || threadId;
  await client.thread.create({
    threadId,
    userId,
  });
}

export interface ZepContextResult {
  context: string;
  userSummary: string;
  metadata?: Record<string, any>;
}

export interface ZepGraphNodeSummary {
  id?: string;
  name?: string;
  labels?: string[];
  data: Record<string, any>;
  summary?: string;
}

export interface ZepGraphQueryResult {
  summary: string;
  nodes: ZepGraphNodeSummary[];
  facts: string[];
  rateLimited?: boolean;
}

export async function fetchZepContext(
  sessionId: string,
): Promise<ZepContextResult> {
  const client = getZepClient();
  if (!client) {
    return { context: "", userSummary: "" };
  }

  try {
    const response = await client.thread.getUserContext(sessionId, {
      mode: "summary",
    });
    const contextBlock = response?.context || "";
    const summaryBlock =
      typeof (response as any)?.summary === "string"
        ? (response as any).summary
        : Array.isArray((response as any)?.summaries)
          ? (response as any).summaries.join("\n")
          : contextBlock;
    return {
      context: contextBlock,
      userSummary: summaryBlock,
      metadata: (response as any)?.metadata,
    };
  } catch (error) {
    if ((error as any)?.statusCode === 404) {
      return { context: "", userSummary: "" };
    }
    console.warn("[Zep] thread.getUserContext failed", error);
    return { context: "", userSummary: "" };
  }
}

export async function addZepMemoryTurn(
  sessionId: string,
  userContent: string,
  assistantContent?: string,
): Promise<void> {
  const client = getZepClient();
  if (!client) return;

  const messages = [
    {
      role: "user" as const,
      name: "Customer",
      content: userContent,
    },
  ];

  if (assistantContent) {
    messages.push({
      role: "assistant" as const,
      name: "TradeZone Assistant",
      content: assistantContent,
    });
  }

  try {
    await client.thread.addMessages(sessionId, {
      messages,
    });
  } catch (error: any) {
    // Handle account quota exceeded (403)
    if (error?.statusCode === 403) {
      console.warn(
        `[Zep] ⚠️  Account quota exceeded (${error?.body?.message || "forbidden"}). Skipping memory storage for session ${sessionId}.`,
      );
      return; // Gracefully skip - conversation continues without Zep memory
    }

    // Handle thread not found (404)
    if (error?.statusCode === 404) {
      try {
        await ensureThreadExists(client, sessionId);
        await client.thread.addMessages(sessionId, { messages });
        return;
      } catch (creationError: any) {
        // Check if creation also failed due to quota
        if (creationError?.statusCode === 403) {
          console.warn(
            `[Zep] ⚠️  Account quota exceeded during thread creation. Skipping memory for session ${sessionId}.`,
          );
          return;
        }
        console.warn("[Zep] thread creation failed", creationError);
      }
    }
    console.warn("[Zep] thread.addMessages failed", error);
  }
}

export async function queryZepGraphContext(
  question: string,
  userId?: string,
): Promise<ZepGraphQueryResult> {
  const client = getZepClient();
  if (!client) {
    return {
      summary: "Graph memory is not configured.",
      nodes: [],
      facts: [],
    };
  }
  try {
    const result = await client.graph.search({
      query: question,
      userId,
      graphId: process.env.ZEP_CATALOG_GRAPH_ID,
      limit: 10,
    });
    const normalized = normalizeGraphResults(result);
    if (!normalized.summary) {
      normalized.summary = "No structured data found for that question.";
    }
    return normalized;
  } catch (error) {
    console.error("[Zep] graph.search failed", error);
    const statusCode = (error as any)?.statusCode;
    return {
      summary:
        statusCode === 429
          ? "Structured catalog is cooling down."
          : "Encountered an issue retrieving structured data.",
      nodes: [],
      facts: [],
      rateLimited: statusCode === 429,
    };
  }
}

function normalizeGraphResults(result: any): ZepGraphQueryResult {
  if (!result) {
    return { summary: "", nodes: [], facts: [] };
  }

  const nodes = Array.isArray(result.nodes)
    ? result.nodes.slice(0, 10).map(normalizeGraphNode)
    : [];
  const facts = Array.isArray(result.edges)
    ? result.edges
        .slice(0, 5)
        .map((edge: any) => truncate(edge.fact || edge.name || "Relation", 160))
    : [];
  const supporting = Array.isArray(result.episodes)
    ? result.episodes
        .slice(0, 2)
        .map((episode: any) => truncate(episode.content || "", 160))
    : [];

  const sections: string[] = [];
  if (nodes.length) {
    const nodeLines = nodes.slice(0, 3).map((node) => {
      const labels =
        Array.isArray(node.labels) && node.labels.length
          ? node.labels.join(", ")
          : node.data.kind || "node";
      const summary = node.summary ? ` — ${truncate(node.summary, 140)}` : "";
      return `- ${node.name || node.data.title || node.data.modelId || "node"} (${labels})${summary}`;
    });
    sections.push(`Nodes:\n${nodeLines.join("\n")}`);
  }
  if (facts.length) {
    sections.push(`Facts:\n${facts.map((fact) => `- ${fact}`).join("\n")}`);
  }
  if (supporting.length) {
    sections.push(
      `Supporting notes:\n${supporting.map((note) => `- ${note}`).join("\n")}`,
    );
  }

  return {
    summary: sections.join("\n\n"),
    nodes,
    facts,
  };
}

function normalizeGraphNode(raw: any): ZepGraphNodeSummary {
  const payload = extractNodePayload(raw);
  const name =
    raw?.name || payload.title || payload.modelId || payload.familyTitle;
  return {
    id: raw?.id || payload.modelId || payload.id,
    name,
    labels: Array.isArray(raw?.labels) ? raw.labels : payload.labels,
    data: payload,
    summary: raw?.summary || payload.summary,
  };
}

function extractNodePayload(raw: any): Record<string, any> {
  const candidates = [
    raw?.data?.json,
    raw?.data,
    raw?.properties?.json,
    raw?.properties,
    raw?.metadata,
  ];
  for (const candidate of candidates) {
    const parsed = safeParse(candidate);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, any>;
    }
  }
  return {};
}

function safeParse(value: any): unknown {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value;
  }
  return null;
}
