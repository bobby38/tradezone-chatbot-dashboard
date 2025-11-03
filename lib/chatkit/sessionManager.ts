import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionContext {
  sessionId: string;
  userId: string;
  source: string;
  sessionName?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
}

export interface EnsureSessionResult {
  sessionName: string | null;
}

function mergeMetadata(
  existing: Record<string, any> | null,
  incoming: Record<string, any> | null,
): Record<string, any> | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming;
  if (!incoming) return existing;
  return { ...existing, ...incoming };
}

/**
 * Ensures a chat session row exists (or updates metadata if already present).
 */
export async function ensureSession(
  client: SupabaseClient,
  context: SessionContext,
): Promise<EnsureSessionResult> {
  const now = new Date().toISOString();
  const sessionNameCandidate = context.sessionName
    ? context.sessionName.slice(0, 120)
    : null;

  const { data: existingSession, error: fetchError } = await client
    .from("chat_sessions")
    .select("session_name, metadata, user_ip, user_agent")
    .eq("session_id", context.sessionId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingSession) {
    await client.from("chat_sessions").insert({
      session_id: context.sessionId,
      user_id: context.userId,
      session_name: sessionNameCandidate,
      started_at: now,
      last_activity: now,
      total_messages: 0,
      source: context.source,
      user_ip: context.clientIp ?? null,
      user_agent: context.userAgent ?? null,
      metadata: context.metadata ?? null,
    });

    return {
      sessionName: sessionNameCandidate,
    };
  }

  const mergedMetadata = mergeMetadata(
    (existingSession.metadata as Record<string, any> | null) ?? null,
    context.metadata ?? null,
  );

  const updatePayload: Record<string, any> = {
    last_activity: now,
    updated_at: now,
    source: context.source,
  };

  if (!existingSession.session_name && sessionNameCandidate) {
    updatePayload.session_name = sessionNameCandidate;
  }

  if (context.clientIp) {
    updatePayload.user_ip = context.clientIp;
  }

  if (context.userAgent) {
    updatePayload.user_agent = context.userAgent;
  }

  if (mergedMetadata) {
    updatePayload.metadata = mergedMetadata;
  }

  await client
    .from("chat_sessions")
    .update(updatePayload)
    .eq("session_id", context.sessionId);

  return {
    sessionName: existingSession.session_name ?? sessionNameCandidate ?? null,
  };
}

/**
 * Returns the next turn index for the given session.
 */
export async function getNextTurnIndex(
  client: SupabaseClient,
  sessionId: string,
): Promise<number> {
  const { count, error } = await client
    .from("chat_logs")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return (count ?? 0) + 1;
}
