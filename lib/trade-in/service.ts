import { randomUUID } from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EmailService } from "@/lib/email-service";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FALLBACK_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

const isValidUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );

const resolveOrgId = () => {
  const envOrgId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
  if (!envOrgId) {
    return FALLBACK_ORG_ID;
  }

  if (isValidUuid(envOrgId)) {
    return envOrgId;
  }

  console.warn(
    "[TradeIn] NEXT_PUBLIC_DEFAULT_ORG_ID is not a valid UUID, falling back to default organization",
    { envOrgId },
  );

  return FALLBACK_ORG_ID;
};

const DEFAULT_ORG_ID = resolveOrgId();

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing Supabase configuration. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export class TradeInValidationError extends Error {
  fields?: string[];
  constructor(message: string, fields?: string[]) {
    super(message);
    this.name = "TradeInValidationError";
    this.fields = fields;
  }
}

const ARRAY_FIELDS = new Set(["defects", "accessories"]);
const NUMERIC_FIELDS = new Set(["price_hint", "range_min", "range_max"]);
const DATE_FIELDS = new Set(["last_contacted_at", "follow_up_at"]);
const ENUM_FIELDS = new Set([
  "status",
  "condition",
  "preferred_payout",
  "preferred_fulfilment",
  "channel",
]);
const TEXT_FIELDS = new Set([
  "category",
  "brand",
  "model",
  "storage",
  "pricing_version",
  "contact_name",
  "contact_phone",
  "contact_email",
  "telegram_handle",
  "source_message_summary",
  "notes",
  "session_id",
  "organization_id",
]);

const SUPPORTED_FIELDS = new Set(
  Array.from(ARRAY_FIELDS)
    .concat(Array.from(NUMERIC_FIELDS))
    .concat(Array.from(DATE_FIELDS))
    .concat(Array.from(ENUM_FIELDS))
    .concat(Array.from(TEXT_FIELDS)),
);

export type TradeInChannel = "chat" | "web_form" | "manual" | "import";

export interface EnsureTradeInLeadParams {
  sessionId: string;
  leadHash?: string;
  channel?: TradeInChannel;
  organizationId?: string;
  initialMessage?: string;
  source?: string;
}

export interface EnsureTradeInLeadResult {
  leadId: string;
  status: string;
  created: boolean;
}

export interface TradeInUpdateInput {
  [key: string]: unknown;
  category?: string;
  brand?: string;
  model?: string;
  storage?: string;
  condition?: string;
  defects?: string[];
  accessories?: string[];
  purchase_year?: number;
  price_hint?: number | string | null;
  range_min?: number | string | null;
  range_max?: number | string | null;
  pricing_version?: string;
  preferred_payout?: string;
  preferred_fulfilment?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  telegram_handle?: string;
  notes?: string;
  status?: string;
  last_contacted_at?: string;
  follow_up_at?: string;
  source_message_summary?: string;
}

export interface TradeInSubmitInput {
  leadId: string;
  summary?: string | null;
  status?: string;
  notify?: boolean;
}

export async function ensureTradeInLead(
  params: EnsureTradeInLeadParams,
): Promise<EnsureTradeInLeadResult> {
  const leadHash = (params.leadHash || params.sessionId || "")
    .trim()
    .toLowerCase();

  if (!leadHash) {
    throw new TradeInValidationError("Lead hash or session id is required");
  }

  const { data: existingLead, error: existingError } = await supabaseAdmin
    .from("trade_in_leads")
    .select("id, status")
    .eq("lead_hash", leadHash)
    .not("status", "in", "(completed,closed,archived)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Trade-in lead lookup failed: ${existingError.message}`);
  }

  if (existingLead) {
    return {
      leadId: existingLead.id,
      status: existingLead.status,
      created: false,
    };
  }

  const insertPayload = {
    organization_id: params.organizationId || DEFAULT_ORG_ID,
    channel: params.channel || "chat",
    session_id: params.sessionId,
    lead_hash: leadHash,
    source_message_summary: params.initialMessage
      ? params.initialMessage.slice(0, 500)
      : null,
  };

  const { data: createdLead, error: insertError } = await supabaseAdmin
    .from("trade_in_leads")
    .insert(insertPayload)
    .select("id, status")
    .single();

  if (insertError || !createdLead) {
    throw new Error(
      `Failed to create trade-in lead: ${insertError?.message ?? "unknown error"}`,
    );
  }

  await supabaseAdmin.from("trade_in_actions").insert({
    lead_id: createdLead.id,
    action_type: "note",
    payload: {
      message: "Lead created via trade-in flow",
      channel: params.channel || "chat",
      sessionId: params.sessionId,
      source: params.source || null,
    },
  });

  return { leadId: createdLead.id, status: createdLead.status, created: true };
}

