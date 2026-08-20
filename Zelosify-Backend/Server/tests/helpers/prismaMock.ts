/**
 * @fileoverview Shared mocked-Prisma helpers for unit tests.
 *
 * Exposes a vi.hoisted mock object shaped like the prisma singleton so tests
 * never touch the development database. Tests import this and register the
 * mock via vi.mock("@/config/prisma/prisma.js", () => ({ default: mockPrisma })).
 *
 * NOTE: Because vi.mock factories are hoisted above imports, this helper is
 * intended to be used via a small inline factory in each test file:
 *
 *   const { mockPrisma } = vi.hoisted(() => import("./helpers/prismaMock.js"));
 *   vi.mock("@/config/prisma/prisma.js", () => ({ default: mockPrisma }));
 *
 * (Vitest allows dynamic import inside vi.hoisted; the object identity is
 * stable across the test file because the helper module is evaluated once.)
 */
import { vi } from "vitest";

export function createMockPrisma() {
  const tx = {
    hiringProfile: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    agentRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    opening: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    tenants: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };

  return {
    hiringProfile: tx.hiringProfile,
    agentRun: tx.agentRun,
    opening: tx.opening,
    user: tx.user,
    tenants: tx.tenants,
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    // Expose the tx object so tests can wire $transaction callback signatures.
    __tx: tx,
  };
}

export function defaultMockTx() {
  return {
    hiringProfile: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentRun: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}
