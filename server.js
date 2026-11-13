// Bot del live de TikTok — Tu Curso Max (@tucursomax)
//
// Lee los comentarios del chat durante un live de TikTok, responde con Gemini
// como experto en ventas del MEGA PACK y emite cada evento { user, comment, reply }
// por WebSocket, para que la pantalla del live muestre el comentario y lea la
// respuesta en voz alta (text-to-speech).
//
// Variables de entorno (ver .env.example):
//   TIKTOK_USERNAME : usuario de TikTok del live (sin @). Por defecto: tucursomax
//   GEMINI_API_KEY  : clave de Google AI Studio (Gemini)
//   PORT            : puerto del servidor HTTP + WebSocket. Por defecto: 3000
//
// Uso: npm install && npm start

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { TikTokLiveConnection } = require('tiktok-live-connector');

// ---------- Cargar .env si existe (sin dependencias extra) ----------
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const eq = clean.indexOf('=');
    if (eq === -1) continue;
    const key = clean.slice(0, eq).trim();
    const value = clean.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
})();

const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || 'tucursomax').replace(/^@/, '');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!GEMINI_API_KEY) {
  console.error('[bot] Falta GEMINI_API_KEY. Ponla en .env o como variable de entorno.');
  process.exit(1);
}

// ---------- Prompt del sistema ----------
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf8');

// ---------- Gemini ----------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: SYSTEM_PROMPT,
});

// ---------- Servidor HTTP + WebSocket ----------
// Un solo puerto (Render usa PORT): /health para comprobar que vive y el
// WebSocket en la misma dirección (wss://<tu-servicio>.onrender.com).
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tiktok: TIKTOK_USERNAME }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot del live de TikTok — Tu Curso Max activo. WebSocket en esta misma direccion.\n');
});

const wss = new WebSocket.Server({ server });

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on('connection', (ws) => {
  console.log('[ws] Pantalla del live conectada.');
  ws.send(JSON.stringify({ type: 'hello', tiktok: TIKTOK_USERNAME }));
  ws.on('close', () => console.log('[ws] Pantalla del live desconectada.'));
});

// ---------- Cola de respuestas: maximo 1 cada 5 segundos ----------
const REPLY_INTERVAL_MS = 5000;
const MAX_QUEUE = 10;
const queue = [];
let processing = false;

// Antiduplicados: mismo usuario + mismo texto en 60 s se ignora.
const seen = new Map(); // clave -> timestamp
const SEEN_TTL_MS = 60000;

function isDuplicate(user, comment) {
  const key = user.toLowerCase() + '|' + comment.toLowerCase().trim();
  const now = Date.now();
  for (const [k, ts] of seen) {
    if (now - ts > SEEN_TTL_MS) seen.delete(k);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

// Si piden persona real / humano / asesor -> respuesta fija, sin llamar a Gemini.
const HUMAN_RE = /(persona real|humano|asesor|hablar con (jarwin|alguien)|atenci[oó]n personal|quiero hablar con una persona)/i;
const HUMAN_REPLY =
  '¡Claro! Jarwin te atiende personalmente por WhatsApp al +51931637348, escríbele ahí y te responde él mismo.';

async function answerWithGemini(comment) {
  const result = await model.generateContent(
    'Comentario del chat en vivo: "' + comment + '"\n' +
    'Responde en máximo 2 líneas, en español peruano, invitando a escribir al WhatsApp +51931637348.'
  );
  return result.response.text().trim();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const { user, comment } = queue.shift();
    const started = Date.now();
    let reply;
    try {
      if (HUMAN_RE.test(comment)) {
        reply = HUMAN_REPLY;
      } else {
        reply = await answerWithGemini(comment);
      }
      if (!reply) reply = '¡Gracias por escribir! Escríbeme por WhatsApp al +51931637348 y te ayudo con tu curso.';
    } catch (err) {
      console.error('[gemini] Error al responder:', err.message);
      reply = '¡Gracias por tu mensaje! Escríbeme por WhatsApp al +51931637348 y te atiendo ahí.';
    }
    const event = { user, comment, reply, ts: new Date().toISOString() };
    console.log('[live] ' + user + ': ' + comment);
    console.log('[live] Respuesta: ' + reply);
    broadcast(event);
    const waited = Date.now() - started;
    if (waited < REPLY_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REPLY_INTERVAL_MS - waited));
    }
  }
  processing = false;
}

function handleComment(user, comment) {
  const text = (comment || '').trim();
  if (!text) return; // ignorar comentarios vacíos
  if (user.toLowerCase() === TIKTOK_USERNAME.toLowerCase()) return; // no responderme a mí mismo
  if (isDuplicate(user, text)) {
    console.log('[live] Duplicado ignorado: ' + user + ': ' + text);
    return;
  }
  // Mostrar el comentario en pantalla al instante, aunque la respuesta tarde.
  broadcast({ type: 'comment', user, comment: text, ts: new Date().toISOString() });
  if (queue.length >= MAX_QUEUE) {
    console.log('[live] Cola llena, se descarta: ' + user + ': ' + text);
    return;
  }
  queue.push({ user, comment: text });
  processQueue();
}

// ---------- Conexión al chat del live de TikTok ----------
// Paquete no oficial: tiktok-live-connector. TikTok puede cambiar su API
// interna y el paquete dejar de funcionar; en ese caso hay que actualizarlo.
let tiktok = null;
let reconnectTimer = null;

function connectTikTok() {
  console.log('[tiktok] Conectando al live de @' + TIKTOK_USERNAME + '...');
  tiktok = new TikTokLiveConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: true,
  })    ;

  tiktok.connect()
    .then((state) => {
      console.log('[tiktok] Conectado al live. Estado: ' + (state && state.roomId ? 'sala ' + state.roomId : 'ok'));
    })
    .catch((err) => {
      console.error('[tiktok] No se pudo conectar (¿el live está en curso?):', err.message);
      scheduleReconnect();
    });

  tiktok.on('chat', (data) => {
    const user = (data && data.user && (data.user.uniqueId || data.user.nickname)) || 'anonimo';
    handleComment(user, data && data.comment);
  });

  tiktok.on('member', (data) => {
    const user = (data && data.user && (data.user.uniqueId || data.user.nickname)) || 'alguien';
    console.log('[tiktok] Se unió: ' + user);
  });

  tiktok.on('like', (data) => {
    const user = (data && data.user && (data.user.uniqueId || data.user.nickname)) || 'alguien';
    console.log('[tiktok] Like de ' + user + ' x' + (data && data.likeCount ? data.likeCount : 1));
  });

  tiktok.on('streamEnd', () => {
    console.log('[tiktok] El live terminó. Esperando a que empiece otro...');
    scheduleReconnect();
  });

  tiktok.on('disconnected', () => {
    console.log('[tiktok] Desconectado del live.');
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('[tiktok] Reintentando conexión en 60 s...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectTikTok();
  }, 60000);
}

// ---------- Arranque ----------
server.listen(PORT, () => {
  console.log('[bot] Servidor HTTP + WebSocket escuchando en el puerto ' + PORT);
  console.log('[bot] Live de TikTok: @' + TIKTOK_USERNAME);
  connectTikTok();
});
