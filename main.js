"use strict";
const express       = require("express");
const bodyParser    = require("body-parser");
const mongodb       = require("mongodb");
const ObjectID      = mongodb.ObjectID;
const passport      = require("passport");
const Strategy      = require("passport-local").Strategy;
const session       = require('express-session');
const bcrypt        = require("bcrypt");

/* Exports */
const reports = require('./routes/safety_cards');
const auth    = require('./routes/auth');
const users   = require('./routes/users');
const radar   = require('./routes/radar');

/* For letting database turn on first. Then, server will start */
const EventEmitter = require('events');
class MyEmitter extends EventEmitter {}
const dbEmitter = new MyEmitter();

/* For environment variable */
require('dotenv').config();

/* FIRE THE APP */
const app = express();

/* Allow CORS */
app.use(require('./config/cors'));
app.engine('html', require('ejs').renderFile);

/*    Middlewares   */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(express.static(__dirname + "/public"));
app.use(require('cookie-parser')());
app.use(session({
    secret: "XhJOwU2yBkHdYAMNvkA2",
    resave: false,
    saveUninitialized: false,
    cookie: { /*secure: true requires https*/ }
}));
app.use(passport.initialize());
app.use(passport.session());

/*   DB connection  */
const mongodb_uri = process.env.MONGODB_URI;
let db;

/* Passport */
passport.use(new Strategy({
        usernameField: 'Email',
        passwordField: 'Password',
        passReqToCallback: true,
        session: false
    },
    function(req, email, pass, done) {
      db.collection("users")
        .findOne({ Email: email }, function(err,user) {
          if (err) { return done(err); }
          if (!user) { return done(null,false); }
          bcrypt.compare(pass, user.Password, function(err, same) {
              if (err) {
                return done(err);
              }
              if (same) {
                return done(null, user);
              }
              return done(null, false);
          });
      });
    }
));

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  db.collection("users")
    .findOne({ _id : ObjectID(id) },
      function (err, user) {
        if (err) {
          return cb(err);
        }
        done(null, user);
      });
});

/* Connect to the database before starting the application server */
mongodb.MongoClient.connect(mongodb_uri, (err, database) => {
    if (err) {
        console.log(err);
        process.exit(1);
    }

    // Save database object from the callback for reuse.
    db = database;
    console.log("Database connection ready");

    /* Slap server on a face to wake it up */
    dbEmitter.emit("dbready");
});

/* Use database throughout all routes*/
app.all('*', (req, res, next) => {
    req.db = db;
    next();
});

// Add user locals
app.use(function(req,res,next) {
  res.locals.user = req.user;
  next();
});

/* Server wakes up after "dbready" event is emitted from his db-friend Mongo */
dbEmitter.once("dbready", () => {
    const server = app.listen(process.env.PORT || 8080, () => {
        const port = server.address().port;
        console.log("App now running on port", port);
    });
});

/* -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- */

/* Route helpers */
function checkAuthentication(req, res, next) {
  if(req.isAuthenticated()){
      //if user is looged in, req.isAuthenticated() will return true
    next();
  }
  else {
    res.redirect('/api/auth/login');
  }
}

/* -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- */

/*   Routes!   */
app.get('/', (req, res) => {
  res.redirect("/about");
});

app.get('/submit', checkAuthentication, (req, res) => {
  res.render('submit.html');
});

/* Misc Views */
app.get("/about",function(req,res) {
  res.render("about.html");
});

/* Reports */
app.get('/api/reports', checkAuthentication, reports.get_safetycard_all);
app.get('/api/reports/:id', checkAuthentication, reports.get_safetycard_one);

/* Submit forms*/
app.get('/api/submit', checkAuthentication, reports.get_submit_form);
app.post('/api/submit', checkAuthentication, reports.post_safetycard);

/* Authentication */
app.get('/api/auth/register', auth.get_register);
app.post('/api/auth/register', auth.post_register);
app.get('/api/auth/login', auth.get_login);
app.get('/api/auth/logout', auth.logout);
app.post('/api/auth/login',
    passport.authenticate('local', { successRedirect: '/',failWithError: true }),
    function(err, req, res, next) {
      res.render("login.html", { msg: "Incorrect email/password." });
    }
);

/* User info */
app.get('/api/user/details', checkAuthentication, users.get_user_details);


/* Safety radar */
app.get('/api/radar', checkAuthentication, radar.get_active_hazards);
app.get('/api/radar/local', checkAuthentication, radar.get_local_hazard);
app.post('/api/radar', checkAuthentication, radar.post_ongoing_hazard);
app.put('/api/radar/:id', checkAuthentication, radar.deactive_ongoing_hazard);
