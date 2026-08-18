import prisma from "../../../config/prisma/prisma.js";
import { ApiResponse, AuthenticatedRequest } from "../../../types/common.js";

export const getUserDetails = async (
  req: AuthenticatedRequest,
  res: ApiResponse
) => {
  try {
    // Get the authenticated user's ID from the request (assumes you have a `req.user` set by the authentication middleware)
    const userId = req.user?.id;

    // Fetch the user's details from the database using Prisma
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
        tenant: {
          select: {
            tenantId: true,
            companyName: true,
          },
        },
      },
    });

    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Respond with the user details
    res.status(200).json(user);
  } catch (error) {
    console.error("Error during user retrieval:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
