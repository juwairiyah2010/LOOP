import { BaseAIProvider } from "./provider.interface.js";

const PROGRAMMING_LANGUAGES = [
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "swift",
  "kotlin", "sql", "r", "matlab", "scala", "dart", "php", "ruby", "bash", "shell"
];
const FRAMEWORKS = [
  "react", "vue", "angular", "next.js", "nuxt", "svelte", "node.js", "express",
  "django", "flask", "fastapi", "spring", "laravel", "rails", "tailwind", "bootstrap",
  "flutter", "react native", "tensorflow", "pytorch", "keras", "scikit-learn",
  "pandas", "numpy", "langchain", "hugging face", "opencv"
];
const TOOLS = [
  "figma", "sketch", "photoshop", "illustrator", "xd", "canva",
  "docker", "kubernetes", "git", "github", "gitlab", "jenkins", "terraform",
  "aws", "gcp", "azure", "heroku", "vercel", "netlify", "postman", "jira",
  "linux", "bash", "nginx", "redis", "elasticsearch"
];
const TECHNOLOGIES = [
  "mongodb", "postgresql", "mysql", "sqlite", "firebase", "supabase", "dynamodb",
  "graphql", "rest", "grpc", "websocket", "kafka", "rabbitmq",
  "machine learning", "deep learning", "ai", "nlp", "computer vision",
  "data science", "big data", "blockchain", "web3", "iot", "ar", "vr",
  "devops", "cloud computing", "microservices"
];
const DOMAINS = [
  "ai", "web development", "mobile development", "cybersecurity", "data science",
  "finance", "fintech", "design", "ui/ux", "research", "product management",
  "startup", "healthcare", "edtech", "sustainability", "robotics", "gaming"
];
const SKILLS = [
  "agile", "scrum", "testing", "ci/cd", "linux", "marketing", "seo", "copywriting",
  "strategy", "accounting", "sales", "leadership", "public speaking", "communication",
  "teamwork", "problem solving", "critical thinking", "data analysis", "project management",
  "business development", "content creation", "research", "entrepreneurship"
];
const INTERESTS = [
  "stem", "technology", "business", "ai", "sustainability", "leadership",
  "open source", "photography", "writing", "music", "art", "sports",
  "entrepreneurship", "social impact", "education", "healthcare", "finance",
  "gaming", "travel", "environment", "data science", "machine learning", "web development"
];

function extractTextFromPdfBase64(base64Pdf) {
  try {
    const buffer = Buffer.from(base64Pdf, "base64");
    const str = buffer.toString("binary");
    const matches = str.match(/\(([^)]+)\)/g) || [];
    return matches.map(m => m.slice(1, -1)).join(" ");
  } catch {
    return "";
  }
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

/**
 * Local Rule-Based Mock AI Provider
 * High-performance, deterministic intelligence fallback that operates
 * strictly on verified opportunity facts without hallucinating.
 */
export class MockAIProvider extends BaseAIProvider {
  getName() {
    return "local_mock";
  }

  isAvailable() {
    return true;
  }

