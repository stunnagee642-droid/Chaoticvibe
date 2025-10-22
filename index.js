const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// bro's Postgres DB connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'chaoticvibe_secret_bro',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
  if(req.session.username) res.redirect('/chat');
  else res.redirect('/login');
});

// Signup
app.get('/signup', (req, res) => res.sendFile(__dirname + '/views/signup.html'));
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if(user.rows.length) return res.send('Username already exists, bro!');
  await pool.query('INSERT INTO users(username, password) VALUES($1,$2)', [username, password]);
  req.session.username = username;
  res.redirect('/chat');
});

// Login
app.get('/login', (req, res) => res.sendFile(__dirname + '/views/login.html'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1 AND password=$2', [username, password]);
  if(user.rows.length){
    req.session.username = username;
    res.redirect('/chat');
  } else res.send('Invalid login, bro!');
});

// Chat
app.get('/chat', async (req, res) => {
  if(!req.session.username) return res.redirect('/login');
  const messages = await pool.query('SELECT * FROM messages ORDER BY time ASC');
  res.render('chat.ejs', { username: req.session.username, messages: messages.rows });
});

app.post('/message', async (req, res) => {
  if(!req.session.username) return res.redirect('/login');
  const { message } = req.body;
  await pool.query('INSERT INTO messages(user_name, message, time) VALUES($1,$2,NOW())', [req.session.username, message]);
  res.redirect('/chat');
});

// Admin panel
app.get('/admin', async (req, res) => {
  if(!req.session.username) return res.redirect('/login');
  const user = await pool.query('SELECT * FROM users WHERE username=$1', [req.session.username]);
  if(!user.rows[0].is_admin) return res.send('Access denied, bro!');
  const allUsers = await pool.query('SELECT id, username FROM users');
  const allMessages = await pool.query('SELECT * FROM messages ORDER BY time DESC');
  res.render('admin.ejs', { users: allUsers.rows, messages: allMessages.rows });
});

// Delete user
app.post('/admin/delete-user', async (req, res) => {
  const { userId } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1', [req.session.username]);
  if(!user.rows[0].is_admin) return res.send('Access denied, bro!');
  await pool.query('DELETE FROM users WHERE id=$1', [userId]);
  res.redirect('/admin');
});

// Delete message
app.post('/admin/delete-message', async (req, res) => {
  const { messageId } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1', [req.session.username]);
  if(!user.rows[0].is_admin) return res.send('Access denied, bro!');
  await pool.query('DELETE FROM messages WHERE id=$1', [messageId]);
  res.redirect('/admin');
});

app.listen(PORT, () => console.log(`ChaoticVibe running on port ${PORT}, bro 😎`));
