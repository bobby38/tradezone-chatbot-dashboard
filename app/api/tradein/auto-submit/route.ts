import { NextResponse } from "next/server";
import { isAuthRequired, verifyApiKey } from "@/lib/security/auth";
import {
  getSupabaseAdminClient,
  submitTradeInLead,
  updateTradeInLead,
} from "@/lib/trade-in/service";

const DEFAULT_DELAY_MINUTES = 2;

function getDelayMinutes(): number {
  const raw = process.env.TRADEIN_AUTO_SUBMIT_DELAY_MINUTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_DELAY_MINUTES;
}

function isAccessoriesCaptured(accessories: any): boolean {
  if (Array.isArray(accessories)) return accessories.length > 0;
  return Boolean(accessories);
}

function buildSummary(lead: any): string | undefined {
  const isTradeUp = Boolean(lead.source_device_name && lead.target_device_name);
  const device = [lead.brand, lead.model, lead.storage]
    .filter(Boolean)
    .join(" ")
    .trim();
  const accessories = Array.isArray(lead.accessories)
    ? lead.accessories.length > 0
      ? lead.accessories.join(", ")
      : "None"
    : lead.accessories || "None";
  const contact = [lead.contact_name, lead.contact_phone, lead.contact_email]
    .filter(Boolean)
    .join(" · ");
  const photosProvided = Array.isArray(lead.trade_in_media)
    ? lead.trade_in_media.length > 0
      ? "Provided"
      : "Not provided — final quote upon inspection"
    : "Not provided — final quote upon inspection";

  const lines: Array<string> = [];
  if (isTradeUp) {
    const tradeValue =
      lead.source_price_quoted != null ? `S$${lead.source_price_quoted}` : "";
    const retailPrice =
      lead.target_price_quoted != null ? `S$${lead.target_price_quoted}` : "";
    const topUp = lead.top_up_amount != null ? `S$${lead.top_up_amount}` : "";
    lines.push(
      `Trade-up: ${lead.source_device_name || "Trade-in"} ${tradeValue} → ${lead.target_device_name || "Target"} ${retailPrice} → Top-up ${topUp}`.trim(),
    );
  }

  lines.push("Trade-In Context Summary:");
  if (device) lines.push(`Device: ${device}`);
  if (lead.condition) lines.push(`Condition: ${lead.condition}`);
  if (accessories) lines.push(`Accessories: ${accessories}`);
  if (!isTradeUp && lead.preferred_payout) {
    lines.push(`Payout Preference: ${lead.preferred_payout}`);
  }
  if (contact) lines.push(`Contact: ${contact}`);
  lines.push(`Photos: ${photosProvided}`);

  if (typeof lead.notes === "string" && lead.notes.trim().length > 0) {
    lines.push(`Latest Notes: ${lead.notes.trim()}`);
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  if (isAuthRequired()) {
    const authResult = verifyApiKey(request);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: 401 },
      );
    }
  }

  const delayMinutes = getDelayMinutes();
  const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000).toISOString();
  const supabase = getSupabaseAdminClient();

  const { data: leads, error } = await supabase
    .from("trade_in_leads")
    .select("*, trade_in_actions (*), trade_in_media (*)")
    .in("status", ["new", "in_review", "awaiting_customer", "quoted"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load trade-in leads" },
      { status: 500 },
    );
  }

  const results: Array<{ leadId: string; status: string; error?: string }> = [];

  for (const lead of leads || []) {
    const actions = Array.isArray(lead.trade_in_actions)
      ? lead.trade_in_actions
      : [];
    const alreadyNotified = actions.some(
      (action: any) => action.action_type === "email_sent",
    );
    if (alreadyNotified) continue;

    const hasDevice = Boolean(lead.brand && lead.model);
    const hasCondition = Boolean(lead.condition);
    const accessoriesCaptured = isAccessoriesCaptured(lead.accessories);
    const hasContactEmail = Boolean(lead.contact_email);
    const hasContactPhone = Boolean(lead.contact_phone);
    const isTradeUp = Boolean(
      lead.source_device_name && lead.target_device_name,
    );
    const hasPayout = isTradeUp ? true : Boolean(lead.preferred_payout);

    if (
      !hasDevice ||
      !hasCondition ||
      !accessoriesCaptured ||
      !hasContactEmail ||
      !hasContactPhone ||
      !hasPayout
    ) {
      continue;
    }

    if (
      (!Array.isArray(lead.trade_in_media) ||
        lead.trade_in_media.length === 0) &&
      (!lead.notes || !/photos:\s*not provided/i.test(lead.notes))
    ) {
      try {
        const note =
          "Photos: Not provided — final quote upon inspection (auto-marked before submit)";
        await updateTradeInLead(lead.id, {
          notes: lead.notes ? `${note}\n${lead.notes}` : note,
        });
      } catch (noteError) {
        results.push({
          leadId: lead.id,
          status: "failed",
          error:
            noteError instanceof Error ? noteError.message : String(noteError),
        });
        continue;
      }
    }

    try {
      const summary = buildSummary(lead);
      const newStatus =
        lead.status && lead.status !== "new" ? lead.status : "in_review";
      await submitTradeInLead({
        leadId: lead.id,
        summary,
        notify: true,
        status: newStatus,
      });
      results.push({ leadId: lead.id, status: "submitted" });
    } catch (submitError) {
      results.push({
        leadId: lead.id,
        status: "failed",
        error:
          submitError instanceof Error
            ? submitError.message
            : String(submitError),
      });
    }
  }

  return NextResponse.json({
    checked: leads?.length || 0,
    submitted: results.filter((item) => item.status === "submitted").length,
    failed: results.filter((item) => item.status === "failed").length,
    delayMinutes,
    results,
  });
}
