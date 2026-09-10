// «Solicitó ya no ser contactado» (0216/0217), comprobado de punta a punta:
// que rechazar con ese motivo marque la ficha, que las campañas dejen de
// ofrecer llamarlo, y que la marca no se ponga sola con cualquier otro rechazo.
//
// Toca datos REALES: marca una cuenta, mira las pantallas y la deja como
// estaba. La prueba del disparador va dentro de una transacción que se revierte.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-no-contactar.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const MOTIVO = "Solicitó ya no ser contactado";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

// ── 1. El disparador, en una transacción que se revierte ──────────────────
console.log("El disparador:");
const { rows: [m] } = await pg.query(`select id from catalogo_motivos_rechazo where lower(nombre) = lower($1)`, [MOTIVO]);
const { rows: [otro] } = await pg.query(`select id from catalogo_motivos_rechazo where lower(nombre) = lower('No responde / silencio')`);
const { rows: [caso] } = await pg.query(`
  select o.id, o.cuenta_id, o.etapa::text etapa, o.motivo_rechazo_id
    from oportunidades o join cuentas c on c.id = o.cuenta_id
   where c.no_contactar_at is null and o.etapa::text not in ('venta','rechazada')
   limit 1`);

await pg.query("begin");
try {
  await pg.query(`update oportunidades set etapa = 'rechazada', motivo_rechazo_id = $2 where id = $1`, [caso.id, otro.id]);
  const { rows: [a] } = await pg.query(`select no_contactar_at from cuentas where id = $1`, [caso.cuenta_id]);
  af("un rechazo cualquiera NO marca la ficha", a.no_contactar_at === null, String(a.no_contactar_at));

  await pg.query(`update oportunidades set motivo_rechazo_id = $2 where id = $1`, [caso.id, m.id]);
  const { rows: [b] } = await pg.query(`select no_contactar_at, no_contactar_nota from cuentas where id = $1`, [caso.cuenta_id]);
  af("con ESE motivo, la ficha queda marcada", b.no_contactar_at !== null, b.no_contactar_nota ?? "");

  await pg.query(`update oportunidades set etapa = 'seguimiento', motivo_rechazo_id = null where id = $1`, [caso.id]);
  const { rows: [c] } = await pg.query(`select no_contactar_at from cuentas where id = $1`, [caso.cuenta_id]);
  af("reabrir la oportunidad NO le quita la marca al cliente", c.no_contactar_at !== null);
} finally {
  await pg.query("rollback");
}
const { rows: [limpio] } = await pg.query(`select no_contactar_at from cuentas where id = $1`, [caso.cuenta_id]);
af("la prueba no dejó rastro", limpio.no_contactar_at === null);

// ── 2. Las pantallas ──────────────────────────────────────────────────────
console.log("\nLas campañas, con un cliente marcado de verdad:");
// Uno que esté en la ruta de mantenimiento, para verlo en las dos pantallas.
// Tiene que estar VIVO en la campaña: en una fila ya cerrada no hay botón de
// llamar que esconder, así que no probaría nada.
const { rows: [enRuta] } = await pg.query(`
  select distinct c.id, c.razon_social
    from oportunidades o join cuentas c on c.id = o.cuenta_id
   where o.tipo_postventa = 'mantenimiento' and c.no_contactar_at is null
     and o.cerrada_at is null and o.etapa::text not in ('venta','rechazada','derivada','historico')
     and exists (select 1 from contactos ct where ct.cuenta_id = c.id and ct.telefono_normalizado <> '')
   limit 1`);
console.log(`  (marcando temporalmente a ${enRuta.razon_social})`);
await pg.query(`update cuentas set no_contactar_at = now(), no_contactar_nota = 'PRUEBA' where id = $1`, [enRuta.id]);
try {
  const cookie = await sesion("postventa1@efameinsa.com");
  // La ruta tiene pestañas y el cliente cae en una sola: se busca en todas, que
  // es lo que haría la persona.
  let ruta = "", pestana = null;
  for (const p of ["por_llamar", "llamados", "cotizados", "cerrados"]) {
    const h = await (await fetch(`${BASE}/comercial/ruta?ver=${p}&todos=1&q=${encodeURIComponent(enRuta.razon_social.slice(0, 18))}`, { headers: { cookie } })).text();
    if (h.includes(enRuta.razon_social.slice(0, 18))) { ruta = h; pestana = p; break; }
  }
  af("la ruta lo encuentra", Boolean(pestana), `pestaña ${pestana ?? "ninguna"}`);
  af("la ruta lo marca", ruta.includes("Pidió que no lo contacten"));
  af("y ya no ofrece llamarlo ni escribirle", Boolean(pestana) && !ruta.includes("wa.me/51") && !ruta.includes('href="tel:'), "sin botones de llamada");

  const parque = await (await fetch(`${BASE}/comercial/parque?todos=1&todas=1&q=${encodeURIComponent(enRuta.razon_social.slice(0, 18))}`, { headers: { cookie } })).text();
  af("«Las ventas de la empresa» lo marca", parque.includes("Pidió que no lo contacten"));
  af("y no le ofrece abrirle un mantenimiento", !parque.includes("Ofrecer mantenimiento"));
} finally {
  await pg.query(`update cuentas set no_contactar_at = null, no_contactar_nota = null where id = $1`, [enRuta.id]);
}
const { rows: [devuelto] } = await pg.query(`select no_contactar_at from cuentas where id = $1`, [enRuta.id]);
af("el cliente quedó como estaba", devuelto.no_contactar_at === null);

console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
