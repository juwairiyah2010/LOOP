import { DeterministicMatchingEngine } from "../backend/server/matching/engine.js";

console.log("=== Testing 'Why This Matches' Explainability & 7 Factors ===");

const user = {
  profile: {
    name: "Maya Lin",
    degree: "B.S.",
    branch: "Computer Science",
    field: "Machine Learning",
    graduation_year: 2026,
    cgpa: 3.9,
    citizenship: "United States",
    skills: ["Python", "PyTorch", "SQL", "Docker"],
    interests: ["Artificial Intelligence", "Climate Tech"],
    categories: ["internship", "research"],
    country: "United States",
    preferred_locations: ["Remote", "New York, NY"],
    experience_years: 2,
    work_authorization: "authorized"
  },
  saved: ["opp_climate_ai"],
  interested: [],
  passed: [],
  applied: []
};

const oppEligible = {
  id: "opp_climate_ai",
  title: "Climate AI Research Fellow",
  category: "internship",
  location: "Remote",
  work_mode: "remote",
  deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString(), // 4 days left
  posted_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
  tags: ["Machine Learning", "Climate Tech", "Python", "SQL"],
  eligibility: {
    branches: ["Computer Science", "Data Science"],
    min_cgpa: 3.0,
    min_graduation_year: 2025,
    max_graduation_year: 2027,
    required_skills: ["Python", "SQL", "PyTorch"]
  }
};

const result = DeterministicMatchingEngine.evaluate(user, oppEligible);

console.log("\nEvaluated Result whyThisMatches:");
console.log(JSON.stringify(result.whyThisMatches, null, 2));

const why = result.whyThisMatches;
if (!why) {
  throw new Error("Missing whyThisMatches property");
}

// 1. match percentage
if (typeof why.matchPercentage !== "number" || why.matchPercentage <= 0) {
  throw new Error(`Invalid matchPercentage: ${why.matchPercentage}`);
}
console.log("✔ 1. Match percentage present:", `${why.matchPercentage}%`);

// 2. matched skills
if (!Array.isArray(why.matchedSkills) || !why.matchedSkills.includes("python") || !why.matchedSkills.includes("sql") || !why.matchedSkills.includes("pytorch")) {
  throw new Error(`Invalid matchedSkills: ${JSON.stringify(why.matchedSkills)}`);
}
console.log("✔ 2. Matched skills present:", why.matchedSkills);

// 3. matched interests
if (!Array.isArray(why.matchedInterests) || why.matchedInterests.length === 0) {
  throw new Error(`Invalid matchedInterests: ${JSON.stringify(why.matchedInterests)}`);
}
console.log("✔ 3. Matched interests present:", why.matchedInterests);

// 4. eligibility
if (!why.eligibility || why.eligibility.status !== "PASS" || !why.eligibility.summary) {
  throw new Error(`Invalid eligibility: ${JSON.stringify(why.eligibility)}`);
}
console.log("✔ 4. Eligibility present:", why.eligibility.summary);

// 5. location/mode
if (!why.locationMode || !why.locationMode.workMode || !why.locationMode.summary) {
  throw new Error(`Invalid locationMode: ${JSON.stringify(why.locationMode)}`);
}
console.log("✔ 5. Location/mode present:", why.locationMode.summary);

// 6. deadline urgency
if (!why.deadlineUrgency || typeof why.deadlineUrgency.daysLeft !== "number" || !why.deadlineUrgency.summary) {
  throw new Error(`Invalid deadlineUrgency: ${JSON.stringify(why.deadlineUrgency)}`);
}
console.log("✔ 6. Deadline urgency present:", why.deadlineUrgency.summary);

// 7. relevant behavior
if (!why.relevantBehavior || why.relevantBehavior.type !== "saved" || !why.relevantBehavior.summary) {
  throw new Error(`Invalid relevantBehavior: ${JSON.stringify(why.relevantBehavior)}`);
}
console.log("✔ 7. Relevant behavior present:", why.relevantBehavior.summary);

// Check factors array for UI display
if (!Array.isArray(why.factors) || why.factors.length < 7) {
  throw new Error(`Expected at least 7 factors, got ${why.factors?.length}`);
}
console.log(`✔ All ${why.factors.length} display factors verified successfully!`);

console.log("\n✅ ALL 7 'WHY THIS MATCHES' FACTORS AND REQUIREMENTS VERIFIED!");
