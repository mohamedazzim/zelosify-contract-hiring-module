"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Briefcase, Calendar, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { Button } from "@/components/UI/shadcn/button";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/UI/shadcn/alert-dialog";
import EmptyState from "@/components/common/EmptyState";
import ErrorComponent from "@/components/common/ErrorComponent";
import Pagination from "./Pagination";
import ProfileCard from "./ProfileCard";

const POLL_INTERVAL_MS = 15000; // gentle 15s polling
const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

function hasActiveRecommendations(profiles) {
  return profiles.some(
    (p) => p.recommendationStatus === "PENDING" || p.recommendationStatus === "PROCESSING"
  );
}

export default function OpeningDetailLayout() {
  const params = useParams();
  const router = useRouter();
  const openingId = params.id;

  const [opening, setOpening] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Shortlist / Reject state
  const [pendingAction, setPendingAction] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  // Polling guard
  const inFlight = useRef(false);

  const fetchProfiles = useCallback(
    async (page = 1, { silent = false } = {}) => {
      if (inFlight.current) return; // prevent overlapping requests
      inFlight.current = true;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axiosInstance.get(
          `/api/v1/hiring-manager/openings/${openingId}/profiles?page=${page}&limit=10`
        );
        const data = res.data.data;
        setOpening(data.opening);
        setProfiles(data.profiles || []);
        setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } catch (err) {
        if (!silent) {
          setError(err.response?.data?.message || "Failed to load opening details");
        }
      } finally {
        inFlight.current = false;
        if (!silent) setLoading(false);
      }
    },
    [openingId]
  );

  // Initial load + refetch when page changes
  useEffect(() => {
    if (openingId) fetchProfiles(1);
  }, [openingId, fetchProfiles]);

  // Gentle polling: stop when no visible profiles are PENDING/PROCESSING
  useEffect(() => {
    if (!profiles.length) return;
    if (!hasActiveRecommendations(profiles)) return;
    const timer = setInterval(() => {
      fetchProfiles(pagination.page, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [profiles, pagination.page, fetchProfiles]);

  const updateProfileFromResponse = useCallback((updatedProfile) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p))
    );
  }, []);

  // Shortlist
  const handleShortlist = useCallback(
    async (profile) => {
      setPendingAction(profile.id);
      try {
        const res = await axiosInstance.post(
          `/api/v1/hiring-manager/profiles/${profile.id}/shortlist`
        );
        updateProfileFromResponse(res.data.data.profile);
        toast.success(res.data.message || "Profile shortlisted");
      } catch (err) {
        const status = err.response?.status;
        const message = err.response?.data?.message;
        if (status === 404) toast.error("Profile not found or access denied.");
        else if (status === 409) toast.error(message || "Profile state does not allow shortlisting.");
        else if (status === 403) toast.error("You are not authorized to shortlist this profile.");
        else toast.error(message || "Failed to shortlist profile.");
      } finally {
        setPendingAction(null);
      }
    },
    [updateProfileFromResponse]
  );

  // Reject (confirmation dialog)
  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const profile = rejectTarget;
    setRejectTarget(null);
    setPendingAction(profile.id);
    try {
      const res = await axiosInstance.post(
        `/api/v1/hiring-manager/profiles/${profile.id}/reject`
      );
      updateProfileFromResponse(res.data.data.profile);
      toast.success(res.data.message || "Profile rejected");
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      if (status === 404) toast.error("Profile not found or access denied.");
      else if (status === 409) toast.error(message || "Profile cannot be rejected in its current state.");
      else if (status === 403) toast.error("You are not authorized to reject this profile.");
      else toast.error(message || "Failed to reject profile.");
    } finally {
      setPendingAction(null);
    }
  }, [rejectTarget, updateProfileFromResponse]);

  const openRejectDialog = useCallback((profile) => {
    setRejectTarget(profile);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen bg-background px-2">
        <div className="flex-1 overflow-y-auto p-4">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (error && !opening) {
    return (
      <div className="flex h-screen bg-background px-2">
        <div className="flex-1 overflow-y-auto p-4">
          <ErrorComponent message={error} onRetry={() => fetchProfiles(1)} />
        </div>
      </div>
    );
  }

  const activeRecommendations = hasActiveRecommendations(profiles);

  return (
    <div className="flex h-screen bg-background px-2">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Back + Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/hiring-manager/openings")}
            aria-label="Back to openings"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{opening?.title}</h1>
        </div>

        {/* Opening Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <InfoCard icon={<MapPin className="h-4 w-4" />} label="Location" value={opening?.location} />
          <InfoCard icon={<Briefcase className="h-4 w-4" />} label="Contract Type" value={opening?.contractType} />
          <InfoCard icon={<Calendar className="h-4 w-4" />} label="Posted" value={formatDate(opening?.postedDate)} />
          <InfoCard icon={<FileText className="h-4 w-4" />} label="Status" value={opening?.status} />
        </div>

        {/* Profiles Section */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Candidate Profiles ({pagination.total})
          </h2>
          <div className="flex items-center gap-2">
            {activeRecommendations && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Auto-refreshing pending recommendations
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProfiles(pagination.page)}
              aria-label="Refresh profiles"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <ErrorComponent message={error} onRetry={() => fetchProfiles(pagination.page)} />
        )}

        {!error && profiles.length === 0 && (
          <EmptyState
            title="No profiles submitted"
            message="Candidates have not submitted profiles for this opening yet."
            icon={<FileText className="w-10 h-10 text-muted-foreground" />}
          />
        )}

        {!error && profiles.length > 0 && (
          <>
            <div className="space-y-3">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onShortlist={handleShortlist}
                  onReject={openRejectDialog}
                  pendingAction={pendingAction}
                />
              ))}
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(page) => fetchProfiles(page)}
            />
          </>
        )}
      </div>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject{" "}
              <span className="font-medium text-foreground">
                {rejectTarget?.fileName || `profile #${rejectTarget?.id}`}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === rejectTarget?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRejectConfirm}
              disabled={pendingAction === rejectTarget?.id}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div className="p-3 border border-border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-sm text-foreground font-medium">{value || "—"}</p>
    </div>
  );
}
