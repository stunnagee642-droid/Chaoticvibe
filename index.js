// CHAOTICVIBE 2.0 BACKEND
const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();

const PORT = process.env.PORT || 3000;

// ===== DATABASE SETUP =====
const db = new sqlite3.Database("./chaoticvibe.db", (err) => {
  if (err) console.error("DB error:", err.message);
  else console.log("ChaoticVibe DB ready ✅");
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    phone TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ===== APP CONFIG =====
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== ROUTES =====
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));
app.get("/home", (req, res) => res.render("home"));
app.get("/chat", (req, res) => res.render("chat"));

// ===== SIGNUP =====
app.post("/signup", async (req, res) => {
  const { username, password, phone } = req.body;
  if (!username || !password) return res.send("Missing fields");
  const hashed = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users(username, password, phone) VALUES(?,?,?)",
    [username, hashed, phone || ""],
    (err) => {
      if (err) return res.send("Username already taken");
      res.redirect("/login");
    }
  );
});

// ===== LOGIN =====
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err || !row) return res.send("Invalid username");
    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.send("Wrong password");
    res.redirect("/home");
  });
});

// ===== SOCKET.IO CHAT =====
io.on("connection", (socket) => {
  console.log("User connected 🟢");

  socket.on("joinChat", ({ sender, receiver }) => {
    socket.join([sender, receiver].sort().join("_"));
  });

  socket.on("sendMessage", ({ sender, receiver, message }) => {
    if (!message.trim()) return;

    db.run(
      "INSERT INTO messages (sender, receiver, message) VALUES (?, ?, ?)",
      [sender, receiver, message]
    );

    const room = [sender, receiver].sort().join("_");
    io.to(room).emit("receiveMessage", { sender, message, time: new Date().toLocaleTimeString() });
  });

  socket.on("disconnect", () => console.log("User left 🔴"));
});

// ===== START SERVER =====
http.listen(PORT, () => console.log(`ChaoticVibe running on ${PORT}`));
