import { DeterministicMatchingEngine } from "../backend/server/matching/engine.js";

function runMatchingTests() {
  console.log("=== Testing Deterministic Matching Engine ===");

  const user1 = {
    profile: {
      degree: "B.Tech",
      branch: "Computer Science",
      field: "Software Engineering",
      graduation_year: 2026,
      cgpa: 8.8,
      citizenship: "India",
      skills: ["React", "Node.js", "JavaScript", "TypeScript"],
      interests: ["AI", "Web Development", "Open Source"],
      categories: ["internship", "hackathon"],
      preferred_locations: ["San Francisco, CA", "Remote"],
      experience_years: 1,
      work_authorization: "authorized"
    },
    saved: ["opp_saved_1"],
    interested: ["opp_1"],
    passed: ["opp_passed_99"],
    applied: []
  };

  const opp1 = {
    id: "opp_1",
    title: "Software Engineering Intern - Summer 2027",
    category: "internship",
    location: "San Francisco, CA",
    work_mode: "hybrid",
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(), // 14 days left
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    tags: ["Software Engineering", "React", "Node.js", "Summer"],
    eligibility: {
      branches: ["Computer Science", "Information Technology"],
      min_cgpa: 7.0,
      min_graduation_year: 2025,
      max_graduation_year: 2027,
      required_skills: ["React", "Node.js", "TypeScript"]
    }
  };

  // Test 1: High matching & Eligible opportunity
  const res1 = DeterministicMatchingEngine.evaluate(user1, opp1);
  console.log("\n[Test 1] Eligible High Match Result:");
  console.log("Final Match Score:", res1.finalMatchScore);
  console.log("Eligibility Status:", res1.eligibility.status);
  console.log("Matched Skills:", res1.matchedSkills);
  console.log("Missing Skills:", res1.missingSkills);
  console.log("Score Breakdown:", JSON.stringify(res1.scoreBreakdown, null, 2));
  console.log("Reasons count:", res1.reasons.length);

  if (res1.finalMatchScore < 80) {
    throw new Error(`Test 1 Failed: Expected high match score >= 80, got ${res1.finalMatchScore}`);
  }
  if (!res1.isEligible || res1.eligibility.status !== "PASS") {
    throw new Error(`Test 1 Failed: Expected eligibility PASS, got ${res1.eligibility.status}`);
  }
  if (res1.missingSkills.length !== 0) {
    throw new Error("Test 1 Failed: User has React, Node.js, TypeScript so missingSkills should be empty");
  }

  // Test 2: Hard Constraint Check - Ineligible because Branch Mismatch
  const oppIneligibleBranch = {
    ...opp1,
    id: "opp_mech",
    eligibility: {
      ...opp1.eligibility,
      branches: ["Mechanical Engineering", "Civil Engineering"]
    }
  };

  const res2 = DeterministicMatchingEngine.evaluate(user1, oppIneligibleBranch);
  console.log("\n[Test 2] Hard Constraint Branch Mismatch Result:");
  console.log("Final Match Score:", res2.finalMatchScore);
  console.log("Eligibility:", res2.eligibility.status);
  console.log("Blockers:", res2.eligibility.blockers);

  if (res2.finalMatchScore !== 0) {
    throw new Error(`Test 2 Failed: Eligibility constraint violation must set finalMatchScore to 0, got ${res2.finalMatchScore}`);
  }
  if (res2.isEligible !== false || res2.eligibility.status !== "FAIL") {
    throw new Error("Test 2 Failed: Expected isEligible to be false");
  }

  // Test 3: Hard Constraint Check - Expired Deadline
  const oppExpired = {
    ...opp1,
    id: "opp_expired",
    deadline: "2024-01-01T00:00:00.000Z"
  };

  const res3 = DeterministicMatchingEngine.evaluate(user1, oppExpired);
  console.log("\n[Test 3] Hard Constraint Expired Deadline Result:");
  console.log("Final Match Score:", res3.finalMatchScore);
  console.log("Blockers:", res3.eligibility.blockers);

  if (res3.finalMatchScore !== 0 || res3.eligibility.status !== "FAIL") {
    throw new Error("Test 3 Failed: Expired deadline must trigger FAIL and score 0");
  }

  // Test 4: Missing Skills Identification
  const oppWithMissingSkills = {
    ...opp1,
    id: "opp_python",
    eligibility: {
      ...opp1.eligibility,
      required_skills: ["React", "Python", "Rust", "Go"]
    }
  };

  const res4 = DeterministicMatchingEngine.evaluate(user1, oppWithMissingSkills);
  console.log("\n[Test 4] Missing Skills Result:");
  console.log("Matched Skills:", res4.matchedSkills);
  console.log("Missing Skills:", res4.missingSkills);

  if (!res4.matchedSkills.includes("react")) {
    throw new Error("Test 4 Failed: Expected React to be matched");
  }
  if (!res4.missingSkills.includes("python") || !res4.missingSkills.includes("rust") || !res4.missingSkills.includes("go")) {
    throw new Error("Test 4 Failed: Expected Python, Rust, Go in missingSkills");
  }

  // Test 5: Verify all 8 scoring dimensions exist in score breakdown
  const requiredFactors = [
    "skills", "interests", "category", "location",
    "experience", "behavior", "urgency", "recency"
  ];
  for (const factor of requiredFactors) {
    if (!res1.scoreBreakdown[factor] || typeof res1.scoreBreakdown[factor].score !== "number") {
      throw new Error(`Test 5 Failed: Score breakdown missing factor '${factor}'`);
    }
  }

  // Test 6: Determinism verification
  const runA = DeterministicMatchingEngine.evaluate(user1, opp1);
  const runB = DeterministicMatchingEngine.evaluate(user1, opp1);
  if (JSON.stringify(runA) !== JSON.stringify(runB)) {
    throw new Error("Test 6 Failed: Engine is non-deterministic!");
  }

  console.log("\n✅ ALL MATCHING ENGINE TESTS PASSED PERFECTLY!");
}

runMatchingTests();
