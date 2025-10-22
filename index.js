// index.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

// database setup
const db = new sqlite3.Database("./chaoticvibe.db");
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, username TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

// routes
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "views", "login.html")));
app.get("/signup", (_, res) => res.sendFile(path.join(__dirname, "views", "signup.html")));
app.get("/chat", (req, res) => {
  if (!req.query.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "views", "chat.html"));
});

// signup/login
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users(username,password) VALUES(?,?)", [username, hashed], (err) => {
    if (err) return res.send("User exists. <a href='/signup'>Try again</a>");
    res.redirect("/");
  });
});
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.send("No user. <a href='/'>Back</a>");
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.send("Wrong pass. <a href='/'>Back</a>");
    res.redirect("/chat?user=" + username);
  });
});

// socket logic
const onlineUsers = new Set();

io.on("connection", (socket) => {
  socket.on("join", (username) => {
    socket.username = username;
    onlineUsers.add(username);

    // load last messages
    db.all("SELECT username,text,timestamp FROM messages ORDER BY id DESC LIMIT 40", (err, rows) => {
      socket.emit("loadMessages", rows.reverse());
    });

    io.emit("onlineUsers", Array.from(onlineUsers));
    io.emit("message", { username: "System", text: `${username} joined` });
  });

  socket.on("message", (msg) => {
    if (!socket.username) return;
    db.run("INSERT INTO messages(username,text) VALUES(?,?)", [socket.username, msg]);
    io.emit("message", { username: socket.username, text: msg, timestamp: new Date().toLocaleTimeString() });
  });

  socket.on("typing", (data) => {
    socket.broadcast.emit("typing", data);
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit("onlineUsers", Array.from(onlineUsers));
      io.emit("message", { username: "System", text: `${socket.username} left` });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("ChaoticVibe live on port " + PORT));
