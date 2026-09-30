// Foto de cómo está la base del CRM en Supabase. Solo lee.
// Agrega una fila a Downloads/vigilancia-supabase.csv y dice qué hacer.
//   node --env-file=.env.local scripts/_vigilar-base.mjs
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const REF = "oyycfgqfddftxoxmqgqa";
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = (readFileSync("C:/Users/diseno/Projects/efameinsa/.env.local", "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "");
const CSV = "C:/Users/diseno/Downloads/vigilancia-supabase.csv";

const hora = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" }).slice(0, 16);
const r = { hora };

// 1. Salud de los servicios.
try {
  const s = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/health?services=db,rest,auth,storage`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  // 29-09 20:04: la API de administración devolvió un error suelto en vez de
  // la lista; eso es la API de Supabase fallando, no la base caída.
  if (!Array.isArray(s)) throw new Error(`la API de administración respondió ${JSON.stringify(s).slice(0, 80)}`);
  r.salud = s.every((x) => x.status === "ACTIVE_HEALTHY") ? "sana" : s.map((x) => `${x.name}:${x.status}`).join(" ");
} catch (e) {
  r.salud = `sin respuesta (${e.message})`;
}

// 2. Cuánto tarda una consulta mínima por la API (lo que siente el usuario).
const tiempos = [];
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  try {
    await fetch(`${URL_BASE}/rest/v1/parametros?select=clave&limit=1`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` }, signal: AbortSignal.timeout(20000) });
    tiempos.push(Date.now() - t);
  } catch {
    tiempos.push(20000);
  }
}
r.rest_ms = Math.round(tiempos.sort((a, b) => a - b)[1]);

// 3. Memoria, swap y carga de la máquina.
try {
  const m = await (await fetch(`${URL_BASE}/customer/v1/privileged/metrics`, { headers: { Authorization: "Basic " + Buffer.from(`service_role:${SR}`).toString("base64") } })).text();
  const v = (n) => Number(m.match(new RegExp(`^${n}\\{[^}]*\\} (\\S+)`, "m"))?.[1]);
  r.carga = v("node_load5").toFixed(1);
  r.mem_libre_mb = Math.round(v("node_memory_MemAvailable_bytes") / 1048576);
  r.swap_mb = Math.round((v("node_memory_SwapTotal_bytes") - v("node_memory_SwapFree_bytes")) / 1048576);
} catch {
  r.carga = r.mem_libre_mb = r.swap_mb = "?";
}

// 4. Conexiones, consultas lentas y bloqueos.
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
try {
  await c.connect();
  const [a] = (await c.query(`
    select count(*)::int as conexiones,
           count(*) filter (where state = 'active')::int as activas,
           count(*) filter (where state like 'idle in transaction%')::int as colgadas,
           count(*) filter (where state = 'idle in transaction (aborted)')::int as abortadas,
           count(*) filter (where state = 'active' and now() - query_start > interval '5 seconds')::int as lentas_5s,
           (select count(*)::int from pg_locks where not granted) as bloqueos
      from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`)).rows;
  Object.assign(r, a);
} catch (e) {
  r.conexiones = `error: ${e.message}`;
} finally {
  await c.end().catch(() => {});
}

// 5. Qué hacer.
const avisos = [];
if (r.salud !== "sana") avisos.push("SERVICIOS NO SANOS: medir de nuevo en 2 min; si sigue, reiniciar el proyecto por API (5 min de corte, avisar antes)");
if (r.rest_ms > 3000) avisos.push("API MUY LENTA (>3 s): el CRM se siente trabado");
else if (r.rest_ms > 1200) avisos.push("API lenta (>1,2 s)");
if (r.abortadas > 0) avisos.push("hay conexiones «idle in transaction (aborted)»: pg_terminate_backend solo a esas (25P02, como el 28-09)");
if (r.bloqueos > 0) avisos.push(`${r.bloqueos} consultas esperando un bloqueo`);
if (r.lentas_5s > 0) avisos.push(`${r.lentas_5s} consultas de más de 5 s`);
if (Number(r.swap_mb) > 700) avisos.push("swap alto (>700 MB): riesgo de caída como el 28-09");
if (Number(r.mem_libre_mb) < 80) avisos.push("memoria libre < 80 MB");
if (Number(r.carga) > 8) avisos.push("carga alta (>8)");
r.estado = avisos.length === 0 ? "OK" : avisos.some((x) => /NO SANOS|MUY LENTA|aborted|riesgo/.test(x)) ? "ACTUAR" : "OJO";
r.que_hacer = avisos.join(" | ") || "nada";

const cols = ["hora", "estado", "salud", "rest_ms", "carga", "mem_libre_mb", "swap_mb", "conexiones", "activas", "colgadas", "abortadas", "lentas_5s", "bloqueos", "que_hacer"];
if (!existsSync(CSV)) appendFileSync(CSV, "\uFEFF" + cols.join(";") + "\n");
appendFileSync(CSV, cols.map((k) => String(r[k] ?? "").replace(/;/g, ",")).join(";") + "\n");
console.log(JSON.stringify(r, null, 1));
