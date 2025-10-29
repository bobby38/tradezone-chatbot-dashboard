"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import {
  Calendar,
  Mail,
  Phone,
  User,
  MessageSquare,
  Globe,
  Monitor,
  Clock,
  TrendingUp,
  Users,
  Eye,
  CheckCircle,
  Download,
  FileText,
  FileSpreadsheet,
  Trash2,
  MoreHorizontal,
  Reply,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReplyDialog } from "@/components/reply-dialog";

interface Submission {
  id: string;
  title: string;
  content_input: string;
  content_type: string;
  ai_metadata: any;
  status: string;
  created_at: string;
}

interface SubmissionStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

interface FormData {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  company?: string;
  [key: string]: any;
}

const getSubmissionEmail = (submission: Submission): string => {
  const metadata = submission.ai_metadata || {};
  return (
    metadata.sender_email ||
    metadata.email ||
    metadata.customer_email ||
    metadata.contact_email ||
    metadata.user_email ||
    ""
  );
};

const getSubmissionName = (submission: Submission): string => {
  const metadata = submission.ai_metadata || {};
  return (
    metadata.sender_name ||
    metadata.name ||
    (metadata.names
      ? `${metadata.names.first_name || ""} ${metadata.names.last_name || ""}`.trim()
      : metadata.customer_name || metadata.contact_name || "Anonymous") ||
    "Anonymous"
  );
};

