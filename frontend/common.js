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

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR TRACKING — fire-and-forget, never blocks the UI
// ─────────────────────────────────────────────────────────────────────────────
// Action weights (applied server-side too):
//   applied=5, interested=3, saved=2, opened=1.5, viewed=1, searched=0.5, passed=-2
//
// Queue batches events and flushes every 3 seconds so network calls are minimal.
// A single click NEVER drastically changes recommendations (server applies decay ×0.95).

const _behaviorQueue = [];
let   _behaviorFlushTimer = null;

function _flushBehaviorQueue() {
  _behaviorFlushTimer = null;
  if (_behaviorQueue.length === 0) return;
  const events = _behaviorQueue.splice(0, 20); // take up to 20
  fetch("/api/user/behavior/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    // keepalive lets the request outlive the page navigation
    keepalive: true,
  }).catch(() => {}); // silently swallow errors — tracking must never break UX
}

/**
 * Track a user action on an opportunity.
 * @param {string} action  - "viewed"|"opened"|"saved"|"interested"|"applied"|"passed"|"searched"
 * @param {object} opp     - Minimal opp object: { id, category, tags, location, work_mode, organization }
 */
function trackBehavior(action, opp) {
  if (!action || !opp) return;
  _behaviorQueue.push({
    action,
    oppId: String(opp.id || opp._id || ""),
    oppSnapshot: {
      category:       opp.category       || null,
      tags:           opp.tags           || [],
      location:       opp.location       || null,
      work_mode:      opp.work_mode      || null,
      organization:   opp.organization   || null,
      required_skills: opp.eligibility?.required_skills || []
    }
  });
  // Debounce: flush 3 seconds after last event
  if (_behaviorFlushTimer) clearTimeout(_behaviorFlushTimer);
  _behaviorFlushTimer = setTimeout(_flushBehaviorQueue, 3000);
}

/**
 * Track a search query — mapped to the "searched" action.
 * @param {string} query - The search string the user submitted
 */
function trackSearch(query) {
  if (!query || !query.trim()) return;
  _behaviorQueue.push({
    action: "searched",
    oppId: "",
    oppSnapshot: { tags: query.trim().toLowerCase().split(/\s+/).filter(Boolean) }
  });
  if (_behaviorFlushTimer) clearTimeout(_behaviorFlushTimer);
  _behaviorFlushTimer = setTimeout(_flushBehaviorQueue, 3000);
}

// Flush when user navigates away
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", _flushBehaviorQueue);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _flushBehaviorQueue();
  });
}

/**
 * Fetch and render learned preferences into a container element.
 * @param {string|HTMLElement} containerEl - CSS selector or DOM element
 * @param {object} [opts]
 *   opts.compact = true → minimal chip display; default = full panel
 */
async function renderLearnedPreferences(containerEl, opts = {}) {
  const el = typeof containerEl === "string" ? document.querySelector(containerEl) : containerEl;
  if (!el) return;

  try {
    const res = await fetch("/api/user/behavior/prefs");
    if (!res.ok) return;
    const data = await res.json();
    const prefs = data.preferences || {};
    const total = data.totalEvents || 0;

    if (total === 0) {
      el.innerHTML = `
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          No behavior data yet — interact with the feed to start personalizing.
        </div>`;
      return;
    }

    // Chip colours per dimension
    const DIM_STYLES = {
      categories: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
      skills:     "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
      locations:  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
      orgs:       "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
      work_modes: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25",
    };
    const DIM_LABELS = {
      categories: "Category preferences",
      skills:     "Skill & topic preferences",
      locations:  "Location preferences",
      orgs:       "Organisations",
      work_modes: "Work mode preferences",
    };

    const dims = ["categories", "skills", "locations", "work_modes", "orgs"];

    const chipsHtml = dims.map(dim => {
      const items = (prefs[dim] || []).slice(0, opts.compact ? 3 : 6);
      if (!items.length) return "";
      const style = DIM_STYLES[dim] || "bg-muted text-muted-foreground border-foreground/15";
      return `
        <div class="mb-3">
          <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">${DIM_LABELS[dim]}</div>
          <div class="flex flex-wrap gap-1.5">
            ${items.map(({ key, score }) => `
              <span class="px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold border ${style} flex items-center gap-1.5">
                ${key.replace(/_/g, " ")}
                <span class="opacity-60 text-[8px]">${score > 0 ? "+" : ""}${score}</span>
              </span>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    const lastUpdated = data.lastUpdated
      ? new Date(data.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "–";

    el.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Based on ${total} interaction${total === 1 ? "" : "s"} · Updated ${lastUpdated}</div>
        </div>
        <button id="behavior-reset-btn" class="px-3 py-1.5 border border-destructive/40 rounded-lg font-mono text-[9px] font-bold uppercase text-destructive hover:bg-destructive/10 transition-all">
          Reset preferences
        </button>
      </div>
      ${chipsHtml}
      <div class="font-mono text-[9px] text-muted-foreground mt-2 border-l-2 border-primary/30 pl-2">
        These preferences are learned gradually. No single action causes a major change.
      </div>
    `;

    // Wire reset button
    const resetBtn = el.querySelector("#behavior-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        if (!confirm("Reset all learned preferences? This cannot be undone.")) return;
        resetBtn.textContent = "Resetting…";
        resetBtn.disabled = true;
        await resetLearnedPreferences();
        await renderLearnedPreferences(el, opts);
      });
    }
  } catch (err) {
    console.error("renderLearnedPreferences error:", err);
  }
}

/** Reset all learned behavior preferences */
async function resetLearnedPreferences() {
  try {
    await fetch("/api/user/behavior/prefs/reset", { method: "DELETE" });
  } catch (err) {
    console.error("resetLearnedPreferences error:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────


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
      <div class="flex items-center gap-5">
        <a href="/" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Feed</a>
        <a href="/calendar" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Calendar</a>
        <a href="/saved" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Saved</a>
        <a href="/tracker" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Tracker</a>
        <a href="/profile" class="font-mono text-[11px] font-bold uppercase tracking-tight text-foreground/70 hover:text-foreground transition-all">Profile</a>
        ${(user?.isAdmin || user?.role === 'admin') ? `
          <a href="/admin" class="font-mono text-[11px] font-bold uppercase tracking-tight text-primary hover:text-primary/80 transition-all flex items-center gap-1">🛡️ Admin</a>
        ` : ''}
        <button id="notif-bell-btn" class="relative p-2 rounded-full border border-foreground/30 hover:border-foreground hover:bg-foreground/5 transition-all text-foreground flex items-center justify-center" title="Notifications" aria-label="Notifications">
          <i data-lucide="bell" class="size-3.5"></i>
          <span id="notif-badge" class="hidden absolute -top-1 -right-1 size-4 bg-primary text-primary-foreground font-mono text-[9px] font-bold rounded-full flex items-center justify-center">0</span>
        </button>
        <button id="logout-btn" class="px-4 py-2 border-2 border-foreground rounded-full font-mono text-[11px] font-bold uppercase tracking-tight hover:bg-foreground hover:text-background transition-all">Log Out</button>
      </div>
    `;
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.href = "/";
      }
    });
    document.getElementById("notif-bell-btn")?.addEventListener("click", () => {
      openNotificationModal();
    });
    updateNotificationBadge();
    if (window.lucide) window.lucide.createIcons();
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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 14: AI INTELLIGENCE LAYER CLIENT API & UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch AI executive summary for an opportunity */
async function fetchAISummary(oppId) {
  try {
    const res = await fetch(`/api/ai/opportunity-summary/${encodeURIComponent(oppId)}`);
    if (!res.ok) throw new Error("Failed to load summary");
    return await res.json();
  } catch (err) {
    console.error("fetchAISummary failed:", err);
    return null;
  }
}

/** Fetch AI skill-gap analysis */
async function fetchAISkillGap(oppId, profile = null) {
  try {
    const res = await fetch("/api/ai/skill-gap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: oppId, profile })
    });
    if (!res.ok) throw new Error("Failed to load skill-gap");
    return await res.json();
  } catch (err) {
    console.error("fetchAISkillGap failed:", err);
    return null;
  }
}

/** Fetch AI match narrative explanation */
async function fetchAIMatchExplanation(oppId, profile = null) {
  try {
    const res = await fetch("/api/ai/explain-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: oppId, profile })
    });
    if (!res.ok) throw new Error("Failed to load match explanation");
    return await res.json();
  } catch (err) {
    console.error("fetchAIMatchExplanation failed:", err);
    return null;
  }
}

