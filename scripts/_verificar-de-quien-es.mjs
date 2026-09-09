// «No puedo registrar la gestión que se envió una cotización» (postventa,
// 09-09). Podía: estaba parada en el expediente de otra persona y la ficha le
// rotulaba «solo lectura» TODOS, incluidos los suyos, porque comparaba contra
// el dueño del CLIENTE. Esto comprueba que ahora compara contra quien mira.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-de-quien-es.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function sesion(email) {
  for (let i = 0; i < 8; i++) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (!data?.properties) { await new Promise((r) => setTimeout(r, 4000)); continue; }
    const jar = new Map();
    const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
    await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
    return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  }
  throw new Error("no abrió sesión");
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
// Un cliente que sirva de banco de pruebas: su ficha es de alguien y tiene
// expedientes de MÁS DE UNA persona. Se busca vivo, no se fija a mano.
const { rows: [caso] } = await pg.query(`
  select c.id::text cuenta, c.razon_social,
         count(distinct o.comercial_id) duenos,
         count(*) filter (where o.comercial_id = c.comercial_id) del_dueno_de_la_ficha
    from cuentas c join oportunidades o on o.cuenta_id = c.id
   where c.comercial_id is not null and o.comercial_id is not null
   group by 1,2 having count(distinct o.comercial_id) >= 2
   order by count(*) desc limit 1`);
const { rows: gente } = await pg.query(`
  select p.id::text, coalesce(p.codigo_comercial, p.rol::text) quien, u.email,
         (select count(*) from oportunidades o where o.cuenta_id = '${caso.cuenta}' and o.comercial_id = p.id) suyas,
         (select count(*) from oportunidades o where o.cuenta_id = '${caso.cuenta}' and o.comercial_id <> p.id) ajenas
    from perfiles p join auth.users u on u.id = p.id
   where p.id in (select distinct comercial_id from oportunidades where cuenta_id = '${caso.cuenta}' and comercial_id is not null)`);
await pg.end();

console.log(`Banco de pruebas: ${caso.razon_social} — expedientes de ${caso.duenos} personas distintas
`);
// SE COMPRUEBA LA REGLA, NO LA FRASE. El rótulo ya cambió dos veces en un día
// —«solo lectura» → «pídaselo para anotar» → «ábralo para pedirlo»— y cada vez
// esta prueba se ponía roja sin que nada estuviera mal. Lo que tiene que ser
// cierto es que la fila AJENA diga de quién es y la propia no lleve nada.
const ROTULO = "de ";
// Se mira FILA POR FILA: qué expedientes salieron en pantalla y de quién es
// cada uno. Contar apariciones sueltas engaña —el HTML repite cada enlace— y
// la ficha no lista todos los expedientes de un cliente con 34.
const pg2 = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg2.connect();
for (const g of gente) {
  const cookie = await sesion(g.email);
  const bruto = await (await fetch(`${BASE}/comercial/cartera/${caso.cuenta}`, { headers: { cookie } })).text();
  // Los <script> traen el mismo texto de la pantalla y ensucian el conteo.
  const html = bruto.replace(new RegExp("<script[^]*?</script>", "gi"), "");
  // Cada fila es un <li> con su enlace; se corta por ahí y se mira dentro.
  const filas = html.split('<li').slice(1)
    .map((t) => {
      const fila = t.slice(0, t.indexOf("</li>") + 1);
      return {
        id: (fila.match(/comercial\/oportunidades\/([0-9a-f-]{36})/) ?? [])[1],
        // «de C4 · …» dentro de una pastilla: es la marca de que el expediente
        // es de otra persona, diga lo que diga el resto de la frase.
        rotulada: /rounded-full[^"]*"[^>]*>\s*de\s+\S+\s*·/.test(fila) || /title="Este expediente es de/.test(fila),
      };
    })
    .filter((f) => f.id);
  const vistos = [...new Set(filas.map((f) => f.id))];
  const { rows: duenos } = await pg2.query(`select id::text, comercial_id::text from oportunidades where id = any($1::uuid[])`, [vistos]);
  const deQuien = new Map(duenos.map((d) => [d.id, d.comercial_id]));
  const ajenasVistas = vistos.filter((id) => deQuien.get(id) !== g.id);
  const propiasVistas = vistos.filter((id) => deQuien.get(id) === g.id);
  const rotuladas = new Set(filas.filter((f) => f.rotulada).map((f) => f.id));
  console.log(`— ${g.quien}: ${vistos.length} expedientes en pantalla (${propiasVistas.length} suyos, ${ajenasVistas.length} de otros)`);
  afirmar(`${g.quien}: se rotulan TODOS los ajenos`, ajenasVistas.every((id) => rotuladas.has(id)), `${[...rotuladas].length} rotulados`);
  afirmar(`${g.quien}: NO se rotula ninguno suyo`, propiasVistas.every((id) => !rotuladas.has(id)));
  afirmar(`${g.quien}: el rótulo viejo «solo lectura» ya no está`, !html.includes("· solo lectura"));
}
await pg2.end();
console.log(`
${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
