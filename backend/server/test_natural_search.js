import { searchOpportunitiesByNaturalLanguage, buildMongoFilterQuery } from "./search/natural_search.js";
import { aiService } from "./ai/index.js";
import { getUsersCollection } from "./db.js";

async function runTests() {
  console.log("=== Phase 15: Natural-Language Opportunity Search Test Suite ===\n");

  const users = await getUsersCollection();
  const testUser = await users.findOne({ name: "shresth261" });

  const testQueries = [
    {
      label: "Query 1: Remote AI internships for 3rd year CSE students",
      query: "Remote AI internships for 3rd year CSE students",
      user: testUser,
      asserts: (res) => {
        if (!res.interpretedFilters.category || res.interpretedFilters.category !== "internship") {
          throw new Error(`Expected category "internship", got "${res.interpretedFilters.category}"`);
        }
        if (res.interpretedFilters.work_mode !== "remote") {
          throw new Error(`Expected work_mode "remote", got "${res.interpretedFilters.work_mode}"`);
        }
        if (!res.interpretedFilters.skills?.includes("AI")) {
          throw new Error(`Expected skills to include "AI", got ${JSON.stringify(res.interpretedFilters.skills)}`);
        }
        if (res.interpretedFilters.education?.yearOfStudy !== 3 || res.interpretedFilters.education?.major !== "CSE") {
          throw new Error(`Expected education { yearOfStudy: 3, major: 'CSE' }, got ${JSON.stringify(res.interpretedFilters.education)}`);
        }
        if (res.results.length === 0) {
          throw new Error("Expected at least 1 matching opportunity in results");
        }
        const hasRemoteAi = res.results.some(r => r.title.includes("AI") && r.work_mode === "remote");
        if (!hasRemoteAi) {
          throw new Error("Expected at least one Remote AI opportunity");
        }
      }
    },
    {
      label: "Query 2: Java internships closing this week",
      query: "Java internships closing this week",
      user: testUser,
      asserts: (res) => {
        if (res.interpretedFilters.category !== "internship") {
          throw new Error(`Expected category "internship", got "${res.interpretedFilters.category}"`);
        }
        if (!res.interpretedFilters.skills?.includes("Java")) {
          throw new Error(`Expected skills to include "Java", got ${JSON.stringify(res.interpretedFilters.skills)}`);
        }
        if (res.interpretedFilters.maxDaysLeft !== 7) {
          throw new Error(`Expected maxDaysLeft 7 for 'closing this week', got ${res.interpretedFilters.maxDaysLeft}`);
        }
        if (res.results.length === 0) {
          throw new Error("Expected at least 1 Java internship closing this week");
        }
        const hasJava = res.results.some(r => (r.tags?.includes("Java") || r.title.includes("Java")));
        if (!hasJava) {
          throw new Error("Expected Java opportunity in results");
        }
      }
    },
    {
      label: "Query 3: Hackathons near Delhi",
      query: "Hackathons near Delhi",
      user: testUser,
      asserts: (res) => {
        if (res.interpretedFilters.category !== "hackathon") {
          throw new Error(`Expected category "hackathon", got "${res.interpretedFilters.category}"`);
        }
        if (!res.interpretedFilters.location || !res.interpretedFilters.location.toLowerCase().includes("delhi")) {
          throw new Error(`Expected location "Delhi", got "${res.interpretedFilters.location}"`);
        }
        if (res.results.length === 0) {
          throw new Error("Expected at least 1 hackathon near Delhi");
        }
        const hasDelhi = res.results.some(r => r.location?.toLowerCase().includes("delhi"));
        if (!hasDelhi) {
          throw new Error("Expected Delhi hackathon in results");
        }
      }
    },
    {
      label: "Query 4: Scholarships I am eligible for",
      query: "Scholarships I am eligible for",
      user: testUser,
      asserts: (res) => {
        if (res.interpretedFilters.category !== "scholarship") {
          throw new Error(`Expected category "scholarship", got "${res.interpretedFilters.category}"`);
        }
        if (!res.interpretedFilters.checkUserEligibility) {
          throw new Error("Expected checkUserEligibility to be true");
        }
        if (res.results.length === 0) {
          throw new Error("Expected eligible scholarships for student");
        }
        for (const opp of res.results) {
          if (opp.category !== "scholarship") {
            throw new Error(`Expected only scholarships, got ${opp.category}`);
          }
        }
      }
    }
  ];

  let passed = 0;
  for (const t of testQueries) {
    console.log(`Testing: ${t.label}`);
    try {
      const result = await searchOpportunitiesByNaturalLanguage(t.query, t.user, { limit: 10 });
      console.log(`  -> Interpreted Filters:`, JSON.stringify(result.interpretedFilters));
      console.log(`  -> Mongo Query:`, JSON.stringify(result.mongoQuery));
      console.log(`  -> Summary: "${result.summary}"`);
      console.log(`  -> Matched Results Count: ${result.totalCount}`);
      result.results.forEach((r, idx) => {
        console.log(`     [${idx + 1}] ${r.title} (${r.organization}) · ${r.work_mode || 'n/a'} · ${r.location || 'n/a'}`);
      });
      t.asserts(result);
      console.log(`  PASSED\n`);
      passed++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}\n`);
    }
  }

  console.log(`=== Test Results: ${passed}/${testQueries.length} Passed ===`);
  if (passed !== testQueries.length) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