  async analyzeResume(input = {}) {
    let text = "";
    if (input.text) {
      text = input.text.toLowerCase();
    } else if (input.base64Pdf) {
      text = extractTextFromPdfBase64(input.base64Pdf).toLowerCase();
    }

    const matchedLangs = PROGRAMMING_LANGUAGES.filter(lang => text.includes(lang)).map(l => l.toUpperCase());
    const matchedFrameworks = FRAMEWORKS.filter(fw => text.includes(fw)).map(f => f.charAt(0).toUpperCase() + f.slice(1));
    const matchedTools = TOOLS.filter(tool => text.includes(tool)).map(t => t.charAt(0).toUpperCase() + t.slice(1));
    const matchedTechs = TECHNOLOGIES.filter(tech => text.includes(tech)).map(t => t.toUpperCase());
    const matchedDomains = DOMAINS.filter(domain => text.includes(domain)).map(d => d.charAt(0).toUpperCase() + d.slice(1));
    const matchedSkills = SKILLS.filter(skill => text.includes(skill)).map(s => s.charAt(0).toUpperCase() + s.slice(1));
    const matchedInterests = INTERESTS.filter(interest => text.includes(interest)).map(i => i.charAt(0).toUpperCase() + i.slice(1));

    const allSkills = Array.from(new Set([...matchedSkills, ...matchedLangs, ...matchedFrameworks]));
    const preferredRoles = [];
    if (text.includes("developer") || text.includes("engineer") || text.includes("software")) preferredRoles.push("Software Engineer");
    if (text.includes("designer") || text.includes("ui") || text.includes("ux")) preferredRoles.push("UI/UX Designer");
    if (text.includes("product") || text.includes("project")) preferredRoles.push("Product Manager");
    if (text.includes("data") || text.includes("analytics")) preferredRoles.push("Data Analyst / Scientist");
    if (preferredRoles.length === 0) preferredRoles.push("Software Engineer");

    const primaryField = preferredRoles[0] === "UI/UX Designer" ? "Design" :
                         preferredRoles[0] === "Product Manager" ? "Product" :
                         preferredRoles[0].includes("Data") ? "Data & AI" : "Software Engineering";

    return {
      skills: allSkills.length > 0 ? allSkills : ["JavaScript", "Python", "Git", "Problem Solving"],
      interests: matchedInterests.length > 0 ? matchedInterests : ["STEM", "AI", "Open Source"],
      programmingLanguages: matchedLangs.length > 0 ? matchedLangs : ["JAVASCRIPT", "PYTHON"],
      frameworks: matchedFrameworks,
      tools: matchedTools,
      technologies: matchedTechs,
      domains: matchedDomains,
      preferredRoles,
      strengthsSummary: `Strong foundation in ${allSkills.slice(0, 3).join(", ") || "software fundamentals"} with focus on ${primaryField}. Well-suited for technical problem solving.`,
      recommendedProfileUpdates: {
        field: primaryField,
        skills: allSkills.slice(0, 8),
        interests: matchedInterests.slice(0, 5)
      }
    };
  }

