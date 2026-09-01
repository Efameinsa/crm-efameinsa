// ============================================================
// CRM EFAMEINSA · Coordinador local de correlativos (plan 26)
// ============================================================
// Corre en el servidor de la oficina, junto al servidor de archivos. Hace UNA
// cosa: que la oficina pueda numerar cotizaciones sin internet, sin que dos
// personas se pisen y sin chocar jamás con la nube.
//
// CÓMO. Mientras hay internet, mantiene una DESPENSA de números reservados en
// Supabase (40 por serie, renovados cada 5 minutos — la nube los salta desde
// la 0138). Cuando el internet se corta, entrega números de esa despensa: es
// un solo proceso, así que la entrega es atómica y no hay carreras — que es
// justo lo que un Excel compartido no puede prometer. Al volver el internet,
// confirma en la nube cada número que entregó.
//
// EL LIBRO. Cada entrega queda en `libro.jsonl` (fuente de verdad local) y en
// `correlativos-usados.csv`, que cualquiera puede abrir con Excel para ver
// quién usó qué — de SOLO lectura: el libro lo escribe únicamente este
// proceso.
//
//   set COORDINADOR_SECRETO=<el mismo que guarda la base (tabla coordinador_local)>
//   set COORDINADOR_PUERTO=8098
//   set NEXT_PUBLIC_SUPABASE_URL=... / NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//   node coordinador-local.mjs
//
// SOLO responde a la red privada de la oficina, igual que el servidor de
// archivos. Pedir un número no exige secreto (el riesgo de un abuso interno
// es gastar despensa, y todo queda anotado con nombre); el secreto protege
// lo que habla con la nube.
import http from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUERTO = Number(process.env.COORDINADOR_PUERTO ?? 8098);
const SECRETO = process.env.COORDINADOR_SECRETO ?? "";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const DATOS = process.env.COORDINADOR_DATOS ?? join(process.cwd(), "coordinador-datos");
const SERIES = ["EFAMEINSA", "OPEN"];
const OBJETIVO = Number(process.env.COORDINADOR_DESPENSA ?? 40);
const CADA_MS = 5 * 60 * 1000;

if (!SECRETO || SECRETO.length < 24) {
  console.error("Falta COORDINADOR_SECRETO (mínimo 24 caracteres, el mismo de la base).");
  process.exit(1);
}
if (!SUPABASE || !ANON) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}
mkdirSync(DATOS, { recursive: true });

const RUTA_DESPENSA = join(DATOS, "despensa.json");
const RUTA_LIBRO = join(DATOS, "libro.jsonl");
const RUTA_CSV = join(DATOS, "correlativos-usados.csv");

/** { EFAMEINSA: { anio, numeros: [..] }, OPEN: {...} } — solo los SIN entregar. */
let despensa = existsSync(RUTA_DESPENSA) ? JSON.parse(readFileSync(RUTA_DESPENSA, "utf8")) : {};
/** Entregas hechas: [{serie, anio, numero, quien, motivo, fecha, confirmado}] */
let libro = existsSync(RUTA_LIBRO)
  ? readFileSync(RUTA_LIBRO, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
let ultimaSincronizacion = null;
let conInternet = null;

const guardarDespensa = () => writeFileSync(RUTA_DESPENSA, JSON.stringify(despensa, null, 2));
function reescribirCsv() {
  const filas = ["serie,anio,numero,entregado_a,motivo,fecha,confirmado_en_nube"];
  for (const e of libro) {
    filas.push([e.serie, e.anio, e.numero, `"${(e.quien ?? "").replaceAll('"', "'")}"`, `"${(e.motivo ?? "").replaceAll('"', "'")}"`, e.fecha, e.confirmado ? "SI" : "pendiente"].join(","));
  }
  writeFileSync(RUTA_CSV, "﻿" + filas.join("\r\n"), "utf8");
}

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** Confirmar pendientes + renovar despensa + soltar vencidos. */
async function sincronizar() {
  try {
    for (const e of libro.filter((x) => !x.confirmado)) {
      await rpc("confirmar_uso_local", { p_secreto: SECRETO, p_serie: e.serie, p_anio: e.anio, p_numero: e.numero });
      e.confirmado = true;
    }
    // El libro se reescribe entero (es chico) para persistir los confirmados.
    writeFileSync(RUTA_LIBRO, libro.map((e) => JSON.stringify(e)).join("\n") + (libro.length ? "\n" : ""));

    const anio = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4);
    for (const serie of SERIES) {
      const numeros = await rpc("renovar_despensa_local", {
        p_secreto: SECRETO, p_serie: serie, p_objetivo: OBJETIVO, p_dias_vigencia: 7,
      });
      despensa[serie] = { anio: Number(anio), numeros };
    }
    await rpc("liberar_reservas_vencidas", { p_secreto: SECRETO });
    guardarDespensa();
    reescribirCsv();
    ultimaSincronizacion = new Date().toISOString();
    if (conInternet !== true) console.log(`[${new Date().toLocaleTimeString("es-PE")}] Con internet: despensa renovada (${SERIES.map((s) => `${s}:${despensa[s]?.numeros.length ?? 0}`).join(", ")})`);
    conInternet = true;
  } catch (e) {
    if (conInternet !== false) console.log(`[${new Date().toLocaleTimeString("es-PE")}] SIN internet o sin nube (${e.message.slice(0, 80)}) — se trabaja de la despensa`);
    conInternet = false;
  }
}

