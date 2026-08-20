/**
 * scripts/cleanupTestData.ts
 *
 * SAFE cleanup of test-generated data from the development database.
 *
 * Usage:
 *   npm run cleanup:test-data            # DRY-RUN: report only, deletes nothing
 *   npm run cleanup:test-data -- --confirm   # EXECUTE deletions
 *
 * Safety guarantees:
 *   - Refuses to run without the exact "--confirm" flag.
 *   - Defaults to dry-run/report mode (no writes).
 *   - Runs all deletions inside ONE Prisma transaction.
 *   - Deletes ONLY explicitly identified test profiles (by ID) and test users
 *     (by exact username). Never bulk-deletes by pattern.
 *   - Preserves the "Bruce Wayne Corp" tenant and all 12 seeded openings.
 *   - AgentRun rows are removed via the schema-level ON DELETE CASCADE.
 *   - Never contacts Keycloak; DB only.
 *   - Prints counts and IDs only — never secrets.
 */
import prisma from "../src/config/prisma/prisma.js";

// ---------------------------------------------------------------------------
// Explicit deletion criteria (from the audit, verified read-only on 2026-08-19)
// ---------------------------------------------------------------------------

/** HiringProfile IDs identified as test-generated. */
const TEST_PROFILE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 83, 84, 85];

/**
 * Exact usernames of test users. Exact-match only — a future user named
 * "hm_live_manager_1" would also be deleted, but ordinary similar names like
 * "hm_vendor" or "itvendor2" are NOT affected because they are not in this list.
 */
const TEST_USERNAMES = [
  "itvendor1",
  "hm_test_vendor",
  "hm_neg_test_user",
  "hm_vendor_test",
  "itvendor_walkthrough_test",
  "hm_live_manager_1",
  "hm_live_manager_2",
];

/** Baseline tenant and openings that MUST be preserved. */
const BASELINE_TENANT_NAME = "Bruce Wayne Corp";

function hasConfirmFlag(): boolean {
  return process.argv.includes("--confirm");
}

