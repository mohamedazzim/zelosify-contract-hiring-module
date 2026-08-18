"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import FinancePage from "@/pages/UserDashboardPage/Finance/FinancePage";

export default function UserSubPage({ params }) {
  // Unwrap params with React.use()
  const unwrappedParams = use(params);
  const slug = unwrappedParams.slug;

  // If it's not one of our known slugs, trigger a 404:
  if (!["finance"].includes(slug)) {
    notFound();
  }

  // Conditionally render the correct component:
  switch (slug) {
    // For VENDOR_MANAGER role
    case "finance":
      return <FinancePage />;

    // Default case
    default:
      return null;
  }
}