  async analyzeSkillGap(userProfile = {}, opportunity = {}) {
    const userSkills = (userProfile.skills || []).map(normalize);
    const reqs = opportunity.eligibility || {};
    const explicitRequired = (reqs.required_skills || reqs.skills || []).map(normalize);
    const tags = (opportunity.tags || []).map(normalize);

    const targetSkills = explicitRequired.length > 0 
      ? explicitRequired 
      : tags.filter(t => !["internship", "scholarship", "hackathon", "fellowship", "remote", "hybrid"].includes(t));

    const matchedSkills = [];
    const missingSkills = [];

    for (const target of targetSkills) {
      if (userSkills.some(us => us === target || us.includes(target) || target.includes(us))) {
        matchedSkills.push(target);
      } else {
        missingSkills.push(target);
      }
    }

    // Identify user bonus skills that provide competitive advantage
    const competitiveAdvantage = userSkills
      .filter(s => !targetSkills.includes(s))
      .slice(0, 3)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));

    let gapSeverity = "NONE";
    if (missingSkills.length >= 4) gapSeverity = "HIGH";
    else if (missingSkills.length >= 2) gapSeverity = "MODERATE";
    else if (missingSkills.length === 1) gapSeverity = "LOW";

    const totalTarget = Math.max(1, targetSkills.length);
    const readinessScore = Math.min(100, Math.round((matchedSkills.length / totalTarget) * 100));

    // Generate actionable roadmap for missing skills
    const learningRoadmap = missingSkills.map((skill, idx) => {
      const capSkill = skill.charAt(0).toUpperCase() + skill.slice(1);
      if (idx === 0) {
        return {
          step: 1,
          title: `Master ${capSkill} Fundamentals`,
          description: `Review official documentation and core concepts of ${capSkill} to bridge the primary prerequisite.`,
          estimatedTime: "3-5 days"
        };
      } else if (idx === 1) {
        return {
          step: 2,
          title: `Build a Proof-of-Concept using ${capSkill}`,
          description: `Create a small demo repository applying ${capSkill} alongside your existing ${matchedSkills[0] || "core"} skills.`,
          estimatedTime: "1 week"
        };
      } else {
        return {
          step: idx + 1,
          title: `Highlight ${capSkill} in Application Materials`,
          description: `Reference your project or coursework demonstrating understanding of ${capSkill} in your resume.`,
          estimatedTime: "1-2 days"
        };
      }
    });

    return {
      opportunityId: String(opportunity.id || opportunity._id || ""),
      opportunityTitle: opportunity.title || "Untitled Opportunity",
      organization: opportunity.organization || "Unspecified Organization",
      matchedSkills: matchedSkills.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
      missingSkills: missingSkills.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
      gapSeverity,
      readinessScore,
      competitiveAdvantage,
      learningRoadmap,
      summary: missingSkills.length === 0
        ? `You meet all ${targetSkills.length} identified skill prerequisites for ${opportunity.organization}. High readiness to apply!`
        : `You have ${matchedSkills.length} of ${targetSkills.length} skills. You can close the gap in ${missingSkills.join(", ")} with targeted preparation.`
    };
  }

  async summarizeOpportunity(opportunity = {}) {
    const title = opportunity.title || "Opportunity";
    const org = opportunity.organization || "Organization";
    const category = (opportunity.category || "program").toUpperCase();
    const mode = opportunity.work_mode || "unspecified";
    const location = opportunity.location || "unspecified location";
    const desc = opportunity.description || "";
    const deadline = opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Rolling / Unspecified";

    const highlights = [];
    if (opportunity.prize_amount) {
      highlights.push(`Rewards: ${opportunity.prize_amount}`);
    }
    highlights.push(`Mode: ${mode.toUpperCase()} · ${location}`);
    if (opportunity.tags && opportunity.tags.length > 0) {
      highlights.push(`Key Focus: ${opportunity.tags.slice(0, 4).join(", ")}`);
    }
    if (opportunity.participants) {
      highlights.push(`Community size: ~${opportunity.participants} participants`);
    }

    return {
      opportunityId: String(opportunity.id || opportunity._id || ""),
      quickTake: `${org} is offering a ${category.toLowerCase()} focused on ${opportunity.tags?.[0] || "industry skills"} with ${mode} participation.`,
      whoItsFor: `Students and early-career developers interested in ${opportunity.tags?.slice(0, 2).join(" & ") || category}.`,
      keyCommitment: `${mode.toUpperCase()} format based in ${location}.`,
      highlights,
      deadlineNote: opportunity.deadline ? `Application deadline: ${deadline}` : "Rolling admissions — no fixed deadline stored.",
      verifiedFacts: {
        organization: org,
        deadline: opportunity.deadline || null,
        workMode: mode,
        prizeOrStipend: opportunity.prize_amount || null,
        applyUrl: opportunity.apply_url || null
      }
    };
  }

  async explainMatch(userProfile = {}, opportunity = {}, deterministicMatch = {}) {
    const score = deterministicMatch.finalMatchScore ?? deterministicMatch.matchScore ?? 75;
    const matchedSkills = deterministicMatch.matchedSkills || [];
    const matchedInterests = deterministicMatch.matchedInterests || [];
    const missingSkills = deterministicMatch.missingSkills || [];
    const isEligible = deterministicMatch.isEligible !== false;

    const topAlignments = [];
    if (matchedSkills.length > 0) {
      topAlignments.push(`Direct skill match on ${matchedSkills.join(", ")}`);
    }
    if (matchedInterests.length > 0) {
      topAlignments.push(`Shares interest in ${matchedInterests.join(", ")}`);
    }
    if (opportunity.work_mode === "remote") {
      topAlignments.push("Flexible remote work mode removes geographic barriers");
    }

    const potentialHesitations = [];
    if (!isEligible) {
      potentialHesitations.push("Hard eligibility constraint unfulfilled");
    }
    if (missingSkills.length > 0) {
      potentialHesitations.push(`Missing prerequisites: ${missingSkills.join(", ")}`);
    }
    if (deterministicMatch.scoreBreakdown?.urgency?.score >= 90) {
      potentialHesitations.push("Deadline is approaching quickly — requires swift action");
    }

    const narrative = !isEligible
      ? `Although there may be skill overlap, this opportunity is marked ineligible because one or more mandatory eligibility constraints are not met.`
      : score >= 80
      ? `Strong ${score}% deterministic alignment. Your profile background in ${userProfile.field || "your domain"} and skills in ${matchedSkills.join(", ") || "relevant areas"} directly match ${opportunity.organization}'s requirements.`
      : `Moderate ${score}% alignment. You have foundational skills, though bridging ${missingSkills.slice(0, 2).join(", ") || "additional requirements"} will increase your competitiveness.`;

    return {
      opportunityId: String(opportunity.id || opportunity._id || ""),
      matchPercentage: score,
      headline: score >= 85 ? "High-Confidence Match" : score >= 65 ? "Solid Potential Match" : "Growth Opportunity",
      narrativeExplanation: narrative,
      topAlignments: topAlignments.length > 0 ? topAlignments : ["Compatible profile background"],
      potentialHesitations: potentialHesitations.length > 0 ? potentialHesitations : ["No critical hesitations detected"],
      recommendedAction: score >= 80 ? "Recommended to prioritize and apply early." : "Review required skills and consider preparing application materials."
    };
  }

  async explainEligibility(userProfile = {}, opportunity = {}, deterministicEligibility = {}) {
    const status = deterministicEligibility.status || deterministicEligibility.eligible || "PASS";
    const blockers = deterministicEligibility.blockers || [];
    const warnings = deterministicEligibility.warnings || [];
    const reasons = deterministicEligibility.reasons || [];

    let plainEnglish = "";
    const nextSteps = [];

    if (status === "PASS") {
      plainEnglish = `You meet all verified eligibility prerequisites specified for ${opportunity.organization}. All hard constraints (deadline, academic standing, and location) are satisfied.`;
      nextSteps.push("Proceed with your application with confidence.");
      nextSteps.push("Double check that your resume is up to date before submitting.");
    } else if (status === "FAIL") {
      plainEnglish = `You do not currently satisfy one or more mandatory requirements: ${blockers.join("; ")}. LOOP will not artificially inflate your match score.`;
      nextSteps.push("Review whether profile information (e.g. graduation year or major) is correctly recorded.");
      nextSteps.push("Look for similar opportunities without this constraint.");
    } else {
      plainEnglish = `Eligibility is conditional: ${warnings.join("; ")}. Please verify these details on the opportunity's official page.`;
      nextSteps.push("Update missing fields in your LOOP profile.");
      nextSteps.push("Check the official guidelines to confirm personal eligibility.");
    }

    return {
      opportunityId: String(opportunity.id || opportunity._id || ""),
      status,
      headline: status === "PASS" ? "Eligible to Apply" : status === "FAIL" ? "Ineligible Based on Stored Constraints" : "Conditional Verification Needed",
      plainEnglishExplanation: plainEnglish,
      passedCriteria: reasons.filter(r => !r.includes("⛔")),
      blockedCriteria: blockers,
      nextSteps
    };
  }

  async compareOpportunities(opportunities = [], userProfile = {}) {
    if (!Array.isArray(opportunities) || opportunities.length === 0) {
      throw new Error("Must provide at least 2 opportunities to compare");
    }

    const focusArea = {};
    const timelineAndDeadline = {};
    const skillRequirements = {};
    const rewardOrStipend = {};
    const workMode = {};

    for (const opp of opportunities) {
      const key = `${opp.organization} (${opp.title})`;
      focusArea[key] = opp.category || "General";
      timelineAndDeadline[key] = opp.deadline 
        ? new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "Rolling";
      skillRequirements[key] = (opp.eligibility?.required_skills || opp.tags || []).slice(0, 4);
      rewardOrStipend[key] = opp.prize_amount || "None listed";
      workMode[key] = (opp.work_mode || "unspecified").toUpperCase();
    }

    const tradeoffs = [
      {
        aspect: "Time Commitment & Urgency",
        notes: `Compare the deadlines: ${opportunities.map(o => `${o.organization}: ${o.deadline ? new Date(o.deadline).toLocaleDateString() : 'Rolling'}`).join(" vs ")}.`
      },
      {
        aspect: "Work Mode & Flexibility",
        notes: `Work modes differ: ${opportunities.map(o => `${o.organization}: ${o.work_mode || 'unspecified'}`).join(" vs ")}.`
      },
      {
        aspect: "Compensation / Rewards",
        notes: `Rewards: ${opportunities.map(o => `${o.organization}: ${o.prize_amount || 'Experience/Mentorship'}`).join(" vs ")}.`
      }
    ];

    const bestFitFor = {};
    opportunities.forEach((o, i) => {
      bestFitFor[o.title] = i === 0 
        ? "Best for candidates seeking deep hands-on project exposure and mentorship." 
        : "Best for candidates wanting flexible execution or competitive incentives.";
    });

    return {
      comparedCount: opportunities.length,
      opportunities: opportunities.map(o => ({
        id: o.id || o._id,
        title: o.title,
        organization: o.organization,
        category: o.category,
        work_mode: o.work_mode || "unspecified",
        deadline: o.deadline || null,
        prize_amount: o.prize_amount || null
      })),
      comparisonMatrix: {
        focusArea,
        timelineAndDeadline,
        skillRequirements,
        rewardOrStipend,
        workMode
      },
      verdict: `Each opportunity serves a distinct objective. Focus on ${opportunities[0].organization} for direct domain relevance, or consider ${opportunities[1]?.organization || "alternatives"} for timeline fit.`,
      tradeoffs,
      bestFitFor
    };
  }

  async parseNaturalLanguageSearch(query = "") {
    const q = (query || "").toLowerCase();

    // 1. Categories
    const categories = [];
    const catKeywords = [
      { key: "internship", match: ["internship", "internships", "intern", "interns"] },
      { key: "scholarship", match: ["scholarship", "scholarships", "grant", "grants"] },
      { key: "hackathon", match: ["hackathon", "hackathons", "buildathon", "hack"] },
      { key: "fellowship", match: ["fellowship", "fellowships"] },
      { key: "competition", match: ["competition", "competitions", "contest", "contests", "challenge", "challenges"] }
    ];

    for (const c of catKeywords) {
      if (c.match.some(m => new RegExp(`\\b${m}\\b`, "i").test(q))) {
        categories.push(c.key);
      }
    }
    const category = categories.length === 1 ? categories[0] : undefined;

    // 2. Work modes
    const workModes = [];
    if (/\b(remote|virtual|online|wfh)\b/i.test(q)) workModes.push("remote");
    if (/\b(hybrid)\b/i.test(q)) workModes.push("hybrid");
    if (/\b(onsite|in-person|in person|offline|office)\b/i.test(q)) workModes.push("onsite");
    const work_mode = workModes.length === 1 ? workModes[0] : undefined;

    // 3. Location extraction
    let location = undefined;
    const commonLocations = [
      "delhi", "new delhi", "bengaluru", "bangalore", "mumbai", "hyderabad", "pune", "chennai",
      "noida", "gurgaon", "gurugram", "kolkata", "san francisco", "new york", "london", "boston",
      "austin", "chicago", "seattle", "tokyo", "toronto"
    ];
    for (const loc of commonLocations) {
      if (new RegExp(`\\b${loc}\\b`, "i").test(q)) {
        location = loc.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        break;
      }
    }
    if (!location) {
      const nearMatch = q.match(/\b(?:near|in|at|around)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      if (nearMatch && nearMatch[1]) {
        const candidate = nearMatch[1].trim();
        const stopWords = ["for", "this", "my", "the", "a", "an", "closing", "urgent"];
        if (!stopWords.includes(candidate.toLowerCase())) {
          location = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }
      }
    }

    // 4. Skills extraction
    const matchedSkills = [];
    if (/\b(ai|artificial intelligence)\b/i.test(q)) matchedSkills.push("AI");
    if (/\b(ml|machine learning)\b/i.test(q)) matchedSkills.push("Machine Learning");
    if (/\b(java)\b/i.test(q) && !/\b(javascript)\b/i.test(q)) matchedSkills.push("Java");
    if (/\b(javascript|js)\b/i.test(q)) matchedSkills.push("JavaScript");
    if (/\b(typescript|ts)\b/i.test(q)) matchedSkills.push("TypeScript");
    if (/\b(python)\b/i.test(q)) matchedSkills.push("Python");
    if (/\b(react)\b/i.test(q)) matchedSkills.push("React");
    if (/\b(node(?:\.js)?)\b/i.test(q)) matchedSkills.push("Node.js");
    if (/\b(c\+\+)\b/i.test(q)) matchedSkills.push("C++");
    if (/\b(sql|postgres|mongodb)\b/i.test(q)) matchedSkills.push("SQL");
    if (/\b(spring|spring boot)\b/i.test(q)) matchedSkills.push("Spring Boot");
    if (/\b(web3|blockchain)\b/i.test(q)) matchedSkills.push("Web3");

    const allKnownSkills = [...PROGRAMMING_LANGUAGES, ...FRAMEWORKS, ...TOOLS, ...TECHNOLOGIES, ...DOMAINS];
    for (const s of allKnownSkills) {
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(q)) {
        const cap = s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        if (!matchedSkills.some(existing => existing.toLowerCase() === s.toLowerCase())) {
          matchedSkills.push(cap);
        }
      }
    }

    // 5. Closing window / Deadlines
    let maxDaysLeft = undefined;
    if (/\b(closing this week|this week|7 days|within a week|ending this week)\b/i.test(q)) {
      maxDaysLeft = 7;
    } else if (/\b(closing this month|this month|30 days)\b/i.test(q)) {
      maxDaysLeft = 30;
    } else if (/\b(closing soon|urgent|urgently|soon|ending soon)\b/i.test(q)) {
      maxDaysLeft = 14;
    }

    // 6. Education / Academic profile
    let education = undefined;
    let yearOfStudy = undefined;
    let major = undefined;

    if (/\b(1st year|first year|freshman)\b/i.test(q)) yearOfStudy = 1;
    if (/\b(2nd year|second year|sophomore)\b/i.test(q)) yearOfStudy = 2;
    if (/\b(3rd year|third year|junior)\b/i.test(q)) yearOfStudy = 3;
    if (/\b(4th year|fourth year|senior|final year)\b/i.test(q)) yearOfStudy = 4;

    if (/\b(cse|computer science|cs)\b/i.test(q)) major = "CSE";
    else if (/\b(ece|electronics)\b/i.test(q)) major = "ECE";
    else if (/\b(it|information technology)\b/i.test(q)) major = "IT";
    else if (/\b(mechanical)\b/i.test(q)) major = "Mechanical";
    else if (/\b(civil)\b/i.test(q)) major = "Civil";
    else if (/\b(electrical)\b/i.test(q)) major = "Electrical";
    else if (/\b(data science)\b/i.test(q)) major = "Data Science";

    if (yearOfStudy || major) {
      education = {
        ...(yearOfStudy ? { yearOfStudy } : {}),
        ...(major ? { major } : {})
      };
    }

    // 7. Check User Eligibility
    const checkUserEligibility = /\b(eligible for|i am eligible|eligible|my eligibility|qualify for)\b/i.test(q);

    // 8. Prize or Stipend
    const hasPrize = /\b(prize|prizes|cash|money|stipend|paid|\$|inr|₹|bounty)\b/i.test(q);

    const interpretedFilters = {
      ...(category ? { category } : {}),
      ...(categories.length > 0 ? { categories } : {}),
      ...(work_mode ? { work_mode } : {}),
      ...(workModes.length > 0 ? { workModes } : {}),
      ...(location ? { location } : {}),
      ...(matchedSkills.length > 0 ? { skills: matchedSkills } : {}),
      ...(maxDaysLeft !== undefined ? { maxDaysLeft } : {}),
      ...(education ? { education } : {}),
      ...(checkUserEligibility ? { checkUserEligibility: true } : {}),
      ...(hasPrize ? { hasPrize: true } : {})
    };

    const summaryParts = [];
    if (checkUserEligibility) summaryParts.push("Verified eligible");
    if (work_mode) summaryParts.push(work_mode);
    if (matchedSkills.length > 0) summaryParts.push(matchedSkills.join("/") + " skills");
    if (categories.length > 0) summaryParts.push(categories.join(" or ") + "s");
    else summaryParts.push("opportunities");
    if (location) summaryParts.push(`near ${location}`);
    if (education) {
      const eduStr = [
        education.yearOfStudy ? `${education.yearOfStudy}${education.yearOfStudy === 1 ? 'st' : education.yearOfStudy === 2 ? 'nd' : education.yearOfStudy === 3 ? 'rd' : 'th'} year` : "",
        education.major || ""
      ].filter(Boolean).join(" ");
      summaryParts.push(`for ${eduStr} students`);
    }
    if (maxDaysLeft) {
      summaryParts.push(maxDaysLeft <= 7 ? "closing this week" : `closing in ${maxDaysLeft} days`);
    }
    if (hasPrize) summaryParts.push("with prizes/stipends");

    const summary = `Searching for ${summaryParts.join(" ")}`;

    return {
      query,
      interpretedFilters,
      interpretedIntent: interpretedFilters,
      summary,
      _provider: this.getName()
    };
  }

  async generatePersonalizedDigest(userProfile = {}, topOpportunities = [], options = {}) {
    const name = userProfile.name || "Student";
    const curated = (topOpportunities || []).slice(0, 4).map(opp => {
      return {
        opportunityId: String(opp.id || opp._id || ""),
        title: opp.title,
        organization: opp.organization,
        category: opp.category,
        deadline: opp.deadline || null,
        whySelected: `Selected for your interest in ${opp.category} and background in ${(userProfile.skills || []).slice(0, 2).join(", ") || "technology"}.`,
        recommendedAction: opp.deadline ? "Review requirements and note the upcoming deadline." : "Explore the program details when convenient."
      };
    });

    // Pick earliest deadline among curated
    const withDeadlines = topOpportunities
      .filter(o => o.deadline && new Date(o.deadline) > new Date())
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const nearest = withDeadlines[0];
    const actionItem = nearest
      ? `${nearest.title} (${nearest.organization}) deadline is approaching. Ensure your application draft is ready.`
      : "Complete your profile skills to unlock more high-precision matches.";

    return {
      greeting: `Hello ${name}, here is your curated LOOP intelligence digest.`,
      digestDate: new Date().toISOString().split("T")[0],
      curatedOpportunities: curated,
      actionItemOfTheWeek: actionItem,
      skillToFocusOn: userProfile.skills?.[0] ? `${userProfile.skills[0]} advanced applications` : "Modern Web Frameworks",
      motivationalNote: "Consistent preparation beats last-minute stress. Take one step today."
    };
  }
}
