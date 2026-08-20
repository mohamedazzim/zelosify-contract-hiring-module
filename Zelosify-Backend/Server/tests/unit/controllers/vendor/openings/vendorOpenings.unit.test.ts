/**
 * @fileoverview Unit tests for IT Vendor openings handlers
 * Covers tenant isolation, vendor-only profile visibility, S3 key format,
 * MIME type restrictions, and transactional profile creation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted allows mock objects to be referenced inside vi.mock factories
const { mockPrisma, mockStorageService } = vi.hoisted(() => ({
  mockPrisma: {
    opening: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    hiringProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  },
  mockStorageService: {
    getUploadURL: vi.fn(),
    getObjectURL: vi.fn(),
  },
}));

// Mock the Prisma client singleton
vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

// Mock the storage service factory so tests never hit real S3
vi.mock("@/services/storage/storageFactory.js", () => ({
  createStorageService: () => mockStorageService,
}));

// Mock the recommendation queue so vendor handler tests do not invoke background workers
vi.mock("@/services/ai/queue/recommendationQueue.js", () => ({
  recommendationQueue: {
    enqueue: vi.fn().mockReturnValue(true),
    getStatus: vi.fn().mockReturnValue({ activeWorkers: 0, queuedJobs: 0, inFlightCount: 0 }),
  },
}));

// Import handlers AFTER mocks are registered
import { getOpenings } from "@/controllers/vendor/openings/handlers/getOpenings.js";
import { getOpeningById } from "@/controllers/vendor/openings/handlers/getOpeningById.js";
import { presignUploadUrl } from "@/controllers/vendor/openings/handlers/presignUploadUrl.js";
import { uploadProfile } from "@/controllers/vendor/openings/handlers/uploadProfile.js";
import { deleteProfile } from "@/controllers/vendor/openings/handlers/deleteProfile.js";
import { previewProfile } from "@/controllers/vendor/openings/handlers/previewProfile.js";

// ---- Mock request/response helpers ----

function createMockReq(overrides: Record<string, any> = {}) {
  return {
    user: {
      id: "vendor-uuid-1",
      username: "vendor1@example.com",
      email: "vendor1@example.com",
      role: "IT_VENDOR",
      department: "Procurement",
      provider: "KEYCLOAK",
      tenant: {
        tenantId: "tenant-1-uuid",
        companyName: "Tenant One Corp",
      },
    },
    params: {},
    query: {},
    body: {},
    headers: {},
    cookies: {},
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}

// ---- Tests ----

describe("Vendor Openings API — Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults
    mockPrisma.opening.findMany.mockResolvedValue([]);
    mockPrisma.opening.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.hiringProfile.findMany.mockResolvedValue([]);
    mockPrisma.hiringProfile.count.mockResolvedValue(0);
    mockStorageService.getUploadURL.mockResolvedValue(
      "https://s3.example.com/presigned-url"
    );
  });

  // ===========================================================================
  // GET /api/v1/vendor/openings  —  getOpenings
  // ===========================================================================
  describe("getOpenings", () => {
    it("should return 400 when tenant ID is missing", async () => {
      const req = createMockReq({ user: { id: "v1", role: "IT_VENDOR" } });
      const res = createMockRes();

      await getOpenings(req as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: "Tenant ID is required",
        })
      );
    });

    it("should filter openings by requesting vendor's tenant ID (tenant isolation)", async () => {
      const req = createMockReq({ query: { page: "1", limit: "20" } });
      const res = createMockRes();

      await getOpenings(req as any, res);

      // The findMany query MUST include tenantId in the WHERE clause
      const callArgs = mockPrisma.opening.findMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({ tenantId: "tenant-1-uuid" });
    });

    it("should prevent vendor from tenant A from seeing tenant B's openings", async () => {
      const req = createMockReq({
        query: {},
        user: {
          id: "vendor-a",
          username: "va@test.com",
          role: "IT_VENDOR",
          tenant: { tenantId: "tenant-A", companyName: "Tenant A" },
        },
      });
      const res = createMockRes();

      // Simulate DB having openings for BOTH tenant-A and tenant-B
      mockPrisma.opening.findMany.mockResolvedValue([
        {
          id: "op-a1",
          title: "Tenant A Opening",
          location: "NYC",
          contractType: "Contract",
          postedDate: new Date(),
          hiringManagerId: "mgr-a",
        },
      ]);
      mockPrisma.opening.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "mgr-a", username: "bossA", email: "a@x.com", firstName: "Boss", lastName: "A" },
      ]);

      await getOpenings(req as any, res);

      // Verify findMany is called exactly once with tenant-A filter only
      expect(mockPrisma.opening.findMany).toHaveBeenCalledTimes(1);
      const whereClause = mockPrisma.opening.findMany.mock.calls[0][0].where;
      expect(whereClause.tenantId).toBe("tenant-A");
      // Ensure no bypass (no OR, no in, no lack of tenant filter)
      expect(whereClause).not.toHaveProperty("OR");
      expect(whereClause).not.toHaveProperty("tenantId", { in: expect.anything() });

      // Response should only contain tenant-A openings
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.data).toHaveLength(1);
      expect(jsonArg.data[0].id).toBe("op-a1");
    });

    it("should apply pagination defaults (page=1, limit=10)", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await getOpenings(req as any, res);

      const callArgs = mockPrisma.opening.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(10);
    });

    it("should batch-fetch hiring manager names in a single query (no N+1)", async () => {
      const req = createMockReq({ query: { page: "1", limit: "10" } });
      const res = createMockRes();

      mockPrisma.opening.findMany.mockResolvedValue([
        { id: "op-1", title: "T1", location: null, contractType: null, postedDate: new Date(), hiringManagerId: "mgr-1" },
        { id: "op-2", title: "T2", location: null, contractType: null, postedDate: new Date(), hiringManagerId: "mgr-2" },
        { id: "op-3", title: "T3", location: null, contractType: null, postedDate: new Date(), hiringManagerId: "mgr-1" }, // duplicate
      ]);
      mockPrisma.opening.count.mockResolvedValue(3);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "mgr-1", username: "alice", email: "alice@x.com", firstName: "Alice", lastName: "Smith" },
        { id: "mgr-2", username: "bob", email: "bob@x.com", firstName: "Bob", lastName: "Jones" },
      ]);

      await getOpenings(req as any, res);

      // Should do a SINGLE batched findMany with in-operator (deduplication via Set)
      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
      const userQuery = mockPrisma.user.findMany.mock.calls[0][0];
      expect(userQuery.where.id.in).toEqual(["mgr-1", "mgr-2"]);

      // Response should include hiring manager names
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.data[0].hiringManager.name).toBe("Alice Smith");
      expect(jsonArg.data[1].hiringManager.name).toBe("Bob Jones");
      expect(jsonArg.data[2].hiringManager.name).toBe("Alice Smith");
    });
  });

  // ===========================================================================
  // GET /api/v1/vendor/openings/:id  —  getOpeningById
  // ===========================================================================
  describe("getOpeningById", () => {
    it("should return 404 when opening not found (no tenant leak)", async () => {
      const req = createMockReq({ params: { id: "nonexistent-id" } });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue(null);

      await getOpeningById(req as any, res);

      // 404 with generic message — does NOT reveal whether the ID exists for another tenant
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "Opening not found",
      });
      // Ensure tenantId was passed in the WHERE clause (not a post-filter)
      const whereClause = mockPrisma.opening.findFirst.mock.calls[0][0].where;
      expect(whereClause).toEqual({ id: "nonexistent-id", tenantId: "tenant-1-uuid" });
    });

    it("should only return profiles uploadedBy the requesting vendor", async () => {
      const req = createMockReq({ params: { id: "opening-1" } });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({
        id: "opening-1",
        title: "Test Opening",
        description: "A test opening",
        location: "NYC",
        contractType: "Contract",
        hiringManagerId: "mgr-1",
        experienceMin: 3,
        experienceMax: 5,
        postedDate: new Date(),
        expectedCompletionDate: new Date(),
        actionDate: null,
        status: "OPEN",
        _count: { hiringProfiles: 5 },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        username: "hm@test.com",
        email: "hm@test.com",
        firstName: "Hiring",
        lastName: "Manager",
      });
      mockPrisma.hiringProfile.findMany.mockResolvedValue([
        { id: 1, s3Key: "tenant-1-uuid/opening-1/ts_file.pdf", status: "SUBMITTED", submittedAt: new Date(), recommended: null },
      ]);

      await getOpeningById(req as any, res);

      // Profile query MUST filter by uploadedBy = req.user.id
      expect(mockPrisma.hiringProfile.findMany).toHaveBeenCalledTimes(1);
      const profileQuery = mockPrisma.hiringProfile.findMany.mock.calls[0][0];
      expect(profileQuery.where).toEqual({
        openingId: "opening-1",
        uploadedBy: "vendor-uuid-1",
        isDeleted: false,
      });
    });

    it("should never return profiles belonging to other vendors", async () => {
      const req = createMockReq({
        params: { id: "opening-shared" },
        user: {
          id: "vendor-2",
          role: "IT_VENDOR",
          tenant: { tenantId: "tenant-1-uuid", companyName: "Tenant One Corp" },
        },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({
        id: "opening-shared",
        title: "Shared Opening",
        description: "D",
        location: "L",
        contractType: "C",
        hiringManagerId: "mgr-1",
        experienceMin: 1,
        experienceMax: 2,
        postedDate: new Date(),
        expectedCompletionDate: null,
        actionDate: null,
        status: "OPEN",
        _count: { hiringProfiles: 3 }, // 3 total profiles from 3 different vendors
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        username: "boss",
        email: "boss@test.com",
        firstName: null,
        lastName: null,
      });
      mockPrisma.hiringProfile.count.mockResolvedValue(3);

      // DB would return 3 profiles, but OUR query only asks for vendor-2's
      mockPrisma.hiringProfile.findMany.mockResolvedValue([
        { id: 7, s3Key: "tenant-1-uuid/opening-shared/999_vendor2_resume.pdf", status: "SUBMITTED", submittedAt: new Date(), recommended: null },
      ]);

      await getOpeningById(req as any, res);

      const response = res.json.mock.calls[0][0];

      // _count shows 3 total profiles exist (informational)
      expect(response.data.opening.profilesCount).toBe(3);
      // But only 1 profile is returned — vendor-2's own upload
      expect(response.data.profiles).toHaveLength(1);
      expect(response.data.profiles[0].s3Key).toContain("vendor2");

      // Verify the query filtered by uploadedBy = vendor-2
      const profileQuery = mockPrisma.hiringProfile.findMany.mock.calls[0][0];
      expect(profileQuery.where.uploadedBy).toBe("vendor-2");
    });
  });

  // ===========================================================================
  // POST /api/v1/vendor/openings/:id/profiles/presign  —  presignUploadUrl
  // ===========================================================================
  describe("presignUploadUrl", () => {
    it("should reject files with disallowed extensions (e.g. .docx)", async () => {
      const req = createMockReq({
        params: { id: "opening-1" },
        body: { filenames: ["malicious.docx"] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });

      await presignUploadUrl(req as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: expect.stringContaining("Invalid file type"),
        })
      );
      expect(mockStorageService.getUploadURL).not.toHaveBeenCalled();
    });

    it("should accept PDF and PPTX files and return presigned URLs", async () => {
      const req = createMockReq({
        params: { id: "opening-1" },
        body: { filenames: ["resume.pdf", "slides.pptx"] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      mockStorageService.getUploadURL.mockResolvedValue("https://s3.example.com/url");

      await presignUploadUrl(req as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Two URLs generated (one per file)
      expect(mockStorageService.getUploadURL).toHaveBeenCalledTimes(2);

      // Verify S3 key format: <tenantId>/<openingId>/<timestamp>_<filename>
      const keys = mockStorageService.getUploadURL.mock.calls.map((c: any) => c[0]);
      expect(keys[0]).toMatch(/^tenant-1-uuid\/opening-1\/\d+_resume\.pdf$/);
      expect(keys[1]).toMatch(/^tenant-1-uuid\/opening-1\/\d+_slides\.pptx$/);
    });

    it("should return 404 when opening not found (tenant isolation)", async () => {
      const req = createMockReq({
        params: { id: "no-such-opening" },
        body: { filenames: ["file.pdf"] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue(null);

      await presignUploadUrl(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockStorageService.getUploadURL).not.toHaveBeenCalled();
    });

    it("should pass correct content type to storage service", async () => {
      const req = createMockReq({
        params: { id: "opening-1" },
        body: { filenames: ["doc.pdf", "slides.pptx"] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });

      await presignUploadUrl(req as any, res);

      // PDF file → application/pdf
      expect(mockStorageService.getUploadURL.mock.calls[0][1]).toBe("application/pdf");
      // PPTX file → application/vnd.openxmlformats-officedocument.presentationml.presentation
      expect(mockStorageService.getUploadURL.mock.calls[1][1]).toBe(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );
    });
  });

  // ===========================================================================
  // POST /api/v1/vendor/openings/:id/profiles/upload  —  uploadProfile
  // ===========================================================================
  describe("uploadProfile", () => {
    it("should create profiles in a Prisma $transaction (atomicity)", async () => {
      const req = createMockReq({
        params: { id: "opening-1" },
        body: {
          files: [
            { s3Key: "tenant-1-uuid/opening-1/123_file1.pdf", filename: "file1.pdf" },
            { s3Key: "tenant-1-uuid/opening-1/123_file2.pdf", filename: "file2.pdf" },
          ],
        },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ status: "OPEN" });

      const mockTx = {
        hiringProfile: {
          create: vi.fn().mockResolvedValue({
            id: 99,
            s3Key: "k1",
            status: "SUBMITTED",
            submittedAt: new Date(),
          }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));

      await uploadProfile(req as any, res);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.hiringProfile.create).toHaveBeenCalledTimes(2);
      // Verify each create call has the right fields
      expect(mockTx.hiringProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            openingId: "opening-1",
            uploadedBy: "vendor-uuid-1",
            status: "SUBMITTED",
          }),
        })
      );
    });

    it("should reject uploads to CLOSED openings (409)", async () => {
      const req = createMockReq({
        params: { id: "closed-opening" },
        body: { files: [{ s3Key: "k1", filename: "f.pdf" }] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ status: "CLOSED" });

      await uploadProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: expect.stringContaining("CLOSED"),
        })
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should reject uploads to ON_HOLD openings (409)", async () => {
      const req = createMockReq({
        params: { id: "onhold-opening" },
        body: { files: [{ s3Key: "k1", filename: "f.pdf" }] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ status: "ON_HOLD" });

      await uploadProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should return 404 when opening not found", async () => {
      const req = createMockReq({
        params: { id: "missing" },
        body: { files: [{ s3Key: "k1", filename: "f.pdf" }] },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue(null);

      await uploadProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ===========================================================================
  // PATCH /:openingId/profiles/:profileId  —  deleteProfile (soft-delete)
  // ===========================================================================
  describe("deleteProfile", () => {
    it("should soft-delete own profile successfully", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "42" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      mockPrisma.hiringProfile.findFirst.mockResolvedValue({ id: 42 });
      mockPrisma.hiringProfile.update.mockResolvedValue({ id: 42, isDeleted: true });

      await deleteProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPrisma.hiringProfile.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { isDeleted: true },
      });
    });

    it("should return 404 for another vendor's profile", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "99" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      // Profile belongs to a different vendor — not found by the ownership query
      mockPrisma.hiringProfile.findFirst.mockResolvedValue(null);

      await deleteProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });

    it("should return 404 for already-deleted profile (idempotent)", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "42" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      // Already-deleted profile is filtered out by isDeleted: false
      mockPrisma.hiringProfile.findFirst.mockResolvedValue(null);

      await deleteProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid profile ID", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "not-a-number" },
      });
      const res = createMockRes();

      await deleteProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });

    it("should return 404 for non-existent opening", async () => {
      const req = createMockReq({
        params: { openingId: "missing", profileId: "42" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue(null);

      await deleteProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockPrisma.hiringProfile.update).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // GET /:openingId/profiles/:profileId/preview  —  previewProfile
  // ===========================================================================
  describe("previewProfile", () => {
    it("should redirect to presigned S3 URL for own profile", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "42" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      mockPrisma.hiringProfile.findFirst.mockResolvedValue({
        id: 42,
        s3Key: "tenant-1/opening-1/123_resume.pdf",
      });
      mockStorageService.getObjectURL.mockResolvedValue(
        "https://s3.example.com/presigned-get-url"
      );

      await previewProfile(req as any, res);

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        "https://s3.example.com/presigned-get-url"
      );
      expect(mockStorageService.getObjectURL).toHaveBeenCalledWith(
        "tenant-1/opening-1/123_resume.pdf"
      );
    });

    it("should return 404 for another vendor's profile", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "99" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue({ id: "opening-1" });
      mockPrisma.hiringProfile.findFirst.mockResolvedValue(null);

      await previewProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockStorageService.getUploadURL).not.toHaveBeenCalled();
    });

    it("should return 404 for non-existent opening", async () => {
      const req = createMockReq({
        params: { openingId: "missing", profileId: "42" },
      });
      const res = createMockRes();

      mockPrisma.opening.findFirst.mockResolvedValue(null);

      await previewProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 for invalid profile ID", async () => {
      const req = createMockReq({
        params: { openingId: "opening-1", profileId: "abc" },
      });
      const res = createMockRes();

      await previewProfile(req as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
