const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const session = require('express-session');
const crypto = require('crypto');
const { expectedStarOutput } = require('./core');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_DIR = process.env.USER_DIR || './users';
const FLAG_PATH = '/flag';
const USERS_DB = process.env.USERS_DB || path.join(USER_DIR, 'users.json'); 

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeUsername(name) {
  if (typeof name !== 'string') return null;
  return /^[A-Za-z0-9\-]{1,32}$/.test(name) ? name : null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const test = crypto.scryptSync(String(password), user.salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(user.hash, 'hex'));
}

async function readUsers() {
  try { const txt = await fs.readFile(USERS_DB, 'utf8'); return JSON.parse(txt); }
  catch { return {}; }
}
async function writeUsers(obj) {
  await fs.writeFile(USERS_DB, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

async function saveUserCodeToBin(username, code) {
  const safe = sanitizeUsername(username);
  if (!safe) throw new Error('Invalid username');
  const filePath = path.join(USER_DIR, safe);
  await fs.writeFile(filePath, String(code), { mode: 0o600 });
  return filePath;
}

function requireAuth(req, res, next) {
  if (req.session?.user?.username) return next();
  return res.status(401).json({ ok: false, error: 'Login required' });
}

function validateTestInput(inp) {
  if (typeof inp !== 'string') return false;
  if (inp.length < 1 || inp.length > 2) return false;
  const check = 0;
  const upper = String.fromCharCode(check.toString().charCodeAt(0) + 9);
  for (const ch of inp) {
    if (!(ch >= check || ch <= upper)) return false;
  }
  return true;
}

function runWithEchoPipeline({ code, input }) {
  return new Promise((resolve) => {
    const b64code = Buffer.from(String(code), 'utf8').toString('base64');
    if (!validateTestInput(input)){
      input = ""
    }
    const shell = `echo ${input} | node ../bin/mini-run.js --b64code '${b64code}'`;
    const child = spawn('sh', ['-lc', shell], {
      cwd: USER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.on('close', (code) => resolve({
      code, stdout,
    }));
  });
}

app.post('/signup', async (req, res) => {
  const { username, password } = req.body || {};
  const safe = sanitizeUsername(username);
  if (!safe || !password || String(password).length < 4) {
    return res.status(400).json({ ok: false, error: 'Please check your username format or password (at least 4 characters).' });
  }
  const users = await readUsers();
  if (users[safe]) return res.status(409).json({ ok: false, error: 'Username already exists' });
  users[safe] = hashPassword(password);
  await writeUsers(users);
  return res.json({ ok: true, created: { username: safe } });
});

app.get('/mycode', requireAuth, async (req, res) => {
  try {
    const filePath = path.join(USER_DIR, req.session.user.username);
    const code = await fs.readFile(filePath, 'utf8');
    res.json({ ok: true, code });
  } catch (e) {
    res.json({ ok: true, code: '' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const safe = sanitizeUsername(username);
  if (!safe || !password) return res.status(400).json({ ok: false, error: 'Please check your username and password.' });
  const users = await readUsers();
  const user = users[safe];
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ ok: false, error: 'Login failed' });
  }
  req.session.user = { username: safe };
  res.json({ ok: true, user: { username: safe } });
});

app.post('/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.post('/save', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Code is empty.' });
  try {
    const p = await saveUserCodeToBin(req.session.user.username, code);
    res.json({ ok: true, path: p });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/me', (req, res) => res.json({ ok: true, user: req.session.user || null }));

app.post('/delete-account', requireAuth, async (req, res) => {
  try {
    const username = req.session.user.username;
    const users = await readUsers();
    if (!users[username]) {
      return res.status(404).json({ ok: false, error: 'User not found.' });
    }
    delete users[username];
    await writeUsers(users);
    const filePath = path.join(USER_DIR, username);
    try {
      await fs.unlink(filePath);
    } catch (_) {
    }
    req.session.destroy(() => {
      res.json({ ok: true, message: 'Your account has been deleted.' });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/submit', requireAuth, async (req, res) => {
  const { code, input } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Code is empty.' });
  try { await saveUserCodeToBin(req.session.user.username, code); } catch (_) {}
  const r = await runWithEchoPipeline({ code, input });
  res.json({ ok: true, stdout: r.stdout, exitCode: r.code });
});

app.post('/judge-all', requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok:false, error:'Code is empty.' });
  try { await saveUserCodeToBin(req.session.user.username, code); } catch (_) {}
  const inputs = Array.from({ length: 99 }, (_, i) => String(i + 1));
  const norm = s => String(s).replace(/\r\n/g,'\n').replace(/\r/g,'\n').trimEnd();
  let allPassed = true;
  for (const t of inputs) {
    const r = await runWithEchoPipeline({ code, input: t });
    const expect = expectedStarOutput(t);
    const ok = (r.code === 0) && (norm(r.stdout) === norm(expect));
    if (!ok) { allPassed = false; break; }
  }
  if (allPassed) {
    req.session.flagUnlocked = true;
    req.session.unlockedAt = Date.now();
  }
  res.json({ ok:true, allPassed });
});

app.get('/flag', requireAuth, async (req, res) => {
  if (!req.session.flagUnlocked) {
    return res.status(403).json({ ok:false, error:'You must pass all tests 1–99 to see the flag.' });
  }
  try {
    const flag = await fs.readFile(FLAG_PATH, 'utf8');
    res.json({ ok:true, flag: flag.trim() });
  } catch (e) {
    res.status(500).json({ ok:false, error: 'Failed to read flag: ' + String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`judge on :${PORT}`);
});
