// index.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files from public/
app.use(express.static(path.join(__dirname, "public")));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// Use simple HTML files in /views
const VIEWS_DIR = path.join(__dirname, "views");

// --- Database (SQLite) ---
const DB_FILE = path.join(__dirname, "chaoticvibe.db");
const db = new sqlite3.Database(DB_FILE);

// Create tables if not exists
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

// --- Routes ---

// Serve login page
app.get("/", (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, "login.html"));
});

// Signup page
app.get("/signup", (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, "signup.html"));
});

// Chat page (after login). Username passed as query ?user=NAME
app.get("/chat", (req, res) => {
  const user = req.query.user;
  if (!user) return res.redirect("/");
  res.sendFile(path.join(VIEWS_DIR, "chat.html"));
});

// Handle signup form
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim().length < 3 || password.length < 4) {
    return res.send("Invalid input. <a href='/signup'>Back</a>");
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users(username, password) VALUES(?, ?)",
      [username.trim(), hashed],
      function (err) {
        if (err) {
          return res.send("Username already exists. <a href='/signup'>Try again</a>");
        }
        // redirect to login after signup
        res.redirect("/");
      }
    );
  } catch (err) {
    console.error(err);
    res.send("Server error. <a href='/signup'>Back</a>");
  }
});

// Handle login form
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.send("Missing fields. <a href='/'>Back</a>");

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err) {
      console.error(err);
      return res.send("Server error. <a href='/'>Back</a>");
    }
    if (!row) return res.send("User not found. <a href='/'>Back</a>");

    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.send("Wrong password. <a href='/'>Back</a>");

    // success -> redirect to chat with username in query
    res.redirect("/chat?user=" + encodeURIComponent(username));
  });
});

// Optional endpoint to fetch last 50 messages (not required, socket will handle load)
app.get("/messages", (req, res) => {
  db.all("SELECT username, text, timestamp FROM messages ORDER BY id DESC LIMIT 50", (err, rows) => {
    if (err) return res.json([]);
    res.json(rows.reverse());
  });
});

// --- Socket.io for live chat ---
io.on("connection", (socket) => {
  // When client joins, they should emit "join" with username
  socket.on("join", (username) => {
    socket.username = username;
    // send last 30 messages
    db.all("SELECT username, text, timestamp FROM messages ORDER BY id DESC LIMIT 30", (err, rows) => {
      if (err) return;
      socket.emit("loadMessages", rows.reverse());
    });
    // optional: broadcast join
    socket.broadcast.emit("message", { username: "System", text: `${username} joined the chat` });
  });

  socket.on("message", (text) => {
    const username = socket.username || "Anonymous";
    const safeText = String(text).substring(0, 2000);
    db.run("INSERT INTO messages(username, text) VALUES(?, ?)", [username, safeText], (err) => {
      if (err) console.error("DB insert error:", err);
    });
    io.emit("message", { username, text: safeText });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      socket.broadcast.emit("message", { username: "System", text: `${socket.username} left the chat` });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ ChaoticVibe listening on port ${PORT}`);
});
