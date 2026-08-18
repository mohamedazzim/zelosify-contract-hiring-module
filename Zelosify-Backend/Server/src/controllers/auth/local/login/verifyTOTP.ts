import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import prisma from "../../../../config/prisma/prisma.js";
import { authenticator } from "otplib";
import { getKeycloakClientSecret } from "../../../../utils/keycloak/getKeycloakClientSecret.js";
import axios from "axios";

export const verifyTOTP = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { totp } = req.body;
    const tempToken = req.cookies.temp_token;

    if (!tempToken || !totp) {
      res.status(400).json({ message: "Temp token and TOTP are required" });
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET!) as JwtPayload;
    } catch (error) {
      res.status(401).json({ message: "Invalid or expired temp token" });
      return;
    }

    const { userId, refreshToken } = decoded;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        department: true,
        totpSecret: true,
        tenant: {
          select: {
            tenantId: true,
            companyName: true,
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Verify TOTP
    const isValidTOTP = authenticator.verify({
      token: totp,
      secret: user.totpSecret!,
    });

    if (!isValidTOTP) {
      res.status(401).json({ message: "Invalid TOTP code" });
      return;
    }

    // TOTP is valid, now exchange the refresh token for new access token
    const clientSecret = await getKeycloakClientSecret();

    try {
      const tokenResponse = await axios.post(
        `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      // Set new access and refresh tokens
      res.cookie("access_token", tokenResponse.data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 4 * 3600 * 1000, // 4 hours
        path: "/",
      });

      res.cookie("refresh_token", tokenResponse.data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
      });

      // Clear the temporary token
      res.clearCookie("temp_token");

      // Remove sensitive data before sending user info
      const { totpSecret, ...userData } = user;

      // Send the final response
      res.json({
        message: "TOTP verified successfully. Login successful.",
        user: userData,
      });
    } catch (error: any) {
      console.error(
        "❌ Error exchanging refresh token:",
        error.response?.data || error.message
      );
      res.status(401).json({ message: "Failed to authenticate" });
    }
  } catch (error) {
    console.error("❌ Error verifying TOTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
