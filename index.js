// index.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Config ---
const PORT = process.env.PORT || 3000;
const VIEWS_DIR = path.join(__dirname, "views");
const PUBLIC_DIR = path.join(__dirname, "public");

// --- Middlewares ---
app.use(express.static(PUBLIC_DIR));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("views", VIEWS_DIR);
app.set("view engine", "ejs");

// session (simple memory store; fine for small / dev; for prod consider a persistent store)
app.use(session({
  secret: process.env.SESSION_SECRET || "chaoticvibe-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// --- Database (auto-create) ---
const DB_FILE = path.join(__dirname, "chaoticvibe.db");
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT,
    phone TEXT UNIQUE,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    convo_id TEXT,
    from_phone TEXT,
    to_phone TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// --- Helpers ---
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/");
}

function convoId(a, b) {
  // deterministic convo id for two phones (sorted)
  const [x, y] = [a, b].sort();
  return `${x}_${y}`;
}

// --- Routes ---
// Landing / login page
app.get("/", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/home");
  res.render("login");
});

// Signup page
app.get("/signup", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/home");
  res.render("signup");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Handle signup
app.post("/signup", async (req, res) => {
  const { fullname, phone, password } = req.body;
  if (!fullname || !phone || !password) return res.send("All fields required. <a href='/signup'>Back</a>");
  const cleanedPhone = phone.trim();
  if (password.length < 4) return res.send("Password too short. <a href='/signup'>Back</a>");
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users(fullname, phone, password) VALUES(?,?,?)", [fullname.trim(), cleanedPhone, hashed], function(err) {
      if (err) return res.send("Phone already registered. <a href='/signup'>Try again</a>");
      // auto-login after signup:
      req.session.user = { fullname: fullname.trim(), phone: cleanedPhone };
      res.redirect("/home");
    });
  } catch (e) {
    console.error(e);
    res.send("Server error. <a href='/signup'>Back</a>");
  }
});

// Handle login
app.post("/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.send("Missing fields. <a href='/'>Back</a>");
  db.get("SELECT * FROM users WHERE phone = ?", [phone.trim()], async (err, row) => {
    if (err) { console.error(err); return res.send("Server error. <a href='/'>Back</a>"); }
    if (!row) return res.send("User not found. <a href='/'>Back</a>");
    const ok = await bcrypt.compare(password, row.password);
    if (!ok) return res.send("Wrong password. <a href='/'>Back</a>");
    req.session.user = { fullname: row.fullname, phone: row.phone };
    res.redirect("/home");
  });
});

// Home page - shows chats & contacts
app.get("/home", requireAuth, (req, res) => {
  const me = req.session.user;
  // Get other users and last message for preview
  db.all("SELECT phone, fullname FROM users WHERE phone != ? ORDER BY fullname COLLATE NOCASE", [me.phone], (err, rows) => {
    if (err) { console.error(err); rows = []; }
    // For each user, fetch last message between me and them
    const users = rows;
    const tasks = users.map(u => {
      return new Promise((resolve) => {
        const cid = convoId(me.phone, u.phone);
        db.get("SELECT text, timestamp FROM messages WHERE convo_id = ? ORDER BY id DESC LIMIT 1", [cid], (e, mrow) => {
          resolve({
            phone: u.phone,
            fullname: u.fullname,
            last: mrow ? mrow.text : "",
            lastTime: mrow ? mrow.timestamp : null
          });
        });
      });
    });
    Promise.all(tasks).then(list => {
      res.render("home", { me, contacts: list });
    });
  });
});

// Individual chat page (private)
app.get("/chat/:other", requireAuth, (req, res) => {
  const me = req.session.user;
  const otherPhone = req.params.other;
  if (!otherPhone) return res.redirect("/home");
  // Ensure other exists
  db.get("SELECT fullname, phone FROM users WHERE phone = ?", [otherPhone], (err, row) => {
    if (err || !row) return res.send("User not found. <a href='/home'>Back</a>");
    const cid = convoId(me.phone, row.phone);
    // load last 100 messages
    db.all("SELECT from_phone, to_phone, text, timestamp FROM messages WHERE convo_id = ? ORDER BY id ASC LIMIT 1000", [cid], (e, rows) => {
      const msgs = rows || [];
      res.render("chat", { me, other: row, messages: msgs, convoId: cid });
    });
  });
});

// API: fetch online users (optional)
app.get("/api/online", (req, res) => {
  res.json(Array.from(onlineSet));
});

// --- Socket.io logic ---
// keep track of online phones
const onlineSet = new Set();

// mapping socket.id -> phone to handle disconnect
const socketPhone = new Map();

io.on("connection", (socket) => {
  // client should emit "auth" with { phone } after connecting
  socket.on("auth", (data) => {
    const phone = data && data.phone;
    if (!phone) return;
    socketPhone.set(socket.id, phone);
    onlineSet.add(phone);
    io.emit("onlineUsers", Array.from(onlineSet));
  });

  // join a convo room
  socket.on("joinRoom", (data) => {
    // data = { convoId, phone }
    if (!data || !data.convoId || !data.phone) return;
    socket.join(data.convoId);
    // (optionally) broadcast presence in this convo
  });

  // typing indicator broadcast to room
  socket.on("typing", (data) => {
    // data = { convoId, phone }
    if (!data || !data.convoId) return;
    socket.to(data.convoId).emit("typing", { phone: data.phone });
  });

  // message send
  socket.on("sendMessage", (data) => {
    // data = { convoId, from_phone, to_phone, text }
    if (!data || !data.convoId || !data.from_phone || !data.to_phone || !data.text) return;
    const text = String(data.text).substring(0, 2000);
    db.run("INSERT INTO messages(convo_id, from_phone, to_phone, text) VALUES(?,?,?,?)", [data.convoId, data.from_phone, data.to_phone, text], function(err) {
      if (err) { console.error("DB insert error", err); return; }
      const msg = {
        from_phone: data.from_phone,
        to_phone: data.to_phone,
        text,
        timestamp: new Date().toISOString()
      };
      // emit to room
      io.to(data.convoId).emit("message", msg);
    });
  });

  socket.on("disconnect", () => {
    const phone = socketPhone.get(socket.id);
    socketPhone.delete(socket.id);
    if (phone) {
      // check if any other socket has same phone - naive approach: remove anyway => for small usage ok
      onlineSet.delete(phone);
      io.emit("onlineUsers", Array.from(onlineSet));
    }
  });
});

// Start server
server.listen(PORT, () => console.log(`ChaoticVibe listening on port ${PORT}`));
