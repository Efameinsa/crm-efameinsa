// Tasking · programa de envío por WhatsApp
// Se vincula por QR a un WhatsApp (usar un CHIP SECUNDARIO, nunca el número personal),
// toma de la web los mensajes que ya tocan, los envía con pausas y responde a «listo 154» / «pendientes».
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, isJidGroup, isPnUser, useMultiFileAuthState } from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CARPETA_SESION = path.join(DIR, 'sesion');

// --- Configuración (worker/.env) ---
for (const linea of fs.existsSync(path.join(DIR, '.env')) ? fs.readFileSync(path.join(DIR, '.env'), 'utf8').split(/\r?\n/) : []) {
  const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const CLAVE = process.env.TASKING_KEY || '';
if (!APP_URL || !CLAVE) {
  console.error('Falta configurar APP_URL y TASKING_KEY en .env');
  process.exit(1);
}

// Pausas para que el envío se parezca al de una persona y no dispare bloqueos
const PAUSA_MIN_MS = 5000;
const PAUSA_MAX_MS = 11000;
const MAX_POR_MINUTO = 6;
const CADA_COLA_MS = 15000;

const log = (...a) => console.log(new Date().toLocaleTimeString('es-PE'), ...a);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (a, b) => a + Math.floor(Math.random() * (b - a));

async function api(ruta, cuerpo, metodo = 'POST') {
  const r = await fetch(`${APP_URL}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'x-tasking-key': CLAVE },
    body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
  });
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

let sock = null;
let conectado = false;
let ultimoQr = null;
let enviando = false;
const enviadosRecientes = [];
const existeCache = new Map();

async function informar(extra = {}) {
  const numero = sock?.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
  try {
    const r = await api('/api/tasking/whatsapp/estado', { conectado, qr: conectado ? null : ultimoQr, numero, nombre: sock?.user?.name ?? null, ...extra });
    if (r?.comando) await ejecutarComando(r.comando);
  } catch (e) {
    log('No se pudo avisar el estado a la web:', e.message);
  }
}

// Órdenes que llegan desde la página WhatsApp de la web
async function ejecutarComando(comando) {
  log(`Orden desde la web: ${comando}`);
  if (comando === 'desvincular') {
    if (conectado) await sock.logout().catch(() => sock.end(new Error('desvincular')));
    else {
      fs.rmSync(CARPETA_SESION, { recursive: true, force: true });
      sock?.end(new Error('desvincular'));
    }
    existeCache.clear();
  } else if (comando === 'qr_nuevo' && !conectado) {
    sock?.end(new Error('qr nuevo'));
  }
}

async function jidDe(numero) {
  if (existeCache.has(numero)) return existeCache.get(numero);
  const [r] = (await sock.onWhatsApp(numero)) ?? [];
  const jid = r?.exists ? r.jid : null;
  existeCache.set(numero, jid);
  return jid;
}

async function enviarCola() {
  if (!conectado || enviando) return;
  enviando = true;
  try {
    const ahora = Date.now();
    while (enviadosRecientes.length && ahora - enviadosRecientes[0] > 60_000) enviadosRecientes.shift();
    const cupo = MAX_POR_MINUTO - enviadosRecientes.length;
    if (cupo <= 0) return;
    const { mensajes } = await api('/api/tasking/whatsapp/cola', { limite: cupo });
    for (const m of mensajes) {
      if (!conectado) {
        await api('/api/tasking/whatsapp/resultado', { id: m.id, ok: false, error: 'WhatsApp se desconectó', reintentar: true });
        continue;
      }
      try {
        const jid = await jidDe(m.destino);
        if (!jid) {
          await api('/api/tasking/whatsapp/resultado', { id: m.id, ok: false, error: `El número +${m.destino} no tiene WhatsApp`, reintentar: false });
          log(`✗ +${m.destino} no tiene WhatsApp`);
          continue;
        }
        await sock.presenceSubscribe(jid).catch(() => {});
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        await dormir(azar(1200, 2600));
        await sock.sendPresenceUpdate('paused', jid).catch(() => {});
        await sock.sendMessage(jid, { text: m.cuerpo });
        enviadosRecientes.push(Date.now());
        await api('/api/tasking/whatsapp/resultado', { id: m.id, ok: true });
        log(`✓ Enviado a +${m.destino}`);
      } catch (e) {
        log(`✗ Error con +${m.destino}:`, e.message);
        await api('/api/tasking/whatsapp/resultado', { id: m.id, ok: false, error: e.message, reintentar: true }).catch(() => {});
      }
      await dormir(azar(PAUSA_MIN_MS, PAUSA_MAX_MS));
    }
  } catch (e) {
    log('No se pudo leer la cola:', e.message);
  } finally {
    enviando = false;
  }
}

function textoDe(msg) {
  const m = msg.message;
  return m?.conversation || m?.extendedTextMessage?.text || '';
}

async function alRecibir({ messages, type }) {
  if (type !== 'notify') return;
  for (const msg of messages) {
    try {
      if (msg.key.fromMe || isJidGroup(msg.key.remoteJid) || msg.key.remoteJid === 'status@broadcast') continue;
      const texto = textoDe(msg).trim();
      if (!texto) continue;
      // Con los identificadores nuevos (LID) el número real viene en remoteJidAlt
      const jidNumero = isPnUser(msg.key.remoteJid) ? msg.key.remoteJid : msg.key.remoteJidAlt;
      const de = jidNumero?.split('@')[0]?.split(':')[0];
      if (!de) continue;
      const { respuesta } = await api('/api/tasking/whatsapp/entrante', { de, texto });
      if (respuesta) {
        await dormir(azar(800, 2000));
        await sock.sendMessage(msg.key.remoteJid, { text: respuesta });
        log(`↩ Respondido a +${de}`);
      }
    } catch (e) {
      log('Error al procesar un mensaje recibido:', e.message);
    }
  }
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const este = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' }),
    browser: Browsers.windows('Tasking'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock = este;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', alRecibir);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      ultimoQr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      log('QR nuevo listo: escanéalo desde CRM → Tasking → WhatsApp.');
      await informar();
    }
    if (connection === 'open') {
      conectado = true;
      ultimoQr = null;
      log(`✅ WhatsApp conectado como ${sock.user?.name ?? ''} (${sock.user?.id?.split(':')[0]})`);
      await informar();
      enviarCola();
    }
    if (connection === 'close') {
      if (este !== sock) return; // un socket viejo ya reemplazado
      conectado = false;
      ultimoQr = null;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        log('Sesión cerrada (desde el celular o desde la web). Se pedirá un QR nuevo.');
        fs.rmSync(CARPETA_SESION, { recursive: true, force: true });
        await informar({ detalle: 'Se desvinculó el número; escanea el QR nuevo para vincular otro.' });
      } else {
        log(`Conexión cerrada (código ${codigo ?? '?'}), reconectando…`);
        await informar({ detalle: 'Reconectando…' });
      }
      setTimeout(conectar, 3000);
    }
  });
}

log(`Tasking · WhatsApp → ${APP_URL}`);
await conectar();
setInterval(enviarCola, CADA_COLA_MS);
// Latido para que la web sepa que este programa está encendido, y respaldo del cron de correos/agenda
setInterval(() => informar(), 10_000);
setInterval(() => api(`/api/tasking/cron`, null, 'GET').catch((e) => log('Cron:', e.message)), 60_000);
process.on('SIGINT', async () => {
  conectado = false;
  await informar({ detalle: 'Programa detenido' });
  process.exit(0);
});
