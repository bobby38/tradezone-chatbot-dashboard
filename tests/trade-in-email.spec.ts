import "ts-node/register/transpile-only";
import "tsconfig-paths/register";
import { test, expect } from "@playwright/test";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const hasSupabaseCredentials =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

test.describe("Trade-in email notifications", () => {
  test.skip(
    !hasSupabaseCredentials,
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run trade-in email tests.",
  );

  test("submitTradeInLead sends an email notification", async () => {
    const envKeys = [
      "SMTP_CONFIG_SOURCE",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM_EMAIL",
      "SMTP_FROM_NAME",
    ] as const;

    const originalEnv: Record<string, string | undefined> = {};
    envKeys.forEach((key) => {
      originalEnv[key] = process.env[key];
    });

    let leadId: string | null = null;
    let supabase: SupabaseClient | null = null;

    try {
      const testAccount = await nodemailer.createTestAccount();

      process.env.SMTP_CONFIG_SOURCE = "env";
      process.env.SMTP_HOST = testAccount.smtp.host;
      process.env.SMTP_PORT = String(testAccount.smtp.port);
      process.env.SMTP_USER = testAccount.user;
      process.env.SMTP_PASS = testAccount.pass;
      process.env.SMTP_FROM_EMAIL = testAccount.user;
      process.env.SMTP_FROM_NAME = "TradeZone QA (Ethereal)";

      const {
        ensureTradeInLead,
        updateTradeInLead,
        submitTradeInLead,
        getSupabaseAdminClient,
      } = await import("../lib/trade-in/service");

      supabase = getSupabaseAdminClient();

      const sessionId = `qa-email-${Date.now()}-${randomUUID()}`;
      const ensureResult = await ensureTradeInLead({
        sessionId,
        channel: "chat",
        initialMessage: "Automated QA trade-in email test",
        source: "qa.playwright",
      });
      leadId = ensureResult.leadId;

      const contactEmail = testAccount.user.includes("@")
        ? testAccount.user.replace("@", "+qa@")
        : `${testAccount.user}+qa@ethereal.email`;

      await updateTradeInLead(leadId, {
        brand: "DJI",
        model: "Osmo Pocket 3 Creator Combo",
        storage: "256GB",
        condition: "mint",
        accessories: ["box"],
        contact_name: "QA Bot",
        contact_phone: "91234567",
        contact_email: contactEmail,
        preferred_payout: "cash",
        notes: "Photos: Not provided — customer has none on hand.",
      });

      const result = await submitTradeInLead({
        leadId,
        status: "in_review",
        notify: true,
        summary: "Automated QA: verify trade-in email delivery.",
      });

      expect(result.emailSent).toBeTruthy();

      const { data: actions, error: actionError } = await supabase
        .from("trade_in_actions")
        .select("action_type")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1);

      expect(actionError).toBeNull();
      expect(actions && actions[0]?.action_type).toBe("email_sent");
    } finally {
      if (supabase && leadId) {
        await supabase.from("trade_in_actions").delete().eq("lead_id", leadId);
        await supabase.from("trade_in_media").delete().eq("lead_id", leadId);
        await supabase.from("trade_in_leads").delete().eq("id", leadId);
      }

      envKeys.forEach((key) => {
        const value = originalEnv[key];
        if (typeof value === "undefined") {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });
});
