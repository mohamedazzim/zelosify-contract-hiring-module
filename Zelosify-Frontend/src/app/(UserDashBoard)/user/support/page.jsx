"use client";

import dynamic from "next/dynamic";
import CircleLoader from "@/components/UI/loaders/CircleLoader";

const SupportPage = dynamic(
  () => import("@/pages/UserDashboardPage/Support/SupportPage"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-screen">
        <CircleLoader />
      </div>
    ),
  }
);

export default function Support() {
  return <SupportPage />;
}
