"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  Calendar,
  User,
  Upload,
  Eye,
  Trash2,
  FileText,
} from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { Button } from "@/components/UI/shadcn/button";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/UI/shadcn/dialog";
import EmptyState from "@/components/common/EmptyState";
import ErrorComponent from "@/components/common/ErrorComponent";
import FileDropzone from "./FileDropzone";

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const deriveFilename = (s3Key) => {
  if (!s3Key) return "unknown";
  const parts = s3Key.split("/");
  const last = parts[parts.length - 1];
  // Strip the timestamp prefix (e.g. "1234567890_file.pdf" → "file.pdf")
  return last.replace(/^\d+_/, "");
};

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function OpeningDetailLayout() {
  const params = useParams();
  const router = useRouter();
  const openingId = params.id;

  const [opening, setOpening] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState(null);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/api/v1/vendor/openings/${openingId}`);
      setOpening(res.data.data.opening);
      setProfiles(res.data.data.profiles);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load opening details");
    } finally {
      setLoading(false);
    }
  }, [openingId]);

  useEffect(() => {
    if (openingId) fetchDetails();
  }, [openingId, fetchDetails]);

  // Upload flow: presign → PUT to S3 → confirm
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress("Requesting presigned URLs...");
    try {
      // Step 1: Get presigned URLs
      const filenames = selectedFiles.map((f) => f.name);
      const presignRes = await axiosInstance.post(
        `/api/v1/vendor/openings/${openingId}/profiles/presign`,
        { filenames }
      );
      const presignData = presignRes.data.data;

      // Step 2: Upload each file directly to S3
      for (let i = 0; i < presignData.length; i++) {
        const { url, mimeType } = presignData[i];
        setUploadProgress(`Uploading ${i + 1} of ${presignData.length}...`);
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: selectedFiles[i],
        });
      }

      // Step 3: Confirm upload
      setUploadProgress("Confirming upload...");
      const filesPayload = presignData.map((d) => ({
        s3Key: d.s3Key,
        filename: d.filename,
      }));
      await axiosInstance.post(
        `/api/v1/vendor/openings/${openingId}/profiles/upload`,
        { files: filesPayload }
      );

      // Clear and refetch
      setSelectedFiles([]);
      setUploadProgress("");
      await fetchDetails();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  // Delete flow
  const handleDeleteConfirm = async () => {
    if (!profileToDelete) return;
    try {
      await axiosInstance.patch(
        `/api/v1/vendor/openings/${openingId}/profiles/${profileToDelete}`
      );
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
      await fetchDetails();
    } catch (err) {
      setError(err.response?.data?.message || "Delete failed");
    }
  };

  const openPreview = (profileId) => {
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    window.open(
      `${baseUrl}/api/v1/vendor/openings/${openingId}/profiles/${profileId}/preview`,
      "_blank"
    );
  };

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
          <ErrorComponent message={error} onRetry={fetchDetails} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background px-2">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Back button + Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/vendor/openings")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {opening?.title}
          </h1>
        </div>

        {/* Opening Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard icon={<MapPin className="h-4 w-4" />} label="Location" value={opening?.location} />
          <InfoCard icon={<Briefcase className="h-4 w-4" />} label="Contract Type" value={opening?.contractType} />
          <InfoCard icon={<User className="h-4 w-4" />} label="Hiring Manager" value={opening?.hiringManager?.name} />
          <InfoCard icon={<Calendar className="h-4 w-4" />} label="Posted" value={formatDate(opening?.postedDate)} />
          <InfoCard icon={<Briefcase className="h-4 w-4" />} label="Experience" value={
            opening?.experienceMin != null
              ? `${opening.experienceMin}${opening.experienceMax ? ` – ${opening.experienceMax}` : "+"} yrs`
              : "—"
          } />
          <InfoCard icon={<FileText className="h-4 w-4" />} label="Status" value={opening?.status} />
        </div>

        {opening?.description && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Description</h2>
            <p className="text-sm text-foreground leading-relaxed">{opening.description}</p>
          </div>
        )}

        {/* Upload Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Upload Profiles</h2>
          <FileDropzone
            onFilesSelected={setSelectedFiles}
            disabled={uploading || opening?.status !== "OPEN"}
          />
          {uploading && (
            <p className="text-sm text-muted-foreground mt-2">{uploadProgress}</p>
          )}
          {selectedFiles.length > 0 && !uploading && (
            <Button onClick={handleUpload} className="mt-3" size="sm">
              <Upload className="h-4 w-4 mr-1" />
              Upload {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>

        {/* Profiles List */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Submitted Profiles ({profiles.length})
          </h2>
          {profiles.length === 0 ? (
            <EmptyState
              title="No profiles submitted"
              message="Upload candidate profiles for this opening."
              icon={<FileText className="w-10 h-10 text-muted-foreground" />}
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-tableHeader">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary">Filename</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary">Submitted</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-primary">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-primary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className="border-b border-border hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 text-sm text-foreground">
                        {deriveFilename(profile.s3Key)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatDate(profile.submittedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-400">
                          {profile.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openPreview(profile.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              setProfileToDelete(profile.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Profile</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this profile? This action cannot be
                undone from the vendor portal.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
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
