"use client";

import { useState, useEffect, useCallback } from "react";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { Loader2, CheckCircle2, AlertCircle, Plus, X } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import ErrorComponent from "@/components/common/ErrorComponent";
import { Skeleton } from "@/components/UI/shadcn/skeleton";

const STATUS_TONE = {
  OPEN: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  CLOSED: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  FILLED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const initialForm = {
  title: "",
  description: "",
  requestedSkills: "",
  contractType: "",
  location: "",
  experienceMin: "",
  experienceMax: "",
  resourceCount: "1",
};

export default function VendorRequestsLayout() {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const fetchRequests = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = `page=${page}&limit=10${statusFilter ? `&status=${statusFilter}` : ""}`;
      const res = await axiosInstance.get(`/api/v1/vendor/requests?${params}`);
      setRequests(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load vendor requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests(1);
  }, [fetchRequests]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    if (!form.title.trim()) {
      setResult({ ok: false, message: "Title is required." });
      return;
    }
    setSubmitting(true);
    try {
      const skills = form.requestedSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        requestedSkills: skills.length ? skills : undefined,
        contractType: form.contractType.trim() || undefined,
        location: form.location.trim() || undefined,
        experienceMin: form.experienceMin ? parseInt(form.experienceMin, 10) : undefined,
        experienceMax: form.experienceMax ? parseInt(form.experienceMax, 10) : undefined,
        resourceCount: form.resourceCount ? parseInt(form.resourceCount, 10) : 1,
      };
      const res = await axiosInstance.post("/api/v1/vendor/requests", payload);
      setResult({ ok: true, message: res.data?.message || "Vendor request created" });
      setForm(initialForm);
      setShowForm(false);
      fetchRequests(1);
    } catch (err) {
      setResult({
        ok: false,
        message: err.response?.data?.message || "Failed to create vendor request",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex h-screen bg-background px-2">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Vendor Requests</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage resource requests for your tenant.
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-90"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? "Cancel" : "New Request"}
            </button>
          </div>

          {result && (
            <div
              className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
                result.ok
                  ? "border-green-200 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  : "border-red-200 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>{result.message}</span>
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="mb-6 space-y-4 border border-border rounded-lg p-4 bg-card">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder="e.g. DevOps contractor"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Contract Type
                  </label>
                  <input
                    name="contractType"
                    value={form.contractType}
                    onChange={handleChange}
                    placeholder="e.g. Full-time Contract"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Describe the resource need"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Location
                  </label>
                  <input
                    name="location"
                    value={form.location}
                    onChange={handleChange}
                    placeholder="e.g. Remote"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Min Experience
                  </label>
                  <input
                    name="experienceMin"
                    type="number"
                    min="0"
                    value={form.experienceMin}
                    onChange={handleChange}
                    placeholder="e.g. 3"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Resource Count
                  </label>
                  <input
                    name="resourceCount"
                    type="number"
                    min="1"
                    value={form.resourceCount}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Requested Skills (comma-separated)
                </label>
                <input
                  name="requestedSkills"
                  value={form.requestedSkills}
                  onChange={handleChange}
                  placeholder="e.g. AWS, Kubernetes, Docker"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Creating…" : "Create Request"}
              </button>
            </form>
          )}

          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {["", "OPEN", "CLOSED", "FILLED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>

          {error && <ErrorComponent message={error} onRetry={() => fetchRequests(pagination.page)} />}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!loading && !error && requests.length === 0 && (
            <EmptyState
              title="No vendor requests"
              message="Create a new resource request to get started."
            />
          )}

          {!loading && !error && requests.length > 0 && (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="border border-border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{req.title}</h3>
                      {req.description && (
                        <p className="text-sm text-muted-foreground mt-1">{req.description}</p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_TONE[req.status] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                    {req.location && <span>📍 {req.location}</span>}
                    {req.contractType && <span>📋 {req.contractType}</span>}
                    {req.experienceMin != null && (
                      <span>⏱ {req.experienceMin}{req.experienceMax ? `–${req.experienceMax}` : "+"} yrs</span>
                    )}
                    <span>👥 {req.resourceCount} resource{req.resourceCount > 1 ? "s" : ""}</span>
                    <span>📅 {formatDate(req.createdAt)}</span>
                  </div>
                  {req.requestedSkills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {req.requestedSkills.map((skill) => (
                        <span
                          key={skill}
                          className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[11px]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
