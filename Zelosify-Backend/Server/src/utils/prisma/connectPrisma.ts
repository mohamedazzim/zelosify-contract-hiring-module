import prisma from "../../config/prisma/prisma.js";

export default async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to PostgreSQL");
  } catch (error) {
    console.error("❌ Failed to connect to PostgreSQL:", error);
    process.exit(1);
  }
}
