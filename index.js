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
      connectSrc: ["'self'", "https://api.weather.gov", supabaseOrigin, "https://cdn.jsdelivr.net"],
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

  const { error: dbError } = await supabaseAdmin
    .from('card_files')
    .insert({
      card_id: cardId,
      file_name: file.originalname,
      file_path: filePath,
      file_url: urlData.publicUrl,
      uploader_id: user.id,
      family_id: card.family_id
    });

  if (dbError) {
    console.error('DB error:', dbError);
    return res.status(500).json({ error: 'Failed to save file record' });
  }

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
    .select('family_id, display_name')
    .eq('id', user.id)
    .single();

  socket.userId = user.id;
  socket.displayName = (profile && profile.display_name) || user.user_metadata?.full_name || user.email;
  socket.familyId = (profile && profile.family_id) || null;
  socket.userSupabase = scopedClient(token);
  next();
});





webPush.setVapidDetails(`mailto:${process.env.PERSONAL_EMAIL}`, process.env.PUBLIC_VAPID_KEY, process.env.PRIVATE_VAPID_KEY);

const users = {};         // { userId: socketId }
const subscriptions = {}; // { userId: PushSubscription }





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

    console.log("✅ Daily cleanup succeeded");
    res.send('Cleanup successful');
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
    res.status(500).send('Server error during cleanup');
  }
});






