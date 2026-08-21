import { Response } from "express";
import { AuthenticatedRequest } from "../../../types/common.js";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import { getAdminToken } from "../../../utils/keycloak/getAdminToken.js";
import { getClientSecret } from "../../../config/keycloak/keycloak.js";
import axios from "axios";

export const logout = asyncHandler(
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Retrieve refresh token from cookies or header.
      const refreshToken =
        req.cookies.refresh_token || req.headers.authorization?.split(" ")[1];

      // Try to logout from Keycloak if we have a refresh token
      if (refreshToken) {
        try {
          const user = (req as any).user;
          if (user && user.provider === "KEYCLOAK") {
            const adminToken = await getAdminToken();
            const clientSecret = await getClientSecret(adminToken);
            if (clientSecret) {
              await axios.post(
                `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`,
                new URLSearchParams({
                  client_id: process.env.KEYCLOAK_CLIENT_ID!,
                  client_secret: clientSecret,
                  refresh_token: refreshToken,
                }),
                { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
              );
              console.log("Keycloak session invalidated for user.");
            }
          }
        } catch (error: any) {
          // Log but don't fail - we still want to clear cookies
          console.error("Keycloak logout request failed (non-fatal):", error.message);
        }
      }

      // Clear cookies securely
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      });
      console.log("Cookies cleared successfully.");

      res.status(200).json({ message: "Logged out successfully" });
      return;
    } catch (error) {
      console.error("Logout error:", error);
      // Even on error, clear cookies
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      });
      res.status(200).json({ message: "Logged out successfully" });
      return;
    }
  }
);
