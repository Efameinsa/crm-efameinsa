// La regla de la 0220 con sesiones reales: postventa vincula la carpeta de un
// cliente de otra cartera (el caso SÁNCHEZ DIESTRA de Ariana), un comercial
// ajeno no puede, y el error se dice con palabras en vez de «no pasa nada».
//   node --env-file=.env.local scripts/_verificar-vincular-carpeta.mjs
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };
async function como(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const cli = createClient(url, anon, { auth: { persistSession: false } });
  await cli.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return cli;
}
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const CUENTA = "d1262fbd-50c5-4a6b-a4e5-704b64051b7d"; // SÁNCHEZ DIESTRA DAVID, cartera de C5
// La ruta se toma del índice, no se escribe a mano: las barras de Windows se
// comen fácil en una cadena y la prueba fallaría por eso y no por la regla.
const { rows: [carpeta] } = await pg.query(`select ruta from carpetas_servidor where clase = 'fotos' and ruta ilike '%SANCHEZ DIESTRA%' limit 1`);
const RUTA = carpeta.ruta;

const c1 = await como((await admin.auth.admin.getUserById((await pg.query(`select id from perfiles where codigo_comercial='C1'`)).rows[0].id)).data.user.email);
const r0 = await c1.rpc("vincular_carpeta_servidor", { p_cuenta: CUENTA, p_clase: "fotos", p_ruta: RUTA });
af("un comercial de OTRA cartera no puede, y se le dice", Boolean(r0.error) && /cartera|postventa|gerencia/i.test(r0.error.message), r0.error?.message?.slice(0, 80));

const pv1 = await como("postventa1@efameinsa.com");
const r1 = await pv1.rpc("vincular_carpeta_servidor", { p_cuenta: CUENTA, p_clase: "fotos", p_ruta: "W:\NO\EXISTE" });
af("una carpeta fuera del índice se rechaza con explicación", Boolean(r1.error) && /índice/i.test(r1.error.message), r1.error?.message?.slice(0, 70));
const r2 = await pv1.rpc("vincular_carpeta_servidor", { p_cuenta: CUENTA, p_clase: "fotos", p_ruta: RUTA });
af("Ariana (PV1) vincula la carpeta de fotos de un cliente de C5", !r2.error && r2.data === "Carpeta vinculada", r2.error?.message ?? r2.data);
const { rows: [c] } = await pg.query(`select carpetas_servidor from cuentas where id = $1`, [CUENTA]);
af("y queda guardado en la ficha", c.carpetas_servidor?.fotos === RUTA, JSON.stringify(c.carpetas_servidor));
const { rows: [d] } = await pg.query(`select p.codigo_comercial from cuentas c join perfiles p on p.id=c.comercial_id where c.id=$1`, [CUENTA]);
af("la cartera no se movió", d.codigo_comercial === "C5", d.codigo_comercial);
console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
