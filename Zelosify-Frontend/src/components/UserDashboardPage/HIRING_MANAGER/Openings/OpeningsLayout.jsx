"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/UI/shadcn/table";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import EmptyState from "@/components/common/EmptyState";
import ErrorComponent from "@/components/common/ErrorComponent";
import VirtualizedTable from "@/components/common/VirtualizedTable";
import Pagination from "./Pagination";
import CreateOpeningModal from "./CreateOpeningModal";

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const STATUS_TONE = {
  OPEN: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  CLOSED: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

function StatusBadge({ status }) {
  return (
    <span
      role="status"
      aria-label={`Opening status: ${status}`}
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        STATUS_TONE[status] || "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">Title</TableHead>
            <TableHead className="px-4 py-3">Location</TableHead>
            <TableHead className="px-4 py-3">Contract Type</TableHead>
            <TableHead className="px-4 py-3">Experience</TableHead>
            <TableHead className="px-4 py-3">Posted Date</TableHead>
            <TableHead className="px-4 py-3">Profiles</TableHead>
            <TableHead className="px-4 py-3">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-44" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-10" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-16" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function OpeningsLayout() {
  const router = useRouter();
  const [openings, setOpenings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchOpenings = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(
        `/api/v1/hiring-manager/openings?page=${page}&limit=10`
      );
      const data = res.data.data;
      setOpenings(data.openings || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load openings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenings(1);
  }, [fetchOpenings]);

  const handlePageChange = (newPage) => fetchOpenings(newPage);
  const handleRowClick = (openingId) => router.push(`/hiring-manager/openings/${openingId}`);

  const handleCreateSuccess = (newOpening) => {
    // Refresh the openings list
    fetchOpenings(1);
  };

  return (
    <div className="flex h-screen bg-background px-2">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Openings</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Review candidate profiles and manage shortlist decisions.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Opening
            </button>
          </div>

          {error && (
            <ErrorComponent message={error} onRetry={() => fetchOpenings(pagination.page)} />
          )}

          {loading && <TableSkeleton />}

          {!loading && !error && openings.length === 0 && (
            <EmptyState
              title="No openings found"
              message="There are no openings assigned to you yet."
              icon={<Briefcase className="w-12 h-12 text-muted-foreground" />}
            />
          )}

          {!loading && !error && openings.length > 0 && (
            <>
              <VirtualizedTable
                rows={openings}
                rowKey="id"
                onRowClick={(row) => handleRowClick(row.id)}
                columns={[
                  {
                    key: "title",
                    header: "Title",
                    cell: (o) => (
                      <span className="font-medium text-foreground">{o.title}</span>
                    ),
                  },
                  {
                    key: "location",
                    header: "Location",
                    cell: (o) => o.location || "—",
                  },
                  {
                    key: "contractType",
                    header: "Contract Type",
                    cell: (o) => o.contractType || "—",
                  },
                  {
                    key: "experience",
                    header: "Experience",
                    cell: (o) =>
                      o.experienceMin != null
                        ? `${o.experienceMin}${o.experienceMax ? `–${o.experienceMax}` : "+"} yrs`
                        : "—",
                  },
                  {
                    key: "skills",
                    header: "Required Skills",
                    cell: (o) => (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(o.requiredSkills || []).slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[11px] whitespace-nowrap"
                          >
                            {skill}
                          </span>
                        ))}
                        {(o.requiredSkills || []).length > 4 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{o.requiredSkills.length - 4}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "postedDate",
                    header: "Posted Date",
                    cell: (o) => formatDate(o.postedDate),
                  },
                  {
                    key: "profilesCount",
                    header: "Profiles",
                    cell: (o) => o.profilesCount ?? 0,
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (o) => <StatusBadge status={o.status} />,
                  },
                ]}
              />

              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>

      {/* Create Opening Modal */}
      <CreateOpeningModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
