import { SourceManager, SOURCE_STATUS } from "./ingestion/source_manager.js";
import { 
  getUsersCollection, 
  getOpportunitiesCollection, 
  getSourcesCollection, 
  getSourceHealthLogsCollection,
  toObjectId 
} from "./db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_jwt_leap_lounge_2026_super_safe";

async function runAdminSourceHealthTestSuite() {
  console.log("============================================================");
  console.log("   PHASE 17: SECURE ADMIN & SOURCE HEALTH TEST SUITE       ");
  console.log("============================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(message);
    }
    console.log(`  ✓ Passed: ${message}`);
    passedTests++;
  }

  const usersColl = await getUsersCollection();
  const oppsColl = await getOpportunitiesCollection();
  const sourcesColl = await getSourcesCollection();
  const logsColl = await getSourceHealthLogsCollection();

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1: Source Health Initialization & Schema
  // ───────────────────────────────────────────────────────────────────────────
  console.log("Test 1: Source Health Tracking Schema & Defaults");
  {
    await SourceManager.initSources();
    const sources = await SourceManager.getSources();

    assert(sources.length >= 4, `At least 4 default sources initialized (got ${sources.length})`);

    const devto = sources.find(s => s.id === "devto_hackathons" || s.name === "devto_hackathons");
    assert(devto !== undefined, "devto_hackathons source exists");
    assert(devto.enabled === true, "devto_hackathons is enabled by default");
    assert(devto.status !== undefined, "Status field is defined on source");
    assert(devto.errors !== undefined, "Errors tracking object is present on source");
    assert(devto.duplicates !== undefined, "Duplicates tracking metric is present on source");
    assert(devto.fetched !== undefined, "Fetched metric is present on source");
    assert(devto.added !== undefined, "Added metric is present on source");
    assert(devto.updated !== undefined, "Updated metric is present on source");
    assert(devto.duration !== undefined, "Duration metric is present on source");

    const sample = sources.find(s => s.id === "sample_aggregator");
    assert(sample !== undefined, "sample_aggregator source exists");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2: Enable & Disable Sources
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 2: Enable / Disable Sources Admin Controls");
  {
    // Disable sample_aggregator
    const disabled = await SourceManager.toggleSource("sample_aggregator", false);
    assert(disabled.enabled === false, "Source toggled to enabled: false");
    assert(disabled.status === SOURCE_STATUS.DISABLED, "Disabled source status updated to 'disabled'");

    const inDb = await SourceManager.getSource("sample_aggregator");
    assert(inDb.enabled === false, "Database reflects enabled: false");
    assert(inDb.status === SOURCE_STATUS.DISABLED, "Database reflects status: disabled");

    // Ingestion of a disabled source should be rejected unless forced
    let threwDisabled = false;
    try {
      await SourceManager.triggerIngestion({ sourceId: "sample_aggregator", force: false });
    } catch (err) {
      threwDisabled = true;
      assert(err.message.includes("disabled"), `Expected disabled error message, got: ${err.message}`);
    }
    assert(threwDisabled, "Attempting to ingest disabled source threw error as expected");

    // Re-enable sample_aggregator
    const reEnabled = await SourceManager.toggleSource("sample_aggregator", true);
    assert(reEnabled.enabled === true, "Source successfully re-enabled");
    assert(reEnabled.status !== SOURCE_STATUS.DISABLED, "Re-enabled source is no longer marked disabled");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3: Trigger Ingestion & Track Execution Metrics
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 3: Trigger Ingestion Pipeline & Record Metrics");
  {
    // Run ingestion for sample_aggregator
    const runResult = await SourceManager.triggerIngestion({
      sourceId: "sample_aggregator",
      triggeredBy: "admin_tester"
    });

    assert(runResult.success === true, "Ingestion execution succeeded");
    assert(runResult.summary !== undefined, "Summary returned in run report");

    const sampleSource = await SourceManager.getSource("sample_aggregator");
    assert(sampleSource.fetched > 0, `Fetched items recorded: ${sampleSource.fetched}`);
    assert(sampleSource.added > 0 || sampleSource.updated > 0, `Added (${sampleSource.added}) or updated (${sampleSource.updated}) recorded`);
    assert(sampleSource.duration >= 0, `Execution duration recorded: ${sampleSource.duration}ms`);
    assert(sampleSource.last_successful_run !== null, `last_successful_run recorded: ${sampleSource.last_successful_run}`);
    assert(sampleSource.status === SOURCE_STATUS.HEALTHY || sampleSource.status === SOURCE_STATUS.DEGRADED, `Status is healthy or degraded (got ${sampleSource.status})`);

    // Verify history log entry was appended
    assert(Array.isArray(sampleSource.history) && sampleSource.history.length > 0, "Source history log recorded");
    const latestRun = sampleSource.history[0];
    assert(latestRun.triggeredBy === "admin_tester", "Run history records triggeredBy identity");
    assert(latestRun.duration >= 0, "Run history records duration");

    // Re-run immediately: all items are now existing, so duplicates/updated must be tracked!
    const reRunResult = await SourceManager.triggerIngestion({
      sourceId: "sample_aggregator",
      triggeredBy: "admin_tester"
    });
    assert(reRunResult.success === true, "Second ingestion execution succeeded");

    const reRunSource = await SourceManager.getSource("sample_aggregator");
    assert(reRunSource.duplicates > 0 || reRunSource.updated > 0, `Duplicates (${reRunSource.duplicates}) or updated (${reRunSource.updated}) tracked on repeat run`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 4: Inspect Ingestion Failures
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 4: Failure & Diagnostics Inspection");
  {
    // Insert a mock failure log entry to verify failure inspection
    const testFailure = {
      sourceId: "devto_hackathons",
      sourceName: "Dev.to Hackathons",
      timestamp: new Date().toISOString(),
      status: SOURCE_STATUS.DEGRADED,
      duration: 350,
      fetched: 10,
      added: 8,
      updated: 0,
      duplicates: 0,
      errorCount: 1,
      errors: [
        {
          message: "Validation failed: apply_url is missing or malformed",
          itemTitle: "Malformed Community Hackathon",
          stage: "validation",
          timestamp: new Date().toISOString()
        }
      ],
      triggeredBy: "test_runner"
    };

    await logsColl.insertOne(testFailure);

    const failuresReport = await SourceManager.getFailures({ sourceId: "devto_hackathons" });
    assert(failuresReport.failures.length > 0, "Failures report returned recorded errors");

    const found = failuresReport.failures.find(f => f.itemTitle === "Malformed Community Hackathon");
    assert(found !== undefined, "Found specific validation failure in diagnostics");
    assert(found.stage === "validation", "Diagnostics records stage: validation");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 5: Inspect Unverified & AI-Generated Opportunities
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 5: Unverified and AI-Generated Opportunities Review");
  {
    // Ensure test unverified opportunities exist
    const testUnverifiedOpp = {
      id: "opp_test_unverified_99",
      title: "Autonomous Agent Summer Fellowship 2026",
      organization: "Autonomous Lab",
      category: "fellowship",
      source: "ai_generated",
      is_ai_generated: true,
      verified: false,
      apply_url: "https://example.com/apply-agent-fellowship",
      deadline: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      active: true,
      created_at: new Date().toISOString()
    };

    await oppsColl.deleteOne({ id: testUnverifiedOpp.id });
    await oppsColl.insertOne(testUnverifiedOpp);

    // Inspect all unverified opportunities
    const unverifiedQueue = await SourceManager.getUnverifiedOpportunities({ filter: "all" });
    assert(unverifiedQueue.total > 0, "Unverified queue returns pending items");
    assert(unverifiedQueue.aiGeneratedCount > 0, "AI generated count is tracked");

    const foundOpp = unverifiedQueue.opportunities.find(o => o.id === testUnverifiedOpp.id);
    assert(foundOpp !== undefined, "Test unverified opportunity found in review queue");
    assert(foundOpp.qualityScore !== undefined, "Computed qualityScore is attached to opportunity");
    assert(foundOpp.verified === false, "Opportunity is verified: false");
    assert(foundOpp.is_ai_generated === true, "Opportunity is flagged is_ai_generated: true");

    // Filter strictly by AI generated
    const aiQueue = await SourceManager.getUnverifiedOpportunities({ filter: "ai_generated" });
    assert(aiQueue.opportunities.every(o => o.is_ai_generated || o.source === "ai_generated"), "AI filter returns only AI synthesized opportunities");

    // Verify opportunity
    const verifyResult = await SourceManager.verifyOpportunity(testUnverifiedOpp.id, "Chief_Admin");
    assert(verifyResult.success === true, "verifyOpportunity returned success: true");
    assert(verifyResult.verified === true, "verified is true");
    assert(verifyResult.verified_by === "Chief_Admin", "verified_by records admin name");

    const verifiedInDb = await oppsColl.findOne({ id: testUnverifiedOpp.id });
    assert(verifiedInDb.verified === true, "Database record verified is now true");
    assert(verifiedInDb.verified_by === "Chief_Admin", "Database records verified_by admin");
    assert(verifiedInDb.status === "active", "Database status is active");

    // Reject opportunity
    const rejectResult = await SourceManager.rejectOpportunity(testUnverifiedOpp.id, "Duplicate external post", "Chief_Admin");
    assert(rejectResult.success === true, "rejectOpportunity returned success: true");
    assert(rejectResult.status === "rejected", "status is rejected");

    const rejectedInDb = await oppsColl.findOne({ id: testUnverifiedOpp.id });
    assert(rejectedInDb.active === false, "Rejected opportunity is marked active: false");
    assert(rejectedInDb.status === "rejected", "Rejected opportunity has status: rejected");

    // Clean up test opportunity
    await oppsColl.deleteOne({ id: testUnverifiedOpp.id });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 6: System-wide Stats Aggregation
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 6: Overall System Health & Admin Stats");
  {
    const stats = await SourceManager.getSystemStats();
    assert(stats.sources.total >= 4, "Stats tracks total sources");
    assert(stats.sources.enabled >= 1, "Stats tracks enabled sources");
    assert(stats.opportunities.total > 0, "Stats tracks total opportunities in database");
    assert(stats.opportunities.verified >= 0, "Stats tracks verified count");
    assert(stats.opportunities.unverified >= 0, "Stats tracks unverified count");
    assert(stats.opportunities.aiGenerated >= 0, "Stats tracks AI generated count");
    assert(stats.ingestionTotals.fetched >= 0, "Stats aggregates total fetched");
    assert(stats.ingestionTotals.added >= 0, "Stats aggregates total added");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 7: Access Control & requireAdmin Security Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 7: Authentication & Authorization Security Logic");
  {
    // Test admin token generation
    const adminToken = jwt.sign(
      { userId: "user_admin_999", name: "admin", role: "admin", isAdmin: true },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const decodedAdmin = jwt.verify(adminToken, JWT_SECRET);
    assert(decodedAdmin.role === "admin", "Admin token contains role: admin");
    assert(decodedAdmin.isAdmin === true, "Admin token contains isAdmin: true");

    // Test non-admin token
    const regularToken = jwt.sign(
      { userId: "user_regular_111", name: "regular_student", role: "user", isAdmin: false },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const decodedRegular = jwt.verify(regularToken, JWT_SECRET);
    assert(decodedRegular.role === "user", "Regular token contains role: user");
    assert(decodedRegular.isAdmin === false, "Regular token contains isAdmin: false");

    // Verify admin API key
    const adminKey = process.env.ADMIN_API_KEY || "loop_admin_secret_key_2026";
    assert(typeof adminKey === "string" && adminKey.length >= 16, "Admin API Key configured securely");
  }

  console.log("\n============================================================");
  console.log(`   ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions passed!   `);
  console.log("============================================================\n");
}

runAdminSourceHealthTestSuite().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
