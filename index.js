const express = require("express");
const socket = require("socket.io");
const app = express();
const webPush = require('web-push');
const multer = require('multer');

require('dotenv').config();

const supabaseOrigin = (() => {
  try { return new URL(process.env.SUPABASE_URL).origin; } catch { return ''; }
})();

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { registerAiHandlers } = require('./ai');
const { indexCardFile } = require('./file-indexer');
const { fetchTodayEvents, syncUserCalendars } = require('./calendar-sync');

// Verify a Supabase JWT and return the auth user (or null). Uses the admin
// client so the signature is validated server-side without anon rate limits.
async function verifyToken(token) {
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

// A Supabase client scoped to one user's JWT. All user-context queries go
// through this so RLS policies are enforced (never use supabaseAdmin for those).
function scopedClient(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}




var path = require("path");
var bodyParser = require('body-parser');
var helmet = require('helmet');
var rateLimit = require("express-rate-limit");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname,'app')));
// app.use('/css', express.static(path.join(__dirname, 'app/css')));
// app.use('/js', express.static(path.join(__dirname, 'app/js')));
app.use(helmet());
app.use(limiter);

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.weather.gov", "https://geocoding.geo.census.gov", supabaseOrigin, "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https://img.icons8.com", supabaseOrigin, "https://*.googleusercontent.com"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: [supabaseOrigin],
    },
  })
);

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     next();
// });

