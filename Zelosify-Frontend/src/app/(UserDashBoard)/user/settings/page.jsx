"use client";

import dynamic from "next/dynamic";
import CircleLoader from "@/components/UI/loaders/CircleLoader";

const SettingsPage = dynamic(
  () => import("@/pages/UserDashboardPage/Settings/SettingsPage"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-screen">
        <CircleLoader />
      </div>
    ),
  }
);

export default function Settings() {
  return <SettingsPage />;
}
