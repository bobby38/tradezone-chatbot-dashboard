"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  Bot,
  Brain,
  CalendarClock,
  Clock3,
  Download,
  History,
  Loader2,
  Mail,
  Settings as SettingsIcon,
} from "lucide-react";
import { SettingsManager } from "@/lib/settings";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";
import type { AgentTelemetryEntry } from "@/lib/chatkit/telemetry";

interface GeneralSettings {
  apiTimeout: string;
  maxTokens: string;
  temperature: string;
  retryAttempts: string;
  logLevel: string;
  enableAnalytics: boolean;
  enableNotifications: boolean;
}

interface AiSettings {
  provider: string;
  model: string;
}

interface SmtpSettings {
  fromEmail: string;
  fromName: string;
  host: string;
  port: string;
  user: string;
  pass: string;
  encryption: "SSL" | "TLS";
  useAutoTLS: boolean;
  authentication: boolean;
  forceFromEmail: boolean;
  setReturnPath: boolean;
  testEmail: string;
}

interface BotConfig {
  systemPrompt?: string;
  textModel?: string;
  voiceModel?: string;
  voice?: string;
  vectorStoreId?: string;
  voiceEnabled?: boolean;
}

interface ScheduledTaskRun {
  id: string;
  status: "success" | "failed";
  startedAt: string;
  endedAt: string;
  durationMs?: number;
  logUrl?: string;
  notes?: string;
}

interface ScheduledTask {
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

type StatusState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

const DEFAULT_GENERAL: GeneralSettings = {
  apiTimeout: "30",
  maxTokens: "2000",
  temperature: "0.7",
  retryAttempts: "3",
  logLevel: "info",
  enableAnalytics: true,
  enableNotifications: true,
};

const DEFAULT_AI: AiSettings = {
  provider: "openai",
  model: "gpt-4o",
};

const DEFAULT_SMTP: SmtpSettings = {
  fromEmail: "",
  fromName: "",
  host: "",
  port: "587",
  user: "",
  pass: "",
  encryption: "TLS",
  useAutoTLS: true,
  authentication: true,
  forceFromEmail: true,
  setReturnPath: true,
  testEmail: "contactus@tradezone.sg",
};

const LOG_LEVELS = ["debug", "info", "warn", "error"];

const PROVIDER_OPTIONS = [
  {
    value: "openai",
    label: "OpenAI",
    models: [
      "gpt-4.1-preview",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4o-mini-2024-07-18",
      "gpt-4-turbo",
      "gpt-4-0613",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-instruct",
      "whisper-1",
      "gpt-4o-realtime-preview",
    ],
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    models: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "google/gemini-1.5-pro",
      "meta-llama/llama-3.1-70b-instruct",
      "mistralai/mixtral-8x7b-instruct",
      "perplexity/llama-3.1-sonar-small-128k-online",
      "qwen/qwen-2.5-72b-instruct",
    ],
  },
  {
    value: "none",
    label: "Not Configured",
    models: ["gpt-3.5-turbo"],
  },
];

