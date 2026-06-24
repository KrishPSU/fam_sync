'use strict';

const ical = require('node-ical');

// Format a UTC Date as a YYYY-MM-DD string in the given IANA timezone.
function getDateStr(d, tz) {
  try {
    return d.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// Format a UTC Date as "H:MM AM/PM" in the given IANA timezone, matching the
// format manual events use (see formatTimeWithAMPM in new-event-modal.js).
function getTimeStr(d, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d); // e.g. "1:30 PM"
  } catch {
    const h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
  }
}

// Fetch an iCal URL and return events that fall on today's date.
// Handles both single events and recurring events (RRULE).
// Returns an array of { uid, title, time } or throws on network/parse error.
async function fetchTodayEvents(icalUrl) {
  let parsed;
  try {
    parsed = await ical.async.fromURL(icalUrl, { timeout: 10000 });
  } catch (err) {
    throw new Error(`Could not fetch calendar: ${err.message}`);
  }

  // Use a 48-hour UTC window from today's UTC midnight. This wide window is
  // necessary because evening events in negative-offset timezones (e.g. US
  // Eastern 11pm = 3am UTC the next day) would be missed by a 24-hour window.
  // We then filter each event by whether it falls on "today" in its own timezone.
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);

  const results = [];

  for (const key of Object.keys(parsed)) {
    const evt = parsed[key];
    if (evt.type !== 'VEVENT' || !evt.start) continue;

    const isAllDay = !!evt.start.dateOnly;
    // Fall back to UTC for events without a timezone declaration.
    const tz = (evt.start.tz && evt.start.tz !== 'UTC') ? evt.start.tz : 'UTC';

    // "Today" as a date string in the event's own timezone so we compare
    // apples-to-apples regardless of where the server is running.
    const todayStr = getDateStr(new Date(), tz);

    if (evt.rrule) {
      // Recurring event: expand all occurrences in the 48-hour window,
      // then keep only those whose local date matches today.
      const dates = evt.rrule.between(windowStart, windowEnd, true);
      for (const d of dates) {
        if (getDateStr(d, tz) !== todayStr) continue;
        results.push({
          uid: `${evt.uid || key}_${d.getTime()}`,
          title: (evt.summary || 'Untitled').trim(),
          time: isAllDay ? '12:00 AM' : getTimeStr(d, tz),
        });
      }
    } else {
      // Single event: compare its date in its own timezone to today.
      const start = new Date(evt.start);
      if (isNaN(start.getTime())) continue;

      if (isAllDay) {
        // All-day events are stored as UTC midnight of the calendar date;
        // compare the ISO date string directly.
        if (start.toISOString().slice(0, 10) !== todayStr) continue;
        results.push({
          uid: evt.uid || key,
          title: (evt.summary || 'Untitled').trim(),
          time: '12:00 AM',
        });
      } else {
        if (getDateStr(start, tz) !== todayStr) continue;
        results.push({
          uid: evt.uid || key,
          title: (evt.summary || 'Untitled').trim(),
          time: getTimeStr(start, tz),
        });
      }
    }
  }

  return results;
}

// Sync all external calendars for a user. For each calendar we fetch today's
// events, then delete-and-reinsert that calendar's imported events. This avoids
// relying on ON CONFLICT against a partial unique index (which Postgres rejects
// as a conflict target). Returns { count, errors } for diagnostics.
async function syncUserCalendars(userId, familyId, supabaseAdmin) {
  const errors = [];
  let count = 0;

  const { data: calendars, error: calErr } = await supabaseAdmin
    .from('external_calendars')
    .select('id, name, ical_url, default_is_private, default_delete_at_day_end')
    .eq('user_id', userId);

  if (calErr) {
    console.error('[calendar-sync] load calendars error:', calErr.message);
    errors.push(`load calendars: ${calErr.message}`);
    return { count, errors };
  }
  if (!calendars || calendars.length === 0) return { count, errors };

  // User edits/deletions of imported events, keyed by calendar + iCal uid. The
  // sync re-applies these so a re-import doesn't revert the user's changes.
  const ovMap = new Map();
  const { data: overrides } = await supabaseAdmin
    .from('external_event_overrides')
    .select('external_calendar_id, external_id, action, title, time, is_private, delete_at_day_end')
    .eq('user_id', userId);
  if (overrides) {
    for (const o of overrides) ovMap.set(`${o.external_calendar_id}::${o.external_id}`, o);
  }

  for (const cal of calendars) {
    // 1. Fetch today's events FIRST. If this fails, leave existing events in
    //    place (don't wipe the user's view because of a transient fetch error).
    let todayEvents;
    try {
      todayEvents = await fetchTodayEvents(cal.ical_url);
    } catch (err) {
      console.error(`[calendar-sync] fetch "${cal.name}" failed:`, err.message);
      errors.push(`${cal.name}: ${err.message}`);
      continue;
    }

    // 2. Clear out this calendar's previously imported events.
    const { error: delErr } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('user_id', userId)
      .eq('external_calendar_id', cal.id);
    if (delErr) {
      console.error(`[calendar-sync] delete old events for "${cal.name}":`, delErr.message);
      errors.push(`${cal.name} delete: ${delErr.message}`);
    }

    // 3. Insert today's events fresh, applying any user overrides: skip events
    //    the user deleted, and re-apply edits instead of the source values.
    //    Events without an override use this calendar's defaults.
    const calPrivate = cal.default_is_private != null ? cal.default_is_private : true;
    const calDelete = cal.default_delete_at_day_end != null ? cal.default_delete_at_day_end : false;
    const rows = [];
    for (const evt of todayEvents) {
      const ov = ovMap.get(`${cal.id}::${evt.uid}`);
      if (ov && ov.action === 'delete') continue; // user removed this event
      const edited = ov && ov.action === 'edit';
      rows.push({
        title: edited && ov.title != null ? ov.title : evt.title,
        time: edited && ov.time != null ? ov.time : evt.time,
        user_id: userId,
        family_id: familyId,
        is_private: edited && ov.is_private != null ? ov.is_private : calPrivate,
        delete_at_day_end: edited && ov.delete_at_day_end != null ? ov.delete_at_day_end : calDelete,
        external_id: evt.uid,
        external_calendar_id: cal.id,
      });
    }
    if (rows.length > 0) {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from('events')
        .insert(rows)
        .select('id');
      if (insErr) {
        console.error(`[calendar-sync] insert events for "${cal.name}":`, insErr.message);
        errors.push(`${cal.name} insert: ${insErr.message}`);
      } else {
        count += (ins ? ins.length : 0);
      }
    }

    await supabaseAdmin
      .from('external_calendars')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', cal.id);
  }

  console.log(`[calendar-sync] user ${userId}: imported ${count} event(s), ${errors.length} error(s)`);
  return { count, errors };
}

module.exports = { fetchTodayEvents, syncUserCalendars };
