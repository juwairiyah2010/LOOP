// Common utilities for LOOP website

// Fetch current user auth state
async function getAuthUser() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Auth check failed:", err);
    return null;
  }
}

// Redirect if not logged in
async function requireAuth() {
  const user = await getAuthUser();
  if (!user) {
    window.location.href = "/signup";
    return null;
  }
  return user;
}

// Application lifecycle stages in order
// DISCOVERED → SAVED → INTERESTED → PREPARING → APPLIED → SHORTLISTED → INTERVIEW → ACCEPTED | REJECTED
const LIFECYCLE_STAGES = [
  "DISCOVERED", "SAVED", "INTERESTED", "PREPARING",
  "APPLIED", "SHORTLISTED", "INTERVIEW", "ACCEPTED", "REJECTED"
];

const LIFECYCLE_META = {
  DISCOVERED:  { icon: "search",        color: "text-foreground/50",                badge: "bg-foreground/8 text-foreground/60 border-foreground/15",  label: "Discovered"  },
  SAVED:       { icon: "bookmark",      color: "text-sky-600 dark:text-sky-400",    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",    label: "Saved"       },
  INTERESTED:  { icon: "heart",         color: "text-violet-600",                   badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30", label: "Interested"  },
  PREPARING:   { icon: "file-text",     color: "text-amber-600",                    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",  label: "Preparing"   },
  APPLIED:     { icon: "send",          color: "text-blue-600",                     badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",    label: "Applied"     },
  SHORTLISTED: { icon: "list-checks",   color: "text-indigo-600",                   badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30", label: "Shortlisted" },
  INTERVIEW:   { icon: "mic",           color: "text-orange-600",                   badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30", label: "Interview"   },
  ACCEPTED:    { icon: "circle-check",  color: "text-emerald-600",                  badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", label: "Accepted"    },
  REJECTED:    { icon: "circle-x",      color: "text-red-500",                      badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",      label: "Rejected"    },
};

// Get the lifecycle entry for an opportunity from the lifecycle map
// Returns null if not tracked yet
function getLifecycleEntry(lifecycleMap, oppId) {
  if (!lifecycleMap || !oppId) return null;
  return lifecycleMap[String(oppId)] || null;
}

// Render a compact lifecycle stage badge for use in cards
function renderLifecycleBadge(entry) {
  if (!entry || !entry.stage) return "";
  const meta = LIFECYCLE_META[entry.stage] || LIFECYCLE_META.DISCOVERED;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase border ${meta.badge}">
    <i data-lucide="${meta.icon}" class="size-2.5"></i>${meta.label}
  </span>`;
}


// Source of truth: stored deadlineStr only. Never invents or estimates deadlines.
function getDeadlineInfo(deadlineStr) {
  if (!deadlineStr) {
    return {
      urgencyLevel: "ROLLING",
      deadlineConfidence: "LOW",
      daysLeft: null,
      timeRemaining: "Rolling",
      summary: "Rolling deadline — no fixed cut-off date stored",
      recommendedAction: "Apply when ready; check the listing for submission windows",
      badgeClass: "bg-muted/60 text-muted-foreground border-foreground/10"
    };
  }
  const diffMs = new Date(deadlineStr).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const COLORS = {
    CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
    URGENT:   "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
    PRIORITY: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    PREPARE:  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
    PLAN:     "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
    CLOSED:   "bg-foreground/10 text-muted-foreground border-foreground/10"
  };
  let urgencyLevel, summary, recommendedAction, timeRemaining;
  if (diffDays < 0) {
    urgencyLevel = "CLOSED";
    timeRemaining = `Closed ${Math.abs(diffDays)}d ago`;
    summary = `Deadline passed ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
    recommendedAction = "Check if applications are still accepted or look for re-openings";
  } else if (diffDays === 0) {
    urgencyLevel = "CRITICAL"; timeRemaining = "Today";
    summary = "Closes today — submit immediately";
    recommendedAction = "Submit your application right now";
  } else if (diffDays <= 3) {
    urgencyLevel = "CRITICAL"; timeRemaining = `${diffDays}d left`;
    summary = `Closes in ${diffDays} day${diffDays === 1 ? "" : "s"} — act now`;
    recommendedAction = "Complete and submit your application today";
  } else if (diffDays <= 7) {
    urgencyLevel = "URGENT"; timeRemaining = `${diffDays}d left`;
    summary = `Closes in ${diffDays} days — finalize application`;
    recommendedAction = "Finalize materials and submit before the deadline";
  } else if (diffDays <= 14) {
    urgencyLevel = "PRIORITY"; timeRemaining = `${diffDays}d left`;
    summary = `${diffDays} days remaining — begin application`;
    recommendedAction = "Start your application now to allow revision time";
  } else if (diffDays <= 30) {
    urgencyLevel = "PREPARE"; timeRemaining = `${diffDays}d left`;
    summary = `${diffDays} days remaining — gather materials`;
    recommendedAction = "Collect documents, references, and draft your materials";
  } else if (diffDays <= 90) {
    urgencyLevel = "PLAN"; timeRemaining = `${diffDays}d left`;
    summary = `${diffDays} days remaining — plan ahead`;
    recommendedAction = "Add to calendar and plan your preparation timeline";
  } else {
    urgencyLevel = "PLAN"; timeRemaining = `${diffDays}d left`;
    summary = `${diffDays} days remaining — distant deadline`;
    recommendedAction = "Monitor for updates and begin long-term preparation";
  }
  return {
    urgencyLevel,
    deadlineConfidence: "HIGH",
    daysLeft: diffDays,
    timeRemaining,
    summary,
    recommendedAction,
    badgeClass: COLORS[urgencyLevel] || COLORS.PLAN
  };
}

// Backward-compatible deadline formatter (used by marquee ticker, calendar, etc.)
function formatDeadline(deadlineStr) {
  if (!deadlineStr) return "Rolling";
  const info = getDeadlineInfo(deadlineStr);
  return info.timeRemaining;
}


// Compute matching score based on user profile and opportunity tags
function getMatchScore(profile, tags) {
  if (!tags || tags.length === 0) return 0;
  const profileTokens = new Set([
    ...(profile.skills || []),
    ...(profile.interests || []),
    profile.field
  ].filter(Boolean).map(t => t.toLowerCase()));

  const matched = tags.filter(t => profileTokens.has(t.toLowerCase()));
  return Math.round((matched.length / tags.length) * 100);
}

// Generate structured, authentic "Why this matches" explanation (never invents reasons)
function getWhyThisMatches(opp, profile = {}, interactions = {}) {
  if (opp?.whyThisMatches) {
    return opp.whyThisMatches;
  }

  const p = profile || {};
  const userSkills = (Array.isArray(p.skills) ? p.skills : (p.skills ? String(p.skills).split(",") : []))
    .map(s => String(s).trim().toLowerCase())
    .filter(Boolean);

  const userInterests = [
    ...(Array.isArray(p.interests) ? p.interests : (p.interests ? String(p.interests).split(",") : [])),
    p.field,
    p.goal,
    p.future_you
  ].filter(Boolean).map(s => String(s).trim().toLowerCase());

  const oppTags = (opp.tags || []).map(t => String(t).toLowerCase());
  const oppReqSkills = (opp.eligibility?.required_skills || opp.eligibility?.skills || []).map(s => String(s).toLowerCase());
  const nonSkillTokens = ["internship", "scholarship", "hackathon", "fellowship", "remote", "onsite", "hybrid"];
  const targetSkills = oppReqSkills.length > 0 
    ? oppReqSkills 
    : oppTags.filter(t => !nonSkillTokens.includes(t) && !t.startsWith("$"));

  const matchedSkills = (opp.matchedSkills && opp.matchedSkills.length > 0)
    ? opp.matchedSkills
    : targetSkills.filter(t => userSkills.some(s => s === t || s.includes(t) || t.includes(s)));

  const missingSkills = (opp.missingSkills && opp.missingSkills.length > 0)
    ? opp.missingSkills
    : targetSkills.filter(t => !matchedSkills.includes(t));

  const haystack = [
    ...oppTags,
    opp.category || "",
    opp.title || "",
    opp.description || ""
  ].join(" ").toLowerCase();

  const matchedInterests = (opp.matchedInterests && opp.matchedInterests.length > 0)
    ? opp.matchedInterests
    : userInterests.filter(i => haystack.includes(i));

  const score = opp.matchScore !== undefined
    ? opp.matchScore
    : (opp.finalMatchScore !== undefined ? opp.finalMatchScore : getMatchScore(p, opp.tags || []));

  const eligStatus = opp.eligibility?.status || (opp.isEligible === false ? "FAIL" : "PASS");
  const isEligible = eligStatus !== "FAIL";

  const workMode = (opp.work_mode || "").toLowerCase();
  const loc = opp.location || "Unspecified";
  const isRemote = workMode === "remote" || loc.toLowerCase().includes("remote") || loc.toLowerCase().includes("virtual");

  // Structured deadline urgency — PLAN | PREPARE | PRIORITY | URGENT | CRITICAL | CLOSED | ROLLING
  // Source of truth: opp.deadline (stored field only). AI must never invent deadlines.
  let urgencyLevel = "ROLLING";
  let urgencySummary = "Rolling deadline — no fixed cut-off date stored";
  let recommendedAction = "Apply when ready; check the listing for submission windows";
  let deadlineConfidence = "LOW";
  let diffDays = null;
  if (opp.deadline) {
    const diffMs = new Date(opp.deadline).getTime() - Date.now();
    diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    deadlineConfidence = "HIGH";
    if (diffDays < 0) {
      urgencyLevel = "CLOSED";
      urgencySummary = `Deadline passed ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
      recommendedAction = "Check if applications are still accepted or look for re-openings";
    } else if (diffDays === 0) {
      urgencyLevel = "CRITICAL";
      urgencySummary = "Closes today — submit immediately";
      recommendedAction = "Submit your application right now";
    } else if (diffDays <= 3) {
      urgencyLevel = "CRITICAL";
      urgencySummary = `Closes in ${diffDays} day${diffDays === 1 ? "" : "s"} — act now`;
      recommendedAction = "Complete and submit your application today";
    } else if (diffDays <= 7) {
      urgencyLevel = "URGENT";
      urgencySummary = `Closes in ${diffDays} days — finalize application`;
      recommendedAction = "Finalize materials and submit before the deadline";
    } else if (diffDays <= 14) {
      urgencyLevel = "PRIORITY";
      urgencySummary = `${diffDays} days remaining — begin application`;
      recommendedAction = "Start your application now to allow revision time";
    } else if (diffDays <= 30) {
      urgencyLevel = "PREPARE";
      urgencySummary = `${diffDays} days remaining — gather materials`;
      recommendedAction = "Collect documents, references, and draft your materials";
    } else if (diffDays <= 90) {
      urgencyLevel = "PLAN";
      urgencySummary = `${diffDays} days remaining — plan ahead`;
      recommendedAction = "Add to calendar and plan your preparation timeline";
    } else {
      urgencyLevel = "PLAN";
      urgencySummary = `${diffDays} days remaining — distant deadline`;
      recommendedAction = "Monitor for updates and begin long-term preparation";
    }
  }

  const oppId = String(opp.id || opp._id || "");
  const saved = (interactions.saved || []).map(String);
  const applied = (interactions.applied || []).map(String);
  const passed = (interactions.passed || []).map(String);

  let behaviorType = "neutral";
  let behaviorLabel = "Profile match";
  let behaviorSummary = "Recommended based on stored profile criteria (no prior interaction)";
  if (oppId && applied.includes(oppId)) {
    behaviorType = "applied";
    behaviorLabel = "Already applied";
    behaviorSummary = "You already submitted an application to this listing";
  } else if (oppId && saved.includes(oppId)) {
    behaviorType = "saved";
    behaviorLabel = "Saved watchlist";
    behaviorSummary = "Currently saved in your watchlist/interested list";
  } else if (oppId && passed.includes(oppId)) {
    behaviorType = "passed";
    behaviorLabel = "Previously passed";
    behaviorSummary = "Previously dismissed in your feed";
  }

  const userPrefLocs = (Array.isArray(p.preferred_locations) ? p.preferred_locations : []).map(l => String(l).toLowerCase());
  const userCountry = String(p.country || p.location || "").toLowerCase();
  let locationSummary = "";
  if (isRemote) {
    locationSummary = "Remote: Available worldwide from anywhere";
  } else if (userPrefLocs.length > 0 || userCountry) {
    const allLocs = [userCountry, ...userPrefLocs].filter(Boolean);
    const locMatch = allLocs.some(l => loc.toLowerCase().includes(l) || l.includes(loc.toLowerCase()));
    if (locMatch) {
      locationSummary = `Location match: Matches your preferred location (${loc})`;
    } else if (workMode === "hybrid") {
      locationSummary = `Hybrid in ${loc} (partial on-site presence required)`;
    } else {
      locationSummary = `Onsite in ${loc} (outside preferred locations: ${allLocs.join(", ")})`;
    }
  } else {
    locationSummary = `Location: ${loc}`;
  }

  let skillsSummary = "";
  if (matchedSkills.length > 0) {
    skillsSummary = `Matched ${matchedSkills.length} skill(s): ${matchedSkills.join(", ")}`;
  } else if (targetSkills.length === 0) {
    skillsSummary = "No strict skill prerequisites listed · Open to your background";
  } else {
    skillsSummary = `Missing listed prerequisites (${missingSkills.slice(0, 3).join(", ")})`;
  }

  let interestsSummary = "";
  if (matchedInterests.length > 0) {
    interestsSummary = `Direct alignment with your focus on ${matchedInterests.join(", ")}`;
  } else {
    interestsSummary = "Exploratory opportunity matching your field";
  }

  let eligibilitySummary = "";
  if (!isEligible) {
    eligibilitySummary = `Ineligible: ${opp.eligibility?.blockers?.join("; ") || "Hard constraint failed"}`;
  } else if (eligStatus === "UNKNOWN") {
    eligibilitySummary = `Conditional: Verification recommended (${opp.eligibility?.warnings?.join("; ") || "unverified fields"})`;
  } else {
    eligibilitySummary = "Eligible: Meets all academic & eligibility constraints";
  }

  return {
    matchPercentage: score,
    matchedSkills,
    matchedInterests,
    missingSkills,
    skillsSummary,
    interestsSummary,
    eligibility: {
      status: eligStatus,
      isEligible,
      summary: eligibilitySummary,
      blockers: opp.eligibility?.blockers || [],
      warnings: opp.eligibility?.warnings || []
    },
    locationMode: {
      workMode: opp.work_mode || (isRemote ? "remote" : "onsite"),
      location: loc,
      isRemote,
      summary: locationSummary
    },
    deadlineUrgency: {
      deadline: opp.deadline || null,
      daysLeft: diffDays,
      urgencyLevel,
      deadlineConfidence,
      recommendedAction,
      summary: urgencySummary
    },
    relevantBehavior: {
      type: behaviorType,
      label: behaviorLabel,
      summary: behaviorSummary
    }
  };
}

// Render standardized, elegant "Why this matches" section
function renderWhyThisMatchesSection(whyData, options = {}) {
  const why = whyData || {};
  const score = why.matchPercentage !== undefined ? why.matchPercentage : 0;
  const isCompact = !!options.compact;

  const eligStatus = why.eligibility?.status || (why.eligibility?.isEligible ? "PASS" : "UNKNOWN");
  const eligColor = eligStatus === "PASS"
    ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
    : eligStatus === "FAIL"
    ? "text-destructive bg-destructive/10 border-destructive/30"
    : "text-amber-600 bg-amber-500/10 border-amber-500/30";

  const eligIcon = eligStatus === "PASS" ? "shield-check" : eligStatus === "FAIL" ? "shield-alert" : "alert-circle";
  const eligLabel = eligStatus === "PASS" ? "Eligible" : eligStatus === "FAIL" ? "Ineligible" : "Conditional";

  if (isCompact) {
    return `
      <div class="why-matches-compact mt-3 pt-3 border-t border-foreground/10 bg-muted/30 -mx-2 px-3 py-2.5 rounded-xl">
        <div class="flex items-center justify-between mb-2">
          <div class="font-mono text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <i data-lucide="sparkles" class="size-3 text-primary"></i>
            <span>Why this matches</span>
          </div>
          <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${score >= 70 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary'}">
            ${score}% Match
          </span>
        </div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] font-mono leading-tight">
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">✓</span>
            <span class="truncate" title="${why.matchedSkills?.length ? why.matchedSkills.join(', ') : (why.skillsSummary || 'Open')}"><strong class="uppercase text-[9px] text-muted-foreground">Skills:</strong> ${why.matchedSkills?.length ? why.matchedSkills.join(", ") : "Open"}</span>
          </div>
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">★</span>
            <span class="truncate" title="${why.matchedInterests?.length ? why.matchedInterests.join(', ') : (why.interestsSummary || 'Exploratory')}"><strong class="uppercase text-[9px] text-muted-foreground">Interests:</strong> ${why.matchedInterests?.length ? why.matchedInterests.join(", ") : "General"}</span>
          </div>
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">🛡</span>
            <span class="truncate" title="${why.eligibility?.summary || eligLabel}"><strong class="uppercase text-[9px] text-muted-foreground">Status:</strong> ${eligLabel}</span>
          </div>
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">📍</span>
            <span class="truncate" title="${why.locationMode?.summary || ''}"><strong class="uppercase text-[9px] text-muted-foreground">Mode:</strong> ${why.locationMode?.workMode || 'Remote'}</span>
          </div>
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">⏱</span>
            <span class="truncate" title="${why.deadlineUrgency?.summary || ''} · ${why.deadlineUrgency?.recommendedAction || ''}"><strong class="uppercase text-[9px] text-muted-foreground">Deadline:</strong> ${why.deadlineUrgency?.urgencyLevel || 'ROLLING'} · ${why.deadlineUrgency?.daysLeft != null ? why.deadlineUrgency.daysLeft + 'd left' : 'Rolling'}</span>
          </div>
          <div class="flex items-start gap-1 text-foreground/80">
            <span class="text-primary font-bold shrink-0">👤</span>
            <span class="truncate" title="${why.relevantBehavior?.summary || ''}"><strong class="uppercase text-[9px] text-muted-foreground">Behavior:</strong> ${why.relevantBehavior?.label || 'Profile match'}</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="why-matches-section mt-5 p-4 md:p-5 bg-muted/30 border-2 border-foreground/15 rounded-2xl space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-foreground/10">
        <div class="flex items-center gap-2">
          <span class="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">✦</span>
          <h4 class="font-display text-lg md:text-xl uppercase tracking-tight text-foreground">Why this matches</h4>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${eligColor} flex items-center gap-1">
            <i data-lucide="${eligIcon}" class="size-3"></i> ${eligLabel}
          </span>
          <span class="font-mono text-xs font-bold px-3 py-0.5 rounded-full ${score >= 70 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-primary/10 text-primary border border-primary/20'}">
            ${score}% Match
          </span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs font-mono">
        <!-- 1. Matched Skills -->
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col justify-between">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="wrench" class="size-3 text-primary"></i> Matched Skills
          </div>
          <div class="text-foreground leading-snug">
            ${why.matchedSkills && why.matchedSkills.length > 0 
              ? `<span class="text-emerald-600 font-bold">✓ ${why.matchedSkills.join(", ")}</span>`
              : `<span class="text-muted-foreground">${why.skillsSummary || "Open to all backgrounds"}</span>`
            }
          </div>
        </div>

        <!-- 2. Matched Interests -->
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col justify-between">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="sparkles" class="size-3 text-primary"></i> Matched Interests
          </div>
          <div class="text-foreground leading-snug">
            ${why.matchedInterests && why.matchedInterests.length > 0 
              ? `<span class="text-primary font-bold">★ ${why.matchedInterests.join(", ")}</span>`
              : `<span class="text-muted-foreground">${why.interestsSummary || "Exploratory alignment"}</span>`
            }
          </div>
        </div>

        <!-- 3. Eligibility -->
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col justify-between">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="${eligIcon}" class="size-3 text-primary"></i> Eligibility
          </div>
          <div class="text-foreground leading-snug ${eligStatus === 'PASS' ? 'text-emerald-600' : eligStatus === 'FAIL' ? 'text-destructive' : 'text-amber-600'}">
            ${why.eligibility?.summary || eligLabel}
          </div>
        </div>

        <!-- 4. Location / Mode -->
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col justify-between">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="map-pin" class="size-3 text-primary"></i> Location / Mode
          </div>
          <div class="text-foreground leading-snug">
            ${why.locationMode?.summary || `${why.locationMode?.workMode || ''} ${why.locationMode?.location || ''}`}
          </div>
        </div>

        <!-- 5. Deadline Urgency -->
        ${(() => {
          const du = why.deadlineUrgency || {};
          const lvl = du.urgencyLevel || "ROLLING";
          const levelColors = {
            CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
            URGENT:   "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
            PRIORITY: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
            PREPARE:  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
            PLAN:     "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
            ROLLING:  "bg-muted/60 text-muted-foreground border-foreground/10",
            CLOSED:   "bg-foreground/10 text-muted-foreground border-foreground/10"
          };
          const badgeCls = levelColors[lvl] || levelColors.ROLLING;
          const confBadge = du.deadlineConfidence === "HIGH"
            ? `<span class="ml-1.5 px-1.5 py-px rounded text-[8px] font-bold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">Confirmed</span>`
            : `<span class="ml-1.5 px-1.5 py-px rounded text-[8px] font-bold uppercase bg-muted/60 text-muted-foreground border border-foreground/10">Rolling</span>`;
          return `
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col gap-1.5">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
            <i data-lucide="clock" class="size-3 text-primary"></i> Deadline Urgency
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${badgeCls}">${lvl}</span>
            ${confBadge}
          </div>
          <div class="text-foreground leading-snug text-[11px]">${du.summary || "Rolling deadline"}</div>
          ${du.recommendedAction ? `<div class="text-[10px] font-mono text-primary/80 border-t border-foreground/10 pt-1.5">→ ${du.recommendedAction}</div>` : ""}
        </div>
          `;
        })()}

        <!-- 6. Relevant Behavior -->
        <div class="p-3 rounded-xl bg-card border border-foreground/10 flex flex-col justify-between">
          <div class="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="user-check" class="size-3 text-primary"></i> Relevant Behavior
          </div>
          <div class="text-foreground leading-snug">
            ${why.relevantBehavior?.summary || "Profile match recommendation"}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Fetch comprehensive deterministic match evaluation from server
async function fetchOpportunityMatch(oppId) {
  try {
    const res = await fetch(`/api/opportunities/${oppId}/match`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.error(`Failed to fetch match for opportunity ${oppId}:`, err);
  }
  return null;
}

// Fetch list of autocomplete options for skills/interests
async function fetchMasterList(type) {
  try {
    const res = await fetch(`/api/master/${type}`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.error(`Failed to fetch master ${type}:`, err);
  }
  return [];
}

// Render dynamic header based on authentication status
function renderHeader(user) {
  const headerNav = document.getElementById("header-nav");
  if (!headerNav) return;

  if (user) {
    headerNav.innerHTML = `
      <div class="flex items-center gap-6">
        <a href="/" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Feed</a>
        <a href="/calendar" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Calendar</a>
        <a href="/saved" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Saved</a>
        <a href="/tracker" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Tracker</a>
        <a href="/profile" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Profile</a>
        <button id="logout-btn" class="px-4 py-2 border-2 border-foreground rounded-full font-mono text-[11px] font-bold uppercase tracking-tight hover:bg-foreground hover:text-background transition-all">Log Out</button>
      </div>
    `;
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.href = "/";
      }
    });
  } else {
    headerNav.innerHTML = `
      <a href="/login" class="px-4 py-2 rounded-full font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all">Log In</a>
      <a href="/signup" class="px-4 py-2 rounded-full font-mono text-[11px] font-bold uppercase tracking-tight bg-foreground text-background hover:bg-primary transition-colors">Sign Up</a>
    `;
  }
}

// Run dynamic marquee ticker data
async function initMarqueeTicker() {
  const marqueeContainer = document.getElementById("marquee-ticker");
  if (!marqueeContainer) return;

  try {
    const res = await fetch("/api/opportunities/ticker");
    if (!res.ok) return;
    const items = await res.json();
    
    if (items.length === 0) return;

    // Duplicate list items to create infinite scroll effect
    const tickerList = [...items, ...items];
    marqueeContainer.innerHTML = tickerList.map(item => {
      const daysLeft = formatDeadline(item.deadline);
      return `
        <span class="inline-flex items-center gap-3">
          <span>${item.title} · ${item.organization}</span>
          <span class="opacity-60">${daysLeft}</span>
          <span class="opacity-50">✦</span>
        </span>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load ticker:", err);
  }
}

// Lucide icon generation
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
