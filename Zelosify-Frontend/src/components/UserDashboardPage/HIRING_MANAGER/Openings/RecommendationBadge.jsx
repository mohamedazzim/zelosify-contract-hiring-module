"use client";
import { Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

/**
 * Renders a safe recommendation status badge.
 * Only displays internal recommendation details for COMPLETED profiles.
 * PENDING / PROCESSING / FAILED render explicit safe states — never raw
 * error messages, stack traces, or API codes.
 */
export default function RecommendationBadge({ recommendationStatus, recommended }) {
  const status = recommendationStatus || "PENDING";

  switch (status) {
    case "COMPLETED":
      if (recommended === true) {
        return <StatusBadge tone="green" icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Recommended" />;
      }
      if (recommended === false) {
        return <StatusBadge tone="red" icon={<XCircle className="h-3.5 w-3.5" />} label="Not Recommended" />;
      }
      return <StatusBadge tone="gray" label="Completed" />;

    case "PROCESSING":
      return (
        <StatusBadge
          tone="blue"
          icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
          label="Processing"
        />
      );

    case "FAILED":
      return (
        <StatusBadge
          tone="amber"
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="Failed"
        />
      );

    case "PENDING":
    default:
      return (
        <StatusBadge tone="gray" icon={<Clock className="h-3.5 w-3.5" />} label="Pending" />
      );
  }
}

const TONES = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  gray: "bg-muted text-muted-foreground",
};

function StatusBadge({ tone, icon, label }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONES[tone] || TONES.gray}`}
    >
      {icon}
      {label}
    </span>
  );
}
