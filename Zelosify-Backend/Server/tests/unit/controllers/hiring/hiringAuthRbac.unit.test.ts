import { describe, it, expect, vi } from "vitest";
import { authorizeRole } from "@/middlewares/auth/authorizeMiddleware.js";
import jwt from "jsonwebtoken";

describe("Hiring Manager RBAC Middleware Authorization", () => {
  it("6. IT_VENDOR receives 403 when accessing HIRING_MANAGER endpoints", async () => {
    const middleware = authorizeRole("HIRING_MANAGER");

    // Token with IT_VENDOR role only
    const mockToken = jwt.sign(
      {
        sub: "user-vendor-1",
        realm_access: { roles: ["IT_VENDOR"] },
      },
      "dummy-secret"
    );

    const req: any = {
      headers: { authorization: `Bearer ${mockToken}` },
      cookies: {},
    };

    let statusCode = 0;
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
    };

    const next = vi.fn();

    // Mock jwt.verify to return decoded token payload
    vi.spyOn(jwt, "verify").mockImplementation(((token: any, key: any, opts: any, callback: any) => {
      callback(null, {
        sub: "user-vendor-1",
        realm_access: { roles: ["IT_VENDOR"] },
      });
    }) as any);

    await middleware(req, res, next);

    expect(statusCode).toBe(403);
    expect(responseBody.message).toContain("Access Denied");
    expect(next).not.toHaveBeenCalled();
  });

  it("7. VENDOR_MANAGER receives 403 when accessing HIRING_MANAGER endpoints", async () => {
    const middleware = authorizeRole("HIRING_MANAGER");

    const mockToken = jwt.sign(
      {
        sub: "user-vendor-mgr-1",
        realm_access: { roles: ["VENDOR_MANAGER"] },
      },
      "dummy-secret"
    );

    const req: any = {
      headers: { authorization: `Bearer ${mockToken}` },
      cookies: {},
    };

    let statusCode = 0;
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
    };

    const next = vi.fn();

    vi.spyOn(jwt, "verify").mockImplementation(((token: any, key: any, opts: any, callback: any) => {
      callback(null, {
        sub: "user-vendor-mgr-1",
        realm_access: { roles: ["VENDOR_MANAGER"] },
      });
    }) as any);

    await middleware(req, res, next);

    expect(statusCode).toBe(403);
    expect(responseBody.message).toContain("Access Denied");
    expect(next).not.toHaveBeenCalled();
  });

  it("HIRING_MANAGER passes authorization", async () => {
    const middleware = authorizeRole("HIRING_MANAGER");

    const mockToken = jwt.sign(
      {
        sub: "user-hiring-mgr-1",
        realm_access: { roles: ["HIRING_MANAGER"] },
      },
      "dummy-secret"
    );

    const req: any = {
      headers: { authorization: `Bearer ${mockToken}` },
      cookies: {},
    };

    const res: any = {
      status: vi.fn(),
      json: vi.fn(),
    };

    const next = vi.fn();

    vi.spyOn(jwt, "verify").mockImplementation(((token: any, key: any, opts: any, callback: any) => {
      callback(null, {
        sub: "user-hiring-mgr-1",
        realm_access: { roles: ["HIRING_MANAGER"] },
      });
    }) as any);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
