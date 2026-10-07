import { DeterministicEligibilityEngine } from "../backend/server/eligibility/engine.js";

function runTests() {
  console.log("=== Testing Deterministic Eligibility Engine ===");

  // Test 1: Full match
  const profile1 = {
    profile: {
      degree: "B.Tech",
      branch: "Computer Science",
      graduation_year: 2025,
      cgpa: 8.5,
      age: 22,
      gender: "female",
      citizenship: "India",
      skills: ["javascript", "react", "node"],
      experience_years: 1,
      work_authorization: "authorized"
    }
  };

  const opp1 = {
    deadline: "2028-12-31T23:59:59.000Z",
    location: "Remote",
    work_mode: "remote",
    tags: ["javascript", "react"],
    eligibility: {
      branches: ["computer science", "information technology"],
      min_cgpa: 7.5,
      min_graduation_year: 2024,
      max_graduation_year: 2026,
      min_age: 18,
      max_age: 30,
      citizenship: ["India"],
      min_experience: 0,
      work_authorization: "authorized"
    }
  };

  const res1 = DeterministicEligibilityEngine.evaluate(profile1, opp1);
  console.log("\n[Test 1] Full Match Result:", JSON.stringify(res1, null, 2));
  if (res1.eligible !== "PASS" || res1.blockers.length > 0 || res1.confidence !== 1.0) {
    throw new Error("Test 1 failed: Expected PASS with 1.0 confidence");
  }

  // Test 2: Missing CGPA -> UNKNOWN check status, but eligible is PASS (UNKNOWN is not auto-fail)
  const profile2 = {
    profile: {
      degree: "B.Tech",
      branch: "Computer Science",
      graduation_year: 2025,
      skills: ["javascript"]
    }
  };
  const res2 = DeterministicEligibilityEngine.evaluate(profile2, opp1);
  console.log("\n[Test 2] Missing CGPA Result:", JSON.stringify(res2, null, 2));
  if (res2.checks.cgpa !== "UNKNOWN" || res2.eligible === "FAIL") {
    throw new Error("Test 2 failed: UNKNOWN CGPA should not auto-fail eligibility");
  }

  // Test 3: Expired Deadline (Hard Blocker)
  const opp3 = { ...opp1, deadline: "2020-01-01T00:00:00.000Z" };
  const res3 = DeterministicEligibilityEngine.evaluate(profile1, opp3);
  console.log("\n[Test 3] Expired Deadline Result:", res3.eligible, res3.blockers);
  if (res3.eligible !== "FAIL" || res3.checks.deadline !== "FAIL") {
    throw new Error("Test 3 failed: Expired deadline must trigger FAIL");
  }

  // Test 4: Branch Mismatch (Hard Blocker)
  const opp4 = {
    ...opp1,
    eligibility: {
      ...opp1.eligibility,
      branches: ["mechanical engineering"]
    }
  };
  const res4 = DeterministicEligibilityEngine.evaluate(profile1, opp4);
  console.log("\n[Test 4] Branch Mismatch Result:", res4.eligible, res4.blockers);
  if (res4.eligible !== "FAIL" || res4.checks.degree_branch !== "FAIL") {
    throw new Error("Test 4 failed: Branch mismatch must trigger FAIL");
  }

  console.log("\n✅ ALL ELIGIBILITY ENGINE TESTS PASSED PERFECTLY!");
}

runTests();
