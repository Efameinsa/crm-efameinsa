// B5 · Marketing: trae el gasto de Meta Ads (histórico + catch-up manual) y
// lo manda al endpoint YA construido `POST /api/gasto-campania`, el mismo
// que usaría Make.com — este script solo reemplaza a Make del lado de la
// autenticación con Meta, no duplica la lógica de escritura en la base.
//
// Para la sincronización DIARIA automática ver src/app/api/cron/gasto-diario
// (corre en Vercel, escribe directo con el cliente admin). Este script es
// para el backfill inicial y para correr manualmente si hace falta rellenar
// un hueco.
//
// Límite de Meta: Insights no entrega detalle diario de más de 37 meses
// atrás (error #3018) — "todo el histórico" tiene ese techo, no es
// indefinido. Por eso, si no se pasa --desde, se calcula automáticamente
// 37 meses menos 1 semana de margen.
//
// leads_reportados: Meta no tiene un solo action_type universal para "lead".
// Se suman 'lead' (formularios instantáneos) + 'onsite_conversion.
// messaging_conversation_started_7d' (click-to-WhatsApp/Messenger) — son
// conteos de canales distintos, no duplicados entre sí.
//
// Uso:
//   node --env-file=.env.local scripts/sync-meta-ads.mjs [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD] [--url https://...] [--aplicar]
//
// Sin --aplicar: solo trae de Meta e imprime el resumen, no manda nada al CRM.

const API_VERSION = "v21.0";

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}

const APLICAR = process.argv.includes("--aplicar");
const URL_CRM = leerArgumento("url", "https://crm.efameinsa.com");

function haceMeses(fecha, meses) {
  const d = new Date(fecha);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}
function ayer() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const HASTA = leerArgumento("hasta", ayer());
const DESDE = leerArgumento("desde", haceMeses(HASTA, 36) /* 36, no 37: margen de seguridad */);

for (const v of ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "GASTO_INGEST_TOKEN"]) {
  if (!process.env[v]) {
    console.error(`Falta ${v} en .env.local`);
    process.exit(1);
  }
}

const TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID;

const ACCIONES_LEAD = new Set(["lead", "onsite_conversion.messaging_conversation_started_7d"]);

function leadsDeAcciones(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.filter((a) => ACCIONES_LEAD.has(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
}

// Insights por rango de 3 meses: pedir 3 años completos con time_increment=1
// en una sola llamada es frágil (timeouts del lado de Meta con cuentas de
// varios años); trocear en ventanas cortas es más confiable y cada ventana
// pagina sola si hace falta.
function* ventanas3Meses(desde, hasta) {
  let inicio = desde;
  while (inicio < hasta) {
    const fin = haceMeses(inicio, -3) > hasta ? hasta : haceMeses(inicio, -3);
    yield { since: inicio, until: fin };
    inicio = new Date(new Date(fin).getTime() + 86_400_000).toISOString().slice(0, 10);
  }
}

async function obtenerMoneda() {
  const url = `https://graph.facebook.com/${API_VERSION}/act_${AD_ACCOUNT}?fields=name,currency&access_token=${TOKEN}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(`Meta (cuenta): ${d.error.message}`);
  return { moneda: d.currency, nombreCuenta: d.name };
}

async function obtenerInsights(since, until) {
  const filas = [];
  const params = new URLSearchParams({
    fields: "spend,impressions,clicks,actions,campaign_id,campaign_name,date_start",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    level: "campaign",
    limit: "500",
    access_token: TOKEN,
  });
  let url = `https://graph.facebook.com/${API_VERSION}/act_${AD_ACCOUNT}/insights?${params}`;
  while (url) {
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) throw new Error(`Meta (insights ${since}..${until}): ${d.error.message}`);
    filas.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  return filas;
}

async function enviarLote(registros) {
  const r = await fetch(`${URL_CRM}/api/gasto-campania`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GASTO_INGEST_TOKEN}` },
    body: JSON.stringify({ plataforma: "meta", registros }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`CRM /api/gasto-campania (${r.status}): ${d.error ?? JSON.stringify(d)}`);
  return d;
}

async function main() {
  console.log(`Rango: ${DESDE} .. ${HASTA}`);
  const { moneda, nombreCuenta } = await obtenerMoneda();
  console.log(`Cuenta: ${nombreCuenta} · moneda: ${moneda}`);

  const todasLasFilas = [];
  for (const { since, until } of ventanas3Meses(DESDE, HASTA)) {
    process.stdout.write(`  trayendo ${since}..${until}... `);
    const filas = await obtenerInsights(since, until);
    console.log(`${filas.length} filas`);
    todasLasFilas.push(...filas);
  }

  const registros = todasLasFilas.map((f) => ({
    campaign_id: f.campaign_id,
    nombre: f.campaign_name,
    fecha: f.date_start,
    gasto: Number(f.spend || 0),
    impresiones: Number(f.impressions || 0),
    clics: Number(f.clicks || 0),
    leads_reportados: leadsDeAcciones(f.actions),
    moneda,
  }));

  const conGasto = registros.filter((r) => r.gasto > 0);
  console.log(`\nTotal filas día×campaña: ${registros.length}`);
  console.log(`Con gasto > 0: ${conGasto.length}`);
  console.log(`Campañas distintas: ${new Set(registros.map((r) => r.campaign_id)).size}`);
  console.log(`Gasto total del rango: ${registros.reduce((s, r) => s + r.gasto, 0).toFixed(2)} ${moneda}`);

  if (!APLICAR) {
    console.log("\n=== SIMULACIÓN (sin --aplicar, no se manda nada al CRM) ===");
    console.log(`Corre de nuevo con --aplicar para mandarlo a ${URL_CRM}/api/gasto-campania`);
    return;
  }

  console.log(`\n=== ENVIANDO A ${URL_CRM} ===`);
  const TAMANO_LOTE = 300;
  let enviados = 0;
  for (let i = 0; i < registros.length; i += TAMANO_LOTE) {
    const lote = registros.slice(i, i + TAMANO_LOTE);
    const resultado = await enviarLote(lote);
    enviados += resultado.actualizados ?? lote.length;
    console.log(`  ${Math.min(i + TAMANO_LOTE, registros.length)}/${registros.length}...`);
  }
  console.log(`\n✓ Registros escritos en el CRM: ${enviados}`);
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
