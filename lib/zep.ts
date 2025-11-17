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
    return { context: contextBlock, userSummary: contextBlock };
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
    if (error?.statusCode === 404) {
      try {
        await ensureThreadExists(client, sessionId);
        await client.thread.addMessages(sessionId, { messages });
        return;
      } catch (creationError) {
        console.warn("[Zep] thread creation failed", creationError);
      }
    }
    console.warn("[Zep] thread.addMessages failed", error);
  }
}

export async function queryZepGraphContext(
  question: string,
  userId?: string,
): Promise<string> {
  const client = getZepClient();
  if (!client) {
    return "Graph memory is not configured.";
  }
  try {
    const result = await client.graph.search({
      query: question,
      userId,
      graphId: process.env.ZEP_CATALOG_GRAPH_ID,
      limit: 10,
    });
    const summary = summarizeGraphResults(result);
    return summary || "No structured data found for that question.";
  } catch (error) {
    console.error("[Zep] graph.search failed", error);
    return "Encountered an issue retrieving structured data.";
  }
}

function summarizeGraphResults(result: any): string {
  if (!result) return "";
  const sections: string[] = [];

  if (Array.isArray(result.nodes) && result.nodes.length) {
    const nodeLines = result.nodes.slice(0, 3).map((node: any) => {
      const labels = Array.isArray(node.labels) ? node.labels.join(", ") : "node";
      const summary = node.summary ? ` — ${truncate(node.summary, 140)}` : "";
      return `- ${node.name} (${labels})${summary}`;
    });
    sections.push(`Nodes:\n${nodeLines.join("\n")}`);
  }

  if (Array.isArray(result.edges) && result.edges.length) {
    const edgeLines = result.edges.slice(0, 3).map((edge: any) => {
      const fact = edge.fact || edge.name || "Relation";
      return `- ${truncate(fact, 160)}`;
    });
    sections.push(`Facts:\n${edgeLines.join("\n")}`);
  }

  if (Array.isArray(result.episodes) && result.episodes.length) {
    const episodeLines = result.episodes
      .slice(0, 2)
      .map((episode: any) => `- ${truncate(episode.content || "", 160)}`);
    sections.push(`Supporting notes:\n${episodeLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
