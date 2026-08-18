import { Role } from "@prisma/client";

/**
 * Validate if the provided role matches the Role enum
 * @param role - Incoming role to validate
 * @returns boolean - True if valid, false otherwise
 */
export const isValidRole = (role: string): boolean => {
  return Object.values(Role).includes(role as Role);
};
