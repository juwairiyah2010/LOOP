import { 
  NotificationEngine, 
  NOTIFICATION_TYPES, 
  NOTIFICATION_PRIORITIES, 
  DEFAULT_NOTIFICATION_PREFERENCES,
  isQuietHourActive,
  calculateSnoozeTimestamp
} from "./notifications/engine.js";
import { 
  getUsersCollection, 
  getOpportunitiesCollection, 
  getNotificationsCollection, 
  toObjectId 
} from "./db.js";

async function runNotificationsTestSuite() {
  console.log("============================================================");
  console.log("   PHASE 16: NOTIFICATION INTELLIGENCE COMPREHENSIVE SUITE   ");
  console.log("============================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(message);
    }
    console.log(`  ✓ Passed: ${message}`);
    passedTests++;
  }

  const usersColl = await getUsersCollection();
  const oppsColl = await getOpportunitiesCollection();
  const notifsColl = await getNotificationsCollection();

  // Clean test notifications from any previous test runs
  const testUserId = "test_user_phase16";
  await notifsColl.deleteMany({ userId: testUserId });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1: Default Preferences & Preference Merging
  // ───────────────────────────────────────────────────────────────────────────
  console.log("Test 1: Preference Defaults & Merging");
  {
    const emptyUser = { _id: testUserId };
    const prefs = NotificationEngine.getEffectivePreferences(emptyUser);

    assert(prefs.highMatch === true, "Default highMatch is true");
    assert(prefs.savedDeadlines === true, "Default savedDeadlines is true");
    assert(prefs.minMatchScore === 80, "Default minMatchScore is 80");
    assert(prefs.quietHours.enabled === true, "Default quietHours is enabled");
    assert(prefs.quietHours.start === "22:00", "Default quietHours starts at 22:00");
    assert(prefs.quietHours.end === "08:00", "Default quietHours ends at 08:00");
    assert(prefs.quietHours.allowUrgent === true, "Default quietHours allows urgent alerts");
    assert(prefs.timezone === "Asia/Kolkata", "Default timezone is Asia/Kolkata");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2: Quiet Hours & Timezone Evaluation
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 2: Quiet Hours & Timezone Handling");
  {
    const qhOvernight = { enabled: true, start: "22:00", end: "08:00", allowUrgent: true };

    // Reference dates for testing
    // 2026-10-13 23:30 in Asia/Kolkata (IST is UTC+5:30 -> UTC 18:00)
    const nightIst = new Date("2026-10-13T18:00:00.000Z");
    assert(
      isQuietHourActive(qhOvernight, "Asia/Kolkata", nightIst) === true,
      "23:30 IST is correctly detected as quiet hours"
    );

    // 2026-10-13 14:00 in Asia/Kolkata (UTC 08:30)
    const dayIst = new Date("2026-10-13T08:30:00.000Z");
    assert(
      isQuietHourActive(qhOvernight, "Asia/Kolkata", dayIst) === false,
      "14:00 IST is outside quiet hours"
    );

    // Same moment in America/New_York (UTC 18:00 is 14:00 EDT)
    assert(
      isQuietHourActive(qhOvernight, "America/New_York", nightIst) === false,
      "America/New_York at UTC 18:00 (14:00 EDT) is not in quiet hours"
    );

    // 2026-10-13 03:00 EDT (UTC 07:00) in America/New_York
    const nightNyc = new Date("2026-10-13T07:00:00.000Z");
    assert(
      isQuietHourActive(qhOvernight, "America/New_York", nightNyc) === true,
      "America/New_York at UTC 07:00 (03:00 EDT) is in quiet hours"
    );

    // Daytime quiet hours range (13:00 -> 15:00)
    const qhDaytime = { enabled: true, start: "13:00", end: "15:00", allowUrgent: false };
    assert(
      isQuietHourActive(qhDaytime, "Asia/Kolkata", dayIst) === true,
      "14:00 IST is within 13:00-15:00 daytime quiet hours"
    );

    // Disabled quiet hours
    const qhDisabled = { enabled: false, start: "22:00", end: "08:00" };
    assert(
      isQuietHourActive(qhDisabled, "Asia/Kolkata", nightIst) === false,
      "Disabled quiet hours returns false"
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3: Snooze Calculations
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 3: Snooze Calculation Logic");
  {
    const before24 = Date.now() + 24 * 60 * 60 * 1000;
    const snooze24 = calculateSnoozeTimestamp({ hours: 24 });
    const diff24 = Math.abs(new Date(snooze24).getTime() - before24);
    assert(diff24 < 1000, "Snooze 24 hours computes exactly +24h");

    const before3d = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const snooze3d = calculateSnoozeTimestamp({ days: 3 });
    const diff3d = Math.abs(new Date(snooze3d).getTime() - before3d);
    assert(diff3d < 1000, "Snooze 3 days computes exactly +3d");

    const futureIso = new Date(Date.now() + 5000000).toISOString();
    const snoozeCustom = calculateSnoozeTimestamp({ until: futureIso });
    assert(snoozeCustom === futureIso, "Custom snooze until timestamp matches input");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 4: Triggers Evaluation with User Data
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nTest 4: Evaluation of All 7 Notification Triggers");
  {
    // Ensure test user exists in database
    await usersColl.deleteOne({ _id: toObjectId(testUserId) });
    await usersColl.deleteOne({ id: testUserId });

    const refDate = new Date("2026-10-13T09:00:00.000Z"); // 14:30 IST (daytime, not quiet hours)

    // Ensure mock opportunities exist
    const testOpps = [
      {
        id: "opp_notif_1",
        title: "Senior AI Researcher Fellowship",
        organization: "DeepMind",
        category: "fellowship",
        work_mode: "remote",
        deadline: new Date(refDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days away (urgent/critical)
        required_skills: ["Python", "PyTorch", "Machine Learning"],
        active: true
      },
      {
        id: "opp_notif_2",
        title: "Google Summer Code Intern",
        organization: "Google",
        category: "internship",
        work_mode: "hybrid",
        deadline: new Date(refDate.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days away (7d window)
        required_skills: ["Java", "Distributed Systems"],
        active: true
      },
      {
        id: "opp_notif_3",
        title: "Open Source Hackathon",
        organization: "TechFest",
        category: "hackathon",
        work_mode: "remote",
        deadline: new Date(refDate.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days away
        required_skills: ["React", "JavaScript"],
        active: true
      }
    ];

    for (const opp of testOpps) {
      await oppsColl.deleteOne({ id: opp.id });
      await oppsColl.insertOne(opp);
    }

    const testUserDoc = {
      _id: toObjectId(testUserId),
      id: testUserId,
      name: "Phase16Tester",
      profile: {
        skills: ["Python", "PyTorch", "Machine Learning"],
        education: { major: "CSE", yearOfStudy: 4 }
      },
      saved: ["opp_notif_1"], // 2 days away -> saved_deadline trigger!
      interested: ["opp_notif_2"], // 6 days away -> interested_deadline trigger!
      applied: [],
      lifecycle: {
        opp_notif_1: {
          stage: "PREPARING", // 2 days away in PREPARING -> deadline_reminder trigger!
          follow_up_date: "2026-10-13T00:00:00.000Z", // due today -> follow_up_reminder trigger!
          notes: "Review fellowship proposal draft"
        }
      },
      deadlineSnapshots: {
        opp_notif_2: "2026-10-10T00:00:00.000Z" // Snapshot differs from opp_notif_2's deadline -> deadline_change trigger!
      },
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        minMatchScore: 70, // opp_notif_1 matches Python/PyTorch/ML -> high_match trigger!
        timezone: "Asia/Kolkata",
        quietHours: { enabled: true, start: "22:00", end: "08:00", allowUrgent: true }
      }
    };

    await usersColl.insertOne(testUserDoc);

    const evalResult = await NotificationEngine.evaluateTriggers(testUserDoc, {
      referenceDate: refDate
    });

    console.log(`  Trigger evaluation generated ${evalResult.count} notifications.`);
    assert(evalResult.count >= 5, `Expected at least 5 notifications generated, got ${evalResult.count}`);

    const generatedTypes = evalResult.created.map(n => n.type);
    console.log("  Generated types:", generatedTypes);

    assert(generatedTypes.includes(NOTIFICATION_TYPES.HIGH_MATCH), "Triggered: high_match");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.SAVED_DEADLINE), "Triggered: saved_deadline");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.INTERESTED_DEADLINE), "Triggered: interested_deadline");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.DEADLINE_REMINDER), "Triggered: deadline_reminder");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.DEADLINE_CHANGE), "Triggered: deadline_change");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.FOLLOW_UP_REMINDER), "Triggered: follow_up_reminder");
    assert(generatedTypes.includes(NOTIFICATION_TYPES.WEEKLY_DIGEST), "Triggered: weekly_digest");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 5: Deduplication Prevention
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\nTest 5: Deduplication Prevention");
    const reEval = await NotificationEngine.evaluateTriggers(testUserDoc, {
      referenceDate: refDate
    });

    assert(reEval.count === 0, `Re-evaluation should create 0 duplicates, got ${reEval.count}`);

    // Check database count
    const totalInDb = await notifsColl.countDocuments({ userId: String(testUserDoc._id) });
    assert(totalInDb === evalResult.count, `Total stored notifications remains ${evalResult.count}`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 6: Quiet Hours Suppression & Urgent Bypass
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\nTest 6: Quiet Hours Suppression & Urgent Bypass");
    {
      const quietTestUserId = "test_user_quiet";
      await notifsColl.deleteMany({ userId: quietTestUserId });

      // Midnight IST: quiet hours active
      const midnightIst = new Date("2026-10-13T19:00:00.000Z");

      const quietUserDoc = {
        _id: toObjectId(quietTestUserId),
        id: quietTestUserId,
        profile: { skills: ["Python"] },
        saved: ["opp_notif_1"], // 2 days away -> Priority: CRITICAL (urgent)
        interested: [],
        applied: [],
        lifecycle: {},
        notificationPreferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          highMatch: false, // Low/Medium non-urgent suppressed
          weeklyDigest: true, // LOW priority -> should be suppressed during quiet hours!
          savedDeadlines: true, // CRITICAL priority -> should bypass because allowUrgent: true!
          timezone: "Asia/Kolkata",
          quietHours: { enabled: true, start: "22:00", end: "08:00", allowUrgent: true }
        }
      };

      const quietEval = await NotificationEngine.evaluateTriggers(quietUserDoc, {
        referenceDate: midnightIst
      });

      const quietTypes = quietEval.created.map(n => n.type);
      assert(
        quietTypes.includes(NOTIFICATION_TYPES.SAVED_DEADLINE),
        "Urgent/Critical saved deadline bypassed quiet hours"
      );
      assert(
        !quietTypes.includes(NOTIFICATION_TYPES.WEEKLY_DIGEST),
        "Non-urgent weekly digest was suppressed during quiet hours"
      );

      await notifsColl.deleteMany({ userId: quietTestUserId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 7: Retrieval, Snoozing, Unsnoozing & Read State Lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\nTest 7: Retrieval, Snoozing & Read Status Lifecycle");
    {
      const initialFetch = await NotificationEngine.getUserNotifications(testUserDoc._id);
      assert(initialFetch.unreadCount > 0, `Initial unread count > 0 (${initialFetch.unreadCount})`);

      const firstNotif = initialFetch.notifications[0];
      assert(firstNotif.read === false, "First notification is unread initially");
      assert(firstNotif.isSnoozed === false, "First notification is not snoozed initially");

      // Snooze the first notification for 24 hours
      await NotificationEngine.snoozeNotification(firstNotif.id, testUserDoc._id, { hours: 24 });

      const afterSnoozeFetch = await NotificationEngine.getUserNotifications(testUserDoc._id);
      const snoozedItem = afterSnoozeFetch.notifications.find(n => n.id === firstNotif.id);

      assert(snoozedItem.isSnoozed === true, "Notification is marked isSnoozed: true");
      assert(
        afterSnoozeFetch.unreadCount === initialFetch.unreadCount - 1,
        "Snoozed notification is excluded from active unreadCount"
      );

      // Unsnooze
      await NotificationEngine.unsnoozeNotification(firstNotif.id, testUserDoc._id);
      const afterUnsnoozeFetch = await NotificationEngine.getUserNotifications(testUserDoc._id);
      const unsnoozedItem = afterUnsnoozeFetch.notifications.find(n => n.id === firstNotif.id);

      assert(unsnoozedItem.isSnoozed === false, "Notification is unsnoozed (isSnoozed: false)");
      assert(
        afterUnsnoozeFetch.unreadCount === initialFetch.unreadCount,
        "Unread count restored after unsnooze"
      );

      // Mark single notification as read
      await NotificationEngine.markAsRead(firstNotif.id, testUserDoc._id);
      const afterSingleReadFetch = await NotificationEngine.getUserNotifications(testUserDoc._id);
      const readItem = afterSingleReadFetch.notifications.find(n => n.id === firstNotif.id);
      assert(readItem.read === true, "Single notification marked as read");
      assert(!!readItem.readAt, "readAt timestamp is recorded");

      // Mark all as read
      await NotificationEngine.markAllAsRead(testUserDoc._id);
      const afterAllReadFetch = await NotificationEngine.getUserNotifications(testUserDoc._id);
      assert(afterAllReadFetch.unreadCount === 0, "markAllAsRead sets unreadCount to 0");
      assert(
        afterAllReadFetch.notifications.every(n => n.read === true),
        "All notifications have read: true"
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 8: Update Preferences Persistence
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\nTest 8: Updating and Persisting Notification Preferences");
    {
      const updatedPrefs = await NotificationEngine.updatePreferences(testUserDoc._id, {
        minMatchScore: 85,
        timezone: "America/New_York",
        quietHours: {
          start: "23:00",
          end: "07:00",
          allowUrgent: false
        },
        followUps: false
      });

      assert(updatedPrefs.minMatchScore === 85, "minMatchScore updated to 85");
      assert(updatedPrefs.timezone === "America/New_York", "timezone updated to America/New_York");
      assert(updatedPrefs.quietHours.start === "23:00", "quietHours start updated to 23:00");
      assert(updatedPrefs.quietHours.end === "07:00", "quietHours end updated to 07:00");
      assert(updatedPrefs.quietHours.allowUrgent === false, "quietHours allowUrgent updated to false");
      assert(updatedPrefs.followUps === false, "followUps updated to false");

      // Verify bounds clamping on minMatchScore
      const clamped = await NotificationEngine.updatePreferences(testUserDoc._id, {
        minMatchScore: 120
      });
      assert(clamped.minMatchScore === 100, "minMatchScore clamped to maximum 100");
    }

    // Clean up test data
    await notifsColl.deleteMany({ userId: String(testUserDoc._id) });
    await usersColl.deleteOne({ _id: toObjectId(testUserId) });
    for (const opp of testOpps) {
      await oppsColl.deleteOne({ id: opp.id });
    }
  }

  console.log("\n============================================================");
  console.log(`   ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions passed!   `);
  console.log("============================================================\n");
}

runNotificationsTestSuite().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
