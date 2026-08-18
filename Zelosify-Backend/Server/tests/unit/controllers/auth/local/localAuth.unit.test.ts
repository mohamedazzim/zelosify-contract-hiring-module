/**
 * @fileoverview Unit tests for localAuthController
 * @see src/controllers/auth/local/localAuthController.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  register,
  verifyLogin,
  verifyTOTP,
} from "../../../../../src/controllers/auth/local/localAuthController";

// Mock the implementation modules
vi.mock(
  "../../../../../src/controllers/auth/local/register/localRegister",
  () => ({
    register: vi.fn(async (req, res, next) =>
      res.json({ status: "registered" })
    ),
  })
);
vi.mock("../../../../../src/controllers/auth/local/login/localLogin", () => ({
  verifyLogin: vi.fn(async (req, res) => res.json({ status: "logged-in" })),
}));
vi.mock("../../../../../src/controllers/auth/local/login/verifyTOTP", () => ({
  verifyTOTP: vi.fn(async (req, res) => res.json({ status: "totp-verified" })),
}));

// Import the mocked implementation modules after mocking
import * as registerImplModule from "../../../../../src/controllers/auth/local/register/localRegister";
import * as verifyLoginImplModule from "../../../../../src/controllers/auth/local/login/localLogin";
import * as verifyTOTPImplModule from "../../../../../src/controllers/auth/local/login/verifyTOTP";

const mockReq = {} as any;
const mockRes = {
  json: vi.fn(),
  status: vi.fn(function () {
    return this;
  }),
} as any;
const mockNext = vi.fn();

describe("localAuthController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call registerImpl and handle success", async () => {
    await register(mockReq, mockRes, mockNext);
    expect(mockRes.json).toHaveBeenCalledWith({ status: "registered" });
  });

  it("should handle errors in register", async () => {
    const error = new Error("Register error");
    (registerImplModule.register as any).mockImplementationOnce(async () => {
      throw error;
    });
    await register(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error: expect.any(String) })
    );
  });

  it("should call verifyLoginImpl and handle success", async () => {
    await verifyLogin(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ status: "logged-in" });
  });

  it("should handle errors in verifyLogin", async () => {
    const error = new Error("Login error");
    (verifyLoginImplModule.verifyLogin as any).mockImplementationOnce(
      async () => {
        throw error;
      }
    );
    await verifyLogin(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error: expect.any(String) })
    );
  });

  it("should call verifyTOTPImpl and handle success", async () => {
    await verifyTOTP(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ status: "totp-verified" });
  });

  it("should handle errors in verifyTOTP", async () => {
    const error = new Error("TOTP error");
    (verifyTOTPImplModule.verifyTOTP as any).mockImplementationOnce(
      async () => {
        throw error;
      }
    );
    await verifyTOTP(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error: expect.any(String) })
    );
  });
});
