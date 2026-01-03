import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export type ScheduledTaskStatus = "success" | "failed";

export interface ScheduledTaskRun {
  id: string;
  status: ScheduledTaskStatus;
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  durationMs: number;
  logUrl?: string;
  notes?: string;
}

export interface ScheduledTask {
  id: string;
  title: string;
  description: string;
  frequency: string;
  cron: string;
  owner: string;
  environment: string;
  lastRun: ScheduledTaskRun;
  recentRuns: ScheduledTaskRun[];
}

const RAW_TASKS = [
  {
    id: "sync-price-grid",
    title: "Sync price grid",
    description:
      "Refreshes the Supabase trade-in price grid so AI payouts stay in sync with the latest CSV upload.",
    frequency: "Weekly (Sunday 10:00 AM SGT)",
    cron: "0 2 * * 0",
    owner: "Coolify Cron",
    environment: "production",
    recentRuns: [
      {
        id: "sync-price-grid-2025-12-07",
        status: "success",
        startedAt: "2025-12-07T02:00:03Z",
        endedAt: "2025-12-07T02:00:08Z",
        durationMs: 5000,
        logUrl: null,
      },
      {
        id: "sync-price-grid-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:00:03Z",
        endedAt: "2025-11-30T02:00:06Z",
        durationMs: 3000,
        logUrl: null,
      },
    ],
  },
  {
    id: "refresh-woocommerce-catalog",
    title: "Refresh WooCommerce catalog",
    description:
      "Downloads the WooCommerce product snapshot, rebuilds products_master, and pushes updates into Supabase.",
    frequency: "Weekly (Sunday 10:05 AM SGT)",
    cron: "5 2 * * 0",
    owner: "Coolify Cron",
    environment: "production",
    recentRuns: [
      {
        id: "refresh-catalog-2025-12-07",
        status: "success",
        startedAt: "2025-12-07T02:05:02Z",
        endedAt: "2025-12-07T02:05:10Z",
        durationMs: 8000,
        logUrl: null,
      },
      {
        id: "refresh-catalog-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:05:03Z",
        endedAt: "2025-11-30T02:05:09Z",
        durationMs: 6000,
        logUrl: null,
      },
      {
        id: "refresh-catalog-2025-11-23",
        status: "failed",
        startedAt: "2025-11-23T02:05:02Z",
        endedAt: "2025-11-23T02:05:15Z",
        durationMs: 13000,
        logUrl: null,
        notes: "WooCommerce API rate limited (HTTP 429)",
      },
    ],
  },
  {
    id: "graphiti-sync",
    title: "Graphiti enrichment",
    description:
      "Uploads the rebuilt products + trade grid facts into Graphiti so memory/context stay fresh.",
    frequency: "Weekly (Sunday 10:30 AM SGT)",
    cron: "30 2 * * 0",
    owner: "Coolify Cron",
    environment: "production",
    recentRuns: [
      {
        id: "graphiti-sync-2025-12-07",
        status: "success",
        startedAt: "2025-12-07T02:30:03Z",
        endedAt: "2025-12-07T02:30:21Z",
        durationMs: 18000,
        logUrl: null,
      },
      {
        id: "graphiti-sync-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:30:04Z",
        endedAt: "2025-11-30T02:30:18Z",
        durationMs: 14000,
        logUrl: null,
      },
      {
        id: "graphiti-sync-2025-11-23",
        status: "failed",
        startedAt: "2025-11-23T02:30:05Z",
        endedAt: "2025-11-23T02:30:25Z",
        durationMs: 20000,
        logUrl: null,
        notes: "Graphiti API 502 — auto-retry scheduled",
      },
    ],
  },
  {
    id: "tradein-auto-submit",
    title: "Trade-in auto submit",
    description:
      "Submits completed trade-in leads and triggers staff email notifications.",
    frequency: "Every minute",
    cron: "*/1 * * * *",
    owner: "Coolify Cron",
    environment: "production",
    recentRuns: [
      {
        id: "tradein-auto-submit-2026-01-03-1620",
        status: "failed",
        startedAt: "2026-01-03T16:20:03Z",
        endedAt: "2026-01-03T16:20:05Z",
        durationMs: 2000,
        logUrl: null,
        notes: "curl: (3) URL rejected: Malformed input to a URL function",
      },
    ],
  },
  {
    id: "tradein-email-retry",
    title: "Trade-in email retry",
    description: "Retries failed trade-in email notifications.",
    frequency: "Every 5 minutes",
    cron: "*/5 * * * *",
    owner: "Coolify Cron",
    environment: "production",
    recentRuns: [],
  },
] satisfies Array<Omit<ScheduledTask, "lastRun">>;

function normalizeTasks(tasks: Array<Omit<ScheduledTask, "lastRun">>) {
  return tasks.map((task) => ({
    ...task,
    lastRun: task.recentRuns[0],
  }));
}

async function loadExternalTasks(): Promise<Array<
  Omit<ScheduledTask, "lastRun">
> | null> {
  const rawJson = process.env.SCHEDULED_TASKS_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.warn(
        "[ScheduledTasks] Failed to parse SCHEDULED_TASKS_JSON",
        error,
      );
    }
  }

  const remoteUrl = process.env.SCHEDULED_TASKS_URL;
  if (remoteUrl) {
    try {
      const response = await fetch(remoteUrl, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) return data;
      } else {
        console.warn(
          "[ScheduledTasks] SCHEDULED_TASKS_URL returned non-200",
          response.status,
        );
      }
    } catch (error) {
      console.warn(
        "[ScheduledTasks] Failed to fetch SCHEDULED_TASKS_URL",
        error,
      );
    }
  }

  try {
    const filePath = path.join(process.cwd(), "data", "scheduled_tasks.json");
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(fileContents);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    console.warn("[ScheduledTasks] Failed to read scheduled_tasks.json", error);
  }

  return null;
}

export async function GET() {
  const external = await loadExternalTasks();
  const tasks = normalizeTasks(external ?? RAW_TASKS);
  return NextResponse.json(
    { tasks },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
