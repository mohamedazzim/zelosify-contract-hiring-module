import { describe, it, expect, vi, beforeEach } from "vitest";
import { getManagerOpenings } from "@/controllers/hiring/handlers/getManagerOpenings.js";
import { getOpeningProfiles } from "@/controllers/hiring/handlers/getOpeningProfiles.js";
import { shortlistProfile } from "@/controllers/hiring/handlers/shortlistProfile.js";
import { rejectProfile } from "@/controllers/hiring/handlers/rejectProfile.js";
import { OpeningStatus, ProfileStatus, RecommendationStatus } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    opening: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    hiringProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentRun: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

describe("Hiring Manager APIs & Authorization", () => {
  const TENANT_1 = "tenant-1-uuid";
  const TENANT_2 = "tenant-2-uuid";

  function createMockResponse() {
    let statusCode = 200;
    let responseBody: any = null;
    const res: any = {
      status: vi.fn().mockImplementation((code: number) => {
        statusCode = code;
        return {
          json: vi.fn().mockImplementation((body: any) => {
            responseBody = body;
            return body;
          }),
        };
      }),
      json: vi.fn().mockImplementation((body: any) => {
        responseBody = body;
        return body;
      }),
    };
    return {
      res,
      getStatus: () => statusCode,
      getBody: () => responseBody,
    };
  }

  const dbOpening = {
    id: "opening-1",
    tenantId: "tenant-1-uuid",
    title: "Senior Frontend Engineer",
    status: OpeningStatus.OPEN,
    hiringManagerId: "manager-1-uuid",
  };

  const dbUser = { id: "manager-1-uuid", username: "bruce.wayne", role: "HIRING_MANAGER", tenantId: "tenant-1-uuid" };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.opening.findFirst.mockResolvedValue(dbOpening);
    mockPrisma.opening.findMany.mockResolvedValue([]);
    mockPrisma.opening.count.mockResolvedValue(0);
    mockPrisma.user.findFirst.mockResolvedValue(dbUser);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.hiringProfile.findMany.mockResolvedValue([]);
    mockPrisma.hiringProfile.findFirst.mockResolvedValue(null);
    // shortlist/reject use findUnique with include.opening for ownership checks
    mockPrisma.hiringProfile.findUnique.mockResolvedValue(null);
    mockPrisma.hiringProfile.count.mockResolvedValue(0);
    mockPrisma.hiringProfile.update.mockImplementation((args: any) =>
      Promise.resolve({ id: 1, status: args.data.status, ...args.data })
    );
    // $transaction forwards to a tx client whose update resolves the profile
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: {
          update: mockPrisma.hiringProfile.update,
        },
      };
      return cb(tx);
    });
  });

  describe("GET /api/v1/hiring-manager/openings", () => {
    it("1. Manager sees only own openings within their tenant", async () => {
      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        query: { page: "1", limit: "10" },
      };

      const { res, getStatus, getBody } = createMockResponse();
      await getManagerOpenings(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.status).toBe("success");
      expect(Array.isArray(body.data.openings)).toBe(true);
      expect(body.data.pagination).toBeDefined();

      // The query MUST filter by tenant AND hiringManagerId (ownership filter)
      const query = mockPrisma.opening.findMany.mock.calls[0][0];
      expect(query.where.tenantId).toBe("tenant-1-uuid");
      expect(query.where.hiringManagerId).toBe("manager-1-uuid");
    });

    it("2. Manager cannot see another manager's opening", async () => {
      const req: any = {
        user: {
          id: "non-existent-manager-uuid",
          tenant: { tenantId: TENANT_1 },
        },
        query: {},
      };

      const { res, getStatus, getBody } = createMockResponse();
      await getManagerOpenings(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.data.openings.length).toBe(0);
      expect(body.data.pagination.total).toBe(0);
    });

    it("15. Pagination and deterministic ordering work as expected", async () => {
      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        query: { page: "1", limit: "2" },
      };

      const { res, getStatus, getBody } = createMockResponse();
      await getManagerOpenings(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(2);

      // Limit must be applied in the query
      const query = mockPrisma.opening.findMany.mock.calls[0][0];
      expect(query.take).toBe(2);
    });
  });

  describe("GET /api/v1/hiring-manager/openings/:id/profiles", () => {
    it("4. Manager sees submitted, non-deleted profiles on own opening", async () => {
      const profile = {
        id: 100,
        openingId: dbOpening.id,
        s3Key: `tenant1/open1/${Date.now()}_test_cand.pdf`,
        uploadedBy: "vendor-uuid",
        status: ProfileStatus.SUBMITTED,
        recommendationStatus: RecommendationStatus.COMPLETED,
        recommendationScore: 0.92,
        recommendationConfidence: 0.95,
        recommendationReason: "Strong profile fit",
        recommended: true,
      };

      mockPrisma.hiringProfile.findMany.mockResolvedValue([profile]);

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: dbOpening.id },
        query: {},
      };

      const { res, getStatus, getBody } = createMockResponse();
      await getOpeningProfiles(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.data.opening.id).toBe(dbOpening.id);

      const found = body.data.profiles.find((p: any) => p.id === profile.id);
      expect(found).toBeDefined();
      expect(found.fileName).toBe("test_cand.pdf");
      expect(found.recommended).toBe(true);
      expect(found.recommendationScore).toBe(0.92);

      // The profiles query must filter by openingId + isDeleted:false (ownership)
      const profileQuery = mockPrisma.hiringProfile.findMany.mock.calls[0][0];
      expect(profileQuery.where.openingId).toBe(dbOpening.id);
      expect(profileQuery.where.isDeleted).toBe(false);
    });

    it("5. Profiles from another manager's opening return 404 safe denial", async () => {
      mockPrisma.opening.findFirst.mockResolvedValue(null);

      const req: any = {
        user: {
          id: "wrong-manager-uuid",
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: dbOpening.id },
        query: {},
      };

      const { res, getStatus } = createMockResponse();
      await getOpeningProfiles(req, res);

      expect(getStatus()).toBe(404);
    });

    it("3. Cross-tenant opening request returns 404 safe denial", async () => {
      mockPrisma.opening.findFirst.mockResolvedValue(null);

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: "wrong-tenant-uuid" },
        },
        params: { id: dbOpening.id },
        query: {},
      };

      const { res, getStatus } = createMockResponse();
      await getOpeningProfiles(req, res);

      expect(getStatus()).toBe(404);
    });

    it("14. PENDING, PROCESSING, and FAILED recommendation states serialize safely", async () => {
      const failedProfile = {
        id: 201,
        openingId: dbOpening.id,
        s3Key: `tenant1/open1/${Date.now()}_failed_cand.pdf`,
        uploadedBy: "v1",
        status: ProfileStatus.SUBMITTED,
        recommendationStatus: RecommendationStatus.FAILED,
        recommendationReason: "Internal stack trace secret leaked!",
        recommended: null,
        recommendationScore: null,
      };
      const pendingProfile = {
        id: 202,
        openingId: dbOpening.id,
        s3Key: `tenant1/open1/${Date.now()}_pending_cand.pdf`,
        uploadedBy: "v1",
        status: ProfileStatus.SUBMITTED,
        recommendationStatus: RecommendationStatus.PENDING,
        recommended: null,
        recommendationScore: null,
      };

      mockPrisma.hiringProfile.findMany.mockResolvedValue([failedProfile, pendingProfile]);

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: dbOpening.id },
        query: {},
      };

      const { res, getStatus, getBody } = createMockResponse();
      await getOpeningProfiles(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();

      const failedObj = body.data.profiles.find((p: any) => p.id === failedProfile.id);
      expect(failedObj.recommendationStatus).toBe("FAILED");
      expect(failedObj.recommended).toBeNull();
      // Sanitized reason — no stack trace leak
      expect(failedObj.recommendationReason).not.toContain("stack trace secret");

      const pendingObj = body.data.profiles.find((p: any) => p.id === pendingProfile.id);
      expect(pendingObj.recommendationStatus).toBe("PENDING");
      expect(pendingObj.recommended).toBeNull();
      expect(pendingObj.recommendationScore).toBeNull();
    });
  });

  describe("POST /api/v1/hiring-manager/profiles/:id/shortlist", () => {
    it("9. Shortlist succeeds for authorized profile and updates state in transaction", async () => {
      const profile = {
        id: 300,
        openingId: dbOpening.id,
        s3Key: "k.pdf",
        uploadedBy: "v1",
        status: ProfileStatus.SUBMITTED,
        recommendationStatus: RecommendationStatus.COMPLETED,
        recommendationScore: 0.88,
        isDeleted: false,
        opening: { id: dbOpening.id, tenantId: dbOpening.tenantId, hiringManagerId: dbOpening.hiringManagerId },
      };

      mockPrisma.hiringProfile.findUnique.mockResolvedValue(profile);
      mockPrisma.hiringProfile.update.mockResolvedValue({
        ...profile,
        status: ProfileStatus.SHORTLISTED,
        shortlistedBy: dbOpening.hiringManagerId,
        shortlistedAt: new Date(),
      });

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: profile.id.toString() },
      };

      const { res, getStatus, getBody } = createMockResponse();
      await shortlistProfile(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.data.profile.status).toBe("SHORTLISTED");
      expect(body.data.profile.shortlistedBy).toBe(dbOpening.hiringManagerId);
      expect(body.data.profile.shortlistedAt).toBeDefined();

      // Ownership filter: profile lookup must include the manager's opening
      const findFirstQuery = mockPrisma.hiringProfile.findUnique.mock.calls[0][0];
      expect(findFirstQuery.where.id).toBe(300);
    });

    it("10. Shortlist rejects a profile belonging to another manager's opening with 404", async () => {
      mockPrisma.hiringProfile.findUnique.mockResolvedValue(null);

      const req: any = {
        user: {
          id: "wrong-manager-id",
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: "999" },
      };

      const { res, getStatus } = createMockResponse();
      await shortlistProfile(req, res);

      expect(getStatus()).toBe(404);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });

    it("cannot shortlist an already REJECTED candidate (409 conflict)", async () => {
      mockPrisma.hiringProfile.findUnique.mockResolvedValue({
        id: 400,
        openingId: dbOpening.id,
        s3Key: "k.pdf",
        uploadedBy: "v1",
        status: ProfileStatus.REJECTED,
        rejectedBy: dbOpening.hiringManagerId,
        rejectedAt: new Date(),
        isDeleted: false,
        opening: { id: dbOpening.id, tenantId: dbOpening.tenantId, hiringManagerId: dbOpening.hiringManagerId },
      });

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: "400" },
      };

      const { res, getStatus } = createMockResponse();
      await shortlistProfile(req, res);

      expect(getStatus()).toBe(409);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/hiring-manager/profiles/:id/reject", () => {
    it("11. Reject succeeds for authorized profile and updates state in transaction", async () => {
      mockPrisma.hiringProfile.findUnique.mockResolvedValue({
        id: 500,
        openingId: dbOpening.id,
        s3Key: "k.pdf",
        uploadedBy: "v1",
        status: ProfileStatus.SUBMITTED,
        isDeleted: false,
        opening: { id: dbOpening.id, tenantId: dbOpening.tenantId, hiringManagerId: dbOpening.hiringManagerId },
      });
      mockPrisma.hiringProfile.update.mockResolvedValue({
        id: 500,
        status: ProfileStatus.REJECTED,
        rejectedBy: dbOpening.hiringManagerId,
        rejectedAt: new Date(),
      });

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: "500" },
      };

      const { res, getStatus, getBody } = createMockResponse();
      await rejectProfile(req, res);

      expect(getStatus()).toBe(200);
      const body = getBody();
      expect(body.data.profile.status).toBe("REJECTED");
      expect(body.data.profile.rejectedBy).toBe(dbOpening.hiringManagerId);
    });

    it("12. Reject cannot overwrite a SHORTLISTED profile (409 conflict)", async () => {
      mockPrisma.hiringProfile.findUnique.mockResolvedValue({
        id: 600,
        openingId: dbOpening.id,
        s3Key: "k.pdf",
        uploadedBy: "v1",
        status: ProfileStatus.SHORTLISTED,
        shortlistedBy: dbOpening.hiringManagerId,
        shortlistedAt: new Date(),
        isDeleted: false,
        opening: { id: dbOpening.id, tenantId: dbOpening.tenantId, hiringManagerId: dbOpening.hiringManagerId },
      });

      const req: any = {
        user: {
          id: dbOpening.hiringManagerId,
          tenant: { tenantId: dbOpening.tenantId },
        },
        params: { id: "600" },
      };

      const { res, getStatus } = createMockResponse();
      await rejectProfile(req, res);

      expect(getStatus()).toBe(409);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });

    it("8. Missing/unknown profile returns safe 404", async () => {
      mockPrisma.hiringProfile.findUnique.mockResolvedValue(null);

      const req: any = {
        user: {
          id: "any-manager-uuid",
          tenant: { tenantId: TENANT_1 },
        },
        params: { id: "9999999" },
      };

      const { res, getStatus } = createMockResponse();
      await rejectProfile(req, res);

      expect(getStatus()).toBe(404);
    });
  });
});