app.post('/api/upload-card-file', upload.single('file'), async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { cardId } = req.body;
  const file = req.file;

  if (!file || !cardId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Only the card's owner may attach files to it.
  const { data: card } = await supabaseAdmin
    .from('cards')
    .select('user_id, family_id')
    .eq('id', cardId)
    .single();

  if (!card || card.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ext = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${user.id}/${cardId}/${Date.now()}_${baseName}${ext}`;

  const { error: storageError } = await supabaseAdmin.storage
    .from('card-attachments')
    .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

  if (storageError) {
    console.error('Storage error:', storageError);
    return res.status(500).json({ error: 'Upload failed' });
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('card-attachments')
    .getPublicUrl(filePath);

  const { data: fileRow, error: dbError } = await supabaseAdmin
    .from('card_files')
    .insert({
      card_id: cardId,
      file_name: file.originalname,
      file_path: filePath,
      file_url: urlData.publicUrl,
      uploader_id: user.id,
      family_id: card.family_id
    })
    .select()
    .single();

  if (dbError) {
    console.error('DB error:', dbError);
    return res.status(500).json({ error: 'Failed to save file record' });
  }

  // Index the file's text for the AI assistant in the background — don't block
  // (or fail) the upload response on extraction. Errors are recorded on the
  // document row by the indexer itself.
  indexCardFile(supabaseAdmin, fileRow).catch(() => {});

  res.json({ success: true, url: urlData.publicUrl, fileName: file.originalname });
});



app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'landing-page.html'));
});
app.get('/signin', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'signin.html'));
});

// Public client config — the anon/publishable key is safe to expose. Keeps the
// .env file as the single source of truth for the browser's Supabase client.
app.get('/env.js', function(req, res){
  res.type('application/javascript');
  res.send(
    `window.__ENV = ` + JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_KEY
    }) + `;`
  );
});

// The app shell. Identity is always taken from the JWT, never this URL param —
// the uuid here is cosmetic. A malformed uuid just bounces to sign-in.
app.get('/app/:uuid', function(req, res){
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(req.params.uuid)) {
    return res.redirect('/signin');
  }
  res.sendFile(path.join(__dirname, 'app', 'pages', 'index.html'));
});




const server = app.listen(process.env.PORT || 3000, () => {
	console.log(`Server running on port: ${process.env.PORT || 3000}`);
});

var io = socket(server);

// Authenticate every socket at the handshake. Attaches the verified identity,
// family, and a JWT-scoped Supabase client (so RLS applies to every query).
io.use(async (socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const user = await verifyToken(token);
  if (!user) return next(new Error('Authentication failed'));

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('family_id, display_name, email, avatar_url, default_is_private, default_delete_at_day_end, default_landing_tab, weather_zip')
    .eq('id', user.id)
    .single();

  socket.userId = user.id;
  socket.displayName = (profile && profile.display_name) || user.user_metadata?.full_name || user.email;
  socket.familyId = (profile && profile.family_id) || null;
  socket.userSupabase = scopedClient(token);
  socket.userSettings = {
    email: (profile && profile.email) || user.email || '',
    avatar_url: (profile && profile.avatar_url) || user.user_metadata?.avatar_url || '',
    default_is_private: !!(profile && profile.default_is_private),
    default_delete_at_day_end: profile ? !!profile.default_delete_at_day_end : true,
    default_landing_tab: (profile && profile.default_landing_tab) || 'today',
    weather_zip: (profile && profile.weather_zip) || null,
  };
  next();
});





webPush.setVapidDetails(`mailto:${process.env.PERSONAL_EMAIL}`, process.env.PUBLIC_VAPID_KEY, process.env.PRIVATE_VAPID_KEY);





app.get('/api/cleanup', async (req, res) => {
  const secretKey = req.query.key;
  if (secretKey !== process.env.CRON_SECRET_KEY) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const deleteTables = ['tasks', 'events', 'cards', 'messages'];

    for (const table of deleteTables) {
      // Admin client bypasses RLS — this is a trusted cron gated by CRON_SECRET_KEY.
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('delete_at_day_end', true); // UUID-safe

      if (error) {
        console.error(`❌ Error deleting ${table}:`, error.message);
        return res.status(500).send(`Error deleting ${table}`);
      }
    }

    // Purge stale calendar-event overrides. They're keyed by the iCal uid
    // (occurrence-specific for recurring events), so once their day has passed
    // they no longer match anything and are just dead rows.
    {
      const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('external_event_overrides')
        .delete()
        .lt('created_at', cutoff);
      if (error) console.error('❌ Error purging external_event_overrides:', error.message);
    }

    console.log("✅ Daily cleanup succeeded");

    // Sync external calendars for all users so next-day events are ready.
    try {
      const { data: calendars } = await supabaseAdmin
        .from('external_calendars')
        .select('user_id, external_calendars(id)');

      const { data: allUsers } = await supabaseAdmin
        .from('external_calendars')
        .select('user_id, profiles!user_id(family_id)')
        .eq('profiles.family_id', null); // fallback handled inside syncUserCalendars

      // Distinct user+family pairs across all external_calendars rows
      const { data: userRows } = await supabaseAdmin
        .from('external_calendars')
        .select('user_id, profiles!inner(family_id)');

      if (userRows) {
        const seen = new Set();
        for (const row of userRows) {
          const uid = row.user_id;
          if (seen.has(uid)) continue;
          seen.add(uid);
          const fid = row.profiles?.family_id;
          syncUserCalendars(uid, fid, supabaseAdmin).catch(err =>
            console.error(`[calendar-sync] cleanup sync error for ${uid}:`, err.message)
          );
        }
      }
    } catch (calErr) {
      console.error('[calendar-sync] cleanup sync setup error:', calErr.message);
    }

    res.send('Cleanup successful');
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
    res.status(500).send('Server error during cleanup');
  }
});






// Parse a stored "h:mm AM/PM" event time into minutes since midnight, or null
// if it can't be parsed. Used to detect events whose time has already passed.
function eventTimeToMinutes(timeStr) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(timeStr || '').trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}


io.on("connection", function (socket) {

  console.log("New socket connection!");

  // Read-only AI assistant events (ai:ask → ai:answer / ai:error).
  registerAiHandlers(io, socket);

  // A private room per user, so a ping can be pushed to that specific person's
  // open tabs in real time (e.g. the "you missed a ping" in-app nudge).
  socket.join('user:' + socket.userId);

  // Scope all real-time broadcasts to the user's family (rooms keyed by family id).
  if (socket.familyId) {
    socket.join(socket.familyId);
    socket.emit('in-family');
  } else {
    // No family yet → secure default: the user can read/write nothing. Tell the
    // client so it can show a friendly "ask to be added" banner.
    socket.emit('no-family');
  }

  // Send persisted user preferences to the client on every connect.
  socket.emit('user-settings', socket.userSettings);

  // On (re)connect, surface any direct pings that never reached this user as a
  // push notification and that they haven't dismissed yet. Drives the in-app
  // banner so they know to enable notifications.
  (async () => {
    const { count, error } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_id', socket.userId)
      .eq('delivered_push', false)
      .eq('push_miss_ack', false);
    if (!error && count > 0) socket.emit('push-miss-nudge', { count });
  })();



  socket.on('new-event', async(title, time, endTime, deleteAtEndOfDay, isPrivate) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('events')
      .insert({ title: title, time: time, end_time: endTime || null, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay, is_private: !!isPrivate })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('event-created-successfully', title, data[0].id, time, data[0].is_private, data[0].delete_at_day_end, data[0].end_time);
    }
  });



  socket.on('new-task', async(task, deleteAtEndOfDay, isPrivate) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .insert({ title: task, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay, is_private: !!isPrivate })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('task-created-successfully', task, data[0].id, data[0].is_private, data[0].delete_at_day_end);
    }
  });



  socket.on('new-card', async(title, description, deleteAtEndOfDay, isPrivate) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('cards')
      .insert({ title: title, description: description, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay, is_private: !!isPrivate })
      .select()

    if (error) {
      console.error(error);
    } else {
      if (isPrivate) {
        socket.emit('update-cards', title, description, socket.userId, socket.displayName, data[0].id, true, !!deleteAtEndOfDay);
      } else {
        io.to(socket.familyId).emit('update-cards', title, description, socket.userId, socket.displayName, data[0].id, false, !!deleteAtEndOfDay);
      }
      socket.emit('card-created', data[0].id);
    }
  });



  // Read the caller's Today data and push it to the client.
  async function emitPersonData() {
    const events = await getEventsForPerson(socket.userId);
    const tasks = await getTasksForPerson(socket.userId);
    const cards = await getCards();
    const cardFiles = await getCardFiles(cards ? cards.map(c => c.id) : []);
    socket.emit('data-for-person', events, tasks, cards, cardFiles);
  }

  // Delete the caller's events whose time has already passed (relative to the
  // client-supplied local time-of-day). Imported events are also tombstoned so
  // the calendar re-sync won't bring them back for the rest of the day.
  async function deleteExpiredOwnEvents(nowMinutes) {
    if (typeof nowMinutes !== 'number' || !Number.isFinite(nowMinutes)) return;
    const { data: evs, error } = await socket.userSupabase
      .from('events')
      .select('id, time, end_time, external_id, external_calendar_id')
      .eq('user_id', socket.userId);
    if (error || !evs || !evs.length) return;

    const expired = evs.filter(e => {
      const startM = eventTimeToMinutes(e.time);
      const endM = eventTimeToMinutes(e.end_time);
      // Prefer the end time: an event lives until it ends. A midnight end
      // (12:00 AM) means "end of day", and an end earlier than the start means
      // the event runs past midnight — either way it isn't expired today.
      if (endM != null) {
        const effEnd = endM === 0 ? 24 * 60 : endM; // midnight = end of day
        if (startM != null && effEnd < startM) return false; // crosses midnight
        return effEnd < nowMinutes;
      }
      // No end time: fall back to expiring once the start has passed.
      return startM != null && startM > 0 && startM < nowMinutes;
    });
    if (!expired.length) return;

    await socket.userSupabase.from('events').delete().in('id', expired.map(e => e.id));

    const tombstones = expired
      .filter(e => e.external_id && e.external_calendar_id)
      .map(e => ({
        user_id: socket.userId,
        external_calendar_id: e.external_calendar_id,
        external_id: e.external_id,
        action: 'delete',
      }));
    if (tombstones.length) {
      await socket.userSupabase
        .from('external_event_overrides')
        .upsert(tombstones, { onConflict: 'user_id,external_calendar_id,external_id' });
    }
  }

  socket.on('request-data-for-person', async(nowMinutes) => {
    // Drop already-passed events, then paint with whatever's still current.
    await deleteExpiredOwnEvents(nowMinutes);
    await emitPersonData();

    // Then sync external calendars and re-emit so freshly imported events show.
    // We AWAIT here (not fire-and-forget) so the second read happens strictly
    // after the sync's delete+insert completes — otherwise the read races the
    // sync and returns events mid-rewrite.
    try {
      const result = await syncUserCalendars(socket.userId, socket.familyId, supabaseAdmin);
      // The sync re-imports today's events from the source, including ones that
      // already passed — drop those again (and tombstone them) before repainting.
      await deleteExpiredOwnEvents(nowMinutes);
      if (result && (result.count > 0 || result.errors.length === 0)) {
        await emitPersonData();
      }
    } catch (err) {
      console.error('[calendar-sync] background sync error:', err.message);
    }
  });



  async function getEventsForPerson(userId) {
    const { data, error } = await socket.userSupabase
      .from('events')
      .select()
      .eq('user_id', userId)

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getTasksForPerson(userId) {
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getCards() {
    const { data, error } = await socket.userSupabase
      .from('cards')
      .select('*, owner:profiles!user_id(display_name)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getCardFiles(cardIds) {
    if (!cardIds || cardIds.length === 0) return [];
    const { data, error } = await socket.userSupabase
      .from('card_files')
      .select()
      .in('card_id', cardIds);
    if (error) { console.error(error); return []; }
    return data || [];
  }


  // Members of the caller's ACTIVE family, for the family view + ping dropdown.
  // Sourced from family_members (not profiles.family_id) so members whose active
  // family points elsewhere are still listed for this family.
  async function getFamilyMembers() {
    if (!socket.familyId) return [];
    const { data, error } = await socket.userSupabase
      .from('family_members')
      .select('profiles(id, display_name)')
      .eq('family_id', socket.familyId)
      .is('left_at', null);          // exclude members who've left this family
    if (error) { console.error(error); return []; }
    return (data || [])
      .map((r) => r.profiles)
      .filter(Boolean)
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
  }

  // Every family the caller belongs to (id + name), for the switcher dropdown.
  async function getMyFamilies() {
    const { data, error } = await socket.userSupabase
      .from('family_members')
      .select('families(id, name)')
      .eq('user_id', socket.userId)    // only THIS user's memberships, not all co-members
      .is('left_at', null)
      .order('joined_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map((r) => r.families).filter(Boolean);
  }



  socket.on('request-family-events', async() => {
    socket.emit('family-events', await getFamilyEvents(), await getFamilyMembers());
  });

  socket.on('request-family-tasks', async() => {
    socket.emit('family-tasks', await getFamilyTasks(), await getFamilyMembers());
  });

  socket.on('request-family-events-and-tasks', async() => {
    socket.emit('family-events-and-tasks', await getFamilyEvents(), await getFamilyTasks(), await getFamilyMembers());
  });

  async function getFamilyEvents() {
    // RLS scopes this to the caller's family automatically.
    const { data, error } = await socket.userSupabase
      .from('events')
      .select()

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getFamilyTasks() {
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .select()

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }




  socket.on('request-family-members', async () => {
    socket.emit('family-members', await getFamilyMembers());
  });




  // ---- Family create / join (Phase B) ----

  // { id, name, invite_code, members } for the caller's current family.
  async function getFamilyInfo() {
    if (!socket.familyId) return null;
    const { data: fam } = await supabaseAdmin
      .from('families')
      .select('id, name, invite_code')
      .eq('id', socket.familyId)
      .single();
    if (!fam) return null;
    return {
      id: fam.id,
      name: fam.name,
      invite_code: fam.invite_code,
      members: await getFamilyMembers(),
      families: await getMyFamilies(),     // all families this user can switch between
      active_family_id: socket.familyId,
    };
  }

  // 6-char code from an unambiguous alphabet (no 0/O/1/I), unique vs existing.
  async function generateUniqueInviteCode() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      const { data } = await supabaseAdmin.from('families').select('id').eq('invite_code', code).maybeSingle();
      if (!data) return code;
    }
    return ('F' + Date.now().toString(36).toUpperCase()).slice(-6);
  }

  socket.on('request-family-info', async () => {
    if (!socket.familyId) { socket.emit('no-family'); return; }
    socket.emit('family-info', await getFamilyInfo());
  });

  // Point the user at `familyId` as their active family: update the profile,
  // swap the realtime room, and update socket state. Caller must have already
  // validated membership. Returns true on success.
  async function setActiveFamily(familyId) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ family_id: familyId })
      .eq('id', socket.userId);
    if (error) { console.error(error); return false; }
    if (socket.familyId) socket.leave(socket.familyId);
    socket.familyId = familyId;
    if (familyId) socket.join(familyId);
    // Don't carry the assistant's conversation across families.
    socket._aiHistory = null;
    return true;
  }

  socket.on('create-family', async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) { socket.emit('family-error', 'Please enter a family name.'); return; }

    const code = await generateUniqueInviteCode();
    const { data: fam, error } = await supabaseAdmin
      .from('families')
      .insert({ name: trimmed, invite_code: code })
      .select()
      .single();
    if (error || !fam) { console.error(error); socket.emit('family-error', 'Could not create the family.'); return; }

    const { error: mErr } = await supabaseAdmin
      .from('family_members')
      .insert({ user_id: socket.userId, family_id: fam.id });
    if (mErr) { console.error(mErr); socket.emit('family-error', 'Could not join the new family.'); return; }

    // Newly created family becomes the active one.
    if (!(await setActiveFamily(fam.id))) { socket.emit('family-error', 'Could not switch to the new family.'); return; }
    socket.emit('family-joined', await getFamilyInfo());
  });

  socket.on('join-family', async (code) => {
    const c = (code || '').trim().toUpperCase();
    if (!c) { socket.emit('family-error', 'Please enter an invite code.'); return; }

    const { data: fam } = await supabaseAdmin
      .from('families')
      .select('id, name, invite_code')
      .eq('invite_code', c)
      .maybeSingle();
    if (!fam) { socket.emit('family-error', 'No family found with that code.'); return; }

    // Idempotent: joining a family you're already in just switches you to it.
    // If you'd previously left, this clears left_at and reconnects your old data.
    const { error: mErr } = await supabaseAdmin
      .from('family_members')
      .upsert(
        { user_id: socket.userId, family_id: fam.id, left_at: null },
        { onConflict: 'user_id,family_id' }
      );
    if (mErr) { console.error(mErr); socket.emit('family-error', 'Could not join that family.'); return; }

    if (!(await setActiveFamily(fam.id))) { socket.emit('family-error', 'Could not switch to that family.'); return; }
    socket.emit('family-joined', await getFamilyInfo());
  });

  // Switch the active family to one the user already belongs to. Drives the
  // family-tab dropdown; the client refetches all data on family-switched.
  socket.on('switch-family', async (familyId) => {
    if (!familyId) return;
    if (familyId === socket.familyId) { socket.emit('family-switched', await getFamilyInfo()); return; }

    const { data: membership } = await supabaseAdmin
      .from('family_members')
      .select('family_id')
      .eq('user_id', socket.userId)
      .eq('family_id', familyId)
      .is('left_at', null)
      .maybeSingle();
    if (!membership) { socket.emit('family-error', "You're not a member of that family."); return; }

    if (!(await setActiveFamily(familyId))) { socket.emit('family-error', 'Could not switch families.'); return; }
    socket.emit('family-switched', await getFamilyInfo());
  });

  socket.on('leave-family', async () => {
    if (!socket.familyId) return;
    const leaving = socket.familyId;

    // Soft leave: keep the membership row but mark it left. Their data stays
    // linked to the family (not deleted), they vanish from the family's member
    // and message lists, and a later rejoin (same user id) clears left_at and
    // reconnects everything.
    const { error } = await supabaseAdmin
      .from('family_members')
      .update({ left_at: new Date().toISOString() })
      .eq('user_id', socket.userId)
      .eq('family_id', leaving)
      .is('left_at', null);
    if (error) { console.error(error); socket.emit('family-error', 'Could not leave the family.'); return; }

    // Fall back to another family they're still an active member of, if any, so
    // they're not stranded with no active family.
    const { data: remaining } = await supabaseAdmin
      .from('family_members')
      .select('family_id')
      .eq('user_id', socket.userId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })
      .limit(1);
    const next = remaining && remaining.length ? remaining[0].family_id : null;

    if (!(await setActiveFamily(next))) { socket.emit('family-error', 'Could not leave the family.'); return; }

    if (next) {
      socket.emit('family-switched', await getFamilyInfo());
    } else {
      socket.emit('left-family');
    }
  });




  // Card Deletion / Edits

  socket.on('delete-card', async (cardId) => {
    // Read file paths first (a family member may read these).
    const { data: files } = await socket.userSupabase
      .from('card_files')
      .select('file_path')
      .eq('card_id', cardId);

    // Delete the card — RLS only permits this if the caller owns it.
    const { data, error } = await socket.userSupabase
      .from('cards')
      .delete()
      .eq('id', cardId)
      .select()

    if (error || !data || data.length === 0) {
      if (error) console.error(error);
      return; // not the owner / not found — leave storage untouched
    }

    // Card row gone (cascade removed card_files); clean up storage objects.
    if (files && files.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('card-attachments')
        .remove(files.map(f => f.file_path));
      if (storageError) console.error('Storage deletion error:', storageError);
    }

    socket.to(socket.familyId).emit('card-deletion', cardId);
  });


  socket.on('edit-card', async (cardId, title, description, isPrivate, deleteAtDayEnd) => {
    const { data, error } = await socket.userSupabase
      .from('cards')
      .update({ title, description, is_private: !!isPrivate, delete_at_day_end: !!deleteAtDayEnd })
      .eq('id', cardId)
      .select()

    if (error || !data || data.length === 0) {
      if (error) console.error(error);
      return; // RLS blocked (not owner) or not found
    }
    socket.to(socket.familyId).emit('card-edit-complete', cardId, title, description, socket.displayName, !!isPrivate, !!deleteAtDayEnd);
  });


  socket.on('update-task', async (taskId, title, isPrivate, deleteAtDayEnd) => {
    const { error } = await socket.userSupabase
      .from('tasks')
      .update({ title, is_private: !!isPrivate, delete_at_day_end: !!deleteAtDayEnd })
      .eq('id', taskId)

    if (error) console.error(error); // RLS blocks non-owners
  });


  socket.on('update-event', async (eventId, title, time, isPrivate, deleteAtDayEnd, endTime) => {
    const { data, error } = await socket.userSupabase
      .from('events')
      .update({ title, time, end_time: endTime || null, is_private: !!isPrivate, delete_at_day_end: !!deleteAtDayEnd })
      .eq('id', eventId)
      .select('external_id, external_calendar_id')

    if (error || !data || data.length === 0) {
      if (error) console.error(error); // RLS blocks non-owners
      return;
    }

    // For imported calendar events, persist the edit so the next sync re-applies
    // it instead of reverting to the source version.
    const ev = data[0];
    if (ev.external_id && ev.external_calendar_id) {
      const { error: ovErr } = await socket.userSupabase
        .from('external_event_overrides')
        .upsert({
          user_id: socket.userId,
          external_calendar_id: ev.external_calendar_id,
          external_id: ev.external_id,
          action: 'edit',
          title, time, end_time: endTime || null, is_private: !!isPrivate, delete_at_day_end: !!deleteAtDayEnd,
        }, { onConflict: 'user_id,external_calendar_id,external_id' });
      if (ovErr) console.error(ovErr);
    }
  });








  // Task completion

  socket.on('task-crossed', async(taskId, isComplete) => {
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .update({ complete: isComplete })
      .eq('id', taskId)

    if (error) {
      console.error(error);
    } else {
      // return data;
    }
  });




  // Task and Event deletion

  socket.on('delete-task', async (taskId) => {
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      console.error(error);
    } else {
      // return data;
    }
  });



  socket.on('delete-event', async (eventId) => {
    // Read the external identity first so we can tombstone an imported event
    // (otherwise the next calendar sync would re-import it).
    const { data: rows } = await socket.userSupabase
      .from('events')
      .select('external_id, external_calendar_id')
      .eq('id', eventId);

    const { error } = await socket.userSupabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error) {
      console.error(error);
      return;
    }

    const ev = rows && rows[0];
    if (ev && ev.external_id && ev.external_calendar_id) {
      const { error: ovErr } = await socket.userSupabase
        .from('external_event_overrides')
        .upsert({
          user_id: socket.userId,
          external_calendar_id: ev.external_calendar_id,
          external_id: ev.external_id,
          action: 'delete',
        }, { onConflict: 'user_id,external_calendar_id,external_id' });
      if (ovErr) console.error(ovErr);
    }
  });







  // Web Push Notifications


  // Persist this device's push subscription (one row per endpoint, so a user
  // can be reached on multiple devices). Upsert keeps it idempotent across
  // reconnects and reclaims an endpoint if it was previously another account's.
  socket.on('save-subscription', async (subscription) => {
    if (!subscription || !subscription.endpoint) return;
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: socket.userId, endpoint: subscription.endpoint, subscription },
        { onConflict: 'endpoint' }
      );
    if (error) console.error(error);
  });

  // All of a user's saved device subscriptions. Admin client: pinging is a
  // cross-user read, gated by the same-family check in pingUser.
  async function getSubscriptions(userId) {
    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .eq('user_id', userId);
    if (error) { console.error(error); return []; }
    return data || [];
  }

  // Push to every device a user has registered. Returns true if at least one
  // device accepted the notification. Prunes dead endpoints (expired/unsub).
  async function pushToUser(userId, from, title, message) {
    const subs = await getSubscriptions(userId);
    const payload = JSON.stringify({
      title: `${from} pinged you: ${title}`, // e.g. "Krish Chavan pinged you: Reminder"
      body: message
    });
    let delivered = false;
    await Promise.all(subs.map(async (row) => {
      try {
        await webPush.sendNotification(row.subscription, payload);
        delivered = true;
      } catch (err) {
        // 404/410 → the subscription is gone for good; drop it so we stop trying.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
        } else {
          console.error(err);
        }
      }
    }));
    return delivered;
  }

  socket.on('pingUser', async (to, title, message) => {
    if (!socket.familyId) return;
    const from = socket.displayName;
    title = (title || '').trim();
    message = (message || '').trim();
    if (!to || !title || !message) return;

    if (to === 'all') {
      const members = await getFamilyMembers();
      await Promise.all(
        members
          .filter((m) => m.id !== socket.userId)
          .map((m) => pushToUser(m.id, from, title, message))
      );
      await recordMessage(null, title, message, true); // to_id NULL = family broadcast
      socket.emit('registered-and-sent', 'everyone');
      return;
    }

    // Direct ping — the recipient must be a member of the caller's active family.
    const { data: recipient } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .eq('id', to)
      .single();

    const { data: membership } = await supabaseAdmin
      .from('family_members')
      .select('user_id')
      .eq('user_id', to)
      .eq('family_id', socket.familyId)
      .is('left_at', null)
      .maybeSingle();

    if (!recipient || !membership) {
      socket.emit('ping-failed', 'that person');
      return;
    }

    const delivered = await pushToUser(recipient.id, from, title, message);
    await recordMessage(recipient.id, title, message, delivered);

    if (delivered) {
      socket.emit('registered-and-sent', recipient.display_name);
    } else {
      // Saved, but no push got through (recipient hasn't enabled notifications).
      // Tell the sender, and nudge the recipient's open tabs in real time.
      socket.emit('ping-sent-no-push', recipient.display_name);
      io.to('user:' + recipient.id).emit('push-miss-nudge', { from, count: 1 });
    }
  });

  // Persist a ping as a message row (RLS enforces from_id = caller + same family).
  // `deliveredPush` records whether it reached the recipient as a notification.
  async function recordMessage(toId, title, message, deliveredPush) {
    const { error } = await socket.userSupabase
      .from('messages')
      .insert({
        from_id: socket.userId,
        to_id: toId,
        family_id: socket.familyId,
        title: title,
        message: message,
        delivered_push: !!deliveredPush
      });
    if (error) console.error(error);
  }

  // Recipient dismissed the in-app "you missed a ping" banner — stop re-showing
  // it for the pings they've now acknowledged.
  socket.on('ack-push-miss', async () => {
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ push_miss_ack: true })
      .eq('to_id', socket.userId)
      .eq('delivered_push', false)
      .eq('push_miss_ack', false);
    if (error) console.error(error);
  });



  socket.on('get-messages', async () => {
    // RLS scopes to the caller's family + messages they're party to.
    const { data, error } = await socket.userSupabase
      .from('messages')
      .select('*, sender:profiles!from_id(display_name), recipient:profiles!to_id(display_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      socket.emit('messages-retrieved', data);
    }
  });



  // ---- User Settings ----

  const SETTINGS_ALLOWED = ['default_is_private', 'default_delete_at_day_end', 'default_landing_tab', 'weather_zip'];

  socket.on('save-user-settings', async (patch) => {
    if (!patch || typeof patch !== 'object') return;
    const safe = {};
    SETTINGS_ALLOWED.forEach(k => { if (k in patch) safe[k] = patch[k]; });
    if (!Object.keys(safe).length) return;
    const { error } = await supabaseAdmin
      .from('profiles')
      .update(safe)
      .eq('id', socket.userId);
    if (error) { console.error(error); return; }
    Object.assign(socket.userSettings, safe);
  });

  socket.on('delete-push-subscription', async (endpoint) => {
    if (!endpoint) return;
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', socket.userId);
    if (error) console.error(error);
    else socket.emit('push-subscription-deleted');
  });



  // ---- External Calendars ----

  async function emitExternalCalendarsList() {
    const { data, error } = await supabaseAdmin
      .from('external_calendars')
      .select('id, name, last_synced_at, created_at, default_is_private, default_delete_at_day_end')
      .eq('user_id', socket.userId)
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return; }
    socket.emit('external-calendars-list', data || []);
  }

  socket.on('get-external-calendars', async () => {
    await emitExternalCalendarsList();
  });

  // Per-calendar defaults for imported events (private / auto-delete at midnight).
  socket.on('update-calendar-defaults', async (calendarId, isPrivate, deleteAtDayEnd) => {
    if (!calendarId) return;
    const { data, error } = await socket.userSupabase
      .from('external_calendars')
      .update({ default_is_private: !!isPrivate, default_delete_at_day_end: !!deleteAtDayEnd })
      .eq('id', calendarId)
      .select('id');
    if (error || !data || data.length === 0) {
      if (error) console.error(error); // RLS blocked (not owner) or not found
      return;
    }
    // Re-sync so the new defaults take effect on already-imported events.
    // Per-event overrides still win (handled inside syncUserCalendars).
    try {
      await syncUserCalendars(socket.userId, socket.familyId, supabaseAdmin);
    } catch (err) {
      console.error('[calendar-sync] defaults re-sync error:', err.message);
    }
    await emitPersonData();
  });

  socket.on('add-external-calendar', async (name, icalUrl) => {
    if (!name || !icalUrl) {
      socket.emit('external-calendar-error', 'Name and URL are required.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(icalUrl)) {
      socket.emit('external-calendar-error', 'URL must start with http:// or https://');
      return;
    }

    // Reject duplicate URLs for the same user (would collide on the unique index).
    const { data: existing } = await supabaseAdmin
      .from('external_calendars')
      .select('id')
      .eq('user_id', socket.userId)
      .eq('ical_url', icalUrl.trim());
    if (existing && existing.length) {
      socket.emit('external-calendar-error', 'That calendar is already connected.');
      return;
    }

    // Test-fetch the URL before saving to catch invalid/inaccessible URLs early.
    try {
      await fetchTodayEvents(icalUrl);
    } catch (err) {
      socket.emit('external-calendar-error', `Could not read calendar: ${err.message}`);
      return;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('external_calendars')
      .insert({ user_id: socket.userId, name: name.trim(), ical_url: icalUrl.trim() })
      .select()
      .single();

    if (insertErr) {
      console.error(insertErr);
      socket.emit('external-calendar-error', 'Could not save calendar. Please try again.');
      return;
    }

    socket.emit('external-calendar-added');

    // Sync immediately so the user sees events right away.
    try {
      const result = await syncUserCalendars(socket.userId, socket.familyId, supabaseAdmin);
      if (result && result.errors && result.errors.length) {
        socket.emit('external-calendar-error', `Connected, but sync had issues: ${result.errors.join('; ')}`);
      } else if (result && result.count === 0) {
        socket.emit('external-calendar-error', 'Connected, but no events were found for today in this calendar.');
      }
    } catch (err) {
      console.error('[calendar-sync] post-add sync error:', err.message);
      socket.emit('external-calendar-error', `Sync failed: ${err.message}`);
    }

    await emitExternalCalendarsList();
    await emitPersonData(); // refresh Today view with newly imported events
  });

  socket.on('remove-external-calendar', async (calendarId) => {
    if (!calendarId) return;

    // Verify ownership before deleting.
    const { data: cal } = await supabaseAdmin
      .from('external_calendars')
      .select('id')
      .eq('id', calendarId)
      .eq('user_id', socket.userId)
      .single();

    if (!cal) {
      socket.emit('external-calendar-error', 'Calendar not found.');
      return;
    }

    // Delete imported events from this calendar.
    await supabaseAdmin
      .from('events')
      .delete()
      .eq('user_id', socket.userId)
      .eq('external_calendar_id', calendarId);

    // Delete the calendar record (also cascades via FK).
    const { error } = await supabaseAdmin
      .from('external_calendars')
      .delete()
      .eq('id', calendarId);

    if (error) { console.error(error); return; }

    await emitExternalCalendarsList();
    await emitPersonData(); // refresh Today view to remove the deleted events
  });

  socket.on('sync-external-calendars', async () => {
    try {
      await syncUserCalendars(socket.userId, socket.familyId, supabaseAdmin);
    } catch (err) {
      console.error('[calendar-sync] manual sync error:', err.message);
    }
    await emitExternalCalendarsList();
    await emitPersonData();
  });



});