function json(res, codigo, cuerpo) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(cuerpo, null, 1));
}

/** Solo la red de la oficina, igual que el servidor de archivos. */
function redPermitida(req) {
  const ip = (req.socket.remoteAddress ?? "").replace("::ffff:", "");
  return ip === "127.0.0.1" || ip === "::1" || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

const servidor = http.createServer(async (req, res) => {
  if (!redPermitida(req)) return json(res, 403, { error: "Solo desde la red de la oficina" });
  const u = new URL(req.url, "http://x");

  if (u.pathname === "/estado") {
    return json(res, 200, {
      vivo: true,
      internet: conInternet,
      ultima_sincronizacion: ultimaSincronizacion,
      despensa: Object.fromEntries(SERIES.map((s) => [s, despensa[s]?.numeros.length ?? 0])),
      entregados: libro.length,
      sin_confirmar: libro.filter((e) => !e.confirmado).length,
    });
  }

  if (u.pathname === "/correlativo" && req.method === "POST") {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      let datos = {};
      try { datos = JSON.parse(cuerpo || "{}"); } catch { /* vacío */ }
      const serie = String(datos.serie ?? "").toUpperCase();
      if (!SERIES.includes(serie)) return json(res, 400, { error: `Serie desconocida: use ${SERIES.join(" o ")}` });
      const d = despensa[serie];
      if (!d || d.numeros.length === 0) {
        return json(res, 409, { error: "La despensa de esta serie está vacía: hace falta internet para renovarla" });
      }
      const numero = d.numeros.shift();
      const entrega = {
        serie, anio: d.anio, numero,
        quien: String(datos.quien ?? "sin identificar").slice(0, 80),
        motivo: String(datos.motivo ?? "").slice(0, 120),
        fecha: new Date().toISOString(), confirmado: false,
      };
      libro.push(entrega);
      appendFileSync(RUTA_LIBRO, JSON.stringify(entrega) + "\n");
      guardarDespensa();
      reescribirCsv();
      console.log(` → ${serie}-${d.anio} N.º ${numero} para ${entrega.quien} (quedan ${d.numeros.length})`);
      return json(res, 200, { serie, anio: d.anio, numero, quedan: d.numeros.length });
    });
    return;
  }

  json(res, 404, { error: "Rutas: GET /estado · POST /correlativo {serie, quien, motivo}" });
});

servidor.listen(PUERTO, () => {
  console.log("──────────────────────────────────────────────────");
  console.log(`  Coordinador local de correlativos · puerto ${PUERTO}`);
  console.log(`  Series: ${SERIES.join(", ")} · despensa objetivo: ${OBJETIVO}`);
  console.log(`  Libro: ${RUTA_LIBRO}`);
  console.log(`  CSV legible: ${RUTA_CSV}`);
  console.log("──────────────────────────────────────────────────");
  sincronizar();
  setInterval(sincronizar, CADA_MS);
});
