"use client";
import { FileText, Calendar, Check, X } from "lucide-react";
import { Button } from "@/components/UI/shadcn/button";
import RecommendationBadge from "./RecommendationBadge";
import { Skeleton } from "@/components/UI/shadcn/skeleton";

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const PROFILE_STATUS_TONE = {
  SUBMITTED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SHORTLISTED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function ProfileStatusBadge({ status }) {
  return (
    <span
      role="status"
      aria-label={`Profile status: ${status}`}
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        PROFILE_STATUS_TONE[status] || "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

/**
 * Single candidate profile card for a hiring manager.
 * - FAILED reasons are already sanitized by the backend; we render them as plain
 *   text (never HTML) so nothing from a resume can execute.
 * - PENDING/PROCESSING show skeleton/loading states and NEVER show a stale score.
 * - Shortlist/Reject actions are hidden when the profile state would be rejected
 *   by the backend (REJECTED can't be shortlisted; SHORTLISTED can't be rejected).
 */
export default function ProfileCard({
  profile,
  onShortlist,
  onReject,
  pendingAction,
}) {
  const isCompleted = profile.recommendationStatus === "COMPLETED";
  const isPending = profile.recommendationStatus === "PENDING";
  const isProcessing = profile.recommendationStatus === "PROCESSING";
  const isFailed = profile.recommendationStatus === "FAILED";

  const scorePct =
    isCompleted && profile.recommendationScore != null
      ? Math.round(profile.recommendationScore * 100)
      : null;
  const confidencePct =
    isCompleted && profile.recommendationConfidence != null
      ? Math.round(profile.recommendationConfidence * 100)
      : null;

  const actionDisabled = pendingAction === profile.id;

  // Hide actions the backend would reject based on state.
  const canShortlist = profile.status === "SUBMITTED";
  const canReject = profile.status === "SUBMITTED";

  return (
    <div className="border border-border rounded-lg bg-card p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">
            {profile.fileName || `Profile #${profile.id}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProfileStatusBadge status={profile.status} />
          <RecommendationBadge
            recommendationStatus={profile.recommendationStatus}
            recommended={profile.recommended}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          Submitted {formatDate(profile.submittedAt)}
        </span>
      </div>

      {/* Recommendation body */}
      <div className="text-sm text-foreground">
        {isPending && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-56" />
            <p className="text-xs text-muted-foreground">
              Recommendation is pending. This profile will be processed shortly.
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
            <p className="text-xs text-muted-foreground">
              Recommendation is being generated. The score will appear once ready.
            </p>
          </div>
        )}

        {isFailed && (
          <p className="text-xs text-muted-foreground">
            Automated AI recommendation could not be completed for this profile.
          </p>
        )}

        {isCompleted && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs text-muted-foreground">
                Score: <span className="font-semibold text-foreground">{scorePct}%</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Confidence: <span className="font-semibold text-foreground">{confidencePct}%</span>
              </span>
              {profile.recommendationLatencyMs != null && (
                <span className="text-xs text-muted-foreground">
                  Latency: {(profile.recommendationLatencyMs / 1000).toFixed(2)}s
                </span>
              )}
            </div>
            {profile.recommendationReason && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {profile.recommendationReason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {(canShortlist || canReject) && (
        <div className="flex items-center gap-2 pt-1">
          {canShortlist && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onShortlist(profile)}
              disabled={actionDisabled}
              aria-label={`Shortlist ${profile.fileName || profile.id}`}
            >
              <Check className="h-4 w-4" />
              {pendingAction === profile.id && "Shortlisting..."}
              {pendingAction !== profile.id && "Shortlist"}
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive border-border"
              onClick={() => onReject(profile)}
              disabled={actionDisabled}
              aria-label={`Reject ${profile.fileName || profile.id}`}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          )}
        </div>
      )}

      {isFailed && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
          Retry is not available for failed recommendations at this time.
        </p>
      )}
    </div>
  );
}
