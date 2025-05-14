const express = require("express");
const socket = require("socket.io");
const app = express();

require('dotenv').config();

var path = require("path");
var bodyParser = require('body-parser');
var helmet = require('helmet');
var rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname,'./app')));
app.use(helmet());
app.use(limiter);

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     next();
// });
app.get('/', function(req,res){
  // res.send("Welcome!");
  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' https://api.weather.gov");
  res.sendFile(path.join(__dirname, './app/pages/index.html'));
});




const server = app.listen(process.env.PORT || 3000, () => {
	console.log(`Server running on port: ${process.env.PORT || 3000}`);
});

var io = socket(server);


io.on("connection", function (socket) {

  console.log("New socket connection!");

});
