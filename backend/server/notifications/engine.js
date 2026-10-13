import { 
  getNotificationsCollection, 
  getOpportunitiesCollection, 
  getUsersCollection, 
  formatOpportunity, 
  toObjectId 
} from "../db.js";
import { DeterministicMatchingEngine } from "../matching/engine.js";

export const NOTIFICATION_TYPES = {
  HIGH_MATCH: "high_match",
  SAVED_DEADLINE: "saved_deadline",
  INTERESTED_DEADLINE: "interested_deadline",
  DEADLINE_REMINDER: "deadline_reminder",
  DEADLINE_CHANGE: "deadline_change",
  FOLLOW_UP_REMINDER: "follow_up_reminder",
  WEEKLY_DIGEST: "weekly_digest"
};

export const NOTIFICATION_PRIORITIES = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
  CRITICAL: "CRITICAL"
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  highMatch: true,
  savedDeadlines: true,
  interestedDeadlines: true,
  deadlineReminders: true,
  deadlineChanges: true,
  followUps: true,
  weeklyDigest: true,
  minMatchScore: 80,
  quietHours: {
    enabled: true,
    start: "22:00", // 10:00 PM local
    end: "08:00",   // 08:00 AM local
    allowUrgent: true
  },
  timezone: "Asia/Kolkata"
};

/**
 * Checks if current time is within user's configured quiet hours in their timezone.
 * 
 * @param {Object} quietHours - { enabled, start, end, allowUrgent }
 * @param {string} timezone - IANA timezone string e.g. "Asia/Kolkata", "America/New_York"
 * @param {Date} [referenceDate] - Optional date to check
 * @returns {boolean}
 */
export function isQuietHourActive(quietHours = {}, timezone = "Asia/Kolkata", referenceDate = new Date()) {
  if (!quietHours || quietHours.enabled === false) return false;

  const startStr = quietHours.start || "22:00";
  const endStr = quietHours.end || "08:00";

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    });

    const parts = formatter.formatToParts(referenceDate);
    const hourVal = parts.find(p => p.type === "hour")?.value || "0";
    const minVal = parts.find(p => p.type === "minute")?.value || "0";

    const currentMinutes = parseInt(hourVal, 10) * 60 + parseInt(minVal, 10);

    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    if (startMinutes > endMinutes) {
      // Overnight range, e.g. 22:00 -> 08:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Daytime range, e.g. 13:00 -> 15:00
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  } catch {
    // If timezone is invalid, fallback to false
    return false;
  }
}

/**
 * Formats a date relative to timezone.
 */
