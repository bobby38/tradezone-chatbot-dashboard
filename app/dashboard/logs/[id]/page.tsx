"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Bot, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatLog {
  id: string;
  user_id: string;
  prompt: string;
  response: string;
  timestamp: string;
  status: string;
  created_at: string;
  turn_index?: number;
  source?: string | null;
  metadata?: Record<string, any> | null;
}

interface ChatBubbleProps {
  who: "user" | "bot";
  text: string;
  timestamp: string;
  status?: string;
}

function ChatBubble({ who, text, timestamp, status }: ChatBubbleProps) {
  const isUser = who === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`flex items-start space-x-2 max-w-[85%] ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser ? "bg-primary" : "bg-secondary"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4 text-primary-foreground" />
          ) : (
            <Bot className="w-4 h-4 text-secondary-foreground" />
          )}
        </div>
        <div
          className={`rounded-lg p-3 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border"
          }`}
        >
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="space-y-2"
              components={{
                // Compact product list styling
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-2 my-2">
                    {children}
                  </ol>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-1 my-2">
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="text-sm leading-relaxed ml-0">{children}</li>
                ),
                // Product links - compact inline
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-xs"
                  >
                    {children}
                  </a>
                ),
                // Hide product images (too cluttered)
                img: () => null,
                // Clean headings
                h1: ({ children }) => (
                  <h1 className="text-base font-semibold mt-2 mb-1">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-semibold mt-2 mb-1">
                    {children}
                  </h2>
                ),
                // Compact paragraphs
                p: ({ children }) => (
                  <p className="my-1 leading-relaxed">{children}</p>
                ),
                // Strong/bold for product names
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">
                    {children}
                  </strong>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs opacity-70">
            <span>{formatDate(timestamp)}</span>
            {!isUser && status && (
              <span
                className={`ml-2 px-2 py-1 rounded-full ${
                  status === "success"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}
              >
                {status}
              </span>
            )}
          </div>
          {!isUser && (
            <div className="flex items-center space-x-2 mt-2">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <ThumbsUp className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <ThumbsDown className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversation = useCallback(async () => {
    try {
      // Try both user_id and direct session lookup
      let { data, error } = await supabase
        .from("chat_logs")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_index", { ascending: true });

      // If no data found with user_id, try with the full sessionId
      if (!data || data.length === 0) {
        const result = await supabase
          .from("chat_logs")
          .select("*")
          .or(`session_id.ilike.%${sessionId}%,user_id.ilike.%${sessionId}%`)
          .order("created_at", { ascending: true });

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log("Fetched conversation data:", data); // Debug log
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching conversation:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/logs">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Logs
            </Link>
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/logs">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Logs
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Conversation
            </h1>
            <p className="text-muted-foreground font-mono">
              Session: {sessionId.slice(0, 8)}...
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {logs.length} messages
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chat History</CardTitle>
          <CardDescription>
            Full conversation thread for this session
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No messages found for this session
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={log.id}>
                  {/* User message (prompt) */}
                  <ChatBubble
                    who="user"
                    text={log.prompt}
                    timestamp={log.created_at}
                  />
                  {/* Bot response */}
                  <ChatBubble
                    who="bot"
                    text={log.response}
                    timestamp={log.created_at}
                    status={log.status}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{logs.length}</div>
            <p className="text-xs text-muted-foreground">Total Turns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {logs.filter((l) => l.status === "success").length}
            </div>
            <p className="text-xs text-muted-foreground">
              Successful Responses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {logs.length > 0 ? formatDate(logs[0].created_at) : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Started</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
