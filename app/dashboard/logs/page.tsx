"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDate, exportToCSV } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Download,
  Trash2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface ChatLog {
  id: string;
  user_id: string;
  session_id: string | null;
  prompt: string;
  response: string;
  timestamp: string;
  status: string;
  created_at: string;
  turn_index?: number | null;
  source?: string | null;
}

const DEFAULT_PAGE_SIZE = 25;
const SORT_FIELDS = {
  date: "created_at",
  channel: "channel",
  turns: "turn_index",
  status: "status",
} as const;

export default function ChatLogsPage() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [showResponse, setShowResponse] = useState(false);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">(
    "all",
  );
  const [channelFilter, setChannelFilter] = useState<"all" | "voice" | "text">(
    "all",
  );
  const [sortField, setSortField] = useState<keyof typeof SORT_FIELDS>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("chat_logs")
        .select("*", { count: "exact" })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (searchTerm) {
        query = query.or(
          `prompt.ilike.%${searchTerm}%,response.ilike.%${searchTerm}%`,
        );
      }

      // Channel filter shortcuts: "channel:voice" OR dropdown filter
      const channelFromSearch = /channel:voice/i.test(searchTerm)
        ? "voice"
        : /channel:text/i.test(searchTerm)
          ? "text"
          : null;

      const channelChoice =
        channelFromSearch || (channelFilter !== "all" ? channelFilter : null);

      if (channelChoice === "voice") {
        query = query
          .in("source", ["chatkit_voice", "chatkit", "livekit-voice"])
          .eq("channel", "voice");
      } else if (channelChoice === "text") {
        query = query
          .in("source", ["chatkit", "chatkit_voice", "livekit-voice"])
          .or("channel.neq.voice,channel.is.null");
      } else {
        // Default: include all sources (voice, text, and legacy without channel)
        query = query.in("source", [
          "chatkit",
          "chatkit_voice",
          "livekit-voice",
          "n8n-chat",
        ]);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Sorting
      const orderColumn = SORT_FIELDS[sortField];
      query = query.order(orderColumn, { ascending: sortDir === "asc" });
      if (orderColumn !== "created_at") {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  }, [
    channelFilter,
    currentPage,
    pageSize,
    searchTerm,
    sortDir,
    sortField,
    statusFilter,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleSort = (field: keyof typeof SORT_FIELDS) => {
    setSortField((prevField) => {
      if (prevField === field) {
        // toggle direction
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      }
      // new field, reset to desc
      setSortDir("desc");
      return field;
    });
  };

  const handleDelete = async (logIds: string[]) => {
    if (!confirm(`Are you sure you want to delete ${logIds.length} log(s)?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("chat_logs")
        .delete()
        .in("id", logIds);

      if (error) throw error;

      setSelectedLogs([]);
      fetchLogs();
    } catch (error) {
      console.error("Error deleting logs:", error);
      alert("Error deleting logs. Please try again.");
    }
  };

  const handleExport = () => {
    if (logs.length === 0) {
      alert("No data to export");
      return;
    }

    const exportData = logs.map((log) => ({
      id: log.id,
      session_id: log.session_id,
      user_id: log.user_id,
      prompt: log.prompt,
      response: log.response,
      status: log.status,
      turn_index: log.turn_index ?? 1,
      source: log.source ?? "chatkit",
      timestamp: log.timestamp,
      created_at: log.created_at,
    }));

    exportToCSV(
      exportData,
      `chat-logs-${new Date().toISOString().split("T")[0]}.csv`,
    );
  };

  const handleSelectLog = (logId: string) => {
    setSelectedLogs((prev) =>
      prev.includes(logId)
        ? prev.filter((id) => id !== logId)
        : [...prev, logId],
    );
  };

  const handleSelectAll = () => {
    if (selectedLogs.length === logs.length) {
      setSelectedLogs([]);
    } else {
      setSelectedLogs(logs.map((log) => log.id));
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat Logs</h1>
        <p className="text-gray-600">
          View and manage all chatbot conversations
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>
                {totalCount} total conversations
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Status filter */}
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as "all" | "success" | "error");
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>

              {/* Channel filter */}
              <Select
                value={channelFilter}
                onValueChange={(v) => {
                  setChannelFilter(v as "all" | "voice" | "text");
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
              {/* Page size */}
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search conversations..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 w-64"
                />
              </div>
              <Button onClick={fetchLogs} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                onClick={() => setShowResponse((v) => !v)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                ↔︎ Swap
              </Button>
              {selectedLogs.length > 0 && (
                <Button
                  onClick={() => handleDelete(selectedLogs)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedLogs.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={
                          selectedLogs.length === logs.length && logs.length > 0
                        }
                        onChange={handleSelectAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead
                      role="button"
                      className="cursor-pointer"
                      onClick={() => toggleSort("date")}
                    >
                      Session ID
                    </TableHead>
                    <TableHead>
                      {showResponse ? "Response" : "Prompt"}
                    </TableHead>
                    <TableHead
                      role="button"
                      className="cursor-pointer"
                      onClick={() => toggleSort("channel")}
                    >
                      Channel
                    </TableHead>
                    <TableHead
                      role="button"
                      className="cursor-pointer"
                      onClick={() => toggleSort("turns")}
                    >
                      Turns
                    </TableHead>
                    <TableHead
                      role="button"
                      className="cursor-pointer"
                      onClick={() => toggleSort("status")}
                    >
                      Status
                    </TableHead>
                    <TableHead
                      role="button"
                      className="cursor-pointer"
                      onClick={() => toggleSort("date")}
                    >
                      Date
                    </TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLogs.includes(log.id)}
                          onChange={() => handleSelectLog(log.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        <Link
                          href={`/dashboard/logs/${encodeURIComponent(
                            log.session_id || log.user_id || "session",
                          )}`}
                          className="text-primary hover:text-primary/80 underline"
                          title={log.session_id || log.user_id || "unknown"}
                        >
                          {(log.session_id || log.user_id || "unknown").slice(
                            0,
                            20,
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div
                          className="truncate"
                          title={showResponse ? log.response : log.prompt}
                        >
                          {showResponse ? log.response : log.prompt}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {(() => {
                          const source = (log.source || "").toLowerCase();
                          if (source.includes("voice")) return "Voice";
                          if (
                            source.includes("n8n") ||
                            source.includes("webhook")
                          )
                            return "Webhook";
                          if (source.includes("tradein")) return "Trade-In";
                          if (source.includes("chatkit")) return "Text";
                          return log.source ? log.source : "Text";
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {log.turn_index ?? 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleDelete([log.id])}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {logs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No chat logs found</p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, totalCount)} of{" "}
                    {totalCount} results
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {/* Quick page size control */}
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="Rows" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
