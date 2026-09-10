// El motivo nuevo (0216) tiene que estar donde se rechaza, para TODOS los
// comerciales, no solo para postventa.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-motivo-no-contactar.mjs
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
const { rows: cat } = await pg.query(
  `select id, activo from catalogo_motivos_rechazo where lower(nombre) = lower($1)`, [MOTIVO]);
af("el motivo existe una sola vez y está activo", cat.length === 1 && cat[0].activo, `${cat.length} fila(s)`);

// Cada comercial activo con cartera: se prueba con dos, uno de ventas y la de
// postventa, que son las dos barras distintas.
const { rows: gente } = await pg.query(
  `select codigo_comercial, id from perfiles
    where rol = 'comercial' and activo and not es_prueba and codigo_comercial in ('C5','PV1')`);
for (const p of gente) {
  const { data: u } = await admin.auth.admin.getUserById(p.id);
  const cookie = await sesion(u.user.email);
  // La oportunidad viva más reciente de esa persona: es donde se rechaza.
  const { rows: [op] } = await pg.query(
    `select id from oportunidades
      where comercial_id = $1 and etapa::text not in ('venta','rechazada','derivada','historico')
      order by updated_at desc limit 1`, [p.id]);
  if (!op) { console.log(`  (${p.codigo_comercial} no tiene ninguna oportunidad viva: no hay dónde probar)`); continue; }
  const h = await (await fetch(`${BASE}/comercial/oportunidades/${op.id}`, { headers: { cookie } })).text();
  af(`${p.codigo_comercial} ve el motivo al rechazar`, h.includes(MOTIVO), `expediente ${op.id.slice(0, 8)}`);
  af(`${p.codigo_comercial} sigue viendo los de siempre`, h.includes("Compró a la competencia") && h.includes("No responde / silencio"));
}

console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
