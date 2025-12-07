import { NextResponse } from "next/server";

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
        logUrl: "https://trade.rezult.co/logs/sync-price-grid/2025-12-07",
      },
      {
        id: "sync-price-grid-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:00:03Z",
        endedAt: "2025-11-30T02:00:06Z",
        durationMs: 3000,
        logUrl: "https://trade.rezult.co/logs/sync-price-grid/2025-11-30",
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
        logUrl: "https://trade.rezult.co/logs/refresh-catalog/2025-12-07",
      },
      {
        id: "refresh-catalog-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:05:03Z",
        endedAt: "2025-11-30T02:05:09Z",
        durationMs: 6000,
        logUrl: "https://trade.rezult.co/logs/refresh-catalog/2025-11-30",
      },
      {
        id: "refresh-catalog-2025-11-23",
        status: "failed",
        startedAt: "2025-11-23T02:05:02Z",
        endedAt: "2025-11-23T02:05:15Z",
        durationMs: 13000,
        logUrl: "https://trade.rezult.co/logs/refresh-catalog/2025-11-23",
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
        logUrl: "https://trade.rezult.co/logs/graphiti-sync/2025-12-07",
      },
      {
        id: "graphiti-sync-2025-11-30",
        status: "success",
        startedAt: "2025-11-30T02:30:04Z",
        endedAt: "2025-11-30T02:30:18Z",
        durationMs: 14000,
        logUrl: "https://trade.rezult.co/logs/graphiti-sync/2025-11-30",
      },
      {
        id: "graphiti-sync-2025-11-23",
        status: "failed",
        startedAt: "2025-11-23T02:30:05Z",
        endedAt: "2025-11-23T02:30:25Z",
        durationMs: 20000,
        logUrl: "https://trade.rezult.co/logs/graphiti-sync/2025-11-23",
        notes: "Graphiti API 502 — auto-retry scheduled",
      },
    ],
  },
] satisfies Array<Omit<ScheduledTask, "lastRun">>;

const MOCK_TASKS: ScheduledTask[] = RAW_TASKS.map((task) => ({
  ...task,
  lastRun: task.recentRuns[0],
}));

export async function GET() {
  return NextResponse.json({ tasks: MOCK_TASKS });
}
