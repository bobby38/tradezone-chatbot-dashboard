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
    const memory = await client.memory.get(sessionId, {
      max_tokens: 600,
      include_user_summary: true,
    });
    return {
      context: memory?.context || "",
      userSummary: memory?.user_summary || "",
    };
  } catch (error) {
    console.warn("[Zep] memory.get failed", error);
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

  const messages: Array<{
    role: string;
    role_type: "user" | "assistant" | "system";
    content: string;
  }> = [
    {
      role: "Customer",
      role_type: "user",
      content: userContent,
    },
  ];

  if (assistantContent) {
    messages.push({
      role: "TradeZone Assistant",
      role_type: "assistant",
      content: assistantContent,
    });
  }

  try {
    await client.memory.add(sessionId, { messages });
  } catch (error) {
    console.warn("[Zep] memory.add failed", error);
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
    const result = await client.graph.query({
      question,
      user_id: userId,
      max_tokens: 500,
    });
    return result?.context || "No structured data found for that question.";
  } catch (error) {
    console.error("[Zep] graph.query failed", error);
    return "Encountered an issue retrieving structured data.";
  }
}
