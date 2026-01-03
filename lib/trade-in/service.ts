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

function normalizeLeadHash(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return normalized;

  // Collapse widget/LiveKit session ids like:
  // - client_..._<timestamp>
  // - chat-client_..._<timestamp>
  // into a stable hash based on the client id portion.
  const match = normalized.match(
    /^(chat-)?(client_[a-z0-9]+_[a-z0-9]+)(?:_\d+)?$/i,
  );
  if (match && match[2]) {
    return match[2];
  }

  return normalized;
}

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

const CONTACT_PLACEHOLDER_VALUES = new Set([
  "customer",
  "customer name",
  "customer email",
  "customer phone number",
  "unknown",
  "not provided",
  "n/a",
  "pending",
  "here",
  "there",
  "see",
  "see you",
  "thanks",
  "thank",
  "thank you",
  "ok",
  "okay",
  "bye",
  "later",
  "photo",
  "photos",
  "cash",
  "paynow",
  "bank",
  "none",
  "no",
]);

function hasMeaningfulValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !CONTACT_PLACEHOLDER_VALUES.has(normalized);
}

function isValidEmail(value: string | null | undefined): boolean {
  if (!hasMeaningfulValue(value)) return false;
  const email = (value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(value: string | null | undefined): boolean {
  if (!hasMeaningfulValue(value)) return false;
  const digits = (value || "").replace(/\D+/g, "");
  return digits.length >= 8;
}

function sanitizeContactValue(
  value: string | null | undefined,
  fallback = "Not provided",
): string {
  if (!hasMeaningfulValue(value)) {
    return fallback;
  }
  return (value as string).trim();
}

export class TradeInValidationError extends Error {
  fields?: string[];
  constructor(message: string, fields?: string[]) {
    super(message);
    this.name = "TradeInValidationError";
    this.fields = fields;
  }
}

const ARRAY_FIELDS = new Set(["defects", "accessories"]);
const NUMERIC_FIELDS = new Set([
  "price_hint",
  "range_min",
  "range_max",
  "source_price_quoted",
  "target_price_quoted",
  "top_up_amount",
]);
const DATE_FIELDS = new Set([
  "last_contacted_at",
  "follow_up_at",
  "quote_timestamp",
]);
const BOOLEAN_FIELDS = new Set(["initial_quote_given"]);
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
  "source_device_name",
  "target_device_name",
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
    .concat(Array.from(BOOLEAN_FIELDS))
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
  maxAgeMinutes?: number; // optional: if existing lead older than this, create a new one
  forceNew?: boolean; // optional: always create a new lead (used for fresh trade intent)
}

export interface EnsureTradeInLeadResult {
  leadId: string;
  status: string;
  created: boolean;
}

export interface TradeInUpdateInput {
  [key: string]: unknown;
  // Note: we accept both the canonical contact_* keys and common aliases ("email", "phone", "name").
  // Aliases are normalized inside normalizePatch() so upstream tools can be forgiving.
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
  source_device_name?: string;
  source_price_quoted?: number | string | null;
  target_device_name?: string;
  target_price_quoted?: number | string | null;
  top_up_amount?: number | string | null;
  initial_quote_given?: boolean;
  quote_timestamp?: string;
}

export interface TradeInSubmitInput {
  leadId: string;
  summary?: string | null;
  status?: string;
  notify?: boolean;
  allowMissingPayout?: boolean;
  emailContext?: "initial" | "resend" | "retry";
}

export async function ensureTradeInLead(
  params: EnsureTradeInLeadParams,
): Promise<EnsureTradeInLeadResult> {
  const rawSession = (params.leadHash || params.sessionId || "")
    .trim()
    .toLowerCase();
  const leadHash = normalizeLeadHash(rawSession);

  if (!leadHash) {
    throw new TradeInValidationError("Lead hash or session id is required");
  }

  const leadHashCandidates = new Set<string>();
  leadHashCandidates.add(leadHash);
  if (rawSession) {
    leadHashCandidates.add(rawSession);
    if (rawSession.startsWith("chat-")) {
      leadHashCandidates.add(rawSession.replace(/^chat-/, ""));
    } else {
      leadHashCandidates.add(`chat-${rawSession}`);
    }
  }

  const { data: existingLead, error: existingError } = await supabaseAdmin
    .from("trade_in_leads")
    .select("id, status, created_at")
    .in("lead_hash", Array.from(leadHashCandidates))
    .not("status", "in", "(completed,closed,archived,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Trade-in lead lookup failed: ${existingError.message}`);
  }

  if (existingLead && !params.forceNew) {
    // If a max age is provided, drop stale leads and create a fresh one
    if (params.maxAgeMinutes && existingLead.created_at) {
      const ageMs =
        Date.now() - new Date(existingLead.created_at as string).getTime();
      const maxMs = params.maxAgeMinutes * 60 * 1000;
      if (ageMs <= maxMs) {
        return {
          leadId: existingLead.id,
          status: existingLead.status,
          created: false,
        };
      }
    } else {
      return {
        leadId: existingLead.id,
        status: existingLead.status,
        created: false,
      };
    }
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
  // Normalize common aliases to the canonical field names used in the DB
  if (
    typeof patch.email === "string" &&
    !("contact_email" in patch) &&
    !("contactEmail" in patch)
  ) {
    patch.contact_email = patch.email;
  }
  if ("email" in patch) {
    delete patch.email;
  }
  if (typeof patch.contactEmail === "string" && !("contact_email" in patch)) {
    patch.contact_email = patch.contactEmail;
  }
  if ("contactEmail" in patch) {
    delete patch.contactEmail;
  }
  if (typeof patch.phone === "string" && !("contact_phone" in patch)) {
    patch.contact_phone = patch.phone;
  }
  if ("phone" in patch) {
    delete patch.phone;
  }
  if (typeof patch.name === "string" && !("contact_name" in patch)) {
    patch.contact_name = patch.name;
  }
  if ("name" in patch) {
    delete patch.name;
  }

  if (typeof patch.condition === "string") {
    patch.condition = patch.condition.trim().toLowerCase();
  }

  if (typeof patch.preferred_payout === "string") {
    patch.preferred_payout = patch.preferred_payout.trim().toLowerCase();
  }

  if (typeof patch.preferred_fulfilment === "string") {
    patch.preferred_fulfilment = patch.preferred_fulfilment
      .trim()
      .toLowerCase();
  }

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

    if (BOOLEAN_FIELDS.has(key)) {
      if (value === null || value === undefined) {
        updatePayload[key] = null;
      } else {
        updatePayload[key] = Boolean(value);
      }
      return;
    }

    // Trim whitespace for text fields; prevents " bobby@example.com " from being treated as a new value
    if (TEXT_FIELDS.has(key) && typeof value === "string") {
      updatePayload[key] = value.trim();
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
    .select(
      "status, contact_name, contact_phone, contact_email, preferred_payout",
    )
    .eq("id", leadId)
    .single();

  if (fetchError || !existing) {
    throw new Error(
      `Trade-in lead not found: ${fetchError?.message ?? "unknown error"}`,
    );
  }

  const previousStatus = existing.status;

  if (Object.prototype.hasOwnProperty.call(updatePayload, "preferred_payout")) {
    const nameCandidate =
      typeof updatePayload.contact_name === "string"
        ? updatePayload.contact_name
        : (existing.contact_name as string | null | undefined);
    const phoneCandidate =
      typeof updatePayload.contact_phone === "string"
        ? updatePayload.contact_phone
        : (existing.contact_phone as string | null | undefined);
    const emailCandidate =
      typeof updatePayload.contact_email === "string"
        ? updatePayload.contact_email
        : (existing.contact_email as string | null | undefined);

    if (
      !hasMeaningfulValue(nameCandidate) ||
      !isValidPhone(phoneCandidate) ||
      !isValidEmail(emailCandidate)
    ) {
      throw new TradeInValidationError(
        "Collect name, phone, and a valid email before recording payout preference.",
        ["preferred_payout"],
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(updatePayload, "contact_name")) {
    const newNameRaw = updatePayload.contact_name;
    const newName =
      typeof newNameRaw === "string" ? newNameRaw.trim() : undefined;
    const previousName =
      typeof existing.contact_name === "string"
        ? existing.contact_name.trim()
        : null;

    const newIsMeaningful = hasMeaningfulValue(newName);
    const previousIsMeaningful = hasMeaningfulValue(previousName);

    if (!newName || !newIsMeaningful) {
      // Delete if new name is empty or meaningless
      delete updatePayload.contact_name;
    } else if (previousName && previousIsMeaningful) {
      // If same name (case-insensitive), skip update
      if (previousName.toLowerCase() === newName.toLowerCase()) {
        delete updatePayload.contact_name;
      }
      // Otherwise, ALLOW the update (new meaningful name replaces old one)
      // Removed the else block that was blocking all updates
    }
  }

  console.log("[TradeIn] Updating lead:", {
    leadId,
    fieldsToUpdate: Object.keys(updatePayload),
    hasContactName: "contact_name" in updatePayload,
    hasContactEmail: "contact_email" in updatePayload,
    hasContactPhone: "contact_phone" in updatePayload,
  });

  const { data: updatedLead, error: updateError } = await supabaseAdmin
    .from("trade_in_leads")
    .update(updatePayload)
    .eq("id", leadId)
    .select();

  if (updateError) {
    throw new Error(
      `Failed to update trade-in lead: ${updateError?.message ?? "unknown error"}`,
    );
  }

  // Handle case where no rows were updated or multiple rows returned
  if (
    !updatedLead ||
    (Array.isArray(updatedLead) && updatedLead.length === 0)
  ) {
    throw new Error(`Trade-in lead not found or already deleted: ${leadId}`);
  }

  // Get the first (and should be only) result
  const lead = Array.isArray(updatedLead) ? updatedLead[0] : updatedLead;

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

  return { lead, actionsLogged, previousStatus };
}

export interface TradeUpQuoteCacheInput {
  leadId: string;
  sourceName: string;
  targetName: string;
  sourcePrice: number | string;
  targetPrice: number | string;
  topUpAmount: number | string;
  quoteTimestamp?: string | Date;
}

export async function cacheTradeUpQuote(
  input: TradeUpQuoteCacheInput,
): Promise<void> {
  const {
    leadId,
    sourceName,
    targetName,
    sourcePrice,
    targetPrice,
    topUpAmount,
    quoteTimestamp,
  } = input;

  if (!leadId) {
    throw new TradeInValidationError("leadId is required", ["leadId"]);
  }

  const invalidNumericFields: string[] = [];
  const normalizeNumeric = (value: number | string, field: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      invalidNumericFields.push(field);
      return null;
    }
    return num;
  };

  const resolvedSourcePrice = normalizeNumeric(
    sourcePrice,
    "source_price_quoted",
  );
  const resolvedTargetPrice = normalizeNumeric(
    targetPrice,
    "target_price_quoted",
  );
  const resolvedTopUp = normalizeNumeric(topUpAmount, "top_up_amount");

  if (invalidNumericFields.length) {
    throw new TradeInValidationError(
      "Trade-up quote fields must be numeric",
      invalidNumericFields,
    );
  }

  const timestamp =
    quoteTimestamp instanceof Date
      ? quoteTimestamp
      : quoteTimestamp
        ? new Date(quoteTimestamp)
        : new Date();
  if (Number.isNaN(timestamp.valueOf())) {
    throw new TradeInValidationError("Invalid quote_timestamp", [
      "quote_timestamp",
    ]);
  }

  const payload = {
    initial_quote_given: true,
    source_device_name: sanitizeContactValue(sourceName, "device"),
    source_price_quoted: resolvedSourcePrice!,
    target_device_name: sanitizeContactValue(targetName, "device"),
    target_price_quoted: resolvedTargetPrice!,
    top_up_amount: resolvedTopUp!,
    quote_timestamp: timestamp.toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("trade_in_leads")
    .update(payload)
    .eq("id", leadId);

  if (error) {
    throw new Error(
      `[TradeIn] Failed to cache trade-up quote: ${error.message}`,
    );
  }

  await supabaseAdmin.from("trade_in_actions").insert({
    lead_id: leadId,
    action_type: "note",
    payload: {
      message: `Auto-quoted ${payload.source_device_name} → ${payload.target_device_name} (top-up ~S$${payload.top_up_amount})`,
      channel: "chat",
      type: "quote_cache",
    },
  });
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

  const { data: loadedLead, error } = await supabaseAdmin
    .from("trade_in_leads")
    .select(
      `id, status, channel, category, brand, model, storage, condition,
       defects, accessories, purchase_year, price_hint, range_min, range_max,
       pricing_version, preferred_payout, preferred_fulfilment, contact_name,
       contact_phone, contact_email, telegram_handle, notes, session_id,
       source_device_name, target_device_name, source_price_quoted, target_price_quoted,
       top_up_amount, initial_quote_given, quote_timestamp,
       source_message_summary, created_at`,
    )
    .eq("id", input.leadId)
    .single();

  if (error || !loadedLead) {
    console.error("[TradeIn] Lead not found:", error);
    throw new Error(
      `Trade-in lead not found: ${error?.message ?? "unknown error"}`,
    );
  }

  let lead: any = loadedLead;

  console.log("[TradeIn] Lead loaded:", {
    id: lead.id,
    contact: lead.contact_name,
    email: lead.contact_email,
    device: `${lead.brand} ${lead.model}`,
    status: lead.status,
  });

  const isTradeUpLead = Boolean(
    hasMeaningfulValue(lead.target_device_name) &&
      Number.isFinite(Number(lead.top_up_amount)),
  );

  const missingFields: string[] = [];
  const friendlyFieldNames: Record<string, string> = {
    brand: "device brand",
    model: "device model",
    condition: "device condition",
    contact_name: "contact name",
    contact_phone: "contact phone number (at least 8 digits)",
    contact_email: "contact email (valid format)",
    preferred_payout: "preferred payout method",
  };

  if (!lead.brand?.trim()) {
    missingFields.push("brand");
  }
  if (!lead.model?.trim()) {
    missingFields.push("model");
  }
  if (!lead.condition?.trim()) {
    missingFields.push("condition");
  }
  if (!hasMeaningfulValue(lead.contact_name)) {
    missingFields.push("contact_name");
  }
  if (!isValidPhone(lead.contact_phone)) {
    missingFields.push("contact_phone");
  }
  if (!isValidEmail(lead.contact_email)) {
    missingFields.push("contact_email");
  }
  // Trade-ups do not require payout preference (top-up is paid separately).
  // Auto-submit resends also allow payout to be missing.
  if (
    !input.allowMissingPayout &&
    !isTradeUpLead &&
    !lead.preferred_payout?.trim()
  ) {
    missingFields.push("preferred_payout");
  }

  if (missingFields.length > 0) {
    const missingList = missingFields
      .map((field) => friendlyFieldNames[field] ?? field)
      .join(", ");
    throw new TradeInValidationError(
      `Missing required trade-in details: ${missingList}. Please ask the customer for the missing information, save it with tradein_update_lead, then submit the lead.`,
      missingFields,
    );
  }

  const patch: TradeInUpdateInput = {};
  if (input.summary) {
    patch.notes = input.summary;
  }
  // Default the status on submit so the lead reliably shows in the trade-in dashboard workflow.
  patch.status = input.status || "in_review";

  if (Object.keys(patch).length > 0) {
    await updateTradeInLead(input.leadId, patch);
  }

  // Refresh the lead after patching status/notes so the caller and email
  // reflect the canonical DB state (prevents confusion where response shows status='new').
  const { data: refreshedLead, error: refreshError } = await supabaseAdmin
    .from("trade_in_leads")
    .select(
      `id, status, channel, category, brand, model, storage, condition,
       defects, accessories, purchase_year, price_hint, range_min, range_max,
       pricing_version, preferred_payout, preferred_fulfilment, contact_name,
       contact_phone, contact_email, telegram_handle, notes, session_id,
       source_device_name, target_device_name, source_price_quoted, target_price_quoted,
       top_up_amount, initial_quote_given, quote_timestamp,
       source_message_summary, created_at`,
    )
    .eq("id", input.leadId)
    .single();

  if (!refreshError && refreshedLead) {
    lead = refreshedLead;
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

    const contactName = sanitizeContactValue(lead.contact_name);
    const contactEmail = sanitizeContactValue(lead.contact_email);
    const contactPhone = sanitizeContactValue(lead.contact_phone);

    const formData = {
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
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
      source_device_name: lead.source_device_name || null,
      target_device_name: lead.target_device_name || null,
      source_price_quoted: lead.source_price_quoted ?? null,
      target_price_quoted: lead.target_price_quoted ?? null,
      top_up_amount: lead.top_up_amount ?? null,
      initial_quote_given: lead.initial_quote_given ?? null,
      quote_timestamp: lead.quote_timestamp ?? null,
      channel: lead.channel,
      session_id: lead.session_id,
      summary:
        input.summary || lead.notes || lead.source_message_summary || null,
      media: media || [],
    };

    console.log("[TradeIn] Sending email notification...");
    console.log("[TradeIn] Form data:", JSON.stringify(formData, null, 2));

    let emailErrorMessage: string | null = null;
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
      emailErrorMessage =
        emailError instanceof Error ? emailError.message : String(emailError);
    }

    await supabaseAdmin.from("trade_in_actions").insert({
      lead_id: input.leadId,
      action_type: emailSent ? "email_sent" : "email_failed",
      payload: {
        type: "trade-in",
        status: emailSent ? "sent" : "failed",
        summary: input.summary || null,
        context: input.emailContext || "initial",
        error: emailSent ? null : emailErrorMessage,
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

type EmailStatus = "sent" | "failed" | "not_sent";

function deriveEmailStatus(actions?: Array<any>) {
  const normalized = Array.isArray(actions) ? actions : [];
  const emailActions = normalized
    .filter((action) =>
      ["email_sent", "email_failed"].includes(action.action_type),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf(),
    );

  const latest = emailActions[0];
  const lastSent = emailActions.find(
    (action) => action.action_type === "email_sent",
  );
  const lastResent = emailActions.find(
    (action) =>
      action.action_type === "email_sent" &&
      ["resend", "retry"].includes(action.payload?.context),
  );
  const lastFailed = emailActions.find(
    (action) => action.action_type === "email_failed",
  );

  let status: EmailStatus = "not_sent";
  if (latest?.action_type === "email_sent") status = "sent";
  if (latest?.action_type === "email_failed") status = "failed";

  return {
    email_status: status,
    email_last_sent_at: lastSent?.created_at ?? null,
    email_last_resent_at: lastResent?.created_at ?? null,
    email_last_failed_at: lastFailed?.created_at ?? null,
  };
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
       contact_name, contact_phone, contact_email,
       trade_in_actions (action_type, created_at, payload)`,
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

  return (data || []).map((lead: any) => ({
    ...lead,
    ...deriveEmailStatus(lead.trade_in_actions),
  }));
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
    ...deriveEmailStatus(actions),
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
