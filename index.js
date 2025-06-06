const express = require("express");
const socket = require("socket.io");
const app = express();
const webPush = require('web-push');

require('dotenv').config();



const { createClient } = require('@supabase/supabase-js')

// Create a single supabase client for interacting with your database
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);




var path = require("path");
var bodyParser = require('body-parser');
var helmet = require('helmet');
var rateLimit = require("express-rate-limit");

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
      connectSrc: ["'self'", "https://api.weather.gov"],
      imgSrc: ["'self'", "data:", "https://img.icons8.com"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // if needed for inline styles
    },
  })
);

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     next();
// });

const chavans = ["sandeep", "smita", "aarav", "krish"];

app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'landing-page.html'));
});
app.get('/signin', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'signin.html'));
});

app.get('/:name', function(req,res){
  // res.send("Welcome!");

  const name = req.params.name;

  let match = false;
  chavans.forEach((person) => {
    if (name == person.toLowerCase()) {
      match = true;
    }
  });
  if (!match) {
    res.send("Invalid person");
    return;
  }

  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' https://api.weather.gov");
  res.sendFile(path.join(__dirname, 'app', 'pages', 'index.html'));
});




const server = app.listen(process.env.PORT || 3000, () => {
	console.log(`Server running on port: ${process.env.PORT || 3000}`);
});

var io = socket(server);





webPush.setVapidDetails(`mailto:${process.env.PERSONAL_EMAIL}`, process.env.PUBLIC_VAPID_KEY, process.env.PRIVATE_VAPID_KEY);

const users = {};         // { name: socketId }
const subscriptions = {}; // { name: PushSubscription }





app.get('/api/cleanup', async (req, res) => {
  const secretKey = req.query.key;
  if (secretKey !== process.env.CRON_SECRET_KEY) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const deleteTables = ['tasks', 'events', 'cards', 'messages'];

    for (const table of deleteTables) {
      const { error } = await supabase
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



  socket.on('new-event', async(title, time, person, deleteAtEndOfDay) => {
    const { data, error } = await supabase
      .from('events')
      .insert({ title: title, time: time, person: person, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('event-created-successfully', title, data[0].id, time);
    }
  });



  socket.on('new-task', async(task, person, deleteAtEndOfDay) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: task, person: person, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      socket.emit('task-created-successfully', task, data[0].id);
    }
  });



  socket.on('new-card', async(title, description, person, deleteAtEndOfDay) => {
    const { data, error } = await supabase
      .from('cards')
      .insert({ title: title, description: description, person: person, delete_at_day_end: deleteAtEndOfDay })
      .select()

    if (error) {
      console.error(error);
    } else {
      io.emit('update-cards', title, description, person, data[0].id);
    }
  });



  socket.on('request-data-for-person', async(person) => {
    const events = await getEventsForPerson(person);
    const tasks = await getTasksForPerson(person);
    const cards = await getCards();
    socket.emit('data-for-person', events, tasks, cards);
  });



  async function getEventsForPerson(person) {
    const { data, error } = await supabase
      .from('events')
      .select()
      .eq('person', person)

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getTasksForPerson(person) {
    const { data, error } = await supabase
      .from('tasks')
      .select()
      .eq('person', person)

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getCards() {
    const { data, error } = await supabase
      .from('cards')
      .select()

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }



  socket.on('request-family-events', async() => {
    socket.emit('family-events', await getFamilyEvents(), chavans.sort());
  });

  socket.on('request-family-tasks', async() => {
    socket.emit('family-tasks', await getFamilyTasks(), chavans.sort());
  });

  socket.on('request-family-events-and-tasks', async() => {
    socket.emit('family-events-and-tasks', await getFamilyEvents(), await getFamilyTasks(), chavans.sort());
  });

  async function getFamilyEvents() {
    const { data, error } = await supabase
      .from('events')
      .select()

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }


  async function getFamilyTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select()

    if (error) {
      console.error(error);
    } else {
      return data;
    }
  }




  socket.on('request-family-members', () => {
    socket.emit('family-members', chavans.sort());
  });




  // Card Deletion / Edits

  socket.on('delete-card', async (cardId) => {
    const { data, error } = await supabase
      .from('cards')
      .delete()
      .eq('id', cardId)
      .select()

    if (error) {
      console.error(error);
    } else {
      // return data;
      socket.broadcast.emit('card-deletion', cardId);
    }
  });


  socket.on('edit-card', async (cardId, title, description) => {
    const { data, error } = await supabase
      .from('cards')
      .update({ title: title, description: description })
      .eq('id', cardId)
      .select()

    if (error) {
      console.error(error);
    } else {
      // return data;
      socket.broadcast.emit('card-edit-complete', cardId, title, description, data[0].person);
    }
  });








  // Task completion

  socket.on('task-crossed', async(taskId, isComplete) => {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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


  socket.on('register', (name) => {
    console.log(`registered ${name}`);
    users[name] = socket.id;
    console.log(socket.id);
  });

  socket.on('save-subscription', (name, subscription) => {
    console.log(`subscription for ${name} saved`);
    // socket.emit('test', `subscription for ${name} saved`);
    subscriptions[name] = subscription;
    // console.log(subscription);
  });

  socket.on('pingUser', (to, from, title, message) => {
    console.log(`trying to send to ${to} | ${title} --> ${message}`);

    if (to == "all") {
      // socket.emit('client-print', subscriptions);
      chavans.forEach((person) => {
        if (person == from.toLowerCase()) return;
        sendPing(subscriptions[person], to, from, title, message);
      });
    } else {
      const subscription = subscriptions[to];
      sendPing(subscription, to, from, title, message);
    } 
  });



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




  async function sendPing(subscription, to, from, title, message) {
    if (subscription) {
      const formattedTitle = `${from} pinged you: ${title}`; // e.g. "Krish pinged you: Reminder"
      const payload = JSON.stringify({
        title: formattedTitle,
        body: message
      });
      webPush.sendNotification(subscription, payload).catch(console.error);
      console.log(`Noti sent to ${to}`);
      socket.emit('registered-and-sent', to);
      const { data, error } = await supabase
        .from('messages')
        .insert({ to: to, from: from, title: title, message: message })

      if (error) {
        console.error(error);
      } else {
        // return data;
      }
    } else {
      // console.log(`${to} is not registered : ${subscription}`);
      socket.emit('not-registered-for-notis', to);
    }
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
    const { data, error } = await supabase
      .from('messages')
      .select('*')

    if (error) {
      console.error(error);
    } else {
      socket.emit('messages-retrieved', data);
    }
  });



});
