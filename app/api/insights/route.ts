import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface InsightData {
  commonQuestions: Array<{ question: string; count: number; category: string }>;
  enquiryTrends: Array<{ date: string; count: number; category: string }>;
  responseEffectiveness: Array<{
    category: string;
    avgResponseTime: number;
    successRate: number;
  }>;
  userBehavior: Array<{ pattern: string; count: number; description: string }>;
  keywordAnalysis: Array<{
    keyword: string;
    frequency: number;
    context: string;
  }>;
  topIssues: Array<{ issue: string; frequency: number; severity: string }>;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch chat logs for analysis
    const { data: chatLogs, error: chatError } = await supabaseAdmin
      .from("chat_logs")
      .select("id, prompt, response, created_at, processing_time, status")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (chatError) {
      throw chatError;
    }

    // Fetch form submissions for analysis
    const { data: submissions, error: submissionError } = await supabaseAdmin
      .from("submissions")
      .select("id, ai_metadata, created_at, status")
      .eq("content_type", "Form Submission")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (submissionError) {
      throw submissionError;
    }

    const insights = await generateInsights(
      chatLogs || [],
      submissions || [],
      days,
    );

    return NextResponse.json({
      success: true,
      period: `${days} days`,
      insights,
    });
  } catch (error) {
    console.error("Insights API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function generateInsights(
  chatLogs: any[],
  submissions: any[],
  days: number,
): Promise<InsightData> {
  // Analyze common questions from chat logs
  const commonQuestions = analyzeCommonQuestions(chatLogs);

  // Analyze enquiry trends over time
  const enquiryTrends = analyzeEnquiryTrends(chatLogs, submissions, days);

  // Analyze response effectiveness
  const responseEffectiveness = analyzeResponseEffectiveness(chatLogs);

  // Analyze user behavior patterns
  const userBehavior = analyzeUserBehavior(chatLogs, submissions);

  // Analyze keywords and topics
  const keywordAnalysis = analyzeKeywords(chatLogs, submissions);

  // Identify top issues
  const topIssues = identifyTopIssues(chatLogs, submissions);

  return {
    commonQuestions,
    enquiryTrends,
    responseEffectiveness,
    userBehavior,
    keywordAnalysis,
    topIssues,
  };
}

function analyzeCommonQuestions(
  chatLogs: any[],
): Array<{ question: string; count: number; category: string }> {
  const questionPatterns: {
    [pattern: string]: { category: string; count: number };
  } = {};

  chatLogs.forEach((log) => {
    const prompt = (log.prompt || "").toLowerCase();

    // Categorize common question patterns
    if (
      prompt.includes("price") ||
      prompt.includes("cost") ||
      prompt.includes("how much")
    ) {
      incrementPattern(
        questionPatterns,
        "pricing_questions",
        "Pricing Questions",
      );
    }
    if (
      prompt.includes("trade") ||
      prompt.includes("sell") ||
      prompt.includes("buy")
    ) {
      incrementPattern(
        questionPatterns,
        "trade_questions",
        "Trade-in Questions",
      );
    }
    if (prompt.includes("warranty") || prompt.includes("guarantee")) {
      incrementPattern(
        questionPatterns,
        "warranty_questions",
        "Warranty Questions",
      );
    }
    if (
      prompt.includes("delivery") ||
      prompt.includes("shipping") ||
      prompt.includes("pickup")
    ) {
      incrementPattern(
        questionPatterns,
        "delivery_questions",
        "Delivery Questions",
      );
    }
    if (
      prompt.includes("repair") ||
      prompt.includes("fix") ||
      prompt.includes("broken")
    ) {
      incrementPattern(
        questionPatterns,
        "repair_questions",
        "Repair Questions",
      );
    }
    if (
      prompt.includes("support") ||
      prompt.includes("help") ||
      prompt.includes("problem")
    ) {
      incrementPattern(
        questionPatterns,
        "support_questions",
        "Support Questions",
      );
    }
    if (
      prompt.includes("store") ||
      prompt.includes("location") ||
      prompt.includes("address")
    ) {
      incrementPattern(
        questionPatterns,
        "location_questions",
        "Location Questions",
      );
    }
    if (
      prompt.includes("stock") ||
      prompt.includes("available") ||
      prompt.includes("in store")
    ) {
      incrementPattern(
        questionPatterns,
        "availability_questions",
        "Availability Questions",
      );
    }
  });

  return Object.entries(questionPatterns)
    .map(([key, data]) => ({
      question: data.category,
      count: data.count,
      category: key,
    }))
    .sort((a, b) => b.count - a.count);
}

function analyzeEnquiryTrends(
  chatLogs: any[],
  submissions: any[],
  days: number,
): Array<{ date: string; count: number; category: string }> {
  const trends: { [date: string]: { [category: string]: number } } = {};

  // Initialize all dates with zero counts
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    trends[dateStr] = { chat: 0, forms: 0 };
  }

  // Count chat logs by date
  chatLogs.forEach((log) => {
    const date = new Date(log.created_at).toISOString().split("T")[0];
    if (trends[date]) {
      trends[date].chat++;
    }
  });

  // Count form submissions by date
  submissions.forEach((sub) => {
    const date = new Date(sub.created_at).toISOString().split("T")[0];
    if (trends[date]) {
      trends[date].forms++;
    }
  });

  const result: Array<{ date: string; count: number; category: string }> = [];
  Object.entries(trends).forEach(([date, counts]) => {
    result.push({ date, count: counts.chat, category: "Chat Enquiries" });
    result.push({ date, count: counts.forms, category: "Form Submissions" });
  });

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function analyzeResponseEffectiveness(
  chatLogs: any[],
): Array<{ category: string; avgResponseTime: number; successRate: number }> {
  const categories = ["pricing", "trade", "support", "general"];

  return categories.map((category) => {
    const relevantLogs = chatLogs.filter((log) => {
      const prompt = (log.prompt || "").toLowerCase();
      switch (category) {
        case "pricing":
          return prompt.includes("price") || prompt.includes("cost");
        case "trade":
          return prompt.includes("trade") || prompt.includes("sell");
        case "support":
          return prompt.includes("help") || prompt.includes("problem");
        default:
          return true;
      }
    });

    const avgResponseTime =
      relevantLogs.length > 0
        ? relevantLogs.reduce(
            (sum, log) => sum + (log.processing_time || 1000),
            0,
          ) /
          relevantLogs.length /
          1000
        : 0;

    const successRate =
      relevantLogs.length > 0
        ? (relevantLogs.filter((log) => log.status === "success").length /
            relevantLogs.length) *
          100
        : 100;

    return {
      category:
        category.charAt(0).toUpperCase() + category.slice(1) + " Questions",
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      successRate: Math.round(successRate),
    };
  });
}

function analyzeUserBehavior(
  chatLogs: any[],
  submissions: any[],
): Array<{ pattern: string; count: number; description: string }> {
  const patterns: { [pattern: string]: number } = {};

  // Analyze conversation patterns
  let multipleQuestions = 0;
  let quickResponses = 0;
  let longConversations = 0;

  const userSessions: { [userId: string]: any[] } = {};

  chatLogs.forEach((log) => {
    const userId = log.user_id || "anonymous";
    if (!userSessions[userId]) userSessions[userId] = [];
    userSessions[userId].push(log);
  });

  Object.values(userSessions).forEach((session: any[]) => {
    if (session.length > 3) longConversations++;
    if (session.length > 1) multipleQuestions++;

    session.forEach((log) => {
      if (log.processing_time && log.processing_time < 500) quickResponses++;
    });
  });

  return [
    {
      pattern: "Multi-question Sessions",
      count: multipleQuestions,
      description: "Users asking multiple questions in one session",
    },
    {
      pattern: "Quick Interactions",
      count: quickResponses,
      description: "Questions answered in less than 0.5 seconds",
    },
    {
      pattern: "Extended Conversations",
      count: longConversations,
      description: "Sessions with more than 3 interactions",
    },
    {
      pattern: "Form Completions",
      count: submissions.length,
      description: "Users who completed contact or trade-in forms",
    },
  ].sort((a, b) => b.count - a.count);
}

function analyzeKeywords(
  chatLogs: any[],
  submissions: any[],
): Array<{ keyword: string; frequency: number; context: string }> {
  const keywords: { [keyword: string]: { count: number; contexts: string[] } } =
    {};

  const importantKeywords = [
    "iphone",
    "samsung",
    "apple",
    "android",
    "phone",
    "device",
    "trade",
    "sell",
    "buy",
    "price",
    "cost",
    "value",
    "repair",
    "fix",
    "broken",
    "damage",
    "screen",
    "warranty",
    "guarantee",
    "support",
    "help",
    "delivery",
    "pickup",
    "store",
    "location",
  ];

  const allText = [
    ...chatLogs.map((log) => `${log.prompt || ""} ${log.response || ""}`),
    ...submissions.map((sub) => JSON.stringify(sub.ai_metadata || {})),
  ]
    .join(" ")
    .toLowerCase();

  importantKeywords.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    const matches = allText.match(regex) || [];
    if (matches.length > 0) {
      keywords[keyword] = {
        count: matches.length,
        contexts: determineKeywordContexts(keyword, chatLogs, submissions),
      };
    }
  });

  return Object.entries(keywords)
    .map(([keyword, data]) => ({
      keyword,
      frequency: data.count,
      context: data.contexts[0] || "General usage",
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

function identifyTopIssues(
  chatLogs: any[],
  submissions: any[],
): Array<{ issue: string; frequency: number; severity: string }> {
  const issues: { [issue: string]: { count: number; severity: string } } = {};

  const issuePatterns = [
    {
      pattern: /broken|damage|crack|shatter/i,
      issue: "Device Damage",
      severity: "high",
    },
    {
      pattern: /not working|dead|won\'t turn on/i,
      issue: "Device Not Functioning",
      severity: "high",
    },
    {
      pattern: /slow|lag|freeze|crash/i,
      issue: "Performance Issues",
      severity: "medium",
    },
    {
      pattern: /battery|charging|power/i,
      issue: "Battery/Charging Problems",
      severity: "medium",
    },
    {
      pattern: /screen|display|touch/i,
      issue: "Screen Issues",
      severity: "medium",
    },
    {
      pattern: /camera|photo|video/i,
      issue: "Camera Problems",
      severity: "low",
    },
    {
      pattern: /sound|audio|speaker|microphone/i,
      issue: "Audio Issues",
      severity: "low",
    },
    {
      pattern: /network|wifi|cellular|connection/i,
      issue: "Connectivity Problems",
      severity: "medium",
    },
  ];

  const allTexts = [
    ...chatLogs.map((log) => log.prompt || ""),
    ...submissions.map(
      (sub) =>
        (sub.ai_metadata?.message || "") +
        " " +
        (sub.ai_metadata?.subject || ""),
    ),
  ];

  allTexts.forEach((text) => {
    issuePatterns.forEach(({ pattern, issue, severity }) => {
      if (pattern.test(text)) {
        if (!issues[issue]) issues[issue] = { count: 0, severity };
        issues[issue].count++;
      }
    });
  });

  return Object.entries(issues)
    .map(([issue, data]) => ({
      issue,
      frequency: data.count,
      severity: data.severity,
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

function incrementPattern(patterns: any, key: string, category: string) {
  if (!patterns[key]) {
    patterns[key] = { category, count: 0 };
  }
  patterns[key].count++;
}

function determineKeywordContexts(
  keyword: string,
  chatLogs: any[],
  submissions: any[],
): string[] {
  const contexts = ["chat_interaction"];

  submissions.forEach((sub) => {
    const metadata = sub.ai_metadata || {};
    const text = JSON.stringify(metadata).toLowerCase();
    if (text.includes(keyword)) {
      contexts.push("form_submission");
    }
  });

  return [...new Set(contexts)];
}
