import axios from "axios";
import { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";
import { getKeycloakClientSecret } from "../../../../utils/keycloak/getKeycloakClientSecret.js";
import {
  LoginSuccessResponse,
  LoginTOTPRequiredResponse,
} from "../../../../types/auth.js";
import { generateTempToken } from "../../../../utils/jwt/generateTempToken.js";

/**
 * Verify user login credentials (step 1 of 2FA)
 * @param req - Express request with LoginCredentials body
 * @param res - Express response with login status
 */
export const verifyLogin = async (
  req: Request<{}, any, { usernameOrEmail: string; password: string }>,
  res: Response
): Promise<void> => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      res
        .status(400)
        .json({ message: "Username/Email and password are required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        department: true,
        provider: true,
        tenantId: true,
      },
    });

    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    if (user.provider !== "KEYCLOAK") {
      res
        .status(400)
        .json({ message: "This login method is for Keycloak users only" });
      return;
    }

    const clientSecret = await getKeycloakClientSecret();

    console.log("🔹 Attempting Keycloak login with:", user.email);

    try {
      const tokenResponse = await axios.post(
        `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: "password",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: clientSecret,
          username: user.email,
          password,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      // Special handling for seeded users (user0, user1, etc.)
      // lines 403-446
      if (user.username && /^user\d+$/.test(user.username)) {
        console.log(
          `🔹 Detected seeded user ${user.username}, bypassing TOTP verification`
        );

        // Extract tokens from Keycloak response
        const { access_token, refresh_token } = tokenResponse.data;

        // Update user's tokens in the database
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
          },
        });

        // Set access token in cookie
        res.cookie("access_token", access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 4 * 3600 * 1000, // 4 hours
          path: "/",
        });

        // Set refresh token in cookie
        res.cookie("refresh_token", refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: "/",
        });

        // Send the response using proper interface
        const successResponse: LoginSuccessResponse = {
          success: true,
          message: "Authentication successful",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            role: user.role,
            department: user.department,
            provider: user.provider,
            tenantId: user.tenantId,
          },
          redirectTo: "/user", // Redirect to user page
        };

        res.json(successResponse);
        return; // Just return without value to satisfy Promise<void>
      }

      // Normal flow for non-seeded users (existing code)
      // Store the refresh token securely
      const refreshToken = tokenResponse.data.refresh_token;

      // Generate a temporary token that includes the refresh token
      const tempToken = generateTempToken(user.id, refreshToken);

      // Store tempToken in cookies
      res.cookie("temp_token", tempToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 5 * 60 * 1000, // 5 minutes
        path: "/",
      });

      const totpResponse: LoginTOTPRequiredResponse = {
        message: "Login verified. Please enter your TOTP code.",
      };

      res.json(totpResponse);
    } catch (error: any) {
      console.error(
        "❌ Keycloak authentication failed:",
        error.response?.data || error.message
      );
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
  } catch (error) {
    console.error("❌ Error verifying login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
