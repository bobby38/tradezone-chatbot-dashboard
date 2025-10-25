"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileDown,
  Loader2,
  Mail,
  Phone,
  User,
  DollarSign,
  MapPin,
  Info,
  Package,
  Trash2,
  MoreVertical,
  Share2,
  MessageSquare,
  Download,
  FileText,
  Send,
} from "lucide-react";

interface TradeInLeadSummary {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  channel: string;
  brand: string | null;
  model: string | null;
  storage: string | null;
  condition: string | null;
  range_min: number | null;
  range_max: number | null;
  preferred_payout: string | null;
  preferred_fulfilment: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

interface TradeInMediaEntry {
  id: string;
  media_type: string;
  url: string;
  created_at: string;
  mime_type?: string | null;
  size_bytes?: number | null;
}

interface TradeInActionEntry {
  id: string;
  action_type: string;
  payload: any;
  created_at: string;
}

interface TradeInLeadDetail extends TradeInLeadSummary {
  notes: string | null;
  defects: string[] | null;
  accessories: string[] | null;
  purchase_year: number | null;
  price_hint: number | null;
  pricing_version: string | null;
  telegram_handle: string | null;
  session_id: string | null;
  trade_in_media: TradeInMediaEntry[];
  trade_in_actions: TradeInActionEntry[];
}

const resolveStoragePath = (value?: string | null) => {
  if (!value) return "";
  let path = value;
  try {
    if (value.startsWith("http")) {
      const url = new URL(value);
      const segments = url.pathname.split("/");
      const fileIndex = segments.findIndex((segment) => segment === "files");
      if (fileIndex !== -1 && segments[fileIndex + 1]) {
        path = decodeURIComponent(segments[fileIndex + 1]);
      }
    }
  } catch (error) {
    console.warn("[TradeIn] Failed to resolve storage path", error);
  }
  return path.replace(/.*\/files\//, "").replace(/\/view.*$/, "");
};

const getMediaDisplayName = (media: TradeInMediaEntry) => {
  const base = media.media_type
    ? media.media_type.charAt(0).toUpperCase() + media.media_type.slice(1)
    : "File";
  if (!media.url) return `${base}`;
  try {
    if (media.url.startsWith("http")) {
      const url = new URL(media.url);
      const filename =
        url.searchParams.get("filename") ||
        url.pathname.split("/").pop() ||
        media.url;
      return `${base} · ${filename.split("?")[0]}`;
    }
  } catch (error) {
    console.warn("[TradeIn] Failed to derive file name", error);
  }
  return `${base} · ${media.url.split("/").pop() || media.url}`;
};

const STATUS_ORDER = [
  "new",
  "in_review",
  "quoted",
  "awaiting_customer",
  "scheduled",
  "completed",
  "closed",
  "archived",
];

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  quoted: "Quoted",
  awaiting_customer: "Awaiting Customer",
  scheduled: "Scheduled",
  completed: "Completed",
  closed: "Closed",
  archived: "Archived",
};

function formatPriceRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "—";
  if (min != null && max != null) {
    return `$${min} – $${max}`;
  }
  return min != null ? `$${min}` : `$${max}`;
}

