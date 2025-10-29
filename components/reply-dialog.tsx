"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Reply,
  Sparkles,
  Send,
  Copy,
  CheckCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReplyDialogProps {
  submission: {
    id: string;
    ai_metadata: any;
    content_type?: string;
  };
  onReplySent?: () => void;
}

interface DraftReply {
  to: string;
  subject: string;
  content: string;
  type: "contact" | "trade-in" | "agent";
}

export function ReplyDialog({ submission, onReplySent }: ReplyDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const metadata = submission.ai_metadata || {};
  const primaryEmail =
    metadata.email ||
    metadata.sender_email ||
    metadata.customer_email ||
    metadata.contact_email ||
    metadata.user_email ||
    "";
  const displayName =
    metadata.name ||
    metadata.sender_name ||
    (metadata.names
      ? `${metadata.names.first_name || ""} ${metadata.names.last_name || ""}`.trim()
      : metadata.customer_name || metadata.contact_name || "Customer");
  const isTradeInSubmission = Boolean(
    metadata.device_type || metadata.console_type || metadata.body_condition,
  );
  const emailType =
    typeof metadata.email_type === "string" ? metadata.email_type : "";
  const isAgentSubmission =
    submission.content_type === "Agent" ||
    metadata.sent_via === "chatkit_agent" ||
    emailType === "contact" ||
    emailType === "info_request";
  const submissionType = isTradeInSubmission
    ? "Trade-in Form"
    : isAgentSubmission
      ? "Agent Request"
      : "Contact Form";

  const generateDraft = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/submissions/${submission.id}/draft-reply`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        const data = await response.json();
        setDraft(data.draft);
      } else {
        console.error("Failed to generate draft");
      }
    } catch (error) {
      console.error("Error generating draft:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!draft) return;
    const toAddress = draft.to || primaryEmail || "(missing recipient)";

    const emailText = `To: ${toAddress}
Subject: ${draft.subject}

${draft.content}`;

    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const sendEmail = () => {
    if (!draft) return;
    const toAddress = draft.to || primaryEmail;
    if (!toAddress) {
      console.warn("No email address available for reply");
      return;
    }

    // Create mailto link with pre-filled content
    const subject = encodeURIComponent(draft.subject);
    const body = encodeURIComponent(draft.content);
    const mailtoLink = `mailto:${toAddress}?subject=${subject}&body=${body}`;

    window.open(mailtoLink, "_blank");
    onReplySent?.();
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setDraft(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Reply className="h-4 w-4" />
          Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Reply className="h-5 w-5" />
            Reply to {displayName || "Customer"}
          </DialogTitle>
          <DialogDescription>
            Generate an AI-powered reply draft or compose your own response
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Customer Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <strong>Email:</strong> {primaryEmail || "Not provided"}
              </div>
              <div>
                <strong>Name:</strong> {displayName || "Not provided"}
              </div>
              <div>
                <strong>Subject:</strong> {metadata.subject || "No subject"}
              </div>
              <div>
                <strong>Type:</strong> {submissionType}
              </div>
            </div>
          </div>

          {/* Generate Draft Button */}
          {!draft && (
            <div className="text-center py-6">
              <Button
                onClick={generateDraft}
                disabled={loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate AI Reply Draft
              </Button>
            </div>
          )}

          {/* Draft Preview */}
          {draft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Generated Draft
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    className="flex items-center gap-2"
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    onClick={() => setDraft(null)}
                    variant="ghost"
                    size="sm"
                  >
                    Regenerate
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="to">To:</Label>
                  <Input
                    id="to"
                    value={draft.to || primaryEmail}
                    readOnly
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="subject">Subject:</Label>
                  <Input
                    id="subject"
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="content">Message:</Label>
                  <Textarea
                    id="content"
                    value={draft.content}
                    onChange={(e) =>
                      setDraft({ ...draft, content: e.target.value })
                    }
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {draft && (
            <Button onClick={sendEmail} className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