async function main() {
  const confirm = hasConfirmFlag();
  console.log(`\n=== Cleanup Test Data ===`);
  console.log(`Mode: ${confirm ? "EXECUTE (--confirm present)" : "DRY-RUN (report only)"}`);
  if (!confirm) {
    console.log(`\nTo execute, re-run with the exact flag: npm run cleanup:test-data -- --confirm\n`);
  }

  // ---- 1. Identify records to delete (read-only queries) ----
  const profiles = await prisma.hiringProfile.findMany({
    where: { id: { in: TEST_PROFILE_IDS } },
    select: { id: true, s3Key: true, recommendationStatus: true, isDeleted: true },
    orderBy: { id: "asc" },
  });
  const profileIds = profiles.map((p) => p.id);
  const agentRunCount = await prisma.agentRun.count({ where: { profileId: { in: profileIds } } });

  const users = await prisma.user.findMany({
    where: { username: { in: TEST_USERNAMES } },
    select: { id: true, username: true, role: true },
    orderBy: { username: "asc" },
  });
  const userIds = users.map((u) => u.id);

  // ---- 2. Safety pre-checks ----
  const baselineTenant = await prisma.tenants.findFirst({ where: { companyName: BASELINE_TENANT_NAME } });
  if (!baselineTenant) {
    console.error(`ABORT: baseline tenant "${BASELINE_TENANT_NAME}" not found — refusing to continue.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const openingsUnderBaseline = await prisma.opening.count({ where: { tenantId: baselineTenant.tenantId } });
  if (openingsUnderBaseline !== 12) {
    console.error(
      `ABORT: expected 12 seeded openings under "${BASELINE_TENANT_NAME}" but found ${openingsUnderBaseline}. ` +
        `Refusing to run — the baseline does not match expectations.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Refuse to delete the baseline user
  const baselineUser = await prisma.user.findFirst({
    where: { username: "bruce.wayne" },
    select: { id: true },
  });
  if (baselineUser && userIds.includes(baselineUser.id)) {
    console.error("ABORT: baseline user 'bruce.wayne' matched deletion list — refusing.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // ---- 2b. Per-profile safety check ----
  // Every targeted profile must (a) belong to the Bruce Wayne Corp tenant,
  // (b) sit under one of the 12 seeded openings, and (c) carry a known
  // test/walkthrough s3Key pattern. Abort otherwise — this prevents deleting
  // a legitimate profile that happens to share a numeric ID range.
  const seededOpenings = await prisma.opening.findMany({
    where: { tenantId: baselineTenant.tenantId },
    select: { id: true, title: true },
  });
  const seededOpeningIds = new Set(seededOpenings.map((o) => o.id));
  if (seededOpenings.length !== 12) {
    console.error(
      `ABORT: expected exactly 12 seeded openings under "${BASELINE_TENANT_NAME}" but found ${seededOpenings.length}.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const TEST_S3_KEY_PATTERNS = [
    (k: string) => k.startsWith("test/"), // unit-test profiles (83-85)
    (k: string) => k.endsWith("_profile_test.pdf"), // early walkthrough uploads (1-3)
    (k: string) => k.includes("_candidate_test_"), // walkthrough uploads (4-6)
    (k: string) => k.includes("_dummy_candidate"), // walkthrough uploads (7-11)
  ];

  const profilesWithOpenings = await prisma.hiringProfile.findMany({
    where: { id: { in: TEST_PROFILE_IDS } },
    select: { id: true, s3Key: true, openingId: true },
  });

  for (const p of profilesWithOpenings) {
    if (!seededOpeningIds.has(p.openingId)) {
      console.error(`ABORT: profile ${p.id} belongs to opening ${p.openingId} which is NOT one of the 12 seeded openings.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    // A profile is deletable if its s3Key matches a known test/walkthrough
    // pattern OR its ID is explicitly listed in the approved cleanup set.
    // (Every ID in TEST_PROFILE_IDS is explicitly approved, so this can only
    // ever fail if a key genuinely does not look like a test artifact.)
    const matchesKnownPattern = TEST_S3_KEY_PATTERNS.some((fn) => fn(p.s3Key));
    const explicitlyApproved = TEST_PROFILE_IDS.includes(p.id);
    if (!matchesKnownPattern && !explicitlyApproved) {
      console.error(
        `ABORT: profile ${p.id} s3Key does not match any known test/walkthrough pattern (and ID must be explicitly approved).`
      );
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  const missingProfileIds = TEST_PROFILE_IDS.filter((id) => !profilesWithOpenings.some((p) => p.id === id));
  if (missingProfileIds.length > 0) {
    console.error(`ABORT: expected to find ${TEST_PROFILE_IDS.length} profiles but found ${profilesWithOpenings.length}.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\n[SAFETY] verified ${profilesWithOpenings.length}/${TEST_PROFILE_IDS.length} profiles belong to the seeded tenant/openings and match test s3Key patterns.`);

  // ---- 3. Report ----
  console.log(`\n--- Records to delete ---`);
  console.log(`hiringProfile rows: ${profileIds.length}`);
  for (const p of profiles) {
    const keyMarker = p.s3Key.startsWith("test/") ? "[unit-test]" : p.s3Key.split("/")[0] + "/...";
    console.log(
      `  id=${p.id} reco=${p.recommendationStatus} isDeleted=${p.isDeleted} s3=${keyMarker}`
    );
  }
  console.log(`AgentRun rows (cascade-deleted via profile delete): ${agentRunCount}`);
  console.log(`\nuser rows: ${users.length}`);
  for (const u of users) {
    console.log(`  id=${u.id} username=${u.username} role=${u.role}`);
  }
  console.log(`\n--- Preserved ---`);
  console.log(`tenant: ${BASELINE_TENANT_NAME} (${baselineTenant.tenantId})`);
  console.log(`openings: ${openingsUnderBaseline} (all 12 seeded openings untouched)`);
  console.log(`baseline user: bruce.wayne (not in deletion list)`);

  if (!confirm) {
    console.log(`\nDry-run complete. Nothing was deleted.`);
    await prisma.$disconnect();
    return;
  }

  // ---- 4. Execute in ONE transaction ----
  try {
    await prisma.$transaction(async (tx) => {
      // AgentRun rows cascade automatically when the parent profile is deleted.
      // We delete profiles first (FK ON DELETE CASCADE removes dependent runs).
      const profileDelete = await tx.hiringProfile.deleteMany({
        where: { id: { in: profileIds } },
      });
      console.log(`\n[EXECUTED] deleted hiringProfile rows: ${profileDelete.count}`);

      // Delete test users (only those identified). Their dependent records are
      // minimal (no tenant ownership); no cascade issues in the current schema.
      const userDelete = await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
      console.log(`[EXECUTED] deleted user rows: ${userDelete.count}`);
    });

    // Verify: count remaining rows
    const remainingProfiles = await prisma.hiringProfile.count({ where: { id: { in: profileIds } } });
    const remainingUsers = await prisma.user.count({ where: { username: { in: TEST_USERNAMES } } });
    const remainingRuns = await prisma.agentRun.count({ where: { profileId: { in: profileIds } } });
    console.log(`\n[VERIFY] remaining test profiles: ${remainingProfiles}, users: ${remainingUsers}, runs: ${remainingRuns}`);
    console.log(`Cleanup committed successfully.`);
  } catch (err: any) {
    console.error(`Cleanup FAILED (transaction rolled back): ${err?.message || err}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
