"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Phone,
  Upload,
  Mic,
  MicOff,
  Send,
  Loader2,
} from "lucide-react";
import { RealtimeVoice } from "@/components/realtime-voice";
import { MarkdownMessage } from "@/components/markdown-message";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tradeInLeadId, setTradeInLeadId] = useState<string | null>(null);
  const [isTradeInFlow, setIsTradeInFlow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingTradeIn, setIsSubmittingTradeIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate session ID on mount (Guest-XX pattern)
  useEffect(() => {
    const hash = Math.floor(Math.random() * 9999) + 1;
    const sid = `Guest-${hash.toString().padStart(4, "0")}`;
    setSessionId(sid);
    console.log("[Chat] Session initialized:", sid);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ensureTradeInLead = async (initialMessage?: string) => {
    try {
      const response = await fetch("/api/tradein/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          channel: "chat",
          initialMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start trade-in session");
      }

      const data = await response.json();
      setTradeInLeadId(data.leadId);
      setIsTradeInFlow(true);
      return data.leadId as string;
    } catch (error) {
      console.error("[Chat] ensureTradeInLead error", error);
      toast.error("Unable to prepare the trade-in workflow.");
      throw error;
    }
  };

  const handleStartTradeIn = async () => {
    if (isTradeInFlow) return;
    try {
      await ensureTradeInLead("Start trade-in session");
      setIsTradeInFlow(true);
      toast.success("Trade-in assistant ready. Share your device details!");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Great! I'm ready to help with your trade-in. Tell me about the device you want to trade and we’ll keep everything saved.",
          timestamp: new Date(),
        },
      ]);
    } catch {
      // handled in ensureTradeInLead
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const leadId =
        tradeInLeadId || (await ensureTradeInLead("Uploading trade-in photos"));
      setIsTradeInFlow(true);

      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} exceeds the 15MB limit.`);
          continue;
        }

        const mimeType = file.type || "application/octet-stream";
        const uploadUrlResponse = await fetch("/api/tradein/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId,
            mimeType,
            sizeBytes: file.size,
          }),
        });

        if (!uploadUrlResponse.ok) {
          throw new Error("Failed to create upload URL");
        }

        const { uploadUrl, path } = await uploadUrlResponse.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }

        await fetch("/api/tradein/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId,
            path,
            mediaType: mimeType.startsWith("video") ? "video" : "image",
            mimeType,
            sizeBytes: file.size,
          }),
        });

        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            content: `Uploaded attachment: ${file.name}`,
            timestamp: new Date(),
          },
        ]);

        toast.success(`${file.name} uploaded`);
      }
    } catch (error) {
      console.error("[Chat] file upload error", error);
      toast.error("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmitTradeIn = async () => {
    if (!tradeInLeadId) {
      toast.error("Start the trade-in flow before submitting.");
      return;
    }

    setIsSubmittingTradeIn(true);
    try {
      const recentContext = messages
        .slice(-6)
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");

      const response = await fetch("/api/tradein/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: tradeInLeadId,
          summary: recentContext,
          notify: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to submit trade-in lead");
      }

      toast.success("Trade-in lead submitted to the team.");
    } catch (error) {
      console.error("[Chat] trade-in submit error", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to submit trade-in lead",
      );
    } finally {
      setIsSubmittingTradeIn(false);
    }
  };

  // Send text message to ChatKit agent
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message to UI
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      if (isTradeInFlow && !tradeInLeadId) {
        await ensureTradeInLead(userMessage.content);
      }

      const response = await fetch("/api/chatkit/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Add assistant response to UI
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("[Chat] Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content:
          "Sorry, I encountered an error. Please try again or contact support at contactus@tradezone.sg",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Switch to voice mode
  const startVoiceMode = () => {
    setMode("voice");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 md:px-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Chat with Amara
        </h1>
        <p className="text-muted-foreground">
          Your TradeZone AI Assistant • Session: {sessionId}
        </p>
      </div>

      {/* Welcome Card */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle>Welcome to TradeZone!</CardTitle>
          <CardDescription>
            Ask me about products, prices, trade-ins, or store information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            {/* Hero Video */}
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                className="w-full h-full object-cover"
                id="avatarVideo"
                src="https://videostream44.b-cdn.net/tradezone-amara-welcome.mp4"
                autoPlay
                muted
                playsInline
                loop
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <p className="text-sm uppercase tracking-wide opacity-80">
                  Meet Amara
                </p>
                <p className="text-xl font-semibold leading-tight">
                  Personalized tech recommendations, real-time catalogue search,
                  and instant trade-in support.
                </p>
              </div>
            </div>

            {/* Spotlight Widgets */}
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Featured Highlight
                </p>
                <p className="mt-2 text-sm font-medium">
                  Need inspiration? Ask Amara for “PlayStation racing bundles”
                  or “latest Asus ROG laptops” to see stocked items instantly.
                  You can also ask for “best gaming laptops under $1,500” or
                  “latest gaming console deals”.
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Quick Tips
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>
                    • Say “Show me Mario games in stock” to browse the
                    catalogue.
                  </li>
                  <li>
                    • Try “I want to trade in my console” for trade-in support.
                  </li>
                  <li>
                    • Use “Email the team” when you need a follow-up from staff.
                  </li>
                </ul>
              </div>
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Trade-In Assistant
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Planning to sell a device? Start the trade-in flow to keep
                  every answer saved and unlock photo uploads.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant={isTradeInFlow ? "outline" : "default"}
                  onClick={handleStartTradeIn}
                  disabled={isTradeInFlow}
                >
                  {isTradeInFlow ? "Trade-In Flow Active" : "Start Trade-In"}
                </Button>
              </div>
            </div>
          </div>

          {/* Mode Toggle Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              size="lg"
              variant={mode === "text" ? "default" : "outline"}
              onClick={() => setMode("text")}
              className="w-full h-14"
              disabled={isRecording}
            >
              <MessageSquare className="mr-2 h-5 w-5" />
              CHAT NOW
            </Button>
            <Button
              size="lg"
              variant={mode === "voice" ? "default" : "outline"}
              onClick={startVoiceMode}
              className="w-full h-14"
            >
              <Phone className="mr-2 h-5 w-5" />
              VOICE CHAT
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Text Chat Interface */}
      {mode === "text" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Text Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Messages Container */}
            <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto rounded-lg border p-4 bg-muted/20">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <p>Start a conversation! Ask me anything about TradeZone.</p>
                  <p className="text-sm mt-2">
                    Try: “What gaming headphones do you have?” or “I want to
                    trade in my PS5”
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <MarkdownMessage content={msg.content} />
                    <div className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Amara is typing...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask about products, prices, trade-ins..."
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!isTradeInFlow) {
                      toast.info(
                        "Start the trade-in flow before adding photos.",
                      );
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={isUploading}
                  size="icon"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p>
                  Press Enter to send, Shift+Enter for new line. Use the upload
                  button to attach trade-in photos (max 15MB each).
                </p>
                {isTradeInFlow && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSubmitTradeIn}
                    disabled={isSubmittingTradeIn}
                  >
                    {isSubmittingTradeIn ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      "Submit Trade-In"
                    )}
                  </Button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*"
                onChange={handleFileUpload}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Call Interface */}
      {mode === "voice" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Voice Chat with Amara
            </CardTitle>
            <CardDescription>
              Talk naturally - I’ll search our product catalog and help you find
              what you need
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Voice transcripts display */}
            <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto rounded-lg border p-4 bg-muted/20">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Start your voice conversation with Amara</p>
                  <p className="text-sm mt-2">
                    Click “Start Voice Chat” below to begin
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <MarkdownMessage content={msg.content} />
                    <div className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Realtime Voice Component */}
            <RealtimeVoice
              sessionId={sessionId}
              onTranscript={(text, role) => {
                setMessages((prev) => {
                  // If last message is from same role, append to it
                  const last = prev[prev.length - 1];
                  if (last?.role === role) {
                    return [
                      ...prev.slice(0, -1),
                      {
                        ...last,
                        content: last.content + text,
                      },
                    ];
                  } else {
                    // New message
                    return [
                      ...prev,
                      {
                        role,
                        content: text,
                        timestamp: new Date(),
                      },
                    ];
                  }
                });
              }}
            />

            <Button
              variant="outline"
              onClick={() => setMode("text")}
              className="w-full mt-4"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Switch to Text Chat
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Beta Notice */}
      <p className="text-xs text-center text-muted-foreground">
        Beta version: This chatbot can make mistakes. Session: {sessionId}
      </p>
    </div>
  );
}