function normalizePatch(patch: TradeInUpdateInput) {
  const updatePayload: Record<string, any> = {};
  const invalidFields: string[] = [];
  const actions: Array<{ type: string; payload: Record<string, any> }> = [];

  Object.entries(patch).forEach(([key, value]) => {
    if (!SUPPORTED_FIELDS.has(key)) {
      invalidFields.push(key);
      return;
    }

    if (value === undefined) return;

    if (ARRAY_FIELDS.has(key)) {
      if (Array.isArray(value)) {
        updatePayload[key] = value;
      } else if (value === null) {
        updatePayload[key] = [];
      } else {
        invalidFields.push(key);
      }
      return;
    }

    if (NUMERIC_FIELDS.has(key)) {
      if (value === null || value === "") {
        updatePayload[key] = null;
      } else {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          invalidFields.push(key);
          return;
        }
        updatePayload[key] = num;
      }
      return;
    }

    if (DATE_FIELDS.has(key)) {
      if (!value) {
        updatePayload[key] = null;
      } else {
        const date = new Date(value as string);
        if (Number.isNaN(date.valueOf())) {
          invalidFields.push(key);
          return;
        }
        updatePayload[key] = date.toISOString();
      }
      return;
    }

    updatePayload[key] = value ?? null;
  });

  if (typeof patch.notes === "string" && patch.notes.trim().length > 0) {
    actions.push({ type: "note", payload: { message: patch.notes } });
  }

  return { updatePayload, invalidFields, actions };
}

