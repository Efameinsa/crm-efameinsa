// Prueba de humo de la API del portal (Mi cuenta de efameinsa.com → CRM).
//
// Firma cada pedido como lo hará la web (HMAC-SHA256 de `${ts}.${cuerpo}` con
// PORTAL_SECRETO) y llama a las tres rutas:
//   1. POST /api/portal/cliente   → el historial del cliente
//   2. POST /api/portal/mensaje   → un mensaje de prueba en el chat
//   3. POST /api/portal/recibido  → «Ya lo recibí» del primer pedido (o PEDIDO_ID)
// Además comprueba que una firma mala da 401 y que un correo que no existe da 404.
//
// Solo con identidades de PRUEBA (regla del contrato): correos @efameinsa.com,
// gestion1@efameinsa.com o soypuromarketing@gmail.com. Las rutas 2 y 3
// escriben en la base y avisan al equipo: para solo leer, SOLO_LEER=1.
//
// Uso (PowerShell):
//   $env:PORTAL_URL="https://crm.efameinsa.com"; $env:PORTAL_SECRETO="…"
//   $env:PRUEBA_EMAIL="soypuromarketing@gmail.com"   # opcional
//   $env:PRUEBA_TELEFONO="987654321"                 # opcional, en vez del correo
//   $env:PEDIDO_ID="uuid"                            # opcional
//   $env:SOLO_LEER="1"                               # opcional
//   node scripts/_probar-portal.mjs

import { createHmac } from "node:crypto";

const URL_BASE = (process.env.PORTAL_URL ?? "").replace(/\/+$/, "");
const SECRETO = process.env.PORTAL_SECRETO ?? "";
const EMAIL = (process.env.PRUEBA_EMAIL ?? (process.env.PRUEBA_TELEFONO ? "" : "soypuromarketing@gmail.com")).trim().toLowerCase();
const TELEFONO = (process.env.PRUEBA_TELEFONO ?? "").trim();
const SOLO_LEER = process.env.SOLO_LEER === "1";

if (!URL_BASE || !SECRETO) {
  console.error("Faltan PORTAL_URL y/o PORTAL_SECRETO.");
  process.exit(1);
}
const esDePrueba = (e) => /@efameinsa\.com$/.test(e) || e === "soypuromarketing@gmail.com";
if (EMAIL && !esDePrueba(EMAIL)) {
  console.error(`«${EMAIL}» no es un correo de prueba. Use uno @efameinsa.com o soypuromarketing@gmail.com.`);
  process.exit(1);
}
if (!EMAIL && TELEFONO && !SOLO_LEER) {
  console.error("Con solo teléfono no se puede comprobar que es de prueba: corra con SOLO_LEER=1 o agregue PRUEBA_EMAIL.");
  process.exit(1);
}
const identidad = { ...(EMAIL ? { email: EMAIL } : {}), ...(TELEFONO ? { telefono: TELEFONO } : {}) };

function firmar(ts, cuerpo, secreto = SECRETO) {
  return createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");
}

async function llamar(ruta, datos, { secreto = SECRETO } = {}) {
  const cuerpo = JSON.stringify(datos);
  const ts = String(Date.now());
  const inicio = Date.now();
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-portal-ts": ts, "x-portal-firma": firmar(ts, cuerpo, secreto) },
    body: cuerpo,
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* no era JSON */
  }
  return { status: r.status, json, ms: Date.now() - inicio };
}