const normalizeSubmissionForReply = (submission: Submission): Submission => {
  const email = getSubmissionEmail(submission);
  const name = getSubmissionName(submission);

  if (!email && name === "Anonymous") {
    return submission;
  }

  return {
    ...submission,
    ai_metadata: {
      ...submission.ai_metadata,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    },
  };
};

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(
    new Set(),
  );
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/submissions");

      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }

      const data = await response.json();
      setSubmissions(data.submissions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch submissions",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateStats = useCallback(() => {
    if (submissions.length === 0) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats: SubmissionStats = {
      total: submissions.length,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      byStatus: {},
      byType: {},
    };

    submissions.forEach((submission) => {
      const submissionDate = new Date(submission.created_at);

      // Date-based stats
      if (submissionDate >= today) stats.today++;
      if (submissionDate >= weekAgo) stats.thisWeek++;
      if (submissionDate >= monthAgo) stats.thisMonth++;

      // Status stats
      stats.byStatus[submission.status] =
        (stats.byStatus[submission.status] || 0) + 1;

      // Type stats
      const formType = getFormType(submission);
      stats.byType[formType] = (stats.byType[formType] || 0) + 1;
    });

    setStats(stats);
  }, [submissions]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    calculateStats();
  }, [calculateStats]);

  const getFormType = (submission: Submission): string => {
    // Check content_type first (set by AI agent)
    if (submission.content_type === "Agent") {
      return "Agent";
    }

    // Check for trade-in indicators (both Agent and Fluent Form fields)
    const metadata = submission.ai_metadata || {};

    // Agent trade-in fields
    if (metadata.device_type || metadata.console_type) {
      return "Trade-in Form";
    }

    // Fluent Form trade-in fields
    if (
      metadata.checkbox_1 || // Category field (Gaming Consoles, Gadgets, etc.)
      metadata.dropdown_6 || // Brand field (PlayStation, Nintendo, etc.)
      metadata.checkbox_2 || // Device type field
      metadata.input_radio_2 || // Model field
      metadata.dropdown_3 || // Condition field
      metadata["image-upload"] // Trade-in images
    ) {
      return "Trade-in Form";
    }

    // Default to Contact Form (from Fluent Forms)
    return "Contact Form";
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedSubmissions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSubmissions(newExpanded);
  };

  const toggleSelected = (id: string) => {
    const newSelected = new Set(selectedSubmissions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSubmissions(newSelected);
  };

  const selectAll = () => {
    if (selectedSubmissions.size === submissions.length) {
      setSelectedSubmissions(new Set());
    } else {
      setSelectedSubmissions(new Set(submissions.map((s) => s.id)));
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const csvData = submissions.map((submission) => ({
        id: submission.id,
        type: getFormType(submission),
        name: submission.ai_metadata?.name || "",
        email: submission.ai_metadata?.email || "",
        phone: submission.ai_metadata?.phone || "",
        subject: submission.ai_metadata?.subject || "",
        message: submission.ai_metadata?.message || "",
        company: submission.ai_metadata?.company || "",
        device_type: submission.ai_metadata?.device_type || "",
        brand: submission.ai_metadata?.brand || "",
        model: submission.ai_metadata?.model || "",
        body_condition: submission.ai_metadata?.body_condition || "",
        status: submission.status,
        created_at: submission.created_at,
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
      link.download = `form-submissions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = () => {
    setExporting(true);
    try {
      const data = submissions.map((submission) => ({
        ID: submission.id,
        Type: getFormType(submission),
        Name: submission.ai_metadata?.name || "",
        Email: submission.ai_metadata?.email || "",
        Phone: submission.ai_metadata?.phone || "",
        Subject: submission.ai_metadata?.subject || "",
        Message: submission.ai_metadata?.message || "",
        Company: submission.ai_metadata?.company || "",
        "Device Type": submission.ai_metadata?.device_type || "",
        Brand: submission.ai_metadata?.brand || "",
        Model: submission.ai_metadata?.model || "",
        Condition: submission.ai_metadata?.body_condition || "",
        Status: submission.status,
        "Created At": new Date(submission.created_at).toLocaleString(),
      }));

      // Create a simple tab-delimited format that Excel can open
      const headers = Object.keys(data[0]).join("\t");
      const rows = data.map((row) => Object.values(row).join("\t"));
      const tsv = [headers, ...rows].join("\n");

      const blob = new Blob([tsv], { type: "text/tab-separated-values" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `form-submissions-${new Date().toISOString().split("T")[0]}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedSubmissions.size === 0) return;

    if (
      !confirm(
        `Are you sure you want to delete ${selectedSubmissions.size} submission(s)? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const deletePromises = Array.from(selectedSubmissions).map(async (id) => {
        const response = await fetch(`/api/submissions/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`Failed to delete submission ${id}`);
        }
        return id;
      });

      await Promise.all(deletePromises);

      // Remove deleted submissions from state
      setSubmissions((prev) =>
        prev.filter((s) => !selectedSubmissions.has(s.id)),
      );
      setSelectedSubmissions(new Set());

      // Recalculate stats
      calculateStats();
    } catch (error) {
      console.error("Delete error:", error);
      setError(
        error instanceof Error ? error.message : "Failed to delete submissions",
      );
    } finally {
      setDeleting(false);
    }
  };

  const renderFormData = (submission: Submission) => {
    const formData = submission.ai_metadata as FormData;
    const formType = getFormType(submission);
    const isTradeIn = formType === "Trade-in Form";
    const isAgent = formType === "Agent";

    // Extract contact info (handle both Agent and Form submissions)
    const name =
      formData.sender_name ||
      formData.name ||
      (formData.names
        ? `${formData.names.first_name || ""} ${formData.names.last_name || ""}`.trim()
        : "");
    const email = formData.sender_email || formData.email;
    const phone = formData.phone;
    const company = formData.company;
    const message = formData.context || formData.message;
    const subject = formData.subject;

    // Extract trade-in specific data (handle multiple dropdown fields)
    const tradeInData = {
      category: formData.checkbox_1?.[0],
      deviceType: formData.checkbox_2?.[0],
      brand: formData.dropdown_6 || formData.dropdown_1 || formData.dropdown_2,
      model:
        formData.input_radio_2 ||
        formData.input_radio_1 ||
        formData.input_radio,
      storage:
        formData.dropdown_7 || formData.dropdown_9 || formData.dropdown_8,
      condition:
        formData.dropdown_3 || formData.dropdown_4 || formData.dropdown_5,
      accessories: formData.dropdown_10,
      size: formData.input_radio_3, // For clothing/accessories
      address: formData.address_1
        ? `${formData.address_1.address_line_1}, ${formData.address_1.city}, ${formData.address_1.state}, ${formData.address_1.zip}, ${formData.address_1.country}`
        : null,
      images: formData["image-upload"] || [],
    };

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Contact Information */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Contact Information
            </h4>
            <div className="space-y-2">
              {name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{name}</span>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{email}</span>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{phone}</span>
                </div>
              )}
              {company && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{company}</span>
                </div>
              )}
              {tradeInData.address && (
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm">{tradeInData.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Message/Details */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              {isTradeIn ? "Device Information" : "Message Details"}
            </h4>
            <div className="space-y-2">
              {subject && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Subject:</span>
                  </div>
                  <p className="text-sm pl-6">{subject}</p>
                </div>
              )}
              {message && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Message:</span>
                  </div>
                  <p className="text-sm pl-6 whitespace-pre-wrap">{message}</p>
                </div>
              )}
              {isTradeIn && (
                <div className="space-y-3 mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h5 className="font-semibold text-sm text-blue-900 dark:text-blue-100 uppercase tracking-wide flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Trade-In Device Details
                  </h5>
                  <div className="grid gap-2">
                    {tradeInData.category && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Category:
                        </span>
                        <Badge
                          variant="outline"
                          className="bg-blue-100 dark:bg-blue-900"
                        >
                          {tradeInData.category}
                        </Badge>
                      </div>
                    )}
                    {tradeInData.deviceType && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Device Type:
                        </span>
                        <span className="text-sm">
                          {tradeInData.deviceType}
                        </span>
                      </div>
                    )}
                    {tradeInData.brand && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Brand:
                        </span>
                        <span className="text-sm font-semibold">
                          {tradeInData.brand}
                        </span>
                      </div>
                    )}
                    {tradeInData.model && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Model:
                        </span>
                        <span className="text-sm font-semibold">
                          {tradeInData.model}
                        </span>
                      </div>
                    )}
                    {tradeInData.storage && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Storage:
                        </span>
                        <span className="text-sm">{tradeInData.storage}</span>
                      </div>
                    )}
                    {tradeInData.condition && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Condition:
                        </span>
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                          {tradeInData.condition}
                        </span>
                      </div>
                    )}
                    {tradeInData.accessories && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Accessories:
                        </span>
                        <span className="text-sm">
                          {tradeInData.accessories}
                        </span>
                      </div>
                    )}
                    {tradeInData.size && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 min-w-[100px]">
                          Size:
                        </span>
                        <span className="text-sm">{tradeInData.size}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trade-in Images */}
        {isTradeIn && tradeInData.images.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Uploaded Images ({tradeInData.images.length})
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {tradeInData.images.map((imageUrl: string, index: number) => (
                <a
                  key={index}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border rounded-lg overflow-hidden hover:opacity-75 transition-opacity"
                >
                  <Image
                    src={imageUrl}
                    alt={`Trade-in image ${index + 1}`}
                    width={400}
                    height={256}
                    className="w-full h-32 object-cover"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Technical Details (for debugging) */}
        {isAgent && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Technical Details
            </summary>
            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Form Submissions
          </h1>
          <p className="text-muted-foreground">Loading submissions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Form Submissions
          </h1>
          <p className="text-red-500">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Form Submissions
          </h1>
          <p className="text-muted-foreground">
            View and manage form submissions from your website
          </p>
        </div>

        <div className="flex gap-2">
          {selectedSubmissions.size > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteSelected}
                disabled={deleting}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting
                  ? "Deleting..."
                  : `Delete ${selectedSubmissions.size}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSubmissions(new Set())}
              >
                Clear Selection
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Exporting..." : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Submissions
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All time submissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-muted-foreground">Submissions today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisWeek}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisMonth}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agent">Agent Requests</TabsTrigger>
            <TabsTrigger value="contact">Contact Forms</TabsTrigger>
            <TabsTrigger value="tradein">Trade-in Forms</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {activeTab === "overview" && submissions.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedSubmissions.size === submissions.length}
                onCheckedChange={selectAll}
              />
              <span className="text-sm text-muted-foreground">
                Select All ({submissions.length})
              </span>
            </div>
          )}
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4">
            {submissions.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No submissions found
                  </p>
                </CardContent>
              </Card>
            ) : (
              submissions.map((submission) => {
                const submissionEmail = getSubmissionEmail(submission);
                const displayName = getSubmissionName(submission);
                const normalizedSubmission =
                  normalizeSubmissionForReply(submission);

                return (
                  <Card key={submission.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedSubmissions.has(submission.id)}
                            onCheckedChange={() =>
                              toggleSelected(submission.id)
                            }
                          />
                          <div className="flex items-center gap-2">
                            {getFormType(submission) === "Trade-in Form" ? (
                              <Monitor className="h-5 w-5 text-blue-500" />
                            ) : getFormType(submission) === "Agent" ? (
                              <MessageSquare className="h-5 w-5 text-purple-500" />
                            ) : (
                              <Mail className="h-5 w-5 text-green-500" />
                            )}
                            <CardTitle className="text-lg">
                              {displayName}
                            </CardTitle>
                          </div>
                          <Badge variant="outline">
                            {getFormType(submission)}
                          </Badge>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Badge
                            variant={
                              submission.status === "ready"
                                ? "secondary"
                                : "default"
                            }
                            className="flex items-center gap-1"
                          >
                            {submission.status === "ready" && (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            {submission.status}
                          </Badge>
                          {(submissionEmail ||
                            submission.ai_metadata?.email) && (
                            <ReplyDialog
                              submission={normalizedSubmission}
                              onReplySent={() => {
                                // Refresh submissions or update status
                                fetchSubmissions();
                              }}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(submission.id)}
                          >
                            <Eye className="h-4 w-4" />
                            {expandedSubmissions.has(submission.id)
                              ? "Hide"
                              : "View"}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {formatDate(submission.created_at)}
                        {submissionEmail && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-xs sm:text-sm">
                              {submissionEmail}
                            </span>
                          </>
                        )}
                        {submission.ai_metadata?.subject && (
                          <>
                            <span>•</span>
                            <span className="font-medium">
                              {submission.ai_metadata.subject}
                            </span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>

                    {expandedSubmissions.has(submission.id) && (
                      <CardContent>
                        <div className="space-y-6">
                          {renderFormData(submission)}

                          {/* Technical Details - Collapsed by default */}
                          <details className="space-y-2">
                            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                              Technical Details
                            </summary>
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              <div>
                                <h5 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">
                                  Structured Data:
                                </h5>
                                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
                                  {JSON.stringify(
                                    submission.ai_metadata,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                              <div>
                                <h5 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">
                                  Raw Webhook:
                                </h5>
                                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
                                  {submission.content_input}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="agent">
          <div className="grid gap-4">
            {submissions
              .filter((s) => getFormType(s) === "Agent")
              .map((submission) => {
                const submissionEmail = getSubmissionEmail(submission);
                const displayName = getSubmissionName(submission);
                const normalizedSubmission =
                  normalizeSubmissionForReply(submission);

                return (
                  <Card key={submission.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedSubmissions.has(submission.id)}
                            onCheckedChange={() =>
                              toggleSelected(submission.id)
                            }
                          />
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-purple-500" />
                            <CardTitle>{displayName}</CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-purple-50 text-purple-700 border-purple-200"
                          >
                            Agent
                          </Badge>
                          <Badge variant="secondary">{submission.status}</Badge>
                          {(submissionEmail ||
                            submission.ai_metadata?.email) && (
                            <ReplyDialog
                              submission={normalizedSubmission}
                              onReplySent={() => fetchSubmissions()}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(submission.id)}
                          >
                            <Eye className="h-4 w-4" />
                            {expandedSubmissions.has(submission.id)
                              ? "Hide"
                              : "View"}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {formatDate(submission.created_at)}
                        {submissionEmail && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-xs sm:text-sm">
                              {submissionEmail}
                            </span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>
                    {expandedSubmissions.has(submission.id) && (
                      <CardContent>{renderFormData(submission)}</CardContent>
                    )}
                  </Card>
                );
              })}
            {submissions.filter((s) => getFormType(s) === "Agent").length ===
              0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No agent requests found
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="contact">
          <div className="grid gap-4">
            {submissions
              .filter((s) => getFormType(s) === "Contact Form")
              .map((submission) => {
                const submissionEmail = getSubmissionEmail(submission);
                const displayName = getSubmissionName(submission);
                const normalizedSubmission =
                  normalizeSubmissionForReply(submission);

                return (
                  <Card key={submission.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedSubmissions.has(submission.id)}
                            onCheckedChange={() =>
                              toggleSelected(submission.id)
                            }
                          />
                          <div className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-green-500" />
                            <CardTitle>{displayName}</CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{submission.status}</Badge>
                          {(submissionEmail ||
                            submission.ai_metadata?.email) && (
                            <ReplyDialog
                              submission={normalizedSubmission}
                              onReplySent={() => fetchSubmissions()}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(submission.id)}
                          >
                            <Eye className="h-4 w-4" />
                            {expandedSubmissions.has(submission.id)
                              ? "Hide"
                              : "View"}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {formatDate(submission.created_at)}
                        {submissionEmail && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-xs sm:text-sm">
                              {submissionEmail}
                            </span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>
                    {expandedSubmissions.has(submission.id) && (
                      <CardContent>{renderFormData(submission)}</CardContent>
                    )}
                  </Card>
                );
              })}
            {submissions.filter((s) => getFormType(s) === "Contact Form")
              .length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No contact form submissions found
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tradein">
          <div className="grid gap-4">
            {submissions
              .filter((s) => getFormType(s) === "Trade-in Form")
              .map((submission) => {
                const submissionEmail = getSubmissionEmail(submission);
                const displayName = getSubmissionName(submission);
                const normalizedSubmission =
                  normalizeSubmissionForReply(submission);

                return (
                  <Card key={submission.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedSubmissions.has(submission.id)}
                            onCheckedChange={() =>
                              toggleSelected(submission.id)
                            }
                          />
                          <div className="flex items-center gap-2">
                            <Monitor className="h-5 w-5 text-blue-500" />
                            <CardTitle>{displayName}</CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{submission.status}</Badge>
                          {(submissionEmail ||
                            submission.ai_metadata?.email) && (
                            <ReplyDialog
                              submission={normalizedSubmission}
                              onReplySent={() => fetchSubmissions()}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(submission.id)}
                          >
                            <Eye className="h-4 w-4" />
                            {expandedSubmissions.has(submission.id)
                              ? "Hide"
                              : "View"}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {formatDate(submission.created_at)}
                        {submissionEmail && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-xs sm:text-sm">
                              {submissionEmail}
                            </span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>
                    {expandedSubmissions.has(submission.id) && (
                      <CardContent>{renderFormData(submission)}</CardContent>
                    )}
                  </Card>
                );
              })}
            {submissions.filter((s) => getFormType(s) === "Trade-in Form")
              .length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No trade-in form submissions found
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Form Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Form Types</CardTitle>
                <CardDescription>
                  Distribution of form submissions by type
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats &&
                  Object.entries(stats.byType).map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        {type === "Trade-in Form" ? (
                          <Monitor className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Mail className="h-4 w-4 text-green-500" />
                        )}
                        <span>{type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{count}</Badge>
                        <span className="text-sm text-muted-foreground">
                          ({Math.round((count / stats.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Submission Status</CardTitle>
                <CardDescription>
                  Current status of all submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats &&
                  Object.entries(stats.byStatus).map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        {status === "ready" && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <span className="capitalize">{status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{count}</Badge>
                        <span className="text-sm text-muted-foreground">
                          ({Math.round((count / stats.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
