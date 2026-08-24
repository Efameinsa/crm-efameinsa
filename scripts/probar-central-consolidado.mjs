// Verifica lo que se construyó el 24-08 para Central y los comerciales:
//   · el consolidado del día de Central (derivados / cotizaciones / informes)
//   · que el comercial pueda pasarle un contacto a Central
//   · y que NO pueda autoasignárselo (la regla que insistió gerencia)
//
// Uso: node --env-file=.env.local scripts/probar-central-consolidado.mjs [url]

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL_APP = process.argv[2] ?? "http://localhost:3000";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bd = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallas = 0;
const ok = (b, t, e = "") => { console.log(`${b ? "✓" : "✗"} ${t}${e ? ` — ${e}` : ""}`); if (!b) fallas++; };

async function sesion(filtro) {
  const { data: p } = await admin.from("perfiles").select("id, nombre").match(filtro).single();
  const { data: u } = await admin.auth.admin.getUserById(p.id);
  let enl = null;
  for (let i = 1; i <= 4 && !enl; i++) {
    const r = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    enl = r.data?.properties ? r.data : null;
    if (!enl) await new Promise((x) => setTimeout(x, i * 15000));
  }
  if (!enl) return null;
  const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.verifyOtp({ token_hash: enl.properties.hashed_token, type: "magiclink" });
  const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const v = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64");
  const t = v.match(/.{1,3180}/g);
  return {
    perfil: p,
    token: s.session.access_token,
    cookie: t.length === 1 ? `sb-${ref}-auth-token=${t[0]}` : t.map((x, i) => `sb-${ref}-auth-token.${i}=${x}`).join("; "),
  };
}
const pedir = async (ruta, cookie) => {
  const r = await fetch(`${URL_APP}${ruta}`, { headers: { cookie } });
  return { status: r.status, html: (await r.text()).replace(/<!--\s*-->/g, "") };
};

// ── Consolidado de Central ──────────────────────────────────────────────────
const c = await sesion({ rol: "central" });
if (!c) { console.error("rate limit de Supabase; reintentar en un rato."); process.exit(1); }
const central = await pedir("/central", c.cookie);
ok(central.status === 200 && central.html.includes("Consolidado del día"), "Central ve su consolidado del día");
for (const dato of ["Derivados hoy", "Cotizaciones", "Informes de cierre", "Sin asignar"]) {
  ok(central.html.includes(dato), `  · el consolidado trae "${dato}"`);
}
const { rows: sup } = await bd.query(`select supervision_diaria(current_date) d`);
const totales = sup[0].d.totales;
ok(typeof totales.derivados === "number", "supervision_diaria devuelve derivados", `hoy: ${totales.derivados}`);

// ── El comercial pasa un contacto a Central ─────────────────────────────────
const com = await sesion({ codigo_comercial: "C5" });
const miDia = await pedir("/comercial", com.cookie);
ok(miDia.html.includes("Pasar contacto a Central"), "el comercial tiene el botón en Mi día");

const supaCom = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${com.token}` } },
});

const MARCA = "[prueba automática consolidado]";
const { data: creado, error: eIns } = await supaCom
  .from("leads")
  .insert({
    canal: "whatsapp",
    area_destino: "comercial",
    estado: "pendiente_triaje",
    nombre_contacto: `${MARCA} contacto`,
    mensaje: "secadora 25 kg a vapor",
    recibido_por: com.perfil.id,
  })
  .select("id, codigo, estado, asignado_a")
  .single();
ok(!eIns && creado, "el comercial PUEDE registrar un contacto para Central", eIns?.message ?? creado?.codigo);
if (creado) {
  ok(creado.estado === "pendiente_triaje" && creado.asignado_a === null, "  · entra a la cola de triaje, sin asignar");
}

// La regla de gerencia: no puede autoasignárselo.
const { error: eAuto } = await supaCom.from("leads").insert({
  canal: "whatsapp",
  area_destino: "comercial",
  estado: "pendiente_triaje",
  nombre_contacto: `${MARCA} autoasignado`,
  asignado_a: com.perfil.id,
  recibido_por: com.perfil.id,
});
ok(Boolean(eAuto), "el comercial NO puede autoasignarse el contacto (regla de gerencia)", eAuto?.code ?? "");

// Y que Central lo vea en su bandeja.
if (creado) {
  const band = await pedir("/central", c.cookie);
  ok(band.html.includes(`${MARCA} contacto`), "el contacto aparece en la bandeja de Central");
  ok(band.html.includes("secadora 25 kg a vapor"), "  · con lo que solicita");
}

// ── Limpieza: esto es producción ────────────────────────────────────────────
const { rowCount } = await bd.query(`delete from leads where nombre_contacto like $1`, [`${MARCA}%`]);
console.log(`\nLimpieza: ${rowCount} lead(s) de prueba borrado(s).`);
await bd.end();

console.log(fallas === 0 ? "\n✓ Todo verificado" : `\n✗ ${fallas} comprobación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
