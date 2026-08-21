"use client";

import { useState, useEffect } from "react";
import { Settings, Bell, Shield, Palette, Globe, User } from "lucide-react";
import CircleLoader from "@/components/UI/loaders/CircleLoader";

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("zelosify_user");
      if (stored) {
        setUserData(JSON.parse(stored));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <CircleLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/10 rounded-full">
              <Settings className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your account settings and preferences.
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <User className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Profile</h3>
            </div>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p><strong>Username:</strong> {userData?.username || "N/A"}</p>
              <p><strong>Email:</strong> {userData?.email || "N/A"}</p>
              <p><strong>Role:</strong> {userData?.role || "N/A"}</p>
              <p><strong>Company:</strong> {userData?.tenant?.companyName || "N/A"}</p>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure your notification preferences.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Security</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage your security settings and two-factor authentication.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Palette className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Appearance</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Customize the appearance of your dashboard.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Language</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select your preferred language.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
