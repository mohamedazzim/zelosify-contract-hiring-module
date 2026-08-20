import prisma from "../config/prisma/prisma.js";
import { Role, OpeningStatus } from "@prisma/client";

/**
 * Seeds the database with sample job openings for testing purposes.
 *
 * - Upserts a single tenant "Bruce Wayne Corp" (idempotent via companyName)
 * - Requires an existing HIRING_MANAGER user in the database (looked up by role)
 * - Seeds 12 openings with realistic variation in title, contractType,
 *   experience ranges, location (mix of Remote + specific cities), requiredSkills,
 *   and status (mostly OPEN, a couple CLOSED/ON_HOLD)
 * - Idempotent upsert by (tenantId, title): updates existing records with requiredSkills
 *   or creates new ones without duplicating rows on rerun.
 * - All operations run inside a Prisma $transaction so partial failures
 *   roll back — no inconsistent state left behind.
 *
 * Usage:
 *   npm run seed:openings
 *
 * Prerequisites:
 *   - A Postgres database available at DATABASE_URL
 *   - At least one User with role HIRING_MANAGER registered in the DB
 *     (register via POST /api/v1/auth/register before running)
 */
async function seedOpenings() {
  try {
    console.log("🌱 Seeding openings data...");

    // ─────────────────────────────────────────────────────────
    // 1. Upsert tenant "Bruce Wayne Corp" (idempotent)
    // ─────────────────────────────────────────────────────────
    const existingTenant = await prisma.tenants.findFirst({
      where: { companyName: "Bruce Wayne Corp" },
    });

    const tenant = existingTenant
      ? existingTenant
      : await prisma.tenants.create({
          data: { companyName: "Bruce Wayne Corp" },
        });
    console.log(
      `✅ Tenant upserted: ${tenant.tenantId} ("Bruce Wayne Corp")`
    );

    // ─────────────────────────────────────────────────────────
    // 2. Look up a real HIRING_MANAGER user — do NOT invent a UUID
    // ─────────────────────────────────────────────────────────
    const hiringManager = await prisma.user.findFirst({
      where: { role: Role.HIRING_MANAGER },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!hiringManager) {
      throw new Error(
        "❌ BLOCKER: No HIRING_MANAGER user found in the database. " +
          "Register one first via POST /api/v1/auth/register " +
          "(role: HIRING_MANAGER) before running this seed. " +
          "Do not invent a fake UUID — the opening's hiringManagerId " +
          "must resolve to a real user for the 'fetch opening details " +
          "with hiring manager name' requirement."
      );
    }
    console.log(
      `✅ Hiring Manager found: ${hiringManager.firstName} ${hiringManager.lastName} <${hiringManager.email}> (id: ${hiringManager.id})`
    );

    // ─────────────────────────────────────────────────────────
    // 3. Define 12 openings with realistic variation & requiredSkills
    // ─────────────────────────────────────────────────────────
    const openingsData = [
      {
        tenantId: tenant.tenantId,
        title: "Senior Frontend Engineer",
        description:
          "Lead the development of our customer-facing dashboard using React and Tailwind CSS.",
        location: "Remote",
        contractType: "Contract-to-Hire",
        hiringManagerId: hiringManager.id,
        experienceMin: 5,
        experienceMax: 8,
        requiredSkills: [
          "React",
          "TypeScript",
          "Next.js",
          "JavaScript",
          "Tailwind CSS",
          "Redux",
        ],
        expectedCompletionDate: new Date("2026-07-31"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Full-stack Developer",
        description:
          "Build and maintain internal tools for vendor onboarding and contract lifecycle management.",
        location: "New York, NY",
        contractType: "Full-time Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 3,
        experienceMax: 5,
        requiredSkills: [
          "React",
          "Node.js",
          "TypeScript",
          "PostgreSQL",
          "REST APIs",
        ],
        expectedCompletionDate: new Date("2026-09-15"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "DevOps Engineer",
        description:
          "Own CI/CD pipelines, container orchestration, and infrastructure-as-code for our platform.",
        location: "San Francisco, CA",
        contractType: "Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 4,
        experienceMax: 6,
        requiredSkills: [
          "Docker",
          "Kubernetes",
          "AWS",
          "CI/CD",
          "Terraform",
        ],
        expectedCompletionDate: new Date("2026-08-30"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Data Engineer",
        description:
          "Design and maintain our data pipeline for contract analytics and vendor performance metrics.",
        location: "Remote",
        contractType: "Full-time Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 3,
        experienceMax: 7,
        requiredSkills: [
          "Python",
          "SQL",
          "PostgreSQL",
          "ETL",
          "Airflow",
        ],
        expectedCompletionDate: new Date("2026-10-15"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "UX/UI Designer",
        description:
          "Redesign the vendor portal and hiring manager dashboard for improved usability.",
        location: "London, UK",
        contractType: "Part-time",
        hiringManagerId: hiringManager.id,
        experienceMin: 2,
        experienceMax: 4,
        requiredSkills: [
          "Figma",
          "UI Design",
          "UX Research",
          "Wireframing",
          "Design Systems",
        ],
        expectedCompletionDate: new Date("2026-09-30"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Backend Engineer",
        description:
          "Build scalable REST APIs for contract management, scoring engine, and LLM integration.",
        location: "Austin, TX",
        contractType: "Contract-to-Hire",
        hiringManagerId: hiringManager.id,
        experienceMin: 4,
        experienceMax: 6,
        requiredSkills: [
          "Node.js",
          "TypeScript",
          "PostgreSQL",
          "REST APIs",
          "Docker",
        ],
        expectedCompletionDate: new Date("2026-11-01"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Cloud Architect",
        description:
          "Lead cloud migration and design multi-tenant architecture on AWS.",
        location: "Chicago, IL",
        contractType: "Full-time Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 8,
        experienceMax: 10,
        requiredSkills: [
          "AWS",
          "Cloud Architecture",
          "Kubernetes",
          "Microservices",
          "Terraform",
          "Security",
        ],
        expectedCompletionDate: new Date("2026-12-15"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Mobile Developer",
        description:
          "Build the React Native mobile app for vendor onboarding and contract tracking.",
        location: "Remote",
        contractType: "Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 3,
        experienceMax: 5,
        requiredSkills: [
          "React Native",
          "TypeScript",
          "React",
          "Mobile Development",
          "REST APIs",
        ],
        expectedCompletionDate: new Date("2026-09-15"),
        status: OpeningStatus.CLOSED,
      },
      {
        tenantId: tenant.tenantId,
        title: "QA Automation Engineer",
        description:
          "Build automated test suites for the contract management and hiring platform.",
        location: "Boston, MA",
        contractType: "Full-time Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 2,
        experienceMax: 4,
        requiredSkills: [
          "Playwright",
          "Vitest",
          "Jest",
          "TypeScript",
          "Automation Testing",
          "CI/CD",
        ],
        expectedCompletionDate: new Date("2026-10-01"),
        actionDate: new Date("2026-08-18"),
        status: OpeningStatus.ON_HOLD,
      },
      {
        tenantId: tenant.tenantId,
        title: "Security Engineer",
        description:
          "Ensure SOC 2 compliance and implement secure auth for the contract hiring platform.",
        location: "Denver, CO",
        contractType: "Contract-to-Hire",
        hiringManagerId: hiringManager.id,
        experienceMin: 5,
        experienceMax: 8,
        requiredSkills: [
          "Security",
          "SOC 2",
          "Authentication",
          "Cloud Security",
          "OWASP",
        ],
        expectedCompletionDate: new Date("2026-11-30"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "Product Manager",
        description:
          "Define product roadmap for the vendor-hiring-manager contract management module.",
        location: "Seattle, WA",
        contractType: "Full-time Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 4,
        experienceMax: 7,
        requiredSkills: [
          "Product Management",
          "Agile",
          "Roadmap",
          "Scrum",
          "Requirements Analysis",
        ],
        expectedCompletionDate: new Date("2026-12-01"),
        status: OpeningStatus.OPEN,
      },
      {
        tenantId: tenant.tenantId,
        title: "ML Engineer",
        description:
          "Build the resume-scoring and recommendation agent using LLM tool-calling.",
        location: "Remote",
        contractType: "Contract",
        hiringManagerId: hiringManager.id,
        experienceMin: 3,
        experienceMax: 6,
        requiredSkills: [
          "Python",
          "Machine Learning",
          "LLMs",
          "FastAPI",
          "PyTorch",
          "Docker",
        ],
        expectedCompletionDate: new Date("2026-10-31"),
        status: OpeningStatus.OPEN,
      },
    ];

    // ─────────────────────────────────────────────────────────
    // 4. Upsert all openings atomically in a transaction
    //    — idempotent: updates existing records with requiredSkills
    //      or creates new ones without duplicating rows.
    // ─────────────────────────────────────────────────────────
    const seededCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const item of openingsData) {
        const existing = await tx.opening.findFirst({
          where: {
            tenantId: item.tenantId,
            title: item.title,
          },
        });

        if (existing) {
          await tx.opening.update({
            where: { id: existing.id },
            data: item,
          });
        } else {
          await tx.opening.create({
            data: item,
          });
        }
        count++;
      }
      return count;
    });

    console.log(`✅ Upserted ${seededCount} openings with requiredSkills under tenant "Bruce Wayne Corp"`);

    // ── Summary breakdown ──
    const statusCounts = await prisma.opening.groupBy({
      by: ["status"],
      where: { tenantId: tenant.tenantId },
      _count: { _all: true },
    });
    console.log("📊 Openings by status:");
    for (const s of statusCounts) {
      console.log(`   ${s.status}: ${s._count._all}`);
    }

    const totalOpeningsWithSkills = await prisma.opening.count({
      where: {
        tenantId: tenant.tenantId,
        NOT: { requiredSkills: { equals: [] } },
      },
    });
    console.log(`🎯 Openings with non-empty requiredSkills: ${totalOpeningsWithSkills}`);
  } catch (error) {
    console.error("❌ Error seeding openings:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedOpenings();
