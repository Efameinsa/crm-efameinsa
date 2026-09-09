// Reunión del 09-09: «ya revisamos lo que se está ejecutando, pero me sigue
// saliendo ahí como pendiente». La bandeja tenía razón —eso no se había
// tocado— pero callaba que del MISMO cliente ya había otros en curso.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-bandeja-en-curso.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: "postventa@efameinsa.com" });
const jar = new Map();
const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

// La verdad la manda la base, no una lista escrita a mano.
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: esperado } = await pg.query(`
  with op as (
    select o.cuenta_id, o.id, (select count(*) from actividades a where a.oportunidad_id = o.id) g
      from oportunidades o
     where o.origen = 'crm' and o.etapa = 'asignada' and o.tipo_postventa is not null)
  select c.razon_social cliente,
         count(*) filter (where op.g = 0) sin_atender,
         count(*) filter (where op.g > 0) en_curso
    from op join cuentas c on c.id = op.cuenta_id
   group by 1 having count(*) filter (where op.g > 0) > 0 and count(*) filter (where op.g = 0) > 0
   order by 3 desc, 2 desc`);
await pg.end();

const bruto = await (await fetch(`${BASE}/postventa`, { headers: { cookie } })).text();
const html = bruto.replace(new RegExp("<script[^]*?</script>", "gi"), "");
const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

console.log(`Clientes con cosas sin atender Y cosas ya en curso: ${esperado.length}\n`);
afirmar("la bandeja ya no dice «casos activos», que no era verdad", !texto.includes("casos activos"));
for (const e of esperado) {
  const corto = e.cliente.slice(0, 18);
  if (!texto.includes(corto)) { console.log(`  · ${corto}… no sale hoy en la bandeja`); continue; }
  const frase = Number(e.en_curso) === 1 ? "1 ya en curso" : `${e.en_curso} ya en curso`;
  const frase1 = Number(e.en_curso) === 1 ? "Ya hay 1 expediente en curso" : `Ya hay ${e.en_curso} expedientes en curso`;
  afirmar(`${corto}…: dice que ya hay ${e.en_curso} en curso`, texto.includes(frase) || texto.includes(frase1),
    `${e.sin_atender} sin atender`);
}
console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
