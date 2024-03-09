var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require("mysql2");
var mysql2 = require("mysql2/promise");
const OpenAI = require("openai");
var cron = require('node-cron');
var secretConfig = require('./secret-config');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var con;
var con2;
if (secretConfig.ENVIRONMENT == "WINDOWS" || secretConfig.ENVIRONMENT == "MACOS") {
  con = mysql.createPool({
    connectionLimit : 90,
    connectTimeout: 1000000,
    host: secretConfig.DB_HOST,
    user: secretConfig.DB_USER,
    password: secretConfig.DB_PASSWORD,
    database: secretConfig.DB_NAME,
    timezone: '+01:00',
    port: 3306,
    dateStrings: true
  });

  con2 = mysql2.createPool({
    connectionLimit : 90,
    connectTimeout: 1000000,
    host: secretConfig.DB_HOST,
    user: secretConfig.DB_USER,
    password: secretConfig.DB_PASSWORD,
    database: secretConfig.DB_NAME,
    timezone: '+01:00',
    port: 3306,
    dateStrings: true
  });
}
else if (secretConfig.ENVIRONMENT == "UBUNTU") {
  con = mysql.createPool({
    connectionLimit : 90,
    connectTimeout: 1000000,
    host: secretConfig.DB_HOST,
    user: secretConfig.DB_USER,
    password: secretConfig.DB_PASSWORD,
    database: secretConfig.DB_NAME,
    socketPath: '/var/run/mysqld/mysqld.sock',
    timezone: '+01:00',
    dateStrings: true
  });

  con2 = mysql2.createPool({
    connectionLimit : 90,
    connectTimeout: 1000000,
    host: secretConfig.DB_HOST,
    user: secretConfig.DB_USER,
    password: secretConfig.DB_PASSWORD,
    database: secretConfig.DB_NAME,
    socketPath: '/var/run/mysqld/mysqld.sock',
    timezone: '+01:00',
    dateStrings: true
  });
}

const configuration = {
  apiKey: secretConfig.OPENAI_API_KEY,
};

const openai = new OpenAI(configuration);
var people = [];
var prompt1;
var prompt2;

async function initBotPrompt() {
  prompt1 = "You are going to pick a random name and a random age for a person. Then, you are going to describe the person's personality and the person's job. You're going to define all sorts of personal information about this person like location, physical looks, hobbies, shopping habits and more.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{"role": "user", "content": prompt1}],
  });

  let person = completion.choices[0].message.content;
  return person;
}

function randomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generatePeople() {
  for (let i = 0; i < randomInt(5, 20); i++) {
    people.push(await initBotPrompt());
    console.log("+1 person");
  }
}

generatePeople();

async function generateDailyPosts() {
  for (var i in people) {
    prompt2 = "You are going to pretend and act as the person above and describe your day in " + new Date().toISOString() + ". You are going to talk about your morning routine, your work, your lunch, your afternoon routine, your dinner, and your evening routine. You are going to tell me about problems you had, things you learned, things you bought, activities you did, and more.";

    console.log(people[i]);
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {"role": "user", "content": prompt1},
        {"role": "assistant", "content": people[i]},
        {"role": "user", "content": prompt2},
      ],
    });

    let post = completion.choices[0].message.content;
    // Save post to database
    con2.query("INSERT INTO posts (answer1, answer2, dt) VALUES (?, ?, ?)", [people[i], post, new Date().toISOString().slice(0, 19).replace('T', ' ')]);
  }
}

cron.schedule('30 18 * * *', () => {
  console.log("Generating daily posts.");
  generateDailyPosts();
});



app.get("/", (req, res) => {
  res.send("Human Simulation");
});

app.get("/posts", (req, res) => {
  con.query("SELECT * FROM posts WHERE DATE(dt) = DATE(NOW())", function (err, result, fields) {
    if (err) throw err;
    res.send(result);
  });

});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
