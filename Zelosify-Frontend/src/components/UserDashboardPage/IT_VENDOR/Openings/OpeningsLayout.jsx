"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Briefcase } from "lucide-react";
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
import Pagination from "./Pagination";

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function TableSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">Title</TableHead>
            <TableHead className="px-4 py-3">Location</TableHead>
            <TableHead className="px-4 py-3">Contract Type</TableHead>
            <TableHead className="px-4 py-3">Posted Date</TableHead>
            <TableHead className="px-4 py-3">Hiring Manager</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-40" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell className="px-4 py-3"><Skeleton className="h-4 w-32" /></TableCell>
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
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOpenings = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/api/v1/vendor/openings?page=${page}&limit=10`);
      setOpenings(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load openings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenings(1);
  }, [fetchOpenings]);

  const handlePageChange = (newPage) => {
    fetchOpenings(newPage);
  };

  const handleRowClick = (openingId) => {
    router.push(`/vendor/openings/${openingId}`);
  };

  return (
    <div className="flex h-screen bg-background px-2">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Openings</h1>
          </div>

          {/* Content */}
          {error && (
            <ErrorComponent message={error} onRetry={() => fetchOpenings(pagination.page)} />
          )}

          {loading && <TableSkeleton />}

          {!loading && !error && openings.length === 0 && (
            <EmptyState
              title="No openings found"
              message="There are no contract openings available for your tenant yet."
              icon={<Briefcase className="w-12 h-12 text-muted-foreground" />}
            />
          )}

          {!loading && !error && openings.length > 0 && (
            <>
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4 py-3">Title</TableHead>
                      <TableHead className="px-4 py-3">Location</TableHead>
                      <TableHead className="px-4 py-3">Contract Type</TableHead>
                      <TableHead className="px-4 py-3">Posted Date</TableHead>
                      <TableHead className="px-4 py-3">Hiring Manager</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openings.map((opening) => (
                      <TableRow
                        key={opening.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(opening.id)}
                      >
                        <TableCell className="px-4 py-3 text-sm text-foreground font-medium">
                          {opening.title}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-foreground">
                          {opening.location || "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-foreground">
                          {opening.contractType || "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-foreground">
                          {formatDate(opening.postedDate)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-foreground">
                          {opening.hiringManager?.name || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                page={pagination.page}
                totalPages={pagination.pages}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