let fallas = 0;
function revisar(nombre, cond, detalle = "") {
  console.log(`${cond ? "OK   " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallas++;
}

// 0. Las puertas cerradas.
{
  const r = await llamar("/api/portal/cliente", identidad, { secreto: "una-firma-que-no-es-la-buena-1234" });
  revisar("firma mala → 401", r.status === 401, `status ${r.status}`);
  const n = await llamar("/api/portal/cliente", { email: `nadie-${Date.now()}@efameinsa.com` });
  revisar("cliente que no existe → 404 { ok:false }", n.status === 404 && n.json?.ok === false, `status ${n.status}`);
}

// 1. El historial.
const c = await llamar("/api/portal/cliente", identidad);
revisar("POST /api/portal/cliente", c.status === 200 && c.json?.ok === true, `status ${c.status}, ${c.ms} ms`);
if (c.status !== 200) {
  console.log(JSON.stringify(c.json, null, 2));
  process.exit(1);
}
const h = c.json;
console.log(`  cliente: ${h.cliente?.nombre} · empresas: ${(h.cliente?.empresas ?? []).map((e) => e.razon_social).join(", ")}`);
console.log(`  asesor: ${h.asesor ? `${h.asesor.nombre} (${h.asesor.celular || "sin celular"})` : "—"}`);
console.log(`  cotizaciones ${h.cotizaciones.length} · pedidos ${h.pedidos.length} · casos ${h.casos.length} · equipos ${h.equipos.length} · mensajes ${h.mensajes.length}`);
for (const p of h.pedidos.slice(0, 5)) {
  const hechos = p.pasos.filter((x) => x.fecha).length;
  console.log(`  · ${p.codigo} [${p.tipo}] ${p.titulo} — ${hechos}/${p.pasos.length} pasos, ${p.fotos.length} fotos, ${p.documentos.length} documentos${p.recibido_cliente_at ? ", recibido" : ""}`);
}
const claves = ["ok", "cliente", "asesor", "cotizaciones", "pedidos", "casos", "equipos", "mensajes"];
revisar("forma del JSON (claves del contrato)", claves.every((k) => k in h) && Object.keys(h).every((k) => claves.includes(k)));
const textoTodo = JSON.stringify(h);
revisar("sin palabras internas (taller, parque, Huachipa, es_prueba, comision)", !/taller|parque|huachipa|es_prueba|comisi[oó]n/i.test(textoTodo));

// El PDF de la primera cotización con enlace (GET /api/portal/pdf?t=…).
const conPdf = h.cotizaciones.find((x) => x.pdf_url);
if (conPdf) {
  const r = await fetch(conPdf.pdf_url);
  const tipo = r.headers.get("content-type") ?? "";
  revisar(`PDF de ${conPdf.codigo}`, r.status === 200 && tipo.includes("application/pdf"), `status ${r.status}, ${tipo}`);
  const malo = await fetch(conPdf.pdf_url.replace(/t=([^&]+)/, (_m, t) => `t=${t.slice(0, -2)}00`));
  revisar("PDF con token tocado → 401", malo.status === 401, `status ${malo.status}`);
} else {
  console.log("  (ninguna cotización con PDF para probar)");
}

if (SOLO_LEER) {
  console.log("SOLO_LEER=1: no se prueban mensaje ni recibido.");
  process.exit(fallas ? 1 : 0);
}

// 2. Un mensaje de prueba.
const m = await llamar("/api/portal/mensaje", { ...identidad, texto: `Mensaje de prueba del portal (${new Date().toISOString()}). Por favor ignorar.` });
revisar("POST /api/portal/mensaje", m.status === 200 && m.json?.ok === true && m.json?.mensaje?.autor === "cliente", `status ${m.status}`);
const vacio = await llamar("/api/portal/mensaje", { ...identidad, texto: "   " });
revisar("mensaje vacío → 400", vacio.status === 400, `status ${vacio.status}`);

// 3. «Ya lo recibí».
const pedidoId = process.env.PEDIDO_ID || h.pedidos.find((p) => !p.recibido_cliente_at)?.id || h.pedidos[0]?.id;
if (!pedidoId) {
  console.log("Sin pedidos para probar «Ya lo recibí».");
} else {
  const r1 = await llamar("/api/portal/recibido", { ...identidad, pedido_id: pedidoId, nota: "Prueba del portal: llegó bien." });
  revisar("POST /api/portal/recibido", r1.status === 200 && r1.json?.ok === true && Boolean(r1.json?.recibido_cliente_at), `status ${r1.status}`);
  const r2 = await llamar("/api/portal/recibido", { ...identidad, pedido_id: pedidoId });
  revisar("recibido es idempotente (misma fecha)", r2.status === 200 && r2.json?.recibido_cliente_at === r1.json?.recibido_cliente_at);
  const ajeno = await llamar("/api/portal/recibido", { ...identidad, pedido_id: "00000000-0000-4000-8000-000000000000" });
  revisar("pedido que no es suyo → 404", ajeno.status === 404, `status ${ajeno.status}`);
}

process.exit(fallas ? 1 : 0);