export function formatUserDate(dateInput, timezone = "Asia/Kolkata") {
  if (!dateInput) return "No date specified";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Kolkata",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

/**
 * Calculates human-readable time remaining string.
 */
export function formatTimeRemaining(diffDays, deadlineIso) {
  if (diffDays < 0) return "closed";
  if (diffDays === 0) {
    const diffHours = Math.max(1, Math.round((new Date(deadlineIso).getTime() - Date.now()) / (1000 * 60 * 60)));
    return diffHours <= 1 ? "less than 1 hour" : `${diffHours} hours`;
  }
  if (diffDays === 1) return "1 day";
  return `${diffDays} days`;
}

/**
 * Calculates snooze expiration timestamp based on inputs.
 * 
 * @param {Object} snoozeInput - { hours?: number, days?: number, until?: string }
 * @returns {string} ISO Date string
 */
export function calculateSnoozeTimestamp(snoozeInput = {}) {
  const now = Date.now();
  if (snoozeInput.until) {
    const custom = new Date(snoozeInput.until);
    if (!isNaN(custom.getTime()) && custom.getTime() > now) {
      return custom.toISOString();
    }
  }
  if (snoozeInput.days) {
    const days = Math.max(1, Number(snoozeInput.days));
    return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
  }
  const hours = Math.max(1, Number(snoozeInput.hours || 24));
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Generates an ISO week string e.g. "2026-W42" for weekly digest deduplication.
 */
function getIsoYearWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export class NotificationEngine {
  /**
   * Retrieves merged notification preferences for a user doc.
   */
  static getEffectivePreferences(user = {}) {
    const stored = user?.notificationPreferences || {};
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...stored,
      quietHours: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours,
        ...(stored.quietHours || {})
      },
      timezone: stored.timezone || user?.profile?.timezone || DEFAULT_NOTIFICATION_PREFERENCES.timezone
    };
  }

  /**
   * Evaluates all triggers and creates pending notifications for a user.
   * Enforces:
   * - User notification preferences
   * - Quiet hours suppression/deferral
   * - Deduplication via dedupKey
   * - Useful, actionable messaging
   * 
   * @param {Object} user - User document
   * @param {Object} [options] - Optional overrides (e.g. forceDigest, referenceDate)
   * @returns {Promise<Object>} { created: Array, count: number }
   */
  static async evaluateTriggers(user, options = {}) {
    if (!user || !user._id) return { created: [], count: 0 };

    const userIdStr = String(user._id);
    const prefs = this.getEffectivePreferences(user);
    const tz = prefs.timezone;
    const now = options.referenceDate ? new Date(options.referenceDate) : new Date();
    const isQuiet = isQuietHourActive(prefs.quietHours, tz, now);

    const notifsColl = await getNotificationsCollection();
    const oppsColl = await getOpportunitiesCollection();
    const usersColl = await getUsersCollection();

    // Load active opportunities
    const rawOpps = await oppsColl.find({ active: { $ne: false } }).toArray();
    const opps = rawOpps.map(formatOpportunity);
    const oppsMap = new Map(opps.map(o => [String(o.id), o]));

    const newNotifications = [];
    const updatedSnapshots = { ...(user.deadlineSnapshots || {}) };

    const passedIds = new Set((user.passed || []).map(String));
    const appliedIds = new Set((user.applied || []).map(item => 
      typeof item === "object" && item !== null ? String(item.opportunityId || item.id) : String(item)
    ));
    const savedIds = new Set((user.saved || []).map(String));
    const interestedIds = new Set((user.interested || []).map(String));
    const lifecycle = user.lifecycle || {};

    // Helper to evaluate and stage a notification if not duplicated
    const stageNotification = async (notifData) => {
      // 1. Check preferences toggle
      if (notifData.type === NOTIFICATION_TYPES.HIGH_MATCH && !prefs.highMatch) return;
      if (notifData.type === NOTIFICATION_TYPES.SAVED_DEADLINE && !prefs.savedDeadlines) return;
      if (notifData.type === NOTIFICATION_TYPES.INTERESTED_DEADLINE && !prefs.interestedDeadlines) return;
      if (notifData.type === NOTIFICATION_TYPES.DEADLINE_REMINDER && !prefs.deadlineReminders) return;
      if (notifData.type === NOTIFICATION_TYPES.DEADLINE_CHANGE && !prefs.deadlineChanges) return;
      if (notifData.type === NOTIFICATION_TYPES.FOLLOW_UP_REMINDER && !prefs.followUps) return;
      if (notifData.type === NOTIFICATION_TYPES.WEEKLY_DIGEST && !prefs.weeklyDigest) return;

      // 2. Quiet Hours check: if quiet hours is active and not urgent, defer or suppress
      const isUrgent = notifData.priority === NOTIFICATION_PRIORITIES.URGENT || notifData.priority === NOTIFICATION_PRIORITIES.CRITICAL;
      if (isQuiet && (!isUrgent || !prefs.quietHours.allowUrgent)) {
        // Quiet hours active — suppress non-urgent notification to avoid spamming
        return;
      }

      // 3. Deduplication Check
      const existing = await notifsColl.findOne({
        userId: userIdStr,
        dedupKey: notifData.dedupKey
      });

      if (existing) {
        // Already notified with this milestone/dedup key
        return;
      }

      const notifDoc = {
        id: `notif_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`,
        userId: userIdStr,
        type: notifData.type,
        title: notifData.title,
        message: notifData.message,
        opportunityId: notifData.opportunityId || null,
        actionUrl: notifData.actionUrl || (notifData.opportunityId ? `/opportunity/${notifData.opportunityId}` : "/"),
        priority: notifData.priority || NOTIFICATION_PRIORITIES.MEDIUM,
        read: false,
        readAt: null,
        createdAt: now.toISOString(),
        snoozedUntil: null,
        dedupKey: notifData.dedupKey,
        metadata: notifData.metadata || {}
      };

      await notifsColl.insertOne(notifDoc);
      newNotifications.push(notifDoc);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 1: New High-Match Opportunities
    // ─────────────────────────────────────────────────────────────────────────
    if (prefs.highMatch) {
      for (const opp of opps) {
        const oppId = String(opp.id);
        if (passedIds.has(oppId) || appliedIds.has(oppId)) continue;

        const matchEval = DeterministicMatchingEngine.evaluate(user, opp, {
          behaviorPrefs: user.behaviorPrefs || {}
        });

        const score = matchEval.finalMatchScore;
        const threshold = prefs.minMatchScore || 80;

        if (score >= threshold) {
          await stageNotification({
            type: NOTIFICATION_TYPES.HIGH_MATCH,
            title: `✦ New High Match (${score}%): ${opp.title}`,
            message: `${opp.organization} matches your profile (${score}% alignment). Direct requirements match in ${(matchEval.matchedSkills || []).slice(0, 2).join(", ") || "core areas"}.`,
            opportunityId: oppId,
            actionUrl: `/opportunity/${oppId}`,
            priority: score >= 90 ? NOTIFICATION_PRIORITIES.HIGH : NOTIFICATION_PRIORITIES.MEDIUM,
            dedupKey: `high_match:${userIdStr}:${oppId}`,
            metadata: { matchScore: score, organization: opp.organization }
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 2 & 3: Saved & Interested Opportunity Deadlines
    // ─────────────────────────────────────────────────────────────────────────
    const trackedDeadlines = [
      { idSet: savedIds, type: NOTIFICATION_TYPES.SAVED_DEADLINE, label: "Saved Opportunity" },
      { idSet: interestedIds, type: NOTIFICATION_TYPES.INTERESTED_DEADLINE, label: "Interested Opportunity" }
    ];

    for (const tracked of trackedDeadlines) {
      for (const oppId of tracked.idSet) {
        if (appliedIds.has(oppId)) continue; // Already applied, skip standard deadline alerts
        const opp = oppsMap.get(oppId);
        if (!opp || !opp.deadline) continue;

        const deadlineDate = new Date(opp.deadline);
        const diffMs = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 7) {
          let windowKey = "7d";
          let priority = NOTIFICATION_PRIORITIES.HIGH;

          if (diffDays <= 1) {
            windowKey = "1d";
            priority = NOTIFICATION_PRIORITIES.URGENT;
          } else if (diffDays <= 3) {
            windowKey = "3d";
            priority = NOTIFICATION_PRIORITIES.CRITICAL;
          }

          const timeStr = formatTimeRemaining(diffDays, opp.deadline);
          await stageNotification({
            type: tracked.type,
            title: `⏰ ${tracked.label} Closing Soon: ${opp.title}`,
            message: `${opp.organization} closes in ${timeStr}. Review required materials before ${formatUserDate(opp.deadline, tz)}.`,
            opportunityId: oppId,
            actionUrl: `/opportunity/${oppId}`,
            priority,
            dedupKey: `${tracked.type}:${userIdStr}:${oppId}:${windowKey}`,
            metadata: { daysLeft: diffDays, deadline: opp.deadline, windowKey }
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 4: Deadline Reminders (for items in PREPARING stage)
    // ─────────────────────────────────────────────────────────────────────────
    if (prefs.deadlineReminders) {
      for (const [oppId, entry] of Object.entries(lifecycle)) {
        if (entry.stage === "PREPARING") {
          const opp = oppsMap.get(oppId);
          if (!opp || !opp.deadline) continue;

          const deadlineDate = new Date(opp.deadline);
          const diffDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays >= 0 && diffDays <= 5) {
            const windowKey = diffDays <= 1 ? "prep_1d" : "prep_5d";
            await stageNotification({
              type: NOTIFICATION_TYPES.DEADLINE_REMINDER,
              title: `📌 Application Preparation Reminder: ${opp.title}`,
              message: `You are preparing your application for ${opp.organization}. Submission deadline is in ${formatTimeRemaining(diffDays, opp.deadline)}.`,
              opportunityId: oppId,
              actionUrl: `/opportunity/${oppId}`,
              priority: diffDays <= 1 ? NOTIFICATION_PRIORITIES.URGENT : NOTIFICATION_PRIORITIES.HIGH,
              dedupKey: `deadline_reminder:${userIdStr}:${oppId}:${windowKey}`,
              metadata: { stage: entry.stage, daysLeft: diffDays }
            });
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 5: Deadline Changes (Shifted deadlines)
    // ─────────────────────────────────────────────────────────────────────────
    if (prefs.deadlineChanges) {
      const allTrackedIds = new Set([...savedIds, ...interestedIds, ...Object.keys(lifecycle)]);
      for (const oppId of allTrackedIds) {
        const opp = oppsMap.get(oppId);
        if (!opp) continue;

        const currentDeadline = opp.deadline || "ROLLING";
        const recordedDeadline = user.deadlineSnapshots?.[oppId];

        if (recordedDeadline && recordedDeadline !== currentDeadline) {
          const oldFormatted = recordedDeadline === "ROLLING" ? "Rolling" : formatUserDate(recordedDeadline, tz);
          const newFormatted = currentDeadline === "ROLLING" ? "Rolling" : formatUserDate(currentDeadline, tz);

          await stageNotification({
            type: NOTIFICATION_TYPES.DEADLINE_CHANGE,
            title: `🔄 Deadline Changed: ${opp.title}`,
            message: `${opp.organization} changed their deadline from ${oldFormatted} to ${newFormatted}. LOOP updated your schedule.`,
            opportunityId: oppId,
            actionUrl: `/opportunity/${oppId}`,
            priority: NOTIFICATION_PRIORITIES.MEDIUM,
            dedupKey: `deadline_change:${userIdStr}:${oppId}:${currentDeadline}`,
            metadata: { oldDeadline: recordedDeadline, newDeadline: currentDeadline }
          });
        }

        updatedSnapshots[oppId] = currentDeadline;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 6: Follow-up Reminders
    // ─────────────────────────────────────────────────────────────────────────
    if (prefs.followUps) {
      for (const [oppId, entry] of Object.entries(lifecycle)) {
        if (entry.follow_up_date) {
          const followUpDate = new Date(entry.follow_up_date);
          const diffMs = followUpDate.getTime() - now.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

          // Trigger if due today or past due within 3 days
          if (diffDays <= 0 && diffDays >= -3) {
            const opp = oppsMap.get(oppId) || { title: "Application Follow-up", organization: "Company" };
            const dateKey = entry.follow_up_date.split("T")[0];

            await stageNotification({
              type: NOTIFICATION_TYPES.FOLLOW_UP_REMINDER,
              title: `📬 Follow-up Due: ${opp.title}`,
              message: `You scheduled a follow-up for your application with ${opp.organization}. Check your application portal or send a polite inquiry.`,
              opportunityId: oppId,
              actionUrl: `/tracker`,
              priority: NOTIFICATION_PRIORITIES.HIGH,
              dedupKey: `follow_up:${userIdStr}:${oppId}:${dateKey}`,
              metadata: { followUpDate: entry.follow_up_date, notes: entry.notes || "" }
            });
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 7: Weekly Digest Notification
    // ─────────────────────────────────────────────────────────────────────────
    if (prefs.weeklyDigest) {
      const weekKey = getIsoYearWeek(now);
      const topCount = Math.min(5, opps.length);

      await stageNotification({
        type: NOTIFICATION_TYPES.WEEKLY_DIGEST,
        title: `🗞️ Your Weekly Opportunity Digest (${weekKey})`,
        message: `Your weekly intelligence digest is ready with ${topCount} curated opportunities and timely application insights.`,
        actionUrl: `/calendar`,
        priority: NOTIFICATION_PRIORITIES.LOW,
        dedupKey: `weekly_digest:${userIdStr}:${weekKey}`,
        metadata: { weekKey }
      });
    }

    // Persist updated deadline snapshots to user document
    if (Object.keys(updatedSnapshots).length > 0) {
      await usersColl.updateOne(
        { _id: toObjectId(userIdStr) },
        { $set: { deadlineSnapshots: updatedSnapshots } }
      );
    }

    return {
      created: newNotifications,
      count: newNotifications.length
    };
  }

  /**
   * Retrieves all notifications for a user, respecting snoozing and unread filters.
   */
  static async getUserNotifications(userId, options = {}) {
    const userIdStr = String(userId);
    const notifsColl = await getNotificationsCollection();
    const usersColl = await getUsersCollection();
    const user = await usersColl.findOne({ _id: toObjectId(userIdStr) });

    const prefs = this.getEffectivePreferences(user || {});
    const now = new Date();
    const isQuiet = isQuietHourActive(prefs.quietHours, prefs.timezone, now);

    const allDocs = await notifsColl
      .find({ userId: userIdStr })
      .sort({ createdAt: -1 })
      .toArray();

    // Partition and flag snoozed items
    const processed = allDocs.map(item => {
      const isSnoozed = !!(item.snoozedUntil && new Date(item.snoozedUntil) > now);
      return {
        ...item,
        isSnoozed,
        isQuietHourSuppressed: isQuiet && item.priority !== NOTIFICATION_PRIORITIES.URGENT && item.priority !== NOTIFICATION_PRIORITIES.CRITICAL
      };
    });

    // Active unread notifications exclude currently snoozed ones
    const activeUnread = processed.filter(n => !n.read && !n.isSnoozed);
    const visibleNotifications = options.unreadOnly ? activeUnread : processed;

    return {
      notifications: visibleNotifications,
      unreadCount: activeUnread.length,
      totalCount: processed.length,
      preferences: prefs,
      quietHoursActive: isQuiet
    };
  }

  /**
   * Marks a single notification as read.
   */
  static async markAsRead(notificationId, userId) {
    const notifsColl = await getNotificationsCollection();
    return await notifsColl.updateOne(
      { id: String(notificationId), userId: String(userId) },
      { $set: { read: true, readAt: new Date().toISOString() } }
    );
  }

  /**
   * Marks all notifications for a user as read.
   */
  static async markAllAsRead(userId) {
    const notifsColl = await getNotificationsCollection();
    return await notifsColl.updateMany(
      { userId: String(userId), read: { $ne: true } },
      { $set: { read: true, readAt: new Date().toISOString() } }
    );
  }

  /**
   * Snoozes a notification until a future time.
   */
  static async snoozeNotification(notificationId, userId, snoozeInput = {}) {
    const notifsColl = await getNotificationsCollection();
    const snoozedUntil = calculateSnoozeTimestamp(snoozeInput);

    await notifsColl.updateOne(
      { id: String(notificationId), userId: String(userId) },
      { $set: { snoozedUntil } }
    );

    return { success: true, snoozedUntil };
  }

  /**
   * Unsnoozes a notification immediately.
   */
  static async unsnoozeNotification(notificationId, userId) {
    const notifsColl = await getNotificationsCollection();
    await notifsColl.updateOne(
      { id: String(notificationId), userId: String(userId) },
      { $set: { snoozedUntil: null } }
    );
    return { success: true };
  }

  /**
   * Updates notification preferences for a user.
   */
  static async updatePreferences(userId, updateData = {}) {
    const usersColl = await getUsersCollection();
    const user = await usersColl.findOne({ _id: toObjectId(userId) });
    if (!user) throw new Error("User not found");

    const current = this.getEffectivePreferences(user);

    const merged = {
      ...current,
      ...(updateData.highMatch !== undefined ? { highMatch: Boolean(updateData.highMatch) } : {}),
      ...(updateData.savedDeadlines !== undefined ? { savedDeadlines: Boolean(updateData.savedDeadlines) } : {}),
      ...(updateData.interestedDeadlines !== undefined ? { interestedDeadlines: Boolean(updateData.interestedDeadlines) } : {}),
      ...(updateData.deadlineReminders !== undefined ? { deadlineReminders: Boolean(updateData.deadlineReminders) } : {}),
      ...(updateData.deadlineChanges !== undefined ? { deadlineChanges: Boolean(updateData.deadlineChanges) } : {}),
      ...(updateData.followUps !== undefined ? { followUps: Boolean(updateData.followUps) } : {}),
      ...(updateData.weeklyDigest !== undefined ? { weeklyDigest: Boolean(updateData.weeklyDigest) } : {}),
      ...(updateData.minMatchScore !== undefined ? { minMatchScore: Math.max(50, Math.min(100, Number(updateData.minMatchScore))) } : {}),
      ...(updateData.timezone ? { timezone: String(updateData.timezone).trim() } : {}),
      quietHours: {
        ...current.quietHours,
        ...(updateData.quietHours || {})
      }
    };

    await usersColl.updateOne(
      { _id: toObjectId(userId) },
      { $set: { notificationPreferences: merged } }
    );

    return merged;
  }
}
