import "dotenv/config";
import { randomUUID } from "crypto";
import {
  ensureTradeInLead,
  updateTradeInLead,
  submitTradeInLead,
  getSupabaseAdminClient,
} from "../lib/trade-in/service.js";

async function main() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error("SMTP env vars missing (SMTP_HOST, SMTP_USER, SMTP_PASS).");
  }

  const supabase = getSupabaseAdminClient();
  let leadId: string | null = null;

  try {
    const sessionId = `qa-email-${Date.now()}-${randomUUID()}`;
    const ensureResult = await ensureTradeInLead({
      sessionId,
      channel: "chat",
      initialMessage: "Automated QA trade-in email test (manual script)",
      source: "qa.script",
    });
    leadId = ensureResult.leadId;

    await updateTradeInLead(leadId, {
      brand: "DJI",
      model: "Osmo Pocket 3 Creator Combo",
      storage: "256GB",
      condition: "mint",
      accessories: ["box"],
      contact_name: "QA Bot",
      contact_phone: "91234567",
      contact_email: "qa-verification@tradezone.sg",
      preferred_payout: "cash",
      notes: "Photos: Not provided — customer has none on hand.",
    });

    const result = await submitTradeInLead({
      leadId,
      status: "in_review",
      notify: true,
      summary: "Automated QA: verify trade-in email delivery (manual script).",
    });

    console.log(
      "submitTradeInLead result:",
      result.emailSent ? "email_sent" : "email_failed",
    );

    const { data: actions } = await supabase
      .from("trade_in_actions")
      .select("action_type, payload, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(5);

    console.log("Recent actions for lead:", actions);
  } finally {
    if (leadId) {
      await supabase.from("trade_in_actions").delete().eq("lead_id", leadId);
      await supabase.from("trade_in_media").delete().eq("lead_id", leadId);
      await supabase.from("trade_in_leads").delete().eq("id", leadId);
    }
  }
}

main().catch((error) => {
  console.error("QA trade-in email check failed:", error);
  process.exit(1);
});