/** Fetch AI eligibility plain-English explanation */
async function fetchAIEligibilityExplanation(oppId, profile = null) {
  try {
    const res = await fetch("/api/ai/explain-eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: oppId, profile })
    });
    if (!res.ok) throw new Error("Failed to load eligibility explanation");
    return await res.json();
  } catch (err) {
    console.error("fetchAIEligibilityExplanation failed:", err);
    return null;
  }
}

/** Fetch AI opportunity comparison */
async function fetchAICompare(opportunityIds) {
  try {
    const res = await fetch("/api/ai/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityIds })
    });
    if (!res.ok) throw new Error("Failed to compare opportunities");
    return await res.json();
  } catch (err) {
    console.error("fetchAICompare failed:", err);
    return null;
  }
}

/** Natural-language opportunity search */
async function fetchAINaturalSearch(query) {
  try {
    const res = await fetch("/api/ai/natural-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error("Failed to execute natural search");
    return await res.json();
  } catch (err) {
    console.error("fetchAINaturalSearch failed:", err);
    return null;
  }
}

/** Fetch personalized weekly AI digest */
async function fetchAIDigest() {
  try {
    const res = await fetch("/api/ai/digest");
    if (!res.ok) throw new Error("Failed to load digest");
    return await res.json();
  } catch (err) {
    console.error("fetchAIDigest failed:", err);
    return null;
  }
}

/**
 * Renders the interactive AI Intelligence card on opportunity detail pages.
 * @param {string|HTMLElement} container - Selector or DOM node
 * @param {string} oppId - Opportunity ID
 * @param {object} [profile] - Optional student profile
 */
async function renderAIIntelligenceSection(container, oppId, profile = null) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el || !oppId) return;

  el.innerHTML = `
    <div class="border-2 border-primary/30 rounded-3xl p-6 bg-card/60 backdrop-blur-sm relative overflow-hidden shadow-stamp">
      <div class="flex items-center justify-between flex-wrap gap-3 border-b border-foreground/10 pb-4 mb-4">
        <div class="flex items-center gap-2">
          <div class="size-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-display text-base">
            ✦
          </div>
          <div>
            <h3 class="font-display text-xl uppercase tracking-tight leading-none flex items-center gap-2">
              LOOP AI Intelligence Layer
            </h3>
            <span class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Grounded strictly in verified opportunity facts · Zero Hallucination
            </span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 bg-background border border-foreground/15 rounded-xl p-1 font-mono text-[10px]">
          <button data-tab="summary" class="ai-tab-btn active px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold uppercase transition-all">Executive Summary</button>
          <button data-tab="skillgap" class="ai-tab-btn px-3 py-1 rounded-lg hover:bg-foreground/5 font-bold uppercase transition-all">Skill Gap & Roadmap</button>
          <button data-tab="explainer" class="ai-tab-btn px-3 py-1 rounded-lg hover:bg-foreground/5 font-bold uppercase transition-all">Match & Eligibility</button>
        </div>
      </div>

      <div id="ai-tab-content" class="min-h-[140px] flex items-center justify-center">
        <div class="flex items-center gap-2 font-mono text-xs uppercase text-muted-foreground animate-pulse">
          <i data-lucide="loader" class="size-4 animate-spin"></i> Loading AI Intelligence...
        </div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const tabContent = el.querySelector("#ai-tab-content");
  const tabBtns = el.querySelectorAll(".ai-tab-btn");

  let summaryData = null;
  let skillGapData = null;
  let explainerData = null;

  async function loadTab(tab) {
    tabBtns.forEach(b => {
      if (b.dataset.tab === tab) {
        b.className = "ai-tab-btn active px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold uppercase transition-all";
      } else {
        b.className = "ai-tab-btn px-3 py-1 rounded-lg hover:bg-foreground/5 font-bold uppercase transition-all";
      }
    });

    tabContent.innerHTML = `
      <div class="w-full py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground font-mono text-xs uppercase animate-pulse">
        <i data-lucide="loader" class="size-5 animate-spin text-primary"></i> Synthesizing verified data...
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    if (tab === "summary") {
      if (!summaryData) summaryData = await fetchAISummary(oppId);
      if (!summaryData) {
        tabContent.innerHTML = `<div class="font-mono text-xs text-destructive">Failed to load summary.</div>`;
        return;
      }
      tabContent.innerHTML = `
        <div class="space-y-4 w-full">
          <div class="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
            <div class="font-mono text-[9px] uppercase tracking-widest text-primary font-bold mb-1">Quick Take</div>
            <p class="font-sans text-sm font-medium leading-relaxed">${summaryData.quickTake}</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="p-3 bg-background border border-foreground/10 rounded-xl">
              <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Target Audience</div>
              <div class="font-mono text-xs text-foreground/90 mt-1">${summaryData.whoItsFor}</div>
            </div>
            <div class="p-3 bg-background border border-foreground/10 rounded-xl">
              <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Commitment & Format</div>
              <div class="font-mono text-xs text-foreground/90 mt-1">${summaryData.keyCommitment}</div>
            </div>
          </div>
          <div>
            <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Verified Highlights</div>
            <ul class="space-y-1.5">
              ${(summaryData.highlights || []).map(h => `
                <li class="flex items-start gap-2 font-mono text-xs">
                  <span class="text-primary font-bold">›</span>
                  <span>${h}</span>
                </li>
              `).join("")}
            </ul>
          </div>
          <div class="flex items-center justify-between text-[10px] font-mono text-muted-foreground border-t border-foreground/10 pt-3">
            <span>${summaryData.deadlineNote}</span>
            <span class="text-emerald-600 font-bold">✓ Source: Stored Opportunity DB</span>
          </div>
        </div>
      `;
    } else if (tab === "skillgap") {
      if (!skillGapData) skillGapData = await fetchAISkillGap(oppId, profile);
      if (!skillGapData) {
        tabContent.innerHTML = `<div class="font-mono text-xs text-destructive">Failed to load skill-gap analysis.</div>`;
        return;
      }
      const sevColor = skillGapData.gapSeverity === "NONE" ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" :
                       skillGapData.gapSeverity === "LOW" ? "text-sky-600 bg-sky-500/10 border-sky-500/20" :
                       skillGapData.gapSeverity === "MODERATE" ? "text-amber-600 bg-amber-500/10 border-amber-500/20" :
                       "text-destructive bg-destructive/10 border-destructive/20";

      tabContent.innerHTML = `
        <div class="space-y-4 w-full">
          <div class="flex items-center justify-between flex-wrap gap-2 p-3 bg-background border border-foreground/10 rounded-xl">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold uppercase">Prerequisite Gap Severity:</span>
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${sevColor}">
                ${skillGapData.gapSeverity}
              </span>
            </div>
            <div class="font-mono text-xs">
              Readiness: <strong class="text-primary text-sm">${skillGapData.readinessScore}%</strong>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="p-3 bg-background border border-foreground/10 rounded-xl">
              <div class="font-mono text-[9px] uppercase tracking-widest text-emerald-600 font-bold mb-2">Matched Prerequisites (${skillGapData.matchedSkills.length})</div>
              <div class="flex flex-wrap gap-1">
                ${skillGapData.matchedSkills.length > 0 
                  ? skillGapData.matchedSkills.map(s => `<span class="px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded font-mono text-[10px] font-bold uppercase">✓ ${s}</span>`).join("")
                  : `<span class="font-mono text-xs text-muted-foreground italic">None currently on profile</span>`
                }
              </div>
            </div>
            <div class="p-3 bg-background border border-foreground/10 rounded-xl">
              <div class="font-mono text-[9px] uppercase tracking-widest text-amber-600 font-bold mb-2">Skills to Target (${skillGapData.missingSkills.length})</div>
              <div class="flex flex-wrap gap-1">
                ${skillGapData.missingSkills.length > 0 
                  ? skillGapData.missingSkills.map(s => `<span class="px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded font-mono text-[10px] font-bold uppercase">○ ${s}</span>`).join("")
                  : `<span class="font-mono text-xs text-emerald-600 font-bold">✓ Zero missing prerequisites!</span>`
                }
              </div>
            </div>
          </div>

          ${skillGapData.learningRoadmap?.length > 0 ? `
            <div>
              <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Actionable Preparation Roadmap</div>
              <div class="space-y-2">
                ${skillGapData.learningRoadmap.map(r => `
                  <div class="p-2.5 bg-muted/40 border border-foreground/10 rounded-xl flex items-start gap-3">
                    <span class="size-5 rounded-full bg-primary/20 text-primary font-mono text-xs flex items-center justify-center font-bold shrink-0">${r.step}</span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-xs font-bold">${r.title}</span>
                        <span class="font-mono text-[9px] text-muted-foreground">${r.estimatedTime}</span>
                      </div>
                      <p class="font-sans text-xs text-foreground/80 mt-0.5">${r.description}</p>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      `;
    } else if (tab === "explainer") {
      const [matchRes, eligRes] = await Promise.all([
        fetchAIMatchExplanation(oppId, profile),
        fetchAIEligibilityExplanation(oppId, profile)
      ]);
      if (!matchRes || !eligRes) {
        tabContent.innerHTML = `<div class="font-mono text-xs text-destructive">Failed to load explainer.</div>`;
        return;
      }
      tabContent.innerHTML = `
        <div class="space-y-4 w-full">
          <div class="p-4 bg-background border border-foreground/10 rounded-2xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs font-bold uppercase text-primary">${matchRes.headline}</span>
              <span class="font-mono text-xs font-bold">${matchRes.matchPercentage}% Deterministic Match</span>
            </div>
            <p class="font-sans text-sm text-foreground/90 leading-relaxed">${matchRes.narrativeExplanation}</p>
          </div>

          <div class="p-4 bg-background border border-foreground/10 rounded-2xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs font-bold uppercase text-foreground/80">Eligibility Status</span>
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase ${eligRes.status === 'PASS' ? 'bg-emerald-500/15 text-emerald-600' : eligRes.status === 'FAIL' ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-600'}">
                ${eligRes.status}
              </span>
            </div>
            <p class="font-sans text-xs text-foreground/80 leading-relaxed">${eligRes.plainEnglishExplanation}</p>
            ${eligRes.nextSteps?.length > 0 ? `
              <div class="font-mono text-[10px] text-muted-foreground mt-2">
                <strong>Recommended Next Steps:</strong>
                <ul class="list-disc list-inside mt-1 space-y-0.5">
                  ${eligRes.nextSteps.map(s => `<li>${s}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => loadTab(btn.dataset.tab));
  });

  // Initial load
  await loadTab("summary");
}

/**
 * Opens a modal comparing opportunities side-by-side using AI intelligence.
 * @param {string[]} oppIds 
 */
async function openAIComparisonModal(oppIds) {
  if (!Array.isArray(oppIds) || oppIds.length < 2) {
    alert("Select at least 2 opportunities to compare.");
    return;
  }

  let modal = document.getElementById("ai-comparison-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ai-comparison-modal";
    modal.className = "fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto";
    document.body.appendChild(modal);
  }

  modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="bg-card border-2 border-foreground rounded-3xl max-w-4xl w-full p-6 shadow-stamp relative animate-entry max-h-[90vh] overflow-y-auto">
      <button id="close-compare-modal" class="absolute right-6 top-6 size-8 border border-foreground/20 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-all font-mono">✕</button>
      <div class="flex items-center gap-2 mb-2">
        <span class="size-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display text-sm">✦</span>
        <span class="font-mono text-xs uppercase tracking-widest text-muted-foreground font-bold">Side-By-Side AI Evaluation</span>
      </div>
      <h2 class="font-display text-3xl uppercase tracking-tight mb-4">Opportunity Comparison<span class="text-primary">.</span></h2>
      <div id="compare-modal-body" class="py-8 flex flex-col items-center justify-center gap-2 font-mono text-xs uppercase text-muted-foreground animate-pulse">
        <i data-lucide="loader" class="size-6 animate-spin text-primary"></i> Comparing verified fields...
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("close-compare-modal")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  const bodyEl = document.getElementById("compare-modal-body");
  const data = await fetchAICompare(oppIds);

  if (!data || !data.comparisonMatrix) {
    bodyEl.innerHTML = `<div class="font-mono text-xs text-destructive">Failed to load comparison. Ensure both opportunities exist.</div>`;
    return;
  }

  const oppTitles = Object.keys(data.comparisonMatrix.focusArea || {});

  bodyEl.className = "space-y-6";
  bodyEl.innerHTML = `
    <div class="p-4 bg-primary/10 border border-primary/20 rounded-2xl">
      <div class="font-mono text-[10px] uppercase font-bold text-primary mb-1">AI Synthesis & Verdict</div>
      <p class="font-sans text-sm font-medium leading-relaxed">${data.verdict}</p>
    </div>

    <!-- Comparative Matrix Table -->
    <div class="border border-foreground/15 rounded-2xl overflow-hidden font-mono text-xs">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-muted/60 border-b border-foreground/15">
            <th class="p-3 uppercase text-[10px] font-bold text-muted-foreground w-1/4">Dimension</th>
            ${oppTitles.map(t => `<th class="p-3 uppercase text-[10px] font-bold text-foreground w-1/3">${t}</th>`).join("")}
          </tr>
        </thead>
        <tbody class="divide-y divide-foreground/10">
          <tr>
            <td class="p-3 font-bold uppercase text-[10px] text-muted-foreground">Focus / Category</td>
            ${oppTitles.map(t => `<td class="p-3">${data.comparisonMatrix.focusArea[t] || "–"}</td>`).join("")}
          </tr>
          <tr>
            <td class="p-3 font-bold uppercase text-[10px] text-muted-foreground">Timeline & Deadline</td>
            ${oppTitles.map(t => `<td class="p-3 font-semibold text-primary">${data.comparisonMatrix.timelineAndDeadline[t] || "–"}</td>`).join("")}
          </tr>
          <tr>
            <td class="p-3 font-bold uppercase text-[10px] text-muted-foreground">Work Mode</td>
            ${oppTitles.map(t => `<td class="p-3">${data.comparisonMatrix.workMode?.[t] || "–"}</td>`).join("")}
          </tr>
          <tr>
            <td class="p-3 font-bold uppercase text-[10px] text-muted-foreground">Compensation / Reward</td>
            ${oppTitles.map(t => `<td class="p-3 font-semibold text-emerald-600">${data.comparisonMatrix.rewardOrStipend[t] || "None listed"}</td>`).join("")}
          </tr>
          <tr>
            <td class="p-3 font-bold uppercase text-[10px] text-muted-foreground">Key Skills</td>
            ${oppTitles.map(t => `
              <td class="p-3">
                <div class="flex flex-wrap gap-1">
                  ${(data.comparisonMatrix.skillRequirements[t] || []).map(s => `<span class="px-1.5 py-0.5 bg-muted rounded text-[9px] uppercase font-bold">${s}</span>`).join("")}
                </div>
              </td>
            `).join("")}
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tradeoffs -->
    <div>
      <div class="font-mono text-xs uppercase font-bold text-muted-foreground mb-2">Key Tradeoffs</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${(data.tradeoffs || []).map(t => `
          <div class="p-3 bg-muted/40 border border-foreground/10 rounded-xl">
            <div class="font-mono text-[9px] font-bold uppercase text-primary mb-1">${t.aspect}</div>
            <p class="font-sans text-xs text-foreground/80">${t.notes}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Opens a modal displaying the student's personalized AI weekly digest.
 */
async function openAIDigestModal() {
  let modal = document.getElementById("ai-digest-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ai-digest-modal";
    modal.className = "fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto";
    document.body.appendChild(modal);
  }

  modal.classList.remove("hidden");
  modal.innerHTML = `
    <div class="bg-card border-2 border-foreground rounded-3xl max-w-3xl w-full p-8 shadow-stamp relative animate-entry max-h-[90vh] overflow-y-auto">
      <button id="close-digest-modal" class="absolute right-6 top-6 size-8 border border-foreground/20 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-all font-mono">✕</button>
      <div class="flex items-center gap-2 mb-2">
        <span class="size-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-display text-base">✦</span>
        <span class="font-mono text-xs uppercase tracking-widest text-muted-foreground font-bold">Weekly Intelligence Briefing</span>
      </div>
      <h2 class="font-display text-4xl uppercase tracking-tight mb-4">Your LOOP AI Digest<span class="text-primary">.</span></h2>
      <div id="digest-modal-body" class="py-12 flex flex-col items-center justify-center gap-3 font-mono text-xs uppercase text-muted-foreground animate-pulse">
        <i data-lucide="loader" class="size-6 animate-spin text-primary"></i> Curating your personalized opportunities...
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("close-digest-modal")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  const bodyEl = document.getElementById("digest-modal-body");
  const data = await fetchAIDigest();

  if (!data) {
    bodyEl.innerHTML = `<div class="font-mono text-xs text-destructive">Failed to load digest. Please log in or verify account data.</div>`;
    return;
  }

  bodyEl.className = "space-y-6";
  bodyEl.innerHTML = `
    <div class="p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-start gap-4">
      <i data-lucide="sparkles" class="size-5 text-primary shrink-0 mt-0.5"></i>
      <div>
        <div class="font-mono text-[10px] uppercase font-bold text-primary">${data.digestDate}</div>
        <p class="font-sans text-sm font-medium mt-0.5">${data.greeting}</p>
      </div>
    </div>

    <!-- Action Item of the Week -->
    <div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
      <i data-lucide="calendar-clock" class="size-5 text-amber-600 shrink-0 mt-0.5"></i>
      <div>
        <div class="font-mono text-[10px] uppercase font-bold text-amber-600">Priority Action Item This Week</div>
        <p class="font-sans text-xs text-foreground/90 mt-0.5 font-medium">${data.actionItemOfTheWeek}</p>
      </div>
    </div>

    <!-- Curated Opportunities -->
    <div>
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Top Curated Opportunities For You</div>
      <div class="space-y-3">
        ${(data.curatedOpportunities || []).map(o => `
          <div class="p-4 bg-background border border-foreground/15 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-primary/50 transition-colors">
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase bg-primary/10 text-primary">${o.category}</span>
                <span class="font-mono text-[10px] text-muted-foreground uppercase font-bold">${o.organization}</span>
              </div>
              <h4 class="font-display text-lg uppercase truncate">${o.title}</h4>
              <p class="font-sans text-xs text-foreground/70 mt-1">${o.whySelected}</p>
            </div>
            <a href="/opportunity?id=${encodeURIComponent(o.opportunityId)}" class="shrink-0 px-4 py-2 bg-foreground text-background rounded-xl font-mono text-xs font-bold uppercase hover:bg-primary transition-colors text-center">
              View Details →
            </a>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Focus Skill & Motivational Note -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
      <div class="p-4 bg-muted/40 border border-foreground/10 rounded-2xl">
        <div class="font-mono text-[10px] uppercase font-bold text-muted-foreground">Skill To Focus On Next</div>
        <div class="font-display text-xl text-primary mt-1 uppercase">${data.skillToFocusOn}</div>
      </div>
      <div class="p-4 bg-muted/40 border border-foreground/10 rounded-2xl">
        <div class="font-mono text-[10px] uppercase font-bold text-muted-foreground">Weekly Motivation</div>
        <p class="font-sans text-xs italic text-foreground/80 mt-1">"${data.motivationalNote}"</p>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 16: NOTIFICATION INTELLIGENCE CLIENT API & MODAL
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch user notifications */
async function fetchNotifications(options = {}) {
  try {
    const url = `/api/notifications?unreadOnly=${!!options.unreadOnly}&evaluate=${options.evaluate !== false}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("fetchNotifications error:", err);
    return null;
  }
}

/** Update the badge on the header notification bell */
async function updateNotificationBadge() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  try {
    const data = await fetchNotifications({ unreadOnly: true, evaluate: false });
    if (!data) return;
    const count = data.unreadCount || 0;
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch {
    // Non-blocking
  }
}

/** Mark a single notification as read */
async function markNotificationRead(id) {
  try {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    if (res.ok) updateNotificationBadge();
    return res.ok;
  } catch (err) {
    console.error("markNotificationRead error:", err);
    return false;
  }
}

/** Mark all notifications as read */
async function markAllNotificationsRead() {
  try {
    const res = await fetch("/api/notifications/read-all", { method: "POST" });
    if (res.ok) updateNotificationBadge();
    return res.ok;
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    return false;
  }
}

/** Snooze notification */
async function snoozeNotification(id, snoozeInput = { hours: 24 }) {
  try {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snoozeInput)
    });
    if (res.ok) updateNotificationBadge();
    return await res.json();
  } catch (err) {
    console.error("snoozeNotification error:", err);
    return null;
  }
}

/** Unsnooze notification */
async function unsnoozeNotification(id) {
  try {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/unsnooze`, { method: "POST" });
    if (res.ok) updateNotificationBadge();
    return res.ok;
  } catch (err) {
    console.error("unsnoozeNotification error:", err);
    return false;
  }
}

/** Fetch notification preferences */
async function fetchNotificationPreferences() {
  try {
    const res = await fetch("/api/notifications/preferences");
    if (!res.ok) return null;
    const data = await res.json();
    return data.preferences;
  } catch (err) {
    console.error("fetchNotificationPreferences error:", err);
    return null;
  }
}

/** Save notification preferences */
async function saveNotificationPreferences(prefs) {
  try {
    const res = await fetch("/api/notifications/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs)
    });
    return res.ok;
  } catch (err) {
    console.error("saveNotificationPreferences error:", err);
    return false;
  }
}

/**
 * Opens the interactive Notification Center Modal with tabs for Notifications and Preferences.
 */
async function openNotificationModal() {
  let modal = document.getElementById("notification-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "notification-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-entry";
    document.body.appendChild(modal);
  } else {
    modal.classList.remove("hidden");
  }

  let currentTab = "notifications"; // "notifications" | "preferences"
  let filterUnreadOnly = false;

  async function renderModalContent() {
    const loadingHtml = `
      <div class="relative w-full max-w-2xl bg-card border-2 border-foreground rounded-3xl p-6 shadow-stamp-lg flex flex-col gap-4">
        <div class="flex items-center justify-between pb-4 border-b border-foreground/10">
          <div class="flex items-center gap-2">
            <span class="size-6 rounded-lg bg-primary text-primary-foreground font-mono text-xs flex items-center justify-center font-bold">🔔</span>
            <h3 class="font-display text-xl uppercase tracking-tight">Notification Center</h3>
          </div>
          <button id="close-notif-modal" class="size-8 rounded-full border border-foreground/20 hover:border-foreground flex items-center justify-center font-bold">✕</button>
        </div>
        <div class="py-12 text-center font-mono text-xs text-muted-foreground animate-pulse">✦ Loading notifications and preferences...</div>
      </div>
    `;
    modal.innerHTML = loadingHtml;
    document.getElementById("close-notif-modal")?.addEventListener("click", () => modal.classList.add("hidden"));

    const [data, prefs] = await Promise.all([
      fetchNotifications({ unreadOnly: filterUnreadOnly }),
      fetchNotificationPreferences()
    ]);

    const notifs = data?.notifications || [];
    const unreadCount = data?.unreadCount || 0;
    const isQuiet = data?.quietHoursActive || false;
    const quietHours = prefs?.quietHours || {};

    const typeBadges = {
      high_match: "bg-primary/10 text-primary border-primary/30",
      saved_deadline: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      interested_deadline: "bg-pink-500/10 text-pink-600 border-pink-500/30",
      deadline_reminder: "bg-purple-500/10 text-purple-600 border-purple-500/30",
      deadline_change: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      follow_up_reminder: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
      weekly_digest: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
    };

    const typeLabels = {
      high_match: "✦ High Match",
      saved_deadline: "⏰ Saved Deadline",
      interested_deadline: "❤️ Tracked Opportunity",
      deadline_reminder: "📌 Deadline Reminder",
      deadline_change: "🔄 Deadline Changed",
      follow_up_reminder: "📬 Follow-Up Due",
      weekly_digest: "🗞️ Weekly Digest"
    };

    const priorityBadges = {
      CRITICAL: "bg-red-500/20 text-red-600 font-bold",
      URGENT: "bg-red-500/15 text-red-600 font-bold",
      HIGH: "bg-amber-500/15 text-amber-600 font-bold",
      MEDIUM: "bg-blue-500/15 text-blue-600",
      LOW: "bg-muted text-muted-foreground"
    };

    modal.innerHTML = `
      <div class="relative w-full max-w-2xl bg-card border-2 border-foreground rounded-3xl p-6 shadow-stamp-lg flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="flex items-center justify-between pb-4 border-b border-foreground/10 shrink-0">
          <div class="flex items-center gap-3">
            <span class="size-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-display text-base">✦</span>
            <div>
              <h3 class="font-display text-2xl uppercase tracking-tight leading-none">Notifications</h3>
              <div class="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                ${unreadCount} unread · ${prefs?.timezone || 'Local'} Timezone
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="close-notif-modal" class="size-8 rounded-full border border-foreground/20 hover:border-foreground flex items-center justify-center font-bold transition-all">✕</button>
          </div>
        </div>

        <!-- Navigation Sub-bar -->
        <div class="flex items-center justify-between py-3 border-b border-foreground/10 shrink-0 flex-wrap gap-2">
          <div class="flex items-center gap-1.5 p-1 bg-muted/30 rounded-xl border border-foreground/10 font-mono text-[10px] uppercase font-bold">
            <button id="tab-notifs-btn" class="px-3 py-1 rounded-lg ${currentTab === 'notifications' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'} transition-all">
              Inbox (${notifs.length})
            </button>
            <button id="tab-prefs-btn" class="px-3 py-1 rounded-lg ${currentTab === 'preferences' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'} transition-all">
              Preferences & Quiet Hours
            </button>
          </div>

          ${currentTab === 'notifications' ? `
            <div class="flex items-center gap-2 font-mono text-[10px]">
              <button id="toggle-filter-unread" class="px-2.5 py-1 rounded-lg border border-foreground/20 hover:border-foreground ${filterUnreadOnly ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground'} transition-colors">
                ${filterUnreadOnly ? 'Showing Unread' : 'Filter Unread'}
              </button>
              <button id="mark-all-read-btn" class="px-2.5 py-1 rounded-lg border border-foreground/20 hover:border-foreground text-foreground/80 hover:text-foreground transition-colors">
                Mark All Read
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Body Area -->
        <div class="overflow-y-auto flex-1 py-4 space-y-3 pr-1">
          ${currentTab === 'notifications' ? `
            ${isQuiet ? `
              <div class="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] flex items-center gap-2.5">
                <span class="text-sm">🌙</span>
                <span><strong>Quiet Hours Active (${quietHours.start} – ${quietHours.end})</strong>: Non-urgent alerts are deferred to prevent disruption.</span>
              </div>
            ` : ''}

            ${notifs.length === 0 ? `
              <div class="py-16 text-center">
                <div class="text-3xl mb-2">🎉</div>
                <div class="font-display text-xl uppercase tracking-tight">You're All Caught Up!</div>
                <p class="font-mono text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  ${filterUnreadOnly ? 'No unread notifications right now.' : 'No notifications yet. Track opportunities to receive timely deadline and follow-up alerts.'}
                </p>
              </div>
            ` : notifs.map(n => `
              <div class="p-4 rounded-2xl border ${n.read ? 'border-foreground/10 bg-card/60 opacity-80' : 'border-primary/40 bg-card shadow-sm'} flex flex-col gap-2.5 transition-all hover:border-foreground/40">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase">
                    <span class="px-2 py-0.5 rounded-full border ${typeBadges[n.type] || 'border-foreground/20'} font-bold">
                      ${typeLabels[n.type] || n.type}
                    </span>
                    <span class="px-1.5 py-0.5 rounded ${priorityBadges[n.priority] || ''}">
                      ${n.priority}
                    </span>
                    ${n.isSnoozed ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 font-bold">💤 Snoozed</span>` : ''}
                    ${!n.read ? `<span class="size-2 rounded-full bg-primary inline-block"></span>` : ''}
                  </div>
                  <span class="font-mono text-[9px] text-muted-foreground whitespace-nowrap">
                    ${new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>

                <div>
                  <h4 class="font-sans text-sm font-bold leading-tight ${n.read ? 'text-foreground/80' : 'text-foreground'}">${n.title}</h4>
                  <p class="font-sans text-xs text-foreground/70 mt-1 leading-relaxed">${n.message}</p>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-foreground/5 font-mono text-[10px] flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    ${n.actionUrl ? `
                      <a href="${n.actionUrl}" class="px-3 py-1 bg-foreground text-background rounded-lg font-bold uppercase hover:bg-primary transition-colors text-center">
                        View Details →
                      </a>
                    ` : ''}
                    ${!n.read ? `
                      <button data-notif-id="${n.id}" class="btn-mark-read px-2.5 py-1 border border-foreground/20 rounded-lg hover:border-foreground transition-colors">
                        Mark Read
                      </button>
                    ` : ''}
                  </div>

                  <div class="flex items-center gap-1 text-muted-foreground">
                    <button data-notif-id="${n.id}" data-snooze-hours="24" class="btn-snooze px-2 py-1 border border-foreground/15 rounded-lg hover:border-foreground hover:text-foreground transition-colors">
                      💤 Snooze 24h
                    </button>
                    <button data-notif-id="${n.id}" data-snooze-days="3" class="btn-snooze px-2 py-1 border border-foreground/15 rounded-lg hover:border-foreground hover:text-foreground transition-colors">
                      💤 3d
                    </button>
                    ${n.isSnoozed ? `
                      <button data-notif-id="${n.id}" class="btn-unsnooze px-2 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/30 rounded-lg font-bold">
                        Unsnooze
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join("")}
          ` : `
            <!-- Preferences Form -->
            <form id="notif-prefs-form" class="space-y-5 font-mono text-xs">
              <div class="p-4 rounded-2xl bg-muted/20 border border-foreground/10 space-y-3">
                <div class="font-bold uppercase tracking-wider text-primary text-[10px]">Notification Triggers</div>
                
                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>New High-Match Opportunities</span>
                  <input type="checkbox" name="highMatch" class="size-4 accent-primary" ${prefs?.highMatch !== false ? 'checked' : ''}>
                </label>
                
                <div class="pl-4 pt-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>Minimum Match Threshold</span>
                  <div class="flex items-center gap-2">
                    <input type="range" name="minMatchScore" min="50" max="95" step="5" value="${prefs?.minMatchScore || 80}" class="accent-primary" id="range-min-score">
                    <span id="label-min-score" class="font-bold text-foreground w-8 text-right">${prefs?.minMatchScore || 80}%</span>
                  </div>
                </div>

                <label class="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-foreground/5">
                  <span>Saved Opportunity Deadlines (7d, 3d, 1d)</span>
                  <input type="checkbox" name="savedDeadlines" class="size-4 accent-primary" ${prefs?.savedDeadlines !== false ? 'checked' : ''}>
                </label>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Interested Opportunity Deadlines</span>
                  <input type="checkbox" name="interestedDeadlines" class="size-4 accent-primary" ${prefs?.interestedDeadlines !== false ? 'checked' : ''}>
                </label>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Preparation Milestones & Reminders</span>
                  <input type="checkbox" name="deadlineReminders" class="size-4 accent-primary" ${prefs?.deadlineReminders !== false ? 'checked' : ''}>
                </label>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Deadline Changes (Official Date Shifts)</span>
                  <input type="checkbox" name="deadlineChanges" class="size-4 accent-primary" ${prefs?.deadlineChanges !== false ? 'checked' : ''}>
                </label>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Application Follow-Up Reminders</span>
                  <input type="checkbox" name="followUps" class="size-4 accent-primary" ${prefs?.followUps !== false ? 'checked' : ''}>
                </label>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Weekly Curated Intelligence Digest</span>
                  <input type="checkbox" name="weeklyDigest" class="size-4 accent-primary" ${prefs?.weeklyDigest !== false ? 'checked' : ''}>
                </label>
              </div>

              <!-- Quiet Hours & Timezone -->
              <div class="p-4 rounded-2xl bg-muted/20 border border-foreground/10 space-y-3">
                <div class="font-bold uppercase tracking-wider text-primary text-[10px]">Quiet Hours & Timezone</div>

                <label class="flex items-center justify-between gap-3 cursor-pointer">
                  <span>Enable Quiet Hours</span>
                  <input type="checkbox" name="quietHoursEnabled" class="size-4 accent-primary" ${quietHours.enabled !== false ? 'checked' : ''}>
                </label>

                <div class="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label class="text-[10px] text-muted-foreground uppercase block mb-1">Start Time</label>
                    <input type="time" name="quietHoursStart" value="${quietHours.start || '22:00'}" class="w-full bg-background border border-foreground/20 rounded-xl p-2 font-mono text-xs focus:outline-none focus:border-primary">
                  </div>
                  <div>
                    <label class="text-[10px] text-muted-foreground uppercase block mb-1">End Time</label>
                    <input type="time" name="quietHoursEnd" value="${quietHours.end || '08:00'}" class="w-full bg-background border border-foreground/20 rounded-xl p-2 font-mono text-xs focus:outline-none focus:border-primary">
                  </div>
                </div>

                <label class="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-foreground/5 text-[11px]">
                  <span>Allow Urgent / Critical Deadlines During Quiet Hours</span>
                  <input type="checkbox" name="allowUrgent" class="size-4 accent-primary" ${quietHours.allowUrgent !== false ? 'checked' : ''}>
                </label>

                <div class="pt-2 border-t border-foreground/5">
                  <label class="text-[10px] text-muted-foreground uppercase block mb-1">Your Timezone</label>
                  <select name="timezone" class="w-full bg-background border border-foreground/20 rounded-xl p-2.5 font-mono text-xs focus:outline-none focus:border-primary">
                    <option value="Asia/Kolkata" ${prefs?.timezone === 'Asia/Kolkata' ? 'selected' : ''}>Asia/Kolkata (IST, UTC+5:30)</option>
                    <option value="UTC" ${prefs?.timezone === 'UTC' ? 'selected' : ''}>UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York" ${prefs?.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles" ${prefs?.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London" ${prefs?.timezone === 'Europe/London' ? 'selected' : ''}>Europe/London (GMT/BST)</option>
                    <option value="Asia/Singapore" ${prefs?.timezone === 'Asia/Singapore' ? 'selected' : ''}>Asia/Singapore (SGT, UTC+8)</option>
                    <option value="Asia/Tokyo" ${prefs?.timezone === 'Asia/Tokyo' ? 'selected' : ''}>Asia/Tokyo (JST, UTC+9)</option>
                  </select>
                </div>
              </div>

              <div class="flex items-center justify-between pt-2">
                <span id="save-status-msg" class="font-mono text-[10px] text-primary"></span>
                <button type="submit" class="px-5 py-2.5 bg-foreground text-background rounded-xl font-bold uppercase hover:bg-primary transition-colors">
                  Save Preferences
                </button>
              </div>
            </form>
          `}
        </div>

      </div>
    `;

    // Setup interactive handlers
    document.getElementById("close-notif-modal")?.addEventListener("click", () => modal.classList.add("hidden"));
    
    document.getElementById("tab-notifs-btn")?.addEventListener("click", () => {
      currentTab = "notifications";
      renderModalContent();
    });

    document.getElementById("tab-prefs-btn")?.addEventListener("click", () => {
      currentTab = "preferences";
      renderModalContent();
    });

    document.getElementById("toggle-filter-unread")?.addEventListener("click", () => {
      filterUnreadOnly = !filterUnreadOnly;
      renderModalContent();
    });

    document.getElementById("mark-all-read-btn")?.addEventListener("click", async () => {
      await markAllNotificationsRead();
      renderModalContent();
    });

    // Mark single read
    modal.querySelectorAll(".btn-mark-read").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notifId;
        if (id) {
          await markNotificationRead(id);
          renderModalContent();
        }
      });
    });

    // Snooze buttons
    modal.querySelectorAll(".btn-snooze").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notifId;
        const hours = btn.dataset.snoozeHours;
        const days = btn.dataset.snoozeDays;
        if (id) {
          await snoozeNotification(id, hours ? { hours: Number(hours) } : { days: Number(days) });
          renderModalContent();
        }
      });
    });

    // Unsnooze button
    modal.querySelectorAll(".btn-unsnooze").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.notifId;
        if (id) {
          await unsnoozeNotification(id);
          renderModalContent();
        }
      });
    });

    // Preferences form
    const rangeScore = document.getElementById("range-min-score");
    const labelScore = document.getElementById("label-min-score");
    rangeScore?.addEventListener("input", (e) => {
      if (labelScore) labelScore.textContent = `${e.target.value}%`;
    });

    const prefsForm = document.getElementById("notif-prefs-form");
    prefsForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(prefsForm);
      const updatePayload = {
        highMatch: fd.has("highMatch"),
        savedDeadlines: fd.has("savedDeadlines"),
        interestedDeadlines: fd.has("interestedDeadlines"),
        deadlineReminders: fd.has("deadlineReminders"),
        deadlineChanges: fd.has("deadlineChanges"),
        followUps: fd.has("followUps"),
        weeklyDigest: fd.has("weeklyDigest"),
        minMatchScore: Number(fd.get("minMatchScore") || 80),
        timezone: fd.get("timezone") || "Asia/Kolkata",
        quietHours: {
          enabled: fd.has("quietHoursEnabled"),
          start: fd.get("quietHoursStart") || "22:00",
          end: fd.get("quietHoursEnd") || "08:00",
          allowUrgent: fd.has("allowUrgent")
        }
      };

      const ok = await saveNotificationPreferences(updatePayload);
      const statusEl = document.getElementById("save-status-msg");
      if (statusEl) {
        statusEl.textContent = ok ? "✓ Preferences saved successfully" : "❌ Error saving preferences";
        setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 3000);
      }
    });

    if (window.lucide) window.lucide.createIcons();
  }

  await renderModalContent();
}

// Lucide icon generation
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  updateNotificationBadge();
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 17: ADMIN & SOURCE HEALTH CLIENT API
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch system-wide admin dashboard statistics */
async function fetchAdminStats() {
  try {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchAdminStats error:", err);
    return null;
  }
}

/** Fetch all tracked sources and health metrics */
async function fetchAdminSources() {
  try {
    const res = await fetch("/api/admin/sources");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.sources || [];
  } catch (err) {
    console.error("fetchAdminSources error:", err);
    return [];
  }
}

/** Enable or disable an ingestion source */
async function toggleAdminSource(sourceId, enabled) {
  try {
    const res = await fetch(`/api/admin/sources/${encodeURIComponent(sourceId)}/toggle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("toggleAdminSource error:", err);
    return { success: false, error: err.message };
  }
}

/** Trigger ingestion for a specific source or all enabled sources */
async function triggerAdminIngestion(sourceId = null, force = false) {
  try {
    const endpoint = sourceId 
      ? `/api/admin/sources/${encodeURIComponent(sourceId)}/ingest`
      : "/api/admin/ingestion/run";
    
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error("triggerAdminIngestion error:", err);
    return { success: false, error: err.message };
  }
}

/** Fetch inspection failures across sources */
async function fetchAdminFailures(sourceId = null, limit = 50) {
  try {
    const url = `/api/admin/sources/failures?${sourceId ? `sourceId=${encodeURIComponent(sourceId)}&` : ""}limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.failures || [];
  } catch (err) {
    console.error("fetchAdminFailures error:", err);
    return [];
  }
}

/** Fetch unverified and AI-generated opportunities for review */
async function fetchAdminUnverifiedOpportunities(params = {}) {
  try {
    const query = new URLSearchParams({
      filter: params.filter || "all",
      search: params.search || "",
      category: params.category || "",
      limit: String(params.limit || 50),
      skip: String(params.skip || 0)
    });
    const res = await fetch(`/api/admin/opportunities/unverified?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchAdminUnverifiedOpportunities error:", err);
    return { opportunities: [], total: 0 };
  }
}

/** Verify an opportunity and promote it to active/verified */
async function verifyAdminOpportunity(oppId) {
  try {
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(oppId)}/verify`, {
      method: "POST"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("verifyAdminOpportunity error:", err);
    return { success: false, error: err.message };
  }
}

/** Reject / deactivate an unverified opportunity */
async function rejectAdminOpportunity(oppId, reason = "Rejected by administrator") {
  try {
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(oppId)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("rejectAdminOpportunity error:", err);
    return { success: false, error: err.message };
  }
}