export default function TradeInDashboardPage() {
  const [leads, setLeads] = useState<TradeInLeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<TradeInLeadDetail | null>(
    null,
  );
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mediaSignedUrls, setMediaSignedUrls] = useState<
    Record<string, string>
  >({});
  const [mediaLoading, setMediaLoading] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (search.trim().length > 0) {
        params.set("search", search.trim());
      }
      const response = await fetch(`/api/tradein/leads?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load trade-in leads");
      }
      const data = await response.json();
      setLeads(data.leads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openLeadDetail = useCallback(async (leadId: string) => {
    setSelectedLeadId(leadId);
    setDetailLoading(true);
    setSelectedLead(null);
    try {
      const response = await fetch(`/api/tradein/leads/${leadId}`);
      if (!response.ok) {
        throw new Error("Failed to load lead detail");
      }
      const data = await response.json();
      setSelectedLead(data.lead);
      setNoteDraft("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to load lead detail",
      );
      setSelectedLeadId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadSignedUrls = async () => {
      if (!selectedLead || selectedLead.trade_in_media.length === 0) {
        setMediaSignedUrls({});
        return;
      }

      setMediaLoading(true);
      const entries = await Promise.all(
        selectedLead.trade_in_media.map(async (media) => {
          try {
            if (media.url?.startsWith("http")) {
              return { id: media.id, url: media.url } as const;
            }
            const path = resolveStoragePath(media.url);
            if (!path) return null;
            const response = await fetch(
              `/api/tradein/media/sign-url?path=${encodeURIComponent(path)}`,
            );
            if (!response.ok) return null;
            const { url } = await response.json();
            return { id: media.id, url: url as string };
          } catch (error) {
            console.error(
              `[TradeIn] Failed to fetch signed URL for media ${media.id}`,
              error,
            );
            return null;
          }
        }),
      );

      if (!ignore) {
        const map: Record<string, string> = {};
        for (const entry of entries) {
          if (entry?.url) {
            map[entry.id] = entry.url;
          }
        }
        setMediaSignedUrls(map);
        setMediaLoading(false);
      }
    };

    loadSignedUrls();

    return () => {
      ignore = true;
    };
  }, [selectedLead]);

  const closeLeadDetail = () => {
    setSelectedLeadId(null);
    setSelectedLead(null);
    setNoteDraft("");
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((lead) => {
      counts[lead.status] = (counts[lead.status] || 0) + 1;
    });
    return counts;
  }, [leads]);

  const changeStatus = async (leadId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/tradein/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { status: newStatus } }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to update lead status");
      }
      toast.success("Status updated");
      await fetchLeads();
      if (selectedLeadId === leadId) {
        await openLeadDetail(leadId);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to update status",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const addNote = async () => {
    if (!selectedLeadId || noteDraft.trim().length === 0) return;
    try {
      const response = await fetch(`/api/tradein/leads/${selectedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { notes: noteDraft } }),
      });
      if (!response.ok) {
        throw new Error("Failed to save note");
      }
      toast.success("Note saved");
      setNoteDraft("");
      await openLeadDetail(selectedLeadId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add note",
      );
    }
  };

  const deleteLead = async (leadId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this trade-in lead? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/tradein/leads/${leadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete lead");
      }
      toast.success("Trade-in lead deleted");
      closeLeadDetail();
      await fetchLeads();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete lead",
      );
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((lead) => lead.id)));
    }
  };

  const bulkDeleteLeads = async () => {
    if (selectedLeads.size === 0) return;

    if (
      !confirm(
        `Are you sure you want to delete ${selectedLeads.size} trade-in lead${selectedLeads.size === 1 ? "" : "s"}? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    try {
      const response = await fetch("/api/tradein/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selectedLeads) }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete leads");
      }

      const data = await response.json();
      toast.success(
        `Successfully deleted ${data.deletedCount} lead${data.deletedCount === 1 ? "" : "s"}`,
      );
      setSelectedLeads(new Set());
      await fetchLeads();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete leads",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const openReplyDialog = () => {
    if (!selectedLead?.contact_email) {
      toast.error("No email address available for this lead");
      return;
    }
    setReplySubject(
      `Re: Trade-in for ${selectedLead.brand || ""} ${selectedLead.model || "device"}`,
    );
    setReplyMessage(
      `Hi ${selectedLead.contact_name || "there"},\n\nThank you for your trade-in submission.\n\n`,
    );
    setReplyDialogOpen(true);
  };

  const sendReply = async () => {
    if (!selectedLead?.contact_email) return;

    setSendingReply(true);
    try {
      const response = await fetch("/api/tools/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedLead.contact_email,
          subject: replySubject,
          html: replyMessage.replace(/\n/g, "<br>"),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send email");
      }

      toast.success("Reply sent successfully");
      setReplyDialogOpen(false);
      setReplySubject("");
      setReplyMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send reply",
      );
    } finally {
      setSendingReply(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const csvData = leads.map((lead) => ({
        id: lead.id,
        created_at: new Date(lead.created_at).toLocaleString(),
        status: lead.status,
        channel: lead.channel,
        name: lead.contact_name || "",
        email: lead.contact_email || "",
        phone: lead.contact_phone || "",
        brand: lead.brand || "",
        model: lead.model || "",
        storage: lead.storage || "",
        condition: lead.condition || "",
        price_range: formatPriceRange(lead.range_min, lead.range_max),
        payout: lead.preferred_payout || "",
        fulfilment: lead.preferred_fulfilment || "",
      }));

      const headers = Object.keys(csvData[0]).join(",");
      const rows = csvData.map((row) =>
        Object.values(row)
          .map((val) =>
            typeof val === "string" && val.includes(",") ? `"${val}"` : val,
          )
          .join(","),
      );

      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tradein-leads-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Exported to CSV");
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = () => {
    setExporting(true);
    try {
      const data = leads.map((lead) => ({
        ID: lead.id,
        Created: new Date(lead.created_at).toLocaleString(),
        Status: lead.status,
        Channel: lead.channel,
        Name: lead.contact_name || "",
        Email: lead.contact_email || "",
        Phone: lead.contact_phone || "",
        Brand: lead.brand || "",
        Model: lead.model || "",
        Storage: lead.storage || "",
        Condition: lead.condition || "",
        "Price Range": formatPriceRange(lead.range_min, lead.range_max),
        Payout: lead.preferred_payout || "",
        Fulfilment: lead.preferred_fulfilment || "",
      }));

      const headers = Object.keys(data[0]).join("\t");
      const rows = data.map((row) => Object.values(row).join("\t"));
      const tsv = [headers, ...rows].join("\n");

      const blob = new Blob([tsv], { type: "text/tab-separated-values" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tradein-leads-${new Date().toISOString().split("T")[0]}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Exported to Excel");
    } finally {
      setExporting(false);
    }
  };

  const shareOnWhatsApp = (lead: TradeInLeadDetail) => {
    const text = `Trade-in Lead: ${lead.brand || ""} ${lead.model || ""}\nCustomer: ${lead.contact_name || "N/A"}\nCondition: ${lead.condition || "N/A"}\nPrice Range: ${formatPriceRange(lead.range_min, lead.range_max)}\nStatus: ${lead.status}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const shareOnTelegram = (lead: TradeInLeadDetail) => {
    const text = `Trade-in Lead: ${lead.brand || ""} ${lead.model || ""}\nCustomer: ${lead.contact_name || "N/A"}\nCondition: ${lead.condition || "N/A"}\nPrice Range: ${formatPriceRange(lead.range_min, lead.range_max)}\nStatus: ${lead.status}`;
    const url = `https://t.me/share/url?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const copyToClipboard = (lead: TradeInLeadDetail) => {
    const text = `Trade-in Lead\n\nDevice: ${lead.brand || ""} ${lead.model || ""} ${lead.storage || ""}\nCustomer: ${lead.contact_name || "N/A"}\nEmail: ${lead.contact_email || "N/A"}\nPhone: ${lead.contact_phone || "N/A"}\nCondition: ${lead.condition || "N/A"}\nPrice Range: ${formatPriceRange(lead.range_min, lead.range_max)}\nStatus: ${lead.status}\nNotes: ${lead.notes || "None"}`;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Copied to clipboard");
      })
      .catch(() => {
        toast.error("Failed to copy");
      });
  };

  const downloadMedia = useCallback(
    async (entry: TradeInMediaEntry) => {
      try {
        let signedUrl = mediaSignedUrls[entry.id];
        if (!signedUrl) {
          const path = resolveStoragePath(entry.url);
          if (!path) {
            throw new Error("Invalid storage path");
          }
          const response = await fetch(
            `/api/tradein/media/sign-url?path=${encodeURIComponent(path)}`,
          );
          if (!response.ok) {
            throw new Error("Failed to create download link");
          }
          const data = await response.json();
          signedUrl = data.url;
          setMediaSignedUrls((prev) => ({
            ...prev,
            [entry.id]: signedUrl as string,
          }));
        }
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to open attachment",
        );
      }
    },
    [mediaSignedUrls],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Trade-In Leads</h1>
          <p className="text-muted-foreground">
            Monitor trade-in submissions, status updates, and follow-ups.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Input
            placeholder="Search by brand, model, or customer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full md:w-80"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToExcel}>
                <FileDown className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedLeads.size > 0 && (
            <Button
              variant="destructive"
              onClick={bulkDeleteLeads}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedLeads.size})
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => fetchLeads()}>
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leads">Latest Leads</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            {STATUS_ORDER.slice(0, 3).map((status) => (
              <Card key={status}>
                <CardHeader className="pb-2">
                  <CardDescription>{STATUS_LABELS[status]}</CardDescription>
                  <CardTitle className="text-3xl font-bold">
                    {(statusCounts[status] || 0).toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Leads</CardDescription>
                <CardTitle className="text-3xl font-bold">
                  {leads.length.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </TabsContent>
        <TabsContent value="leads" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trade-In Leads</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading leads..."
                  : `${leads.length} lead${leads.length === 1 ? "" : "s"} loaded`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            leads.length > 0 &&
                            selectedLeads.size === leads.length
                          }
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="min-w-[140px]">Customer</TableHead>
                      <TableHead className="min-w-[200px]">Device</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Price Range</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading trade-in leads…
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && leads.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="py-8 text-center text-muted-foreground">
                            No trade-in leads yet.
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedLeads.has(lead.id)}
                            onCheckedChange={() => toggleLeadSelection(lead.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>{lead.contact_name || "Unknown"}</span>
                            </div>
                            {lead.contact_email && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span>{lead.contact_email}</span>
                              </div>
                            )}
                            {lead.contact_phone && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span>{lead.contact_phone}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {[lead.brand, lead.model, lead.storage]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              <span>Channel: {lead.channel}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {lead.condition
                              ? lead.condition.toUpperCase()
                              : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatPriceRange(lead.range_min, lead.range_max)}
                        </TableCell>
                        <TableCell>
                          <Badge>
                            {STATUS_LABELS[lead.status] || lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(
                            new Date(lead.updated_at || lead.created_at),
                            { addSuffix: true },
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openLeadDetail(lead.id)}
                            >
                              View
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => deleteLead(lead.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog
        open={Boolean(selectedLeadId)}
        onOpenChange={(open) => !open && closeLeadDetail()}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trade-In Lead Details</DialogTitle>
            <DialogDescription>
              {selectedLeadId && `Lead ID: ${selectedLeadId}`}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading lead…
            </div>
          )}

          {!detailLoading && selectedLead && (
            <div className="space-y-6">
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {selectedLead.contact_email && (
                  <Button onClick={openReplyDialog} size="sm">
                    <Mail className="h-4 w-4 mr-2" />
                    Reply via Email
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => shareOnWhatsApp(selectedLead)}
                    >
                      WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => shareOnTelegram(selectedLead)}
                    >
                      Telegram
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => copyToClipboard(selectedLead)}
                    >
                      Copy to Clipboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteLead(selectedLead.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Info className="h-4 w-4" /> Lead Summary
                    </CardTitle>
                    <CardDescription>
                      Created{" "}
                      {formatDistanceToNow(new Date(selectedLead.created_at), {
                        addSuffix: true,
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedLead.contact_name || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedLead.contact_email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedLead.contact_phone || "—"}</span>
                    </div>
                    {selectedLead.preferred_fulfilment && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {selectedLead.preferred_fulfilment === "walk_in"
                            ? "Walk-in"
                            : selectedLead.preferred_fulfilment === "pickup"
                              ? "Pickup"
                              : "Courier"}
                        </span>
                      </div>
                    )}
                    {selectedLead.preferred_payout && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {selectedLead.preferred_payout?.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Status</CardTitle>
                    <CardDescription>
                      Update trade-in lead status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select
                      value={selectedLead.status}
                      onValueChange={(value) =>
                        changeStatus(selectedLead.id, value)
                      }
                      disabled={updatingStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status] || status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Last updated{" "}
                      {formatDistanceToNow(
                        new Date(
                          selectedLead.updated_at || selectedLead.created_at,
                        ),
                        {
                          addSuffix: true,
                        },
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Device Details</CardTitle>
                  <CardDescription>
                    {selectedLead.brand || selectedLead.model
                      ? `${selectedLead.brand ?? ""} ${selectedLead.model ?? ""}`
                      : "Device information"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
                  <div>
                    <span className="font-medium">Storage:</span>{" "}
                    {selectedLead.storage || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Condition:</span>{" "}
                    {selectedLead.condition || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Accessories:</span>{" "}
                    {selectedLead.accessories?.join(", ") || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Defects:</span>{" "}
                    {selectedLead.defects?.join(", ") || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Price Hint:</span>{" "}
                    {selectedLead.price_hint
                      ? `$${selectedLead.price_hint}`
                      : "—"}
                  </div>
                  <div>
                    <span className="font-medium">Guide Range:</span>{" "}
                    {formatPriceRange(
                      selectedLead.range_min,
                      selectedLead.range_max,
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Current Notes Display */}
              {selectedLead.notes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Current Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">
                      {selectedLead.notes}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Attachments</CardTitle>
                    <CardDescription>
                      {selectedLead.trade_in_media.length} file(s)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {selectedLead.trade_in_media.length === 0 && (
                      <div className="text-muted-foreground">
                        No files uploaded yet.
                      </div>
                    )}
                    {selectedLead.trade_in_media.map((media) => {
                      const signedUrl =
                        mediaSignedUrls[media.id] ||
                        (media.url?.startsWith("http") ? media.url : undefined);
                      const displayName = getMediaDisplayName(media);
                      const isImage = media.media_type === "image";

                      return (
                        <div
                          key={media.id}
                          className="rounded border border-border px-3 py-3 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{displayName}</div>
                              <div className="text-xs text-muted-foreground">
                                Uploaded{" "}
                                {formatDistanceToNow(
                                  new Date(media.created_at),
                                  {
                                    addSuffix: true,
                                  },
                                )}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadMedia(media)}
                              disabled={mediaLoading && !signedUrl}
                            >
                              <FileDown className="h-4 w-4 mr-1" />
                              Open
                            </Button>
                          </div>
                          {isImage && (
                            <>
                              {signedUrl ? (
                                <Image
                                  src={signedUrl}
                                  alt={displayName}
                                  width={320}
                                  height={180}
                                  unoptimized
                                  className="h-32 w-full object-cover rounded border border-border"
                                />
                              ) : mediaLoading ? (
                                <div className="text-xs text-muted-foreground">
                                  Loading preview…
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Interaction Timeline
                    </CardTitle>
                    <CardDescription>
                      {selectedLead.trade_in_actions.length} event(s)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm max-h-[300px] overflow-y-auto">
                    {selectedLead.trade_in_actions.length === 0 && (
                      <div className="text-muted-foreground">
                        No timeline events yet.
                      </div>
                    )}
                    {selectedLead.trade_in_actions
                      .slice()
                      .reverse()
                      .map((action) => (
                        <div
                          key={action.id}
                          className="rounded border border-border px-3 py-2"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-xs">
                              {action.action_type
                                .replaceAll("_", " ")
                                .toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(
                                new Date(action.created_at),
                                {
                                  addSuffix: true,
                                },
                              )}
                            </span>
                          </div>
                          {action.payload?.message && (
                            <div className="text-xs mt-1">
                              {action.payload.message}
                            </div>
                          )}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add Internal Note</CardTitle>
                  <CardDescription>
                    Add a note to track interactions and updates
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    placeholder="Add internal note..."
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setNoteDraft("")}
                      disabled={noteDraft.trim().length === 0}
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={addNote}
                      disabled={noteDraft.trim().length === 0}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Save Note
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!detailLoading && !selectedLead && (
            <div className="py-12 text-center text-muted-foreground">
              No lead selected.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Email Reply</DialogTitle>
            <DialogDescription>
              Reply to {selectedLead?.contact_email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type your message..."
                rows={10}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setReplyDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={sendReply}
                disabled={
                  sendingReply || !replySubject.trim() || !replyMessage.trim()
                }
              >
                {sendingReply ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Reply
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
