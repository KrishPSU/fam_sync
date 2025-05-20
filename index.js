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

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     next();
// });

const chavans = ["sandeep", "smita", "aarav", "krish"];

app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'signin.html'));
});
app.get('/signin', function(req,res){
  res.sendFile(path.join(__dirname, 'app', 'pages', 'signin.html'));
});

app.get('/:name', function(req,res){
  // res.send("Welcome!");

  const name = req.params.name;
  
  // Don't catch actual static files like /main.js or /favicon.ico
  if (name.includes('.') || name === 'favicon.ico') return next();

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





io.on("connection", function (socket) {

  console.log("New socket connection!");



  socket.on('new-event', async(title, time, person) => {
    const { data, error } = await supabase
      .from('events')
      .insert({ title: title, time: time, person: person })

    if (error) {
      console.error(error);
    }
  });



  socket.on('new-task', async(task, person) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: task, person: person })

    if (error) {
      console.error(error);
    }
  });



  socket.on('new-card', async(title, description, person) => {
    const { data, error } = await supabase
      .from('cards')
      .insert({ title: title, description: description, person: person })

    if (error) {
      console.error(error);
    }
  });



  socket.on('request-data-for-person', async(person) => {
    const events = await getEventsForPerson(person);
    const tasks = await getTasksForPerson(person);
    const cards = await getCardsForPerson(person);
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


  async function getCardsForPerson(person) {
    const { data, error } = await supabase
      .from('cards')
      .select()
      .eq('person', person)

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





  // Web Push Notifications


  socket.on('register', (name) => {
    console.log(`registered ${name}`);
    users[name] = socket.id;
    console.log(socket.id);
  });

  socket.on('save-subscription', (name, subscription) => {
    console.log(`subscription for ${name} saved`);
    subscriptions[name] = subscription;
    console.log(subscription);
  });

  socket.on('pingUser', (to, title, message) => {
    console.log(`trying to send to ${to} | ${title} --> ${message}`);
    const subscription = subscriptions[to];
    if (subscription) {
      const payload = JSON.stringify({ title, body: message });
      webPush.sendNotification(subscription, payload).catch(console.error);
      console.log(`Noti sent to ${to}`);
      socket.emit('registered-and-sent', to);
    } else {
      socket.emit('not-registered-for-notis', to);
    }
  });


});
