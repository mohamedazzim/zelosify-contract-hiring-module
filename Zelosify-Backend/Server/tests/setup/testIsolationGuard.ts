/**
 * @fileoverview Defensive test isolation guard.
 *
 * Unit tests MUST NOT connect to or mutate the development database.
 * This setup file installs a global guard on @prisma/client so that any test
 * which instantiates a REAL PrismaClient fails immediately with a clear message
 * instead of silently writing to the dev database.
 *
 * It is registered via vitest.config.ts `setupFiles` and applies to the whole
 * unit test suite.
 */
import { vi, beforeAll } from "vitest";

// Hoisted: replace PrismaClient with a throw-on-construct proxy before any test
// module imports it. Tests that intentionally mock the prisma singleton
// (vi.mock("@/config/prisma/prisma.js", ...)) never reach this code path.
vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();

  class GuardedPrismaClient {
    constructor() {
      const err = new Error(
        "TEST_ISOLATION_GUARD: a unit test attempted to instantiate the REAL PrismaClient. " +
          "Unit tests must not connect to the development database. Mock the prisma singleton " +
          "(@/config/prisma/prisma.js) or the specific client instead."
      );
      err.name = "TestIsolationViolation";
      throw err;
    }
  }

  // Preserve enums and other exports; only replace the client class.
  return {
    ...actual,
    PrismaClient: GuardedPrismaClient as unknown as typeof actual.PrismaClient,
  };
});

// Also guard against direct PrismaClient import in any file that slips through.
beforeAll(() => {
  // The vi.mock above makes any real instantiation throw. This hook exists to
  // surface a clear failure message naming the guard.
});
