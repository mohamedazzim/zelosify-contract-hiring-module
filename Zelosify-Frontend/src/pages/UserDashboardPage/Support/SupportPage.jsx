"use client";

import { Headset, Mail, MessageSquare, Phone } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/10 rounded-full">
              <Headset className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Support Center
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Need help? We&apos;re here to assist you with any questions or issues.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Email Support</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Send us an email and we&apos;ll respond within24 hours.
            </p>
            <a
              href="mailto:support@zelosify.com"
              className="text-sm text-primary hover:underline"
            >
              support@zelosify.com
            </a>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Live Chat</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Chat with our support team in real-time during business hours.
            </p>
            <button className="text-sm text-primary hover:underline">
              Start Chat
            </button>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Phone Support</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Call us Monday to Friday,9AM to5PM EST.
            </p>
            <a
              href="tel:+18005551234"
              className="text-sm text-primary hover:underline"
            >
              +1 (800)555-1234
            </a>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-3">
              <Headset className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Help Center</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Browse our knowledge base for answers to common questions.
            </p>
            <button className="text-sm text-primary hover:underline">
              Visit Help Center
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
