import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

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
  return tasks.map((task) => {
    const latestRun = task.recentRuns?.[0];
    const nowIso = new Date().toISOString();
    return {
      ...task,
      lastRun:
        latestRun ??
        ({
          id: `${task.id}-no-runs`,
          status: "failed",
          startedAt: nowIso,
          endedAt: nowIso,
          durationMs: 0,
          notes: "No runs recorded yet",
        } satisfies ScheduledTaskRun),
    };
  });
}

/**
 * Fetch scheduled task executions from Coolify API
 */
async function fetchCoolifyScheduledTasks(): Promise<Array<
  Omit<ScheduledTask, "lastRun">
> | null> {
  const coolifyUrl = process.env.COOLIFY_API_URL;
  const coolifyKey = process.env.COOLIFY_API_KEY;
  const coolifyAppUuid = process.env.COOLIFY_APP_UUID;

  if (!coolifyUrl || !coolifyKey || !coolifyAppUuid) {
    console.log("[ScheduledTasks] Coolify config not found, skipping");
    return null;
  }

  try {
    console.log(
      `[ScheduledTasks] Fetching from Coolify: ${coolifyUrl}/api/v1/applications/${coolifyAppUuid}`,
    );

    const response = await fetch(
      `${coolifyUrl}/api/v1/applications/${coolifyAppUuid}`,
      {
        headers: {
          Authorization: `Bearer ${coolifyKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ScheduledTasks] Coolify API error ${response.status}:`,
        errorText,
      );
      return null;
    }

    const data = await response.json();
    console.log(
      "[ScheduledTasks] Coolify response:",
      JSON.stringify(data, null, 2),
    );

    // Map Coolify deployments to scheduled tasks
    // This is a placeholder - adjust based on actual Coolify API response structure
    const tasks: Array<Omit<ScheduledTask, "lastRun">> = [];

    // If Coolify returns deployment history, map it here
    if (data.deployments && Array.isArray(data.deployments)) {
      // Example mapping - adjust based on actual response
      const recentDeployments = data.deployments.slice(0, 5).map((d: any) => ({
        id: d.id || d.uuid || `deploy-${Date.now()}`,
        status: d.status === "finished" ? "success" : "failed",
        startedAt: d.started_at || new Date().toISOString(),
        endedAt: d.finished_at || new Date().toISOString(),
        durationMs:
          new Date(d.finished_at).getTime() - new Date(d.started_at).getTime(),
        logUrl: d.log_url || null,
        notes: d.message || null,
      }));

      tasks.push({
        id: "coolify-auto-deploy",
        title: "Auto Deploy",
        description: "Coolify automatic deployments",
        frequency: "On commit",
        cron: "N/A",
        owner: "Coolify",
        environment: data.environment || "production",
        recentRuns: recentDeployments,
      });
    }

    return tasks.length > 0 ? tasks : null;
  } catch (error) {
    console.error("[ScheduledTasks] Coolify API error:", error);
    return null;
  }
}

/**
 * Fetch scheduled task executions from Supabase
 */
async function fetchSupabaseScheduledTasks(): Promise<Array<
  Omit<ScheduledTask, "lastRun">
> | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data: runs, error } = await supabase
      .from("scheduled_task_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (error || !runs || runs.length === 0) {
      return null;
    }

    // Group by task_id
    const taskMap = new Map<string, any[]>();
    runs.forEach((run) => {
      if (!taskMap.has(run.task_id)) {
        taskMap.set(run.task_id, []);
      }
      taskMap.get(run.task_id)!.push(run);
    });

    // Task metadata
    const taskMetadata: Record<
      string,
      { description: string; frequency: string; cron: string }
    > = {
      "sync-price-grid": {
        description:
          "Refreshes the Supabase trade-in price grid so AI payouts stay in sync with the latest CSV upload.",
        frequency: "Weekly (Sunday 10:00 AM SGT)",
        cron: "0 2 * * 0",
      },
      "refresh-woocommerce-catalog": {
        description:
          "Downloads the WooCommerce product snapshot, rebuilds products_master, and pushes updates into Supabase.",
        frequency: "Weekly (Sunday 10:05 AM SGT)",
        cron: "5 2 * * 0",
      },
      "graphiti-sync": {
        description:
          "Uploads the rebuilt products + trade grid facts into Graphiti so memory/context stay fresh.",
        frequency: "Weekly (Sunday 10:30 AM SGT)",
        cron: "30 2 * * 0",
      },
      "tradein-auto-submit": {
        description:
          "Submits completed trade-in leads and triggers staff email notifications.",
        frequency: "Every minute",
        cron: "*/1 * * * *",
      },
      "tradein-email-retry": {
        description: "Retries failed trade-in email notifications.",
        frequency: "Every 5 minutes",
        cron: "*/5 * * * *",
      },
    };

    const tasks: Array<Omit<ScheduledTask, "lastRun">> = [];
    taskMap.forEach((runs, taskId) => {
      const metadata = taskMetadata[taskId] || {
        description: "Scheduled task",
        frequency: "Unknown",
        cron: "N/A",
      };

      const firstRun = runs[0];
      tasks.push({
        id: taskId,
        title: firstRun.task_title,
        description: metadata.description,
        frequency: metadata.frequency,
        cron: metadata.cron,
        owner: firstRun.owner || "Coolify Cron",
        environment: firstRun.environment || "production",
        recentRuns: runs.slice(0, 10).map((run) => ({
          id: run.id,
          status: run.status as ScheduledTaskStatus,
          startedAt: run.started_at,
          endedAt: run.ended_at || run.started_at,
          durationMs: run.duration_ms || 0,
          logUrl: run.log_url || undefined,
          notes: run.notes || undefined,
        })),
      });
    });

    return tasks;
  } catch (error) {
    console.error("[ScheduledTasks] Supabase error:", error);
    return null;
  }
}

