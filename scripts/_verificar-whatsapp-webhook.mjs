// Prueba el webhook de WhatsApp ENTERO sin necesitar credenciales reales de
// Meta: simula los payloads que Meta manda de verdad (firmados con el mismo
// algoritmo, HMAC-SHA256 sobre el cuerpo crudo), contra el servidor local.
// Verifica el GET de verificación, un mensaje nuevo con referral de anuncio
// (crea lead + conversación), un segundo mensaje del mismo número (no crea
// otra conversación) y un status "delivered". Al final borra todo lo que creó.
//
// Uso: BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-whatsapp-webhook.mjs
import crypto from "node:crypto";
import { Client } from "pg";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SECRETO = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
if (!SECRETO || !VERIFY_TOKEN) {
  console.error("Faltan WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN en .env.local");
  process.exit(1);
}

function firmar(cuerpoTexto) {
  return "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpoTexto).digest("hex");
}

async function postFirmado(payload) {
  const texto = JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firmar(texto) },
    body: texto,
  });
  return res;
}

function payloadMensaje({ wamid, telefono, texto, referral, timestamp }) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PRUEBA" },
              contacts: [{ profile: { name: "PRUEBA WEBHOOK — no es cliente real" }, wa_id: telefono }],
              messages: [
                { from: telefono, id: wamid, timestamp: String(timestamp), type: "text", text: { body: texto }, ...(referral ? { referral } : {}) },
              ],
            },
          },
        ],
      },
    ],
  };
}

function payloadStatus({ wamid, estado, timestamp }) {
  return {
    entry: [{ changes: [{ value: { messaging_product: "whatsapp", statuses: [{ id: wamid, status: estado, timestamp: String(timestamp) }] } }] }],
  };
}

const TELEFONO = "51999" + Math.floor(100000 + Math.random() * 900000);
const WAMID_1 = "wamid.PRUEBA_" + Date.now() + "_1";
const WAMID_2 = "wamid.PRUEBA_" + Date.now() + "_2";
const WAMID_3 = "wamid.PRUEBA_" + Date.now() + "_3";
const AHORA = Math.floor(Date.now() / 1000);

console.log(`Teléfono de prueba: ${TELEFONO}`);

// 1. GET de verificación
{
  const url = new URL(`${BASE}/api/webhooks/whatsapp`);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", VERIFY_TOKEN);
  url.searchParams.set("hub.challenge", "reto-123");
  const res = await fetch(url);
  const texto = await res.text();
  console.log(res.status === 200 && texto === "reto-123" ? "✓ GET de verificación OK" : `✗ GET falló: ${res.status} "${texto}"`);
}

// 2. Firma inválida se rechaza (pero responde 200 igual, por diseño)
{
  const res = await fetch(`${BASE}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=firma-falsa" },
    body: JSON.stringify(payloadMensaje({ wamid: "no-debe-guardarse", telefono: TELEFONO, texto: "x", timestamp: AHORA })),
  });
  console.log(res.status === 200 ? "✓ Firma inválida: responde 200 (no le da pistas al atacante)" : `✗ Firma inválida devolvió ${res.status}`);
}

// 3. Mensaje nuevo, con referral de anuncio → debe crear lead + conversación
const res1 = await postFirmado(
  payloadMensaje({
    wamid: WAMID_1,
    telefono: TELEFONO,
    texto: "Hola, vi su anuncio y quiero información. [PRUEBA-M1]",
    referral: { source_id: "123", body: "Hola, vi su anuncio y quiero información. [PRUEBA-M1]", ctwa_clid: "clid-prueba" },
    timestamp: AHORA,
  }),
);
console.log(res1.status === 200 ? "✓ Mensaje 1 (nuevo, con referral): 200" : `✗ Mensaje 1 falló: ${res1.status}`);

await new Promise((r) => setTimeout(r, 800));

// 4. Segundo mensaje del mismo número → NO debe crear una segunda conversación
const res2 = await postFirmado(payloadMensaje({ wamid: WAMID_2, telefono: TELEFONO, texto: "¿Cuánto cuesta?", timestamp: AHORA + 5 }));
console.log(res2.status === 200 ? "✓ Mensaje 2 (mismo número): 200" : `✗ Mensaje 2 falló: ${res2.status}`);

// 4b. El cliente toca «Me interesa» en una ficha (0250) → tipo interactive + equipo_sku
const res2b = await postFirmado({
  object: "whatsapp_business_account",
  entry: [{ id: "PRUEBA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "51932766654", phone_number_id: "1386979267824702" },
    contacts: [{ profile: { name: "Cliente de prueba" }, wa_id: TELEFONO }],
    messages: [{ from: TELEFONO, id: WAMID_3, timestamp: String(AHORA + 5), type: "interactive", interactive: { type: "button_reply", button_reply: { id: "interes:LAVGIA13", title: "Me interesa" } } }],
  } }] }],
});
console.log(res2b.status === 200 ? "✓ Botón «Me interesa» de una ficha: 200" : `✗ Botón falló: ${res2b.status}`);

// 5. Status "delivered" del primer mensaje
const res3 = await postFirmado(payloadStatus({ wamid: WAMID_1, estado: "delivered", timestamp: AHORA + 6 }));
console.log(res3.status === 200 ? "✓ Status delivered: 200" : `✗ Status falló: ${res3.status}`);

await new Promise((r) => setTimeout(r, 800));

// 6. Verificar en la base
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: [conv] } = await db.query(
  `select id, lead_id, codigo_campania_wa, ctwa_clid, estado from wa_conversaciones where telefono = $1`,
  [TELEFONO],
);
console.log(conv ? `✓ Se creó UNA conversación (código ${conv.codigo_campania_wa}, ctwa_clid ${conv.ctwa_clid})` : "✗ No se creó la conversación");

const { rows: mensajes } = await db.query(`select wamid, direccion, texto, estado, tipo, equipo_sku from wa_mensajes where conversacion_id = $1 order by created_at`, [conv?.id]);
const boton = mensajes.find((m) => m.wamid === WAMID_3);
console.log(boton?.tipo === "interactive" && boton?.equipo_sku === "LAVGIA13" && /Me interesa/.test(boton.texto) ? "✓ El botón quedó como «Me interesa — LAVGIA13» con equipo_sku" : `✗ El botón no quedó bien: ${JSON.stringify(boton)}`);
console.log(mensajes.length === 3 ? "✓ Los 3 mensajes quedaron en el mismo hilo" : `✗ Se esperaban 3 mensajes, hay ${mensajes.length}`);
const primero = mensajes.find((m) => m.wamid === WAMID_1);
console.log(primero?.estado === "entregado" ? "✓ El status \"delivered\" actualizó el mensaje 1" : `✗ Estado del mensaje 1: ${primero?.estado}`);

const { rows: [lead] } = await db.query(`select codigo, canal, fuente, codigo_campania_wa, estado from leads where id = $1`, [conv?.lead_id]);
console.log(lead ? `✓ Se creó el lead ${lead.codigo} (${lead.canal}/${lead.fuente}, ${lead.estado})` : "✗ No se creó el lead");

// 7. Limpieza — no dejar rastro en producción
if (conv) {
  await db.query("delete from wa_mensajes where conversacion_id = $1", [conv.id]);
  await db.query("delete from wa_conversaciones where id = $1", [conv.id]);
}
if (lead) {
  await db.query("update leads set oportunidad_id = null where codigo = $1", [lead.codigo]);
  await db.query("delete from leads where codigo = $1", [lead.codigo]);
}
console.log("✓ Limpieza hecha: conversación, mensajes y lead de prueba borrados");

await db.end();