io.on("connection", function (socket) {

  console.log("New socket connection!");

  // Scope all real-time broadcasts to the user's family (rooms keyed by family id).
  if (socket.familyId) {
    socket.join(socket.familyId);
  } else {
    // No family yet → secure default: the user can read/write nothing. Tell the
    // client so it can show a friendly "ask to be added" banner.
    socket.emit('no-family');
  }



  socket.on('new-event', async(title, time, deleteAtEndOfDay) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('events')
      .insert({ title: title, time: time, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('event-created-successfully', title, data[0].id, time);
    }
  });



  socket.on('new-task', async(task, deleteAtEndOfDay) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('tasks')
      .insert({ title: task, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('task-created-successfully', task, data[0].id);
    }
  });



  socket.on('new-card', async(title, description, deleteAtEndOfDay) => {
    if (!socket.familyId) return;
    const { data, error } = await socket.userSupabase
      .from('cards')
      .insert({ title: title, description: description, user_id: socket.userId, family_id: socket.familyId, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      io.to(socket.familyId).emit('update-cards', title, description, socket.userId, socket.displayName, data[0].id);
      socket.emit('card-created', data[0].id);
    }
  });



  socket.on('request-data-for-person', async() => {
    const events = await getEventsForPerson(socket.userId);
    const tasks = await getTasksForPerson(socket.userId);
    const cards = await getCards();
    const cardFiles = await getCardFiles(cards ? cards.map(c => c.id) : []);
    socket.emit('data-for-person', events, tasks, cards, cardFiles);
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


  // Same-family member profiles, for the family view + ping dropdown.
  async function getFamilyMembers() {
    if (!socket.familyId) return [];
    const { data, error } = await socket.userSupabase
      .from('profiles')
      .select('id, display_name')
      .eq('family_id', socket.familyId)
      .order('display_name');
    if (error) { console.error(error); return []; }
    return data || [];
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
    return { id: fam.id, name: fam.name, invite_code: fam.invite_code, members: await getFamilyMembers() };
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

  socket.on('create-family', async (name) => {
    if (socket.familyId) { socket.emit('family-error', "You're already in a family."); return; }
    const trimmed = (name || '').trim();
    if (!trimmed) { socket.emit('family-error', 'Please enter a family name.'); return; }

    const code = await generateUniqueInviteCode();
    const { data: fam, error } = await supabaseAdmin
      .from('families')
      .insert({ name: trimmed, invite_code: code })
      .select()
      .single();
    if (error || !fam) { console.error(error); socket.emit('family-error', 'Could not create the family.'); return; }

    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({ family_id: fam.id })
      .eq('id', socket.userId);
    if (pErr) { console.error(pErr); socket.emit('family-error', 'Could not join the new family.'); return; }

    socket.familyId = fam.id;
    socket.join(fam.id);
    socket.emit('family-joined', await getFamilyInfo());
  });

  socket.on('join-family', async (code) => {
    if (socket.familyId) { socket.emit('family-error', "You're already in a family."); return; }
    const c = (code || '').trim().toUpperCase();
    if (!c) { socket.emit('family-error', 'Please enter an invite code.'); return; }

    const { data: fam } = await supabaseAdmin
      .from('families')
      .select('id, name, invite_code')
      .eq('invite_code', c)
      .maybeSingle();
    if (!fam) { socket.emit('family-error', 'No family found with that code.'); return; }

    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({ family_id: fam.id })
      .eq('id', socket.userId);
    if (pErr) { console.error(pErr); socket.emit('family-error', 'Could not join that family.'); return; }

    socket.familyId = fam.id;
    socket.join(fam.id);
    socket.emit('family-joined', await getFamilyInfo());
  });

  socket.on('leave-family', async () => {
    if (!socket.familyId) return;
    const previous = socket.familyId;
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ family_id: null })
      .eq('id', socket.userId);
    if (error) { console.error(error); socket.emit('family-error', 'Could not leave the family.'); return; }

    // Their existing items keep the old family_id and stay with that family;
    // the user simply loses access (RLS) and can create/join another.
    socket.leave(previous);
    socket.familyId = null;
    socket.emit('left-family');
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


  socket.on('edit-card', async (cardId, title, description) => {
    const { data, error } = await socket.userSupabase
      .from('cards')
      .update({ title: title, description: description })
      .eq('id', cardId)
      .select()

    if (error || !data || data.length === 0) {
      if (error) console.error(error);
      return; // RLS blocked (not owner) or not found
    }
    socket.to(socket.familyId).emit('card-edit-complete', cardId, title, description, socket.displayName);
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
    const { data, error } = await socket.userSupabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error) {
      console.error(error);
    } else {
      // return data;
    }
  });







  // Web Push Notifications


  socket.on('register', () => {
    users[socket.userId] = socket.id;
  });

  socket.on('save-subscription', (subscription) => {
    subscriptions[socket.userId] = subscription;
  });

  socket.on('pingUser', async (to, title, message) => {
    if (!socket.familyId) return;
    const from = socket.displayName;

    if (to === 'all') {
      const members = await getFamilyMembers();
      members.forEach((m) => {
        if (m.id === socket.userId) return;
        if (subscriptions[m.id]) sendPing(subscriptions[m.id], from, title, message);
      });
      await recordMessage(null, title, message);   // to_id NULL = family broadcast
      socket.emit('registered-and-sent', 'everyone');
      return;
    }

    // Direct ping — the recipient must be in the caller's family.
    const { data: recipient } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, family_id')
      .eq('id', to)
      .single();

    if (!recipient || recipient.family_id !== socket.familyId) {
      socket.emit('not-registered-for-notis', 'that person');
      return;
    }

    await recordMessage(recipient.id, title, message);

    if (subscriptions[to]) {
      sendPing(subscriptions[to], from, title, message);
      socket.emit('registered-and-sent', recipient.display_name);
    } else {
      socket.emit('not-registered-for-notis', recipient.display_name);
    }
  });

  // Persist a ping as a message row (RLS enforces from_id = caller + same family).
  async function recordMessage(toId, title, message) {
    const { error } = await socket.userSupabase
      .from('messages')
      .insert({ from_id: socket.userId, to_id: toId, family_id: socket.familyId, title: title, message: message });
    if (error) console.error(error);
  }



  // socket.on('pingUser', async (to, title, message) => {
  //   const payload = JSON.stringify({ title, body: message });

  //   const { data, error } = await supabase
  //     .from('subscriptions')
  //     .select('subscription')
  //     .eq('name', to)
  //     .single();

  //   if (error || !data) {
  //     socket.emit('not-registered-for-notis', to);
  //     return;
  //   }

  //   const success = await sendNotification(to, payload);

  //   if (success) {
  //     socket.emit('registered-and-sent', to);
  //   } else {
  //     socket.emit('not-registered-for-notis', to);
  //   }
  // });




  // Push a web-push notification. Message persistence + client acks are handled
  // by the caller (pingUser / recordMessage), so this just fires the notification.
  function sendPing(subscription, from, title, message) {
    if (!subscription) return;
    const payload = JSON.stringify({
      title: `${from} pinged you: ${title}`, // e.g. "Krish Chavan pinged you: Reminder"
      body: message
    });
    webPush.sendNotification(subscription, payload).catch(console.error);
  }


  // sendNotification with error handling

  // async function sendNotification(to, payload) {
  //   const subscription = subscriptions[to]; // in-memory
  //   if (!subscription) {
  //     console.log(`${to} has no subscription`);
  //     return false;
  //   }

  //   try {
  //     await webPush.sendNotification(subscription, payload);
  //     console.log(`✅ Notification sent to ${to}`);
  //     return true;
  //   } catch (err) {
  //     console.error(`❌ Failed to send to ${to}:`, err.statusCode);

  //     // Cleanup for expired or invalid subscription
  //     if (err.statusCode === 410 || err.statusCode === 404) {
  //       console.log(`🧹 Removing invalid subscription for ${to}`);

  //       // Remove from Supabase
  //       await supabase
  //         .from('subscriptions')
  //         .delete()
  //         .eq('name', to);

  //       // Remove from in-memory object
  //       delete subscriptions[to];
  //     }

  //     return false;
  //   }
  // }





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



});
