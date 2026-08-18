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
      if (!refreshToken) {
        console.log("⚠️ No refresh token found, already logged out.");
        res
          .status(400)
          .json({ message: "No refresh token found, already logged out" });
        return;
      }
      // Assuming that authentication middleware attaches req.user:
      // Use type assertion to access req.user
      const user = (req as any).user;
      console.log("Logging out user:", user);

      // Check if this is a Keycloak user or OAuth user.
      if (user && user.provider === "KEYCLOAK") {
        // For Keycloak users, retrieve the client secret and call Keycloak logout endpoint.
        const adminToken = await getAdminToken();
        const clientSecret = await getClientSecret(adminToken);
        if (!clientSecret) {
          console.error("Error: CLIENT_SECRET could not be retrieved.");
          res.status(500).json({ message: "Failed to retrieve CLIENT_SECRET" });
          return;
        }
        try {
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
        } catch (error: any) {
          // Type as 'any' for axios error
          console.error(
            "Keycloak logout request failed:",
            error.response?.data || error.message
          );
          res.status(500).json({ message: "Error logging out of Keycloak" });
          return;
        }
      } else {
        // For OAuth users (Google/Microsoft), you may not need to call an external logout endpoint.
        console.log("OAuth user logout: just clearing cookies.");
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
      res.status(500).json({ message: "Error logging out" });
      return;
    }
  }
);
