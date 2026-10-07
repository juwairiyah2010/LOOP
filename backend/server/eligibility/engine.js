export class DeterministicEligibilityEngine {
  static evaluate(userProfile = {}, opportunity = {}) {
    const reasons = [];
    const blockers = [];
    const warnings = [];
    const checks = {};

    let totalChecks = 0;
    let knownChecks = 0;

    // Support flexible profile structure
    const p = userProfile.profile || userProfile || {};
    const reqs = opportunity.eligibility || {};

    const toLowerArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((item) => String(item).toLowerCase().trim());
      if (typeof val === "string") return val.split(",").map((item) => item.toLowerCase().trim());
      return [];
    };

    // 1. DEADLINE CHECK
    totalChecks++;
    const deadlineVal = opportunity.deadline || reqs.deadline;
    if (deadlineVal) {
      const d = new Date(deadlineVal);
      if (!isNaN(d.getTime())) {
        knownChecks++;
        if (d < new Date()) {
          checks.deadline = "FAIL";
          blockers.push("Opportunity deadline has passed");
        } else {
          checks.deadline = "PASS";
          reasons.push("Deadline is open and active");
        }
      } else {
        checks.deadline = "UNKNOWN";
        warnings.push("Deadline format is unparseable");
      }
    } else {
      checks.deadline = "PASS";
      reasons.push("No deadline restriction specified");
      knownChecks++;
    }

    // 2. DEGREE / BRANCH CHECK
    totalChecks++;
    const userDegree = (p.degree || p.education || "").toLowerCase().trim();
    const userBranch = (p.branch || p.field || p.major || "").toLowerCase().trim();
    const allowedDegrees = toLowerArray(reqs.degrees || reqs.degree || reqs.allowed_degrees);
    const allowedBranches = toLowerArray(reqs.branches || reqs.branch || reqs.allowed_fields || reqs.field);

    if (allowedDegrees.length > 0 || allowedBranches.length > 0) {
      let degreeMatched = allowedDegrees.length === 0;
      let branchMatched = allowedBranches.length === 0;

      if (!userDegree && !userBranch) {
        checks.degree_branch = "UNKNOWN";
        warnings.push("Degree or branch not specified in user profile");
      } else {
        knownChecks++;
        if (allowedDegrees.length > 0 && userDegree) {
          degreeMatched = allowedDegrees.some((d) => userDegree.includes(d) || d.includes(userDegree));
        }
        if (allowedBranches.length > 0 && userBranch) {
          branchMatched = allowedBranches.some((b) => userBranch.includes(b) || b.includes(userBranch));
        }

        if (degreeMatched && branchMatched) {
          checks.degree_branch = "PASS";
          reasons.push("User degree and branch match requirement");
        } else {
          checks.degree_branch = "FAIL";
          if (!degreeMatched) blockers.push(`User degree '${p.degree}' does not match required: ${allowedDegrees.join(", ")}`);
          if (!branchMatched) blockers.push(`User branch '${p.branch || p.field}' does not match required: ${allowedBranches.join(", ")}`);
        }
      }
    } else {
      checks.degree_branch = "PASS";
      reasons.push("Open to all degrees and branches");
      knownChecks++;
    }

    // 3. YEAR / GRADUATION CHECK
    totalChecks++;
    const userGradYear = parseInt(p.graduation_year || p.batch_year || p.graduationYear, 10);
    const userCurrentYear = parseInt(p.current_year || p.year, 10);
    const allowedGradYears = toLowerArray(reqs.graduation_years || reqs.graduation_year || reqs.batch).map(Number).filter((n) => !isNaN(n));
    const minGradYear = parseInt(reqs.min_graduation_year, 10);
    const maxGradYear = parseInt(reqs.max_graduation_year, 10);
    const allowedYears = toLowerArray(reqs.eligible_years || reqs.years).map(Number).filter((n) => !isNaN(n));

    if (allowedGradYears.length > 0 || !isNaN(minGradYear) || !isNaN(maxGradYear) || allowedYears.length > 0) {
      if (isNaN(userGradYear) && isNaN(userCurrentYear)) {
        checks.year_graduation = "UNKNOWN";
        warnings.push("Graduation year / current year missing from profile");
      } else {
        knownChecks++;
        let yearValid = true;

        if (allowedGradYears.length > 0 && !isNaN(userGradYear)) {
          if (!allowedGradYears.includes(userGradYear)) yearValid = false;
        }
        if (!isNaN(minGradYear) && !isNaN(userGradYear) && userGradYear < minGradYear) yearValid = false;
        if (!isNaN(maxGradYear) && !isNaN(userGradYear) && userGradYear > maxGradYear) yearValid = false;
        if (allowedYears.length > 0 && !isNaN(userCurrentYear)) {
          if (!allowedYears.includes(userCurrentYear)) yearValid = false;
        }

        if (yearValid) {
          checks.year_graduation = "PASS";
          reasons.push("Graduation year / academic year meets eligibility");
        } else {
          checks.year_graduation = "FAIL";
          blockers.push(`User graduation/academic year (${userGradYear || userCurrentYear}) is not eligible`);
        }
      }
    } else {
      checks.year_graduation = "PASS";
      reasons.push("No graduation year restriction specified");
      knownChecks++;
    }

    // 4. CGPA / GPA CHECK
    totalChecks++;
    const userCgpa = parseFloat(p.cgpa || p.gpa);
    const minCgpa = parseFloat(reqs.min_cgpa || reqs.cgpa || reqs.gpa);

    if (!isNaN(minCgpa)) {
      if (isNaN(userCgpa)) {
        checks.cgpa = "UNKNOWN";
        warnings.push(`Minimum CGPA requirement is ${minCgpa}, but user CGPA is not provided in profile`);
      } else {
        knownChecks++;
        if (userCgpa >= minCgpa) {
          checks.cgpa = "PASS";
          reasons.push(`User CGPA (${userCgpa}) meets minimum requirement (${minCgpa})`);
        } else {
          checks.cgpa = "FAIL";
          blockers.push(`User CGPA (${userCgpa}) is below minimum requirement (${minCgpa})`);
        }
      }
    } else {
      checks.cgpa = "PASS";
      reasons.push("No minimum CGPA requirement specified");
      knownChecks++;
    }

    // 5. AGE / CATEGORY / GENDER CHECK (When relevant)
    totalChecks++;
    const reqMinAge = parseInt(reqs.min_age, 10);
    const reqMaxAge = parseInt(reqs.max_age, 10);
    const reqGender = (reqs.gender || "").toLowerCase().trim();
    const reqCategory = (reqs.category || "").toLowerCase().trim();

    const userAge = parseInt(p.age, 10);
    const userGender = (p.gender || "").toLowerCase().trim();
    const userCategory = (p.category || "").toLowerCase().trim();

    const hasDemographicReqs = !isNaN(reqMinAge) || !isNaN(reqMaxAge) || (reqGender && reqGender !== "any") || reqCategory;

    if (hasDemographicReqs) {
      let demoFail = false;
      let demoUnknown = false;

      if (!isNaN(reqMinAge) || !isNaN(reqMaxAge)) {
        if (isNaN(userAge)) demoUnknown = true;
        else if (!isNaN(reqMinAge) && userAge < reqMinAge) demoFail = true;
        else if (!isNaN(reqMaxAge) && userAge > reqMaxAge) demoFail = true;
      }

      if (reqGender && reqGender !== "any") {
        if (!userGender) demoUnknown = true;
        else if (userGender !== reqGender) demoFail = true;
      }

      if (reqCategory) {
        if (!userCategory) demoUnknown = true;
        else if (!userCategory.includes(reqCategory)) demoFail = true;
      }

      if (demoFail) {
        checks.age_category_gender = "FAIL";
        blockers.push("Demographic criteria (age/gender/category) not met");
      } else if (demoUnknown) {
        checks.age_category_gender = "UNKNOWN";
        warnings.push("Demographic information incomplete in profile");
      } else {
        checks.age_category_gender = "PASS";
        reasons.push("Demographic requirements satisfied");
        knownChecks++;
      }
    } else {
      checks.age_category_gender = "PASS";
      reasons.push("No age/category/gender restrictions");
      knownChecks++;
    }

    // 6. CITIZENSHIP / LOCATION CHECK
    totalChecks++;
    const userCitizenship = (p.citizenship || p.nationality || "").toLowerCase().trim();
    const userCountry = (p.country || p.location || "").toLowerCase().trim();
    const userLocs = toLowerArray(p.preferred_locations);

    const allowedCitizenships = toLowerArray(reqs.citizenship || reqs.allowed_citizenships || reqs.nationalities);
    const workMode = (opportunity.work_mode || reqs.work_mode || "").toLowerCase();
    const oppLocation = (opportunity.location || reqs.location || "").toLowerCase();

    if (allowedCitizenships.length > 0) {
      if (!userCitizenship) {
        checks.citizenship_location = "UNKNOWN";
        warnings.push("Citizenship/nationality missing from profile");
      } else {
        knownChecks++;
        const citMatch = allowedCitizenships.some((c) => userCitizenship.includes(c) || c.includes(userCitizenship));
        if (!citMatch) {
          checks.citizenship_location = "FAIL";
          blockers.push(`User citizenship '${p.citizenship}' not eligible for required: ${allowedCitizenships.join(", ")}`);
        } else {
          checks.citizenship_location = "PASS";
          reasons.push(`Citizenship '${p.citizenship}' is eligible`);
        }
      }
    } else if (workMode === "remote" || oppLocation.includes("remote") || oppLocation.includes("worldwide")) {
      checks.citizenship_location = "PASS";
      reasons.push("Remote opportunity — open location");
      knownChecks++;
    } else if (oppLocation && (userCountry || userLocs.length > 0)) {
      knownChecks++;
      const allUserLocs = [userCountry, ...userLocs].filter(Boolean);
      const locMatch = allUserLocs.some((ul) => oppLocation.includes(ul) || ul.includes(oppLocation));
      if (locMatch) {
        checks.citizenship_location = "PASS";
        reasons.push(`Location '${opportunity.location}' aligns with user location`);
      } else {
        checks.citizenship_location = "PASS";
        warnings.push(`Opportunity location '${opportunity.location}' may require relocation`);
      }
    } else {
      checks.citizenship_location = "PASS";
      reasons.push("Location requirements satisfied");
      knownChecks++;
    }

    // 7. SKILLS CHECK
    totalChecks++;
    const userSkills = toLowerArray(p.skills);
    const requiredSkills = toLowerArray(reqs.required_skills || reqs.skills || opportunity.tags);

    if (requiredSkills.length > 0) {
      if (userSkills.length === 0) {
        checks.skills = "UNKNOWN";
        warnings.push("User has not listed skills in profile");
      } else {
        knownChecks++;
        const matchingSkills = requiredSkills.filter((s) => userSkills.includes(s));
        if (matchingSkills.length > 0) {
          checks.skills = "PASS";
          reasons.push(`Matching skills found: ${matchingSkills.join(", ")}`);
        } else {
          checks.skills = "PASS";
          warnings.push(`Recommended skills to learn: ${requiredSkills.slice(0, 3).join(", ")}`);
        }
      }
    } else {
      checks.skills = "PASS";
      reasons.push("No specific prerequisite skills required");
      knownChecks++;
    }

    // 8. EXPERIENCE CHECK
    totalChecks++;
    const userExpYears = parseFloat(p.experience_years || p.experienceYears || p.experience || 0);
    const minExpYears = parseFloat(reqs.min_experience || reqs.min_experience_years || reqs.experience);

    if (!isNaN(minExpYears) && minExpYears > 0) {
      if (p.experience_years === undefined && p.experienceYears === undefined && p.experience === undefined) {
        checks.experience = "UNKNOWN";
        warnings.push(`Minimum ${minExpYears} year(s) experience required, experience not listed in profile`);
      } else {
        knownChecks++;
        if (userExpYears >= minExpYears) {
          checks.experience = "PASS";
          reasons.push(`Experience (${userExpYears} yrs) meets minimum requirement (${minExpYears} yrs)`);
        } else {
          checks.experience = "FAIL";
          blockers.push(`User experience (${userExpYears} yrs) is below required ${minExpYears} yrs`);
        }
      }
    } else {
      checks.experience = "PASS";
      reasons.push("No minimum experience requirement");
      knownChecks++;
    }

    // 9. WORK AUTHORIZATION CHECK
    totalChecks++;
    const reqWorkAuth = (reqs.work_authorization || reqs.visa_sponsorship || "").toLowerCase().trim();
    const userWorkAuth = (p.work_authorization || p.workAuth || "").toLowerCase().trim();

    if (reqWorkAuth && reqWorkAuth !== "not_required" && reqWorkAuth !== "any") {
      if (!userWorkAuth) {
        checks.work_authorization = "UNKNOWN";
        warnings.push("Work authorization status not specified in profile");
      } else {
        knownChecks++;
        if (userWorkAuth.includes(reqWorkAuth) || reqWorkAuth.includes(userWorkAuth) || userWorkAuth === "authorized" || userWorkAuth === "citizen") {
          checks.work_authorization = "PASS";
          reasons.push("Work authorization criteria met");
        } else {
          checks.work_authorization = "FAIL";
          blockers.push(`Work authorization '${p.work_authorization}' does not satisfy requirement: '${reqs.work_authorization}'`);
        }
      }
    } else {
      checks.work_authorization = "PASS";
      reasons.push("No strict work authorization requirement");
      knownChecks++;
    }

    // OVERALL STATUS DETERMINATION: PASS / FAIL / UNKNOWN
    const checkValues = Object.values(checks);
    let eligible = "PASS";

    if (blockers.length > 0 || checkValues.includes("FAIL")) {
      eligible = "FAIL";
    } else if (checkValues.includes("UNKNOWN") && knownChecks < 3) {
      eligible = "UNKNOWN";
    } else {
      eligible = "PASS";
    }

    const confidence = totalChecks > 0 ? parseFloat((knownChecks / totalChecks).toFixed(2)) : 1.0;

    return {
      eligible,
      confidence,
      reasons,
      blockers,
      warnings,
      checks
    };
  }
}
