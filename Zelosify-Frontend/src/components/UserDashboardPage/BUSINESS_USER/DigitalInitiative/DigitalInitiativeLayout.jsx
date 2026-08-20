"use client";

import { useState } from "react";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const initialForm = {
  initiativeTitle: "",
  businessRationale: "",
  enterpriseResourceCount: "",
  resourceDuration: "",
  successCriteria: "",
  timeline: "",
  additionalComments: "",
};

export default function DigitalInitiativeLayout() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Client-side validation (mirrors the backend AJV schema)
    if (!form.initiativeTitle.trim() || !form.businessRationale.trim()) {
      setError("Title and business rationale are required.");
      return;
    }
    const resourceCount = parseInt(form.enterpriseResourceCount, 10);
    const duration = parseInt(form.resourceDuration, 10);
    if (!resourceCount || resourceCount < 1) {
      setError("Enterprise resource count must be at least 1.");
      return;
    }
    if (!duration || duration < 1) {
      setError("Resource duration must be at least 1.");
      return;
    }
    if (!form.successCriteria.trim() || !form.timeline.trim()) {
      setError("Success criteria and timeline are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await axiosInstance.post("/api/v1/digital-initiatives", {
        initiativeTitle: form.initiativeTitle.trim(),
        businessRationale: form.businessRationale.trim(),
        enterpriseResourceCount: resourceCount,
        resourceDuration: duration,
        successCriteria: form.successCriteria.trim(),
        timeline: form.timeline.trim(),
        additionalComments: form.additionalComments.trim() || undefined,
      });
      setResult({
        ok: true,
        message: res.data?.message || "Digital initiative request created successfully",
        requestIdentifier: res.data?.requestIdentifier,
      });
      setForm(initialForm);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Failed to submit the initiative request.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="px-6 py-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-foreground">Digital Initiative Request</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Submit a new digital initiative for business approval.
      </p>

      {result?.ok && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/30 p-3 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>{result.message}</p>
            {result.requestIdentifier && (
              <p className="mt-1 text-xs font-mono">Reference: {result.requestIdentifier}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-800 dark:text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Initiative Title <span className="text-red-500">*</span>
          </label>
          <input
            name="initiativeTitle"
            value={form.initiativeTitle}
            onChange={handleChange}
            placeholder="e.g. Cloud Migration for CRM"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Business Rationale <span className="text-red-500">*</span>
          </label>
          <textarea
            name="businessRationale"
            value={form.businessRationale}
            onChange={handleChange}
            rows={3}
            placeholder="Why is this initiative needed?"
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Enterprise Resource Count <span className="text-red-500">*</span>
            </label>
            <input
              name="enterpriseResourceCount"
              type="number"
              min="1"
              value={form.enterpriseResourceCount}
              onChange={handleChange}
              placeholder="e.g. 5"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Resource Duration (months) <span className="text-red-500">*</span>
            </label>
            <input
              name="resourceDuration"
              type="number"
              min="1"
              value={form.resourceDuration}
              onChange={handleChange}
              placeholder="e.g. 6"
              className={inputClass}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Success Criteria <span className="text-red-500">*</span>
          </label>
          <textarea
            name="successCriteria"
            value={form.successCriteria}
            onChange={handleChange}
            rows={3}
            placeholder="How will success be measured?"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Timeline <span className="text-red-500">*</span>
          </label>
          <textarea
            name="timeline"
            value={form.timeline}
            onChange={handleChange}
            rows={2}
            placeholder="e.g. Q1–Q2 2026: discovery, build, rollout"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Additional Comments
          </label>
          <textarea
            name="additionalComments"
            value={form.additionalComments}
            onChange={handleChange}
            rows={2}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Submitting…" : "Submit Initiative"}
        </button>
      </form>
    </div>
  );
}
