// Saltear una etapa que no aplica (0198). Se prueba sobre la atención DE
// PRÁCTICA y se la devuelve exactamente a como estaba.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";
const BASE = process.env.BASE ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "postventa2@efameinsa.com" });
const jar = new Map();
const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: [a] } = await pg.query(`select * from atenciones where es_prueba order by id limit 1`);
const antes = { etapa: a.etapa, omitidas: a.etapas_omitidas, programada: a.programada_at };

try {
  await pg.query(`update atenciones set etapa='diagnostico', etapas_omitidas='{}'::jsonb, programada_at=null where id=$1`, [a.id]);
  const ficha = async () => (await (await fetch(`${BASE}/postventa/atenciones/${a.id}`, { headers: { cookie } })).text())
    .replace(new RegExp("<script[^]*?</script>", "gi"), "");
  const h1 = await ficha();
  afirmar("en el paso que toca se ofrece saltear", h1.includes("no aplica en este caso"), "«Planificación»");

  await pg.query(`select omitir_etapa_atencion($1,'planificacion','se resolvió por videollamada, no hay visita')`, [a.id]);
  const h2 = await ficha();
  afirmar("la tira dice «no aplicó» en vez de una fecha", h2.includes("no aplicó"));
  afirmar("y NO la pinta como cumplida", (h2.match(new RegExp("no aplicó", "g")) ?? []).length >= 1);
  const { rows: [d] } = await pg.query(`select etapa, programada_at, etapas_omitidas from atenciones where id=$1`, [a.id]);
  afirmar("el caso avanzó sin sellar la visita", d.etapa === "planificacion" && d.programada_at === null);
  afirmar("queda escrito por qué", String(d.etapas_omitidas?.planificacion?.motivo ?? "").includes("videollamada"));
  afirmar("el motivo viaja a la pantalla", h2.includes("videollamada"));

  await pg.query(`select omitir_etapa_atencion($1,'atencion','el técnico no tiene que ir')`, [a.id]);
  const { rows: [e] } = await pg.query(`select etapa from atenciones where id=$1`, [a.id]);
  afirmar("se puede saltear la siguiente (el «check, check»)", e.etapa === "atencion");
} finally {
  await pg.query(`update atenciones set etapa=$2, etapas_omitidas=$3, programada_at=$4 where id=$1`,
    [a.id, antes.etapa, antes.omitidas ?? {}, antes.programada]);
  const { rows: [f] } = await pg.query(`select etapa from atenciones where id=$1`, [a.id]);
  afirmar(`la atención de práctica volvió a «${antes.etapa}»`, f.etapa === antes.etapa);
  await pg.end();
}
console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