export async function updateTradeInLead(
  leadId: string,
  patch: TradeInUpdateInput,
): Promise<{ lead: any; actionsLogged: number; previousStatus?: string }> {
  if (!leadId) {
    throw new TradeInValidationError("leadId is required");
  }

  const { updatePayload, invalidFields, actions } = normalizePatch(patch);

  if (invalidFields.length > 0) {
    throw new TradeInValidationError(
      `Invalid fields: ${invalidFields.join(", ")}`,
      invalidFields,
    );
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new TradeInValidationError("No valid fields provided");
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("trade_in_leads")
    .select("status")
    .eq("id", leadId)
    .single();

  if (fetchError || !existing) {
    throw new Error(
      `Trade-in lead not found: ${fetchError?.message ?? "unknown error"}`,
    );
  }

  const previousStatus = existing.status;

  const { data: updatedLead, error: updateError } = await supabaseAdmin
    .from("trade_in_leads")
    .update(updatePayload)
    .eq("id", leadId)
    .select()
    .single();

  if (updateError || !updatedLead) {
    throw new Error(
      `Failed to update trade-in lead: ${updateError?.message ?? "unknown error"}`,
    );
  }

  let actionsLogged = 0;
  const actionPayloads: Record<string, any>[] = [];

  if (updatePayload.status && updatePayload.status !== previousStatus) {
    actionPayloads.push({
      lead_id: leadId,
      action_type: "status_change",
      payload: {
        from: previousStatus,
        to: updatePayload.status,
      },
    });
  }

  actions.forEach((action) => {
    actionPayloads.push({
      lead_id: leadId,
      action_type: action.type,
      payload: action.payload,
    });
  });

  if (actionPayloads.length > 0) {
    const { error: actionError } = await supabaseAdmin
      .from("trade_in_actions")
      .insert(actionPayloads);

    if (actionError) {
      console.error("[trade-in] Failed to log actions", actionError);
    } else {
      actionsLogged = actionPayloads.length;
    }
  }

  return { lead: updatedLead, actionsLogged, previousStatus };
}

export async function createTradeInUploadUrl(params: {
  leadId: string;
  path?: string;
  mimeType: string;
}): Promise<{ uploadUrl: string; path: string; bucket: string }> {
  if (!params.leadId) {
    throw new TradeInValidationError("leadId is required");
  }

  const bucket = "tradein-media";
  const filePath = params.path || `tradein/${params.leadId}/${randomUUID()}`;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(filePath);

  if (error || !data) {
    throw new Error(
      `Failed to create upload URL: ${error?.message ?? "unknown error"}`,
    );
  }

  return { uploadUrl: data.signedUrl, path: filePath, bucket };
}

export async function submitTradeInLead(
  input: TradeInSubmitInput,
): Promise<{ lead: any; emailSent: boolean }> {
  console.log("[TradeIn] ========== SUBMIT TRADE-IN LEAD ==========");
  console.log("[TradeIn] Input:", JSON.stringify(input, null, 2));

  if (!input.leadId) {
    throw new TradeInValidationError("leadId is required");
  }

  console.log("[TradeIn] Fetching lead:", input.leadId);

  const { data: lead, error } = await supabaseAdmin
    .from("trade_in_leads")
    .select(
      `id, status, channel, category, brand, model, storage, condition,
       defects, accessories, purchase_year, price_hint, range_min, range_max,
       pricing_version, preferred_payout, preferred_fulfilment, contact_name,
       contact_phone, contact_email, telegram_handle, notes, session_id,
       source_message_summary, created_at`,
    )
    .eq("id", input.leadId)
    .single();

  if (error || !lead) {
    console.error("[TradeIn] Lead not found:", error);
    throw new Error(
      `Trade-in lead not found: ${error?.message ?? "unknown error"}`,
    );
  }

  console.log("[TradeIn] Lead loaded:", {
    id: lead.id,
    contact: lead.contact_name,
    email: lead.contact_email,
    device: `${lead.brand} ${lead.model}`,
    status: lead.status,
  });

  const patch: TradeInUpdateInput = {};
  if (input.summary) {
    patch.notes = input.summary;
  }
  if (input.status) {
    patch.status = input.status;
  }

  if (Object.keys(patch).length > 0) {
    await updateTradeInLead(input.leadId, patch);
  }

  let emailSent = false;
  if (input.notify !== false) {
    console.log("[TradeIn] Notification enabled, fetching media...");

    const { data: media } = await supabaseAdmin
      .from("trade_in_media")
      .select("id, media_type, url, mime_type, size_bytes, created_at")
      .eq("lead_id", input.leadId)
      .order("created_at", { ascending: true });

    console.log("[TradeIn] Media found:", media?.length || 0, "files");

    const formData = {
      name: lead.contact_name || "Not provided",
      email: lead.contact_email || "Not provided",
      phone: lead.contact_phone || "Not provided",
      telegram: lead.telegram_handle || "Not provided",
      device_type: lead.category || "Not specified",
      console_type:
        [lead.brand, lead.model].filter(Boolean).join(" ") || "Not specified",
      storage: lead.storage || "Not specified",
      condition: lead.condition || "Not specified",
      accessories: Array.isArray(lead.accessories) ? lead.accessories : [],
      defects: Array.isArray(lead.defects) ? lead.defects : [],
      purchase_year: lead.purchase_year || "Not specified",
      price_hint: lead.price_hint || null,
      price_range:
        lead.range_min && lead.range_max
          ? `${lead.range_min} - ${lead.range_max}`
          : null,
      pricing_version: lead.pricing_version || "Not set",
      preferred_payout: lead.preferred_payout || "Not specified",
      preferred_fulfilment: lead.preferred_fulfilment || "Not specified",
      channel: lead.channel,
      session_id: lead.session_id,
      summary:
        input.summary || lead.notes || lead.source_message_summary || null,
      media: media || [],
    };

    console.log("[TradeIn] Sending email notification...");
    console.log("[TradeIn] Form data:", JSON.stringify(formData, null, 2));

    try {
      emailSent = await EmailService.sendFormNotification({
        type: "trade-in",
        submissionId: input.leadId,
        formData,
        submittedAt: new Date().toISOString(),
      });

      console.log("[TradeIn] Email sent:", emailSent);
    } catch (emailError) {
      console.error("[TradeIn] Email send failed:", emailError);
      emailSent = false;
    }

    await supabaseAdmin.from("trade_in_actions").insert({
      lead_id: input.leadId,
      action_type: emailSent ? "email_sent" : "email_failed",
      payload: {
        type: "trade-in",
        status: emailSent ? "sent" : "failed",
        summary: input.summary || null,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(
      "[TradeIn] Action logged:",
      emailSent ? "email_sent" : "email_failed",
    );
  } else {
    console.log("[TradeIn] Notification disabled (notify=false)");
  }

  console.log("[TradeIn] ========== SUBMISSION COMPLETE ==========");
  console.log("[TradeIn] Result: { emailSent:", emailSent, "}");

  return { lead, emailSent };
}

export async function recordTradeInMediaEntry(params: {
  leadId: string;
  mediaType: "image" | "video" | "document";
  url: string;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}) {
  const { error } = await supabaseAdmin.from("trade_in_media").insert({
    lead_id: params.leadId,
    media_type: params.mediaType,
    url: params.url,
    thumbnail_url: params.thumbnailUrl || null,
    mime_type: params.mimeType || null,
    size_bytes: params.sizeBytes || null,
    width: params.width || null,
    height: params.height || null,
  });

  if (error) {
    throw new Error(`Failed to record media entry: ${error.message}`);
  }
}

export function getSupabaseAdminClient() {
  return supabaseAdmin;
}

export async function listTradeInLeads(
  options: {
    status?: string;
    limit?: number;
    search?: string;
  } = {},
) {
  const query = supabaseAdmin
    .from("trade_in_leads")
    .select(
      `id, created_at, updated_at, status, channel, brand, model, storage, condition,
       range_min, range_max, preferred_payout, preferred_fulfilment,
       contact_name, contact_phone, contact_email`,
    )
    .order("created_at", { ascending: false });

  if (options.status && options.status !== "all") {
    query.eq("status", options.status);
  }

  if (options.limit) {
    query.limit(options.limit);
  } else {
    query.limit(100);
  }

  if (options.search) {
    const like = `%${options.search.toLowerCase()}%`;
    query.or(
      `brand.ilike.${like},model.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load trade-in leads: ${error.message}`);
  }

  return data;
}

export async function getTradeInLeadDetail(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("trade_in_leads")
    .select(
      `*,
      trade_in_media (*),
      trade_in_actions (* )`,
    )
    .eq("id", leadId)
    .single();

  if (error || !data) {
    throw new Error(`Lead not found: ${error?.message ?? "unknown"}`);
  }

  const media = Array.isArray(data.trade_in_media)
    ? data.trade_in_media.sort(
        (a: any, b: any) =>
          new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf(),
      )
    : [];

  const actions = Array.isArray(data.trade_in_actions)
    ? data.trade_in_actions.sort(
        (a: any, b: any) =>
          new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf(),
      )
    : [];

  return {
    ...data,
    trade_in_media: media,
    trade_in_actions: actions,
  };
}

export async function createSignedMediaUrl(params: {
  path: string;
  expiresIn?: number;
}) {
  const { data, error } = await supabaseAdmin.storage
    .from("tradein-media")
    .createSignedUrl(params.path, params.expiresIn ?? 3600);

  if (error || !data) {
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? "unknown"}`,
    );
  }

  return data.signedUrl;
}

export async function deleteTradeInLead(leadId: string): Promise<void> {
  if (!leadId) {
    throw new TradeInValidationError("leadId is required");
  }

  // First delete associated media from storage
  const { data: mediaEntries } = await supabaseAdmin
    .from("trade_in_media")
    .select("url")
    .eq("lead_id", leadId);

  if (mediaEntries && mediaEntries.length > 0) {
    const filePaths = mediaEntries.map((m) => m.url);
    await supabaseAdmin.storage.from("tradein-media").remove(filePaths);
  }

  // Delete media records
  await supabaseAdmin.from("trade_in_media").delete().eq("lead_id", leadId);

  // Delete action records
  await supabaseAdmin.from("trade_in_actions").delete().eq("lead_id", leadId);

  // Delete the lead
  const { error } = await supabaseAdmin
    .from("trade_in_leads")
    .delete()
    .eq("id", leadId);

  if (error) {
    throw new Error(`Failed to delete trade-in lead: ${error.message}`);
  }
}
