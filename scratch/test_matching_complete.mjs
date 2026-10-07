import { DeterministicMatchingEngine, MATCH_WEIGHTS } from "../backend/server/matching/engine.js";
import { DeterministicEligibilityEngine } from "../backend/server/eligibility/engine.js";

async function runCompleteTestSuite() {
  console.log("============================================================");
  console.log("       LOOP DETERMINISTIC MATCHING ENGINE TEST SUITE        ");
  console.log("============================================================");

  let passedTests = 0;

  // --------------------------------------------------------------------------
  // TEST 1: Weights sanity check
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Weights validation...");
  const sumWeights = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
  console.log(`Weights sum: ${sumWeights}`);
  if (Math.abs(sumWeights - 1.0) > 0.0001) {
    throw new Error(`Weights must sum to 1.0, got ${sumWeights}`);
  }
  passedTests++;
  console.log("✔ Weights properly normalized to 1.00");

  // --------------------------------------------------------------------------
  // TEST 2: High Match Candidate (Eligible)
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] High Match Candidate (Eligible)...");
  const studentUser = {
    profile: {
      name: "Alex Doe",
      degree: "B.Tech",
      branch: "Computer Science",
      field: "Artificial Intelligence",
      graduation_year: 2026,
      cgpa: 9.0,
      citizenship: "India",
      skills: ["Python", "PyTorch", "TensorFlow", "React", "AI"],
      interests: ["AI", "Machine Learning", "Climate Change"],
      categories: ["hackathon", "internship"],
      preferred_locations: ["Remote", "Bangalore"],
      experience_years: 1,
      work_authorization: "authorized"
    },
    saved: ["opp_3"],
    interested: ["opp_3"],
    passed: [],
    applied: []
  };

  const aiHackathon = {
    id: "opp_3",
    title: "Global AI Hackathon 2026",
    category: "hackathon",
    location: "Virtual",
    work_mode: "remote",
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days left (urgent)
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(), // 1 day ago (fresh)
    tags: ["AI", "Machine Learning", "Python", "Prizes"],
    eligibility: {
      branches: ["Computer Science", "Artificial Intelligence", "Data Science"],
      min_cgpa: 7.0,
      min_graduation_year: 2025,
      max_graduation_year: 2027,
      required_skills: ["Python", "AI"]
    }
  };

  const eval1 = DeterministicMatchingEngine.evaluate(studentUser, aiHackathon);
  console.log(`Final Match Score: ${eval1.finalMatchScore}%`);
  console.log(`Eligibility Status: ${eval1.eligibility.status}`);
  console.log(`Matched Skills: ${eval1.matchedSkills.join(", ")}`);
  console.log(`Missing Skills: ${eval1.missingSkills.join(", ") || "(none)"}`);
  console.log(`Matched Interests: ${eval1.matchedInterests.join(", ")}`);

  if (eval1.finalMatchScore < 85) {
    throw new Error(`Expected score >= 85, got ${eval1.finalMatchScore}`);
  }
  if (!eval1.isEligible || eval1.eligibility.status !== "PASS") {
    throw new Error("Expected eligibility status PASS");
  }
  if (eval1.missingSkills.length !== 0) {
    throw new Error("Expected 0 missing skills");
  }
  passedTests++;
  console.log("✔ High Match Candidate verified");

  // --------------------------------------------------------------------------
  // TEST 3: Hard Eligibility Constraint - Branch Mismatch
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Hard Eligibility Constraint - Branch Mismatch...");
  const mechOpp = {
    ...aiHackathon,
    id: "opp_mech_only",
    eligibility: {
      ...aiHackathon.eligibility,
      branches: ["Mechanical Engineering"]
    }
  };

  const eval2 = DeterministicMatchingEngine.evaluate(studentUser, mechOpp);
  console.log(`Final Match Score: ${eval2.finalMatchScore}`);
  console.log(`Is Eligible: ${eval2.isEligible}`);
  console.log(`Blockers: ${eval2.eligibility.blockers.join("; ")}`);

  if (eval2.finalMatchScore !== 0) {
    throw new Error(`Constraint violation must set finalMatchScore to 0, got ${eval2.finalMatchScore}`);
  }
  if (eval2.isEligible !== false) {
    throw new Error("isEligible must be false");
  }
  if (!eval2.reasons[0].includes("ELIGIBILITY CONSTRAINT FAILED")) {
    throw new Error("Primary reason must clearly explain constraint failure");
  }
  passedTests++;
  console.log("✔ Hard Constraint (Branch Mismatch) sets score to 0 and logs blocker reason");

  // --------------------------------------------------------------------------
  // TEST 4: Hard Eligibility Constraint - CGPA Cutoff
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] Hard Eligibility Constraint - CGPA Cutoff...");
  const highGpaOpp = {
    ...aiHackathon,
    id: "opp_high_gpa",
    eligibility: {
      ...aiHackathon.eligibility,
      min_cgpa: 9.5 // Student has 9.0
    }
  };

  const eval3 = DeterministicMatchingEngine.evaluate(studentUser, highGpaOpp);
  console.log(`Final Match Score: ${eval3.finalMatchScore}`);
  console.log(`Blockers: ${eval3.eligibility.blockers.join("; ")}`);

  if (eval3.finalMatchScore !== 0 || eval3.isEligible !== false) {
    throw new Error("CGPA constraint failure must set finalMatchScore to 0");
  }
  passedTests++;
  console.log("✔ Hard Constraint (CGPA Cutoff) sets score to 0");

  // --------------------------------------------------------------------------
  // TEST 5: Hard Eligibility Constraint - Expired Deadline
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Hard Eligibility Constraint - Expired Deadline...");
  const expiredOpp = {
    ...aiHackathon,
    id: "opp_expired",
    deadline: "2023-01-01T00:00:00.000Z"
  };

  const eval4 = DeterministicMatchingEngine.evaluate(studentUser, expiredOpp);
  console.log(`Final Match Score: ${eval4.finalMatchScore}`);
  console.log(`Blockers: ${eval4.eligibility.blockers.join("; ")}`);

  if (eval4.finalMatchScore !== 0 || eval4.isEligible !== false) {
    throw new Error("Expired deadline constraint must set finalMatchScore to 0");
  }
  passedTests++;
  console.log("✔ Hard Constraint (Expired Deadline) sets score to 0");

  // --------------------------------------------------------------------------
  // TEST 6: Missing Skills & Partial Matching
  // --------------------------------------------------------------------------
  console.log("\n[Test 6] Missing Skills & Partial Matching...");
  const fullStackOpp = {
    ...aiHackathon,
    id: "opp_fs",
    eligibility: {
      ...aiHackathon.eligibility,
      required_skills: ["Python", "React", "Docker", "Kubernetes", "AWS"]
    }
  };

  const eval5 = DeterministicMatchingEngine.evaluate(studentUser, fullStackOpp);
  console.log("Matched Skills:", eval5.matchedSkills);
  console.log("Missing Skills:", eval5.missingSkills);
  console.log("Skills Score:", eval5.scoreBreakdown.skills.score);

  if (!eval5.matchedSkills.includes("python") || !eval5.matchedSkills.includes("react")) {
    throw new Error("Expected Python and React to be matched");
  }
  if (!eval5.missingSkills.includes("docker") || !eval5.missingSkills.includes("kubernetes") || !eval5.missingSkills.includes("aws")) {
    throw new Error("Expected Docker, Kubernetes, AWS in missingSkills");
  }
  if (eval5.scoreBreakdown.skills.score >= 100) {
    throw new Error("Skills score should reflect missing skills");
  }
  passedTests++;
  console.log("✔ Missing skills identified and scored appropriately");

  // --------------------------------------------------------------------------
  // TEST 7: Behavior Tracking (Passed vs Saved)
  // --------------------------------------------------------------------------
  console.log("\n[Test 7] Behavior Tracking (Passed vs Saved)...");
  const passedOpp = {
    ...aiHackathon,
    id: "opp_passed_by_user"
  };
  const userWithPassed = {
    ...studentUser,
    saved: [],
    interested: [],
    passed: ["opp_passed_by_user"]
  };

  const evalSaved = DeterministicMatchingEngine.evaluate(studentUser, aiHackathon);
  const evalPassed = DeterministicMatchingEngine.evaluate(userWithPassed, passedOpp);

  console.log(`Saved Opp Behavior Score: ${evalSaved.scoreBreakdown.behavior.score}`);
  console.log(`Passed Opp Behavior Score: ${evalPassed.scoreBreakdown.behavior.score}`);

  if (evalSaved.scoreBreakdown.behavior.score <= evalPassed.scoreBreakdown.behavior.score) {
    throw new Error("Saved opp must have higher behavior score than passed opp");
  }
  passedTests++;
  console.log("✔ Behavior scoring rewards saved items and penalizes passed items");

  // --------------------------------------------------------------------------
  // TEST 8: Explainability & Reasons completeness
  // --------------------------------------------------------------------------
  console.log("\n[Test 8] Explainability & Reasons completeness...");
  console.log("Sample reasons output:");
  eval1.reasons.forEach(r => console.log(`   - ${r}`));

  const allFactors = ["Skills", "Interests", "Category", "Location", "Experience", "Behavior", "Urgency", "Recency"];
  for (const factor of allFactors) {
    const hasReason = eval1.reasons.some(r => r.toLowerCase().includes(factor.toLowerCase()));
    if (!hasReason) {
      throw new Error(`Reasons list missing explanation for ${factor}`);
    }
  }
  passedTests++;
  console.log("✔ Explainable reasons provided for all 8 factors + eligibility");

  // --------------------------------------------------------------------------
  // TEST 9: Determinism Verification (100 iterations)
  // --------------------------------------------------------------------------
  console.log("\n[Test 9] Determinism Verification (100 runs)...");
  const refDate = new Date("2026-10-07T12:00:00.000Z");
  const baseResult = JSON.stringify(
    DeterministicMatchingEngine.evaluate(studentUser, aiHackathon, { referenceDate: refDate })
  );

  for (let i = 0; i < 100; i++) {
    const iterResult = JSON.stringify(
      DeterministicMatchingEngine.evaluate(studentUser, aiHackathon, { referenceDate: refDate })
    );
    if (iterResult !== baseResult) {
      throw new Error(`Non-deterministic result detected on run #${i}`);
    }
  }
  passedTests++;
  console.log("✔ Perfect determinism confirmed across 100 consecutive runs");

  // --------------------------------------------------------------------------
  // TEST 10: Express Server Endpoints Verification
  // --------------------------------------------------------------------------
  console.log("\n[Test 10] Express Server API Endpoints...");
  const { default: app } = await import("../backend/server/app.js");

  // Test /api/matching/evaluate with POST request
  const testReq = {
    profile: studentUser.profile,
    opportunity: aiHackathon
  };

  let evaluateEndpointTested = false;
  // Simulate request through app router
  const server = app.listen(0, async () => {
    const port = server.address().port;
    try {
      const res = await fetch(`http://localhost:${port}/api/matching/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testReq)
      });
      const data = await res.json();
      console.log("/api/matching/evaluate response success:", data.success);
      console.log("/api/matching/evaluate finalMatchScore:", data.finalMatchScore);

      if (!data.success || typeof data.finalMatchScore !== "number") {
        throw new Error("API /api/matching/evaluate returned invalid payload");
      }
      evaluateEndpointTested = true;
    } catch (err) {
      console.error("Endpoint test error:", err);
    } finally {
      server.close();
      if (evaluateEndpointTested) {
        passedTests++;
        console.log("✔ /api/matching/evaluate endpoint verified successfully");
        finish();
      } else {
        process.exit(1);
      }
    }
  });

  function finish() {
    console.log(`\n============================================================`);
    console.log(`       ALL ${passedTests} TESTS PASSED WITH 100% SUCCESS!       `);
    console.log(`============================================================\n`);
  }
}

runCompleteTestSuite().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