async function loadExternalTasks(): Promise<
  Array<Omit<ScheduledTask, "lastRun">>
> {
  const mergedTasks = new Map<string, Omit<ScheduledTask, "lastRun">>(
    RAW_TASKS.map((task) => [task.id, task]),
  );

  const mergeTasks = (tasks: Array<Omit<ScheduledTask, "lastRun">> | null) => {
    if (!tasks || tasks.length === 0) return;
    tasks.forEach((task) => {
      const existing = mergedTasks.get(task.id);
      if (!existing) {
        mergedTasks.set(task.id, task);
        return;
      }
      mergedTasks.set(task.id, {
        ...existing,
        ...task,
        recentRuns:
          task.recentRuns && task.recentRuns.length > 0
            ? task.recentRuns
            : existing.recentRuns,
      });
    });
  };

  mergeTasks(await fetchSupabaseScheduledTasks());
  mergeTasks(await fetchCoolifyScheduledTasks());

  const rawJson = process.env.SCHEDULED_TASKS_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        mergeTasks(parsed);
      }
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
        if (Array.isArray(data)) {
          mergeTasks(data);
        }
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

  const allowFile =
    process.env.SCHEDULED_TASKS_ALLOW_FILE === "1" ||
    process.env.NODE_ENV !== "production";

  if (allowFile) {
    try {
      const filePath = path.join(process.cwd(), "data", "scheduled_tasks.json");
      if (fs.existsSync(filePath)) {
        const fileContents = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(fileContents);
        if (Array.isArray(parsed)) {
          mergeTasks(parsed);
        }
      }
    } catch (error) {
      console.warn(
        "[ScheduledTasks] Failed to read scheduled_tasks.json",
        error,
      );
    }
  }

  return Array.from(mergedTasks.values());
}

export async function GET() {
  const external = await loadExternalTasks();
  const tasks = normalizeTasks(external);
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