function mergeSmtpSettings(remote: Record<string, any>): SmtpSettings {
  const merged: SmtpSettings = { ...DEFAULT_SMTP };
  Object.entries(remote || {}).forEach(([key, value]) => {
    if (key in merged && value !== undefined) {
      // @ts-expect-error dynamic assignment
      merged[key] = value;
    }
  });
  return merged;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  const [general, setGeneral] = useState<GeneralSettings>(DEFAULT_GENERAL);
  const [generalStatus, setGeneralStatus] = useState<StatusState>(null);
  const [generalLoading, setGeneralLoading] = useState(true);
  const [generalSaving, setGeneralSaving] = useState(false);

  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI);
  const [aiStatus, setAiStatus] = useState<StatusState>(null);
  const [detectedProvider, setDetectedProvider] = useState("Not configured");
  const [aiSaving, setAiSaving] = useState(false);

  const [smtp, setSmtp] = useState<SmtpSettings>(DEFAULT_SMTP);
  const [smtpStatus, setSmtpStatus] = useState<StatusState>(null);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const [botPrompt, setBotPrompt] = useState("");
  const [botInitialPrompt, setBotInitialPrompt] = useState("");
  const [botStatus, setBotStatus] = useState<StatusState>(null);
  const [botLoading, setBotLoading] = useState(true);
  const [botSaving, setBotSaving] = useState(false);
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);

  const [telemetry, setTelemetry] = useState<AgentTelemetryEntry[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetryLoadedOnce, setTelemetryLoadedOnce] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [scheduledTasksLoading, setScheduledTasksLoading] = useState(false);
  const [scheduledTasksError, setScheduledTasksError] = useState<string | null>(
    null,
  );
  const [scheduledTasksLoadedOnce, setScheduledTasksLoadedOnce] =
    useState(false);

  const currentModels = useMemo(() => {
    const provider = PROVIDER_OPTIONS.find(
      (item) => item.value === aiSettings.provider,
    );
    return provider?.models ?? ["gpt-4o"];
  }, [aiSettings.provider]);

  useEffect(() => {
    const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    const openrouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

    if (openaiKey && openaiKey.startsWith("sk-")) {
      setDetectedProvider("OpenAI");
    } else if (openrouterKey) {
      setDetectedProvider("OpenRouter");
    } else {
      setDetectedProvider("Not configured");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        setGeneralLoading(true);
        await SettingsManager.migrateFromLocalStorage();
        const loaded = await SettingsManager.loadSettings();
        if (!isMounted) return;

        if (loaded.general) {
          setGeneral((prev) => ({
            ...prev,
            ...loaded.general,
            enableAnalytics:
              loaded.general.enableAnalytics ?? prev.enableAnalytics,
            enableNotifications:
              loaded.general.enableNotifications ?? prev.enableNotifications,
          }));
        }

        if (loaded.ai) {
          setAiSettings((prev) => ({
            ...prev,
            ...loaded.ai,
          }));
        }

        if (loaded.smtp) {
          if (
            "config" in loaded.smtp &&
            loaded.smtp.config &&
            typeof loaded.smtp.config === "object"
          ) {
            setSmtp(
              mergeSmtpSettings(loaded.smtp.config as Record<string, any>),
            );
          } else {
            setSmtp(mergeSmtpSettings(loaded.smtp as Record<string, any>));
          }
        }
      } catch (error) {
        console.error("[Settings] Failed to load persisted settings", error);
        setGeneralStatus({
          type: "error",
          message:
            "Unable to load saved settings from cache. Using defaults until API responds.",
        });
      } finally {
        if (isMounted) {
          setGeneralLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBotConfig = async () => {
      try {
        setBotLoading(true);
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load bot settings (${response.status})`);
        }
        const data = await response.json();
        const chatkit = data.settings?.chatkit || {};
        const prompt =
          chatkit.systemPrompt && chatkit.systemPrompt.trim().length > 0
            ? chatkit.systemPrompt
            : CHATKIT_DEFAULT_PROMPT;
        if (!isMounted) return;
        setBotPrompt(prompt);
        setBotInitialPrompt(prompt);
        setBotConfig({
          systemPrompt: prompt,
          textModel: chatkit.textModel,
          voiceModel: chatkit.voiceModel,
          voice: chatkit.voice,
          vectorStoreId: chatkit.vectorStoreId,
          voiceEnabled: Boolean(chatkit.voiceModel),
        });
        setBotStatus(null);
      } catch (error) {
        console.error("[Settings] Failed to load bot prompt", error);
        if (!isMounted) return;
        setBotPrompt(CHATKIT_DEFAULT_PROMPT);
        setBotInitialPrompt(CHATKIT_DEFAULT_PROMPT);
        setBotStatus({
          type: "error",
          message: "Unable to load saved prompt. Showing default instructions.",
        });
      } finally {
        if (isMounted) {
          setBotLoading(false);
        }
      }
    };

    loadBotConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchTelemetry = useCallback(async () => {
    try {
      setTelemetryLoading(true);
      setTelemetryError(null);
      const response = await fetch("/api/chatkit/telemetry?limit=30", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load telemetry (${response.status})`);
      }
      const data = await response.json();
      setTelemetry(data.entries || []);
      setTelemetryLoadedOnce(true);
    } catch (error) {
      console.error("[Settings] Failed to load telemetry", error);
      setTelemetryError(
        error instanceof Error ? error.message : "Unknown telemetry error",
      );
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  const fetchScheduledTasks = useCallback(async () => {
    try {
      setScheduledTasksLoading(true);
      setScheduledTasksError(null);
      const response = await fetch("/api/scheduled-tasks", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load scheduled tasks (${response.status})`);
      }
      const data = await response.json();
      setScheduledTasks(data.tasks || []);
      setScheduledTasksLoadedOnce(true);
    } catch (error) {
      console.error("[Settings] Failed to load scheduled tasks", error);
      setScheduledTasksError(
        error instanceof Error ? error.message : "Unknown scheduler error",
      );
    } finally {
      setScheduledTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "logs" && !telemetryLoadedOnce) {
      fetchTelemetry();
    }
  }, [activeTab, fetchTelemetry, telemetryLoadedOnce]);

  useEffect(() => {
    if (activeTab === "schedulers" && !scheduledTasksLoadedOnce) {
      fetchScheduledTasks();
    }
  }, [activeTab, fetchScheduledTasks, scheduledTasksLoadedOnce]);

  const handleSaveGeneral = async () => {
    try {
      setGeneralSaving(true);
      setGeneralStatus(null);
      await Promise.all(
        Object.entries(general).map(([key, value]) =>
          SettingsManager.saveSetting("general", key, value),
        ),
      );
      setGeneralStatus({
        type: "success",
        message: "General settings saved.",
      });
    } catch (error) {
      console.error("[Settings] Failed to save general settings", error);
      setGeneralStatus({
        type: "error",
        message: "Failed to save general settings. Please try again.",
      });
    } finally {
      setGeneralSaving(false);
    }
  };

  const handleSaveAi = async () => {
    try {
      setAiSaving(true);
      setAiStatus(null);
      await SettingsManager.saveSetting("ai", "provider", aiSettings.provider);
      await SettingsManager.saveSetting("ai", "model", aiSettings.model);
      setAiStatus({
        type: "success",
        message: "AI provider and model saved.",
      });
    } catch (error) {
      console.error("[Settings] Failed to save AI settings", error);
      setAiStatus({
        type: "error",
        message: "Failed to save AI settings. Please try again.",
      });
    } finally {
      setAiSaving(false);
    }
  };

  const validateSmtp = (): string[] => {
    const errors: string[] = [];
    if (!smtp.fromEmail || !smtp.fromEmail.includes("@")) {
      errors.push("A valid From Email is required");
    }
    if (!smtp.host) {
      errors.push("SMTP Host is required");
    }
    const portValue = Number.parseInt(smtp.port, 10);
    if (!portValue || portValue < 1 || portValue > 65535) {
      errors.push("SMTP Port must be between 1 and 65535");
    }
    if (smtp.authentication) {
      if (!smtp.user) errors.push("SMTP username is required");
      if (!smtp.pass) errors.push("SMTP password is required");
    }
    return errors;
  };

  const handleSaveSmtp = async () => {
    const errors = validateSmtp();
    if (errors.length > 0) {
      setSmtpStatus({
        type: "error",
        message: `Please fix the following: ${errors.join(", ")}`,
      });
      return;
    }

    try {
      setSmtpSaving(true);
      setSmtpStatus(null);
      // Save SMTP settings directly under "smtp" key (not "smtp.config")
      // This matches how EmailService reads: org.settings.smtp
      const allSettings = await SettingsManager.loadSettings();
      const success = await SettingsManager.saveAllSettings({
        ...allSettings,
        smtp: smtp,
      });
      if (success) {
        setSmtpStatus({
          type: "success",
          message: "SMTP settings saved to server cache.",
        });
      } else {
        setSmtpStatus({
          type: "info",
          message:
            "Saved locally but failed to persist to server. Ensure /api/settings-simple is reachable.",
        });
      }
    } catch (error) {
      console.error("[Settings] Failed to save SMTP settings", error);
      setSmtpStatus({
        type: "error",
        message: "Failed to save SMTP settings. Please try again.",
      });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    const errors = validateSmtp();
    if (errors.length > 0) {
      setSmtpStatus({
        type: "error",
        message: `Please fix the following before testing: ${errors.join(", ")}`,
      });
      return;
    }

    if (!smtp.testEmail) {
      setSmtpStatus({
        type: "error",
        message: "Enter a test email before sending.",
      });
      return;
    }

    try {
      setSmtpTesting(true);
      setSmtpStatus({
        type: "info",
        message: `Sending test email to ${smtp.testEmail}...`,
      });

      const response = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: smtp,
          testEmail: smtp.testEmail,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unknown error");
      }
      setSmtpStatus({
        type: "success",
        message: `Test email sent successfully to ${smtp.testEmail}.`,
      });
    } catch (error) {
      console.error("[Settings] Test email failed", error);
      setSmtpStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to send test email.",
      });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSavePrompt = async () => {
    try {
      setBotSaving(true);
      setBotStatus(null);
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settingType: "chatkit",
          settingKey: "systemPrompt",
          settingValue: botPrompt,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to save prompt (${response.status})`);
      }
      setBotInitialPrompt(botPrompt);
      setBotStatus({
        type: "success",
        message: "ChatKit system prompt saved.",
      });
    } catch (error) {
      console.error("[Settings] Failed to save prompt", error);
      setBotStatus({
        type: "error",
        message: "Failed to save prompt. Please try again.",
      });
    } finally {
      setBotSaving(false);
    }
  };

  const generalChanged = useMemo(
    () => JSON.stringify(general) !== JSON.stringify(DEFAULT_GENERAL),
    [general],
  );

  const smtpChanged = useMemo(
    () => JSON.stringify(smtp) !== JSON.stringify(DEFAULT_SMTP),
    [smtp],
  );

  const botPromptChanged = botPrompt !== botInitialPrompt;

  const failingTasks = useMemo(
    () => scheduledTasks.filter((task) => task.lastRun?.status === "failed"),
    [scheduledTasks],
  );

  const latestFailingTask = useMemo(() => {
    if (failingTasks.length === 0) return null;
    return failingTasks.reduce<{
      task: ScheduledTask;
      run: ScheduledTaskRun;
    } | null>((latest, task) => {
      const currentTime = new Date(task.lastRun.endedAt).getTime();
      if (!latest) {
        return { task, run: task.lastRun };
      }
      const latestTime = new Date(latest.run.endedAt).getTime();
      return currentTime > latestTime ? { task, run: task.lastRun } : latest;
    }, null);
  }, [failingTasks]);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-0 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Settings &amp; Operations
        </h1>
        <p className="text-muted-foreground">
          Configure system behaviour, provider integrations, and ChatKit agent
          controls.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid grid-cols-5 md:grid-cols-6 gap-2 bg-muted/40 p-1">
          <TabsTrigger value="general" className="text-sm">
            <SettingsIcon className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-sm">
            <Brain className="mr-2 h-4 w-4" />
            AI Models
          </TabsTrigger>
          <TabsTrigger value="email" className="text-sm">
            <Mail className="mr-2 h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="bot" className="text-sm">
            <Bot className="mr-2 h-4 w-4" />
            Bot Settings
          </TabsTrigger>
          <TabsTrigger value="schedulers" className="text-sm">
            <CalendarClock className="mr-2 h-4 w-4" />
            Schedulers
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-sm">
            <History className="mr-2 h-4 w-4" />
            Bot Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-primary" />
                Runtime Behaviour
              </CardTitle>
              <CardDescription>
                Manage timeouts, token limits, retry strategy, and telemetry
                switches used across dashboards.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalStatus && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    generalStatus.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : generalStatus.type === "info"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {generalStatus.message}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    API Timeout (seconds)
                  </label>
                  <Input
                    value={general.apiTimeout}
                    onChange={(event) =>
                      setGeneral((prev) => ({
                        ...prev,
                        apiTimeout: event.target.value,
                      }))
                    }
                    disabled={generalLoading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Max Tokens
                  </label>
                  <Input
                    value={general.maxTokens}
                    onChange={(event) =>
                      setGeneral((prev) => ({
                        ...prev,
                        maxTokens: event.target.value,
                      }))
                    }
                    disabled={generalLoading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Temperature
                  </label>
                  <Input
                    value={general.temperature}
                    onChange={(event) =>
                      setGeneral((prev) => ({
                        ...prev,
                        temperature: event.target.value,
                      }))
                    }
                    disabled={generalLoading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Retry Attempts
                  </label>
                  <Input
                    value={general.retryAttempts}
                    onChange={(event) =>
                      setGeneral((prev) => ({
                        ...prev,
                        retryAttempts: event.target.value,
                      }))
                    }
                    disabled={generalLoading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Log Level
                  </label>
                  <Select
                    value={general.logLevel}
                    onValueChange={(value) =>
                      setGeneral((prev) => ({ ...prev, logLevel: value }))
                    }
                    disabled={generalLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select log level" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOG_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={general.enableAnalytics}
                    onCheckedChange={(checked) =>
                      setGeneral((prev) => ({
                        ...prev,
                        enableAnalytics: Boolean(checked),
                      }))
                    }
                    disabled={generalLoading}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Usage Analytics</p>
                    <p className="text-xs text-muted-foreground">
                      Control whether dashboard metrics aggregate chat
                      interactions.
                    </p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={general.enableNotifications}
                    onCheckedChange={(checked) =>
                      setGeneral((prev) => ({
                        ...prev,
                        enableNotifications: Boolean(checked),
                      }))
                    }
                    disabled={generalLoading}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Enable admin alerts for failed emails or tool errors.
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleSaveGeneral}
                disabled={generalSaving || generalLoading}
              >
                {generalSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save General Settings
              </Button>
              {!generalChanged && !generalSaving && (
                <span className="ml-3 text-xs text-muted-foreground">
                  Saved values currently match defaults.
                </span>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI Provider &amp; Model
              </CardTitle>
              <CardDescription>
                Configure the default model family used for dashboards and
                ChatKit fallback operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiStatus && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    aiStatus.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : aiStatus.type === "info"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {aiStatus.message}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Provider
                  </label>
                  <Select
                    value={aiSettings.provider}
                    onValueChange={(value) =>
                      setAiSettings((prev) => ({ ...prev, provider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge
                    variant={
                      detectedProvider === "Not configured"
                        ? "destructive"
                        : "outline"
                    }
                    className="mt-1"
                  >
                    Detected: {detectedProvider}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Default Model
                  </label>
                  <Select
                    value={aiSettings.model}
                    onValueChange={(value) =>
                      setAiSettings((prev) => ({ ...prev, model: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="mt-1">
                    Selected: {aiSettings.model}
                  </Badge>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveAi} disabled={aiSaving}>
                {aiSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save AI Configuration
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                SMTP Delivery
              </CardTitle>
              <CardDescription>
                Configure outgoing email settings for trade-in or customer
                notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {smtpStatus && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    smtpStatus.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : smtpStatus.type === "info"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {smtpStatus.message}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    From Email *
                  </label>
                  <Input
                    value={smtp.fromEmail}
                    onChange={(event) =>
                      setSmtp((prev) => ({
                        ...prev,
                        fromEmail: event.target.value,
                      }))
                    }
                    placeholder="sales@tradezone.sg"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    From Name
                  </label>
                  <Input
                    value={smtp.fromName}
                    onChange={(event) =>
                      setSmtp((prev) => ({
                        ...prev,
                        fromName: event.target.value,
                      }))
                    }
                    placeholder="TradeZone"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    SMTP Host *
                  </label>
                  <Input
                    value={smtp.host}
                    onChange={(event) =>
                      setSmtp((prev) => ({ ...prev, host: event.target.value }))
                    }
                    placeholder="smtp.yourprovider.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Port *
                  </label>
                  <Input
                    value={smtp.port}
                    onChange={(event) =>
                      setSmtp((prev) => ({ ...prev, port: event.target.value }))
                    }
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={smtp.useAutoTLS}
                    onCheckedChange={(checked) =>
                      setSmtp((prev) => ({
                        ...prev,
                        useAutoTLS: Boolean(checked),
                      }))
                    }
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Auto TLS</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically upgrade insecure connections when supported.
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={smtp.authentication}
                    onCheckedChange={(checked) =>
                      setSmtp((prev) => ({
                        ...prev,
                        authentication: Boolean(checked),
                      }))
                    }
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Authentication</p>
                    <p className="text-xs text-muted-foreground">
                      Require username &amp; password when sending mail.
                    </p>
                  </div>
                </label>
              </div>

              {smtp.authentication && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      SMTP Username *
                    </label>
                    <Input
                      value={smtp.user}
                      onChange={(event) =>
                        setSmtp((prev) => ({
                          ...prev,
                          user: event.target.value,
                        }))
                      }
                      placeholder="user@tradezone.sg"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      SMTP Password *
                    </label>
                    <Input
                      type="password"
                      value={smtp.pass}
                      onChange={(event) =>
                        setSmtp((prev) => ({
                          ...prev,
                          pass: event.target.value,
                        }))
                      }
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={smtp.forceFromEmail}
                    onCheckedChange={(checked) =>
                      setSmtp((prev) => ({
                        ...prev,
                        forceFromEmail: Boolean(checked),
                      }))
                    }
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Force From Email</p>
                    <p className="text-xs text-muted-foreground">
                      Override application defaults with this sender.
                    </p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={smtp.setReturnPath}
                    onCheckedChange={(checked) =>
                      setSmtp((prev) => ({
                        ...prev,
                        setReturnPath: Boolean(checked),
                      }))
                    }
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Return Path</p>
                    <p className="text-xs text-muted-foreground">
                      Ensure bounces route back to TradeZone inbox.
                    </p>
                  </div>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Encryption
                  </label>
                  <Select
                    value={smtp.encryption}
                    onValueChange={(value: "SSL" | "TLS") =>
                      setSmtp((prev) => ({ ...prev, encryption: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TLS">TLS (Ports 587/25)</SelectItem>
                      <SelectItem value="SSL">SSL (Port 465)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Test Email Recipient
                  </label>
                  <Input
                    value={smtp.testEmail}
                    onChange={(event) =>
                      setSmtp((prev) => ({
                        ...prev,
                        testEmail: event.target.value,
                      }))
                    }
                    placeholder="ops@tradezone.sg"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button onClick={handleSaveSmtp} disabled={smtpSaving}>
                {smtpSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save SMTP Settings
              </Button>
              <Button
                variant="outline"
                onClick={handleTestSmtp}
                disabled={smtpTesting}
              >
                {smtpTesting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send Test Email
              </Button>
              {!smtpChanged && (
                <span className="text-xs text-muted-foreground">
                  Saved SMTP matches defaults.
                </span>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="bot" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                ChatKit System Prompt
              </CardTitle>
              <CardDescription>
                Update Izacc&apos;s instructions for both text and voice chat.
                Changes take effect immediately after saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {botStatus && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    botStatus.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : botStatus.type === "info"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {botStatus.message}
                </div>
              )}

              <Textarea
                value={botPrompt}
                onChange={(event) => setBotPrompt(event.target.value)}
                rows={24}
                disabled={botLoading || botSaving}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Keep product search rules near the top. Markdown is supported in
                responses.
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleSavePrompt}
                disabled={botSaving || botLoading || !botPromptChanged}
              >
                {botSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Prompt
              </Button>
              <Button
                variant="outline"
                onClick={() => setBotPrompt(CHATKIT_DEFAULT_PROMPT)}
                disabled={botSaving || botLoading}
              >
                Reset to Default
              </Button>
              {botLoading && (
                <span className="text-xs text-muted-foreground">
                  Loading current prompt...
                </span>
              )}
              {!botLoading && !botPromptChanged && (
                <span className="text-xs text-muted-foreground">
                  Prompt synced with Supabase.
                </span>
              )}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Runtime Snapshot</CardTitle>
              <CardDescription>
                Quick glance at your deployed ChatKit configuration (from
                Supabase).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Text Model</p>
                <p className="text-base font-semibold">
                  {botConfig?.textModel || "gpt-4o-mini (default)"}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Voice Model</p>
                <p className="text-base font-semibold">
                  {botConfig?.voiceModel || "Disabled"}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Voice/Persona</p>
                <p className="text-base font-semibold">
                  {botConfig?.voice || "alloy"}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Vector Store ID</p>
                <p className="text-base font-semibold truncate">
                  {botConfig?.vectorStoreId || "Not configured"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedulers" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Scheduled Tasks</h2>
              <p className="text-sm text-muted-foreground">
                Monitor cron jobs that keep the price grid, Woo snapshot, and
                Graphiti graph aligned.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={fetchScheduledTasks}
              disabled={scheduledTasksLoading}
            >
              {scheduledTasksLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Refresh
            </Button>
          </div>

          {scheduledTasksError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {scheduledTasksError}
            </div>
          )}

          {failingTasks.length > 0 && latestFailingTask && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {failingTasks.length} scheduled{" "}
                  {failingTasks.length === 1 ? "task" : "tasks"} need attention
                </p>
                <p className="text-sm text-destructive/90">
                  {latestFailingTask.task.title} failed{" "}
                  {formatRelativeTimeFromNow(latestFailingTask.run.endedAt)} —{" "}
                  {latestFailingTask.run.notes || "check the job logs."}
                </p>
              </div>
            </div>
          )}

          {scheduledTasksLoading && scheduledTasks.length === 0 && (
            <Card>
              <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading scheduler status…
              </CardContent>
            </Card>
          )}

          {!scheduledTasksLoading && scheduledTasks.length === 0 && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No scheduled tasks found. Wire your Coolify/N8N cron jobs to the
                `/api/scheduled-tasks` source to populate this view.
              </CardContent>
            </Card>
          )}

          {scheduledTasks.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {scheduledTasks.map((task) => {
                const topRuns = task.recentRuns.slice(0, 3);
                const statusVariant: "secondary" | "destructive" =
                  task.lastRun.status === "success"
                    ? "secondary"
                    : "destructive";
                return (
                  <Card key={task.id} className="flex flex-col">
                    <CardHeader className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2">
                          {task.title}
                          <Badge variant={statusVariant}>
                            {task.lastRun.status === "success"
                              ? "Healthy"
                              : "Attention"}
                          </Badge>
                        </CardTitle>
                        <Badge variant="outline">{task.environment}</Badge>
                      </div>
                      <CardDescription>{task.description}</CardDescription>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-4 w-4" />
                          {task.frequency}
                        </span>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                          {task.cron}
                        </code>
                        <span>Owner: {task.owner}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Last run:{" "}
                        <span
                          className={
                            task.lastRun.status === "success"
                              ? "text-emerald-600 dark:text-emerald-500"
                              : "text-destructive"
                          }
                        >
                          {task.lastRun.status === "success"
                            ? "Success"
                            : "Failed"}
                        </span>{" "}
                        • {formatRelativeTimeFromNow(task.lastRun.endedAt)}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Recent executions
                        </p>
                        <div className="mt-2 space-y-3">
                          {topRuns.map((run) => (
                            <div
                              key={run.id}
                              className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={
                                      run.status === "success"
                                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                        : "text-destructive font-semibold"
                                    }
                                  >
                                    {run.status === "success"
                                      ? "Success"
                                      : "Failed"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Duration: {formatDuration(run.durationMs)}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  Finished{" "}
                                  {formatRelativeTimeFromNow(run.endedAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Started: {formatDateTime(run.startedAt)}
                                <br />
                                Ended: {formatDateTime(run.endedAt)}
                              </p>
                              {run.notes && (
                                <p className="mt-1 text-xs text-foreground">
                                  Notes: {run.notes}
                                </p>
                              )}
                              {run.logUrl && (
                                <div className="pt-2">
                                  <Button
                                    asChild
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0"
                                  >
                                    <a
                                      href={run.logUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-sm"
                                    >
                                      <Download className="h-4 w-4" />
                                      Download logs
                                    </a>
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent Bot Activity</h2>
              <p className="text-sm text-muted-foreground">
                Live logs captured from the ChatKit agent service, including
                tool usage.
              </p>
            </div>
            <Button variant="outline" onClick={fetchTelemetry}>
              Refresh
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last {telemetry.length} interactions</CardTitle>
              <CardDescription>
                Session IDs, prompts, tools invoked, and model responses
                (truncated).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {telemetryLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading telemetry...
                </div>
              )}

              {telemetryError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {telemetryError}
                </div>
              )}

              {!telemetryLoading && telemetry.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No agent telemetry captured yet. Chat with Izacc to populate
                  this list.
                </p>
              )}

              <div className="space-y-3">
                {telemetry.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border p-4 text-sm space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          Session: {entry.sessionId}
                        </Badge>
                        <Badge variant="secondary">
                          Model: {entry.model || "gpt-4o-mini"}
                        </Badge>
                        <Badge variant="secondary">
                          Turns: {entry.historyLength + 1}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground uppercase text-xs">
                        Prompt
                      </p>
                      <p className="text-sm">{entry.prompt}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground uppercase text-xs">
                        Tools Invoked
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {entry.toolCalls.length === 0 && (
                          <Badge variant="outline">None</Badge>
                        )}
                        {entry.toolCalls.map((tool, idx) => (
                          <Badge key={`${entry.id}-${tool.name}-${idx}`}>
                            {tool.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground uppercase text-xs">
                        Model Response (preview)
                      </p>
                      <p className="text-sm whitespace-pre-line">
                        {entry.responsePreview || "No response recorded"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelativeTimeFromNow(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "unknown time";
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(Math.round(diffHours), "hour");
  }
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return relativeTimeFormatter.format(Math.round(diffDays), "day");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs < 0) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m${seconds ? ` ${seconds}s` : ""}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
}
