"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";

interface SettingsResponse {
  settings?: {
    chatkit?: {
      systemPrompt?: string;
    };
  };
}

export default function SettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<null | { type: "success" | "error"; message: string }>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load settings (${res.status})`);
        }
        const data: SettingsResponse = await res.json();
        const existingPrompt = data.settings?.chatkit?.systemPrompt;
        const nextPrompt = existingPrompt && existingPrompt.trim().length > 0 ? existingPrompt : CHATKIT_DEFAULT_PROMPT;
        if (isMounted) {
          setPrompt(nextPrompt);
          setInitialPrompt(nextPrompt);
        }
      } catch (error) {
        console.error("[Settings] Failed to load prompt", error);
        if (isMounted) {
          setPrompt(CHATKIT_DEFAULT_PROMPT);
          setInitialPrompt(CHATKIT_DEFAULT_PROMPT);
          setStatus({
            type: "error",
            message: "Unable to load saved settings. Showing default prompt.",
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatus(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settingType: "chatkit",
          settingKey: "systemPrompt",
          settingValue: prompt,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save settings (${res.status})`);
      }

      setInitialPrompt(prompt);
      setStatus({ type: "success", message: "ChatKit prompt saved." });
    } catch (error) {
      console.error("[Settings] Failed to save prompt", error);
      setStatus({ type: "error", message: "Saving failed. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(CHATKIT_DEFAULT_PROMPT);
    setStatus(null);
  };

  const hasChanges = prompt !== initialPrompt;

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 md:px-0">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-muted-foreground">Manage ChatKit configuration for Izacc.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ChatKit System Prompt</CardTitle>
          <CardDescription>
            Update the instructions Izacc uses for both text and voice conversations. Changes apply immediately after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                status.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {status.message}
            </div>
          )}

          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={24}
            disabled={loading || saving}
            className="font-mono text-xs"
            placeholder="Enter ChatKit system prompt..."
          />
          <p className="text-xs text-muted-foreground">
            Tip: keep key facts at the top, then tool usage rules. Markdown is supported in responses.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={saving || loading || !hasChanges}>
            {saving ? "Saving..." : "Save Prompt"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading || saving}>
            Reset to Default
          </Button>
          {loading && <span className="text-xs text-muted-foreground">Loading current prompt...</span>}
          {!loading && !hasChanges && (
            <span className="text-xs text-muted-foreground">All changes saved.</span>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
