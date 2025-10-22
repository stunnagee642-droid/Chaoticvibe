// --- IMPORTS ---
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import pkg from "pg";
const { Pool } = pkg;

// --- CONFIG ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "chaoticvibe-secret",
  resave: false,
  saveUninitialized: true
}));

// --- ROUTES ---
app.get("/", (req, res) => res.redirect("/login"));

// ✅ Your login/signup routes go *after* app is defined:
app.get("/signup", (req, res) => res.sendFile(__dirname + "/views/signup.html"));
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const existing = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
  if (existing.rows.length) return res.send("Username already exists, bro!");
  await pool.query("INSERT INTO users(username, password) VALUES($1,$2)", [username, password]);
  req.session.username = username;
  res.redirect("/chat");
});

app.get("/login", (req, res) => res.sendFile(__dirname + "/views/login.html"));
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await pool.query("SELECT * FROM users WHERE username=$1 AND password=$2", [username, password]);
  if (user.rows.length) {
    req.session.username = username;
    res.redirect("/chat");
  } else res.send("Invalid login, bro!");
});

// --- SERVER START ---
app.listen(port, () => console.log(`ChaoticVibe running on port ${port}, bro 😎`));
