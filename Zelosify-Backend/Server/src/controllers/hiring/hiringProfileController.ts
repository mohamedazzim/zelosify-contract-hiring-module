import type { Request, Response } from "express";

export async function fetchData(req: Request, res: Response) {
  try {
    const data = "Dummy controller";
    return res.json({ message: "sucess", data });
  } catch (err: any) {
    if (err.code === "P2025") {
      // Prisma record not found
      return res.status(404).json({ message: "Data not found" });
    }
    console.error("Unknown error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
