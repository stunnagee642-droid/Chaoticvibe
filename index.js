// Signup page
app.get('/signup', (req, res) => res.sendFile(__dirname + '/views/signup.html'));
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if(user.rows.length) return res.send('Username already exists, bro!');
  await pool.query('INSERT INTO users(username, password) VALUES($1,$2)', [username, password]);
  req.session.username = username;
  res.redirect('/chat');
});

// Login page
app.get('/login', (req, res) => res.sendFile(__dirname + '/views/login.html'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE username=$1 AND password=$2', [username, password]);
  if(user.rows.length){
    req.session.username = username;
    res.redirect('/chat');
  } else res.send('Invalid login, bro!');
});

// Chat page
app.get('/chat', async (req, res) => {
  if(!req.session.username) return res.redirect('/login');
  const messages = await pool.query('SELECT * FROM messages ORDER BY time ASC');
  res.render('chat.ejs', { username: req.session.username, messages: messages.rows });
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
