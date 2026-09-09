// «Cuando deriva esa llamada, tiene que ir con el histórico de las incidencias
// de ese equipo… no solo el histórico de la llamada, sino más bien los
// informes» (Carlos, 09-09).
//
// Todavía ninguna máquina REAL tiene dos incidencias —el circuito es nuevo—,
// así que el caso importante se arma DE PRÁCTICA: una segunda atención sobre
// el mismo equipo del caso de práctica, que se borra al terminar pase lo que
// pase.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-historial-del-equipo.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "http://localhost:3000";
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
  throw new Error(`no abrió sesión de ${email}`);
}
const sinScripts = (h) => h.replace(new RegExp("<script[^]*?</script>", "gi"), "");
const ficha = async (id, cookie) => sinScripts(await (await fetch(`${BASE}/postventa/atenciones/${id}`, { headers: { cookie } })).text());

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
let creada = null;
try {
  const real = await sesion("postventa@efameinsa.com");
  const practica = await sesion("postventa2@efameinsa.com");

  // 1) Una máquina con UNA sola incidencia: el bloque tiene que decirlo, no
  //    mostrar una lista vacía que parezca un error.
  const { rows: [sola] } = await pg.query(`
    select a.id::text from atenciones a
     where a.equipo_id is not null and not coalesce(a.es_prueba, false)
       and (select count(*) from atenciones b where b.equipo_id = a.equipo_id) = 1
     order by a.solicitado_at desc limit 1`);
  if (sola) {
    const h = await ficha(sola.id, real);
    afirmar("con una sola incidencia lo dice, no miente con una lista vacía",
      h.includes("Es la primera vez que esta máquina"));
  }

  // 2) Una máquina con DOS: tiene que listar la anterior y avisar de los ciclos.
  const { rows: [base] } = await pg.query(
    `select id::text, equipo_id::text, cuenta_id::text, tipo::text from atenciones
      where es_prueba and equipo_id is not null order by id limit 1`);
  if (!base) {
    console.log("  (no hay caso de práctica con equipo: no se pudo probar el histórico)");
  } else {
    const { rows: [nueva] } = await pg.query(
      `insert into atenciones (cuenta_id, equipo_id, tipo, etapa, detalle, solicitado_at, registrado_at,
                               diagnostico, ciclos, cerrado_at, es_prueba)
       values ($1, $2, $3, 'cierre', 'PRUEBA — incidencia anterior', now() - interval '40 days',
               now() - interval '40 days', 'PRUEBA: se cambió la resistencia', 1000,
               now() - interval '39 days', true)
       returning id::text`,
      [base.cuenta_id, base.equipo_id, base.tipo]);
    creada = nueva.id;

    const h = await ficha(base.id, practica);
    afirmar("la ficha trae el bloque de la máquina", h.includes("Lo que ya se le hizo a ESTA máquina"));
    afirmar("lista la incidencia anterior", h.includes("se cambió la resistencia"));
    // El número y la palabra viajan en nodos distintos —React mete un
    // comentario entre las dos— así que buscar «1,000 ciclos» de corrido falla
    // aunque en pantalla se lea así.
    afirmar("y avisa de los ciclos ya trabajados", h.includes("La última lectura dice") && h.includes("ciclos"));
    afirmar("no se lista a sí misma", !h.includes(`/postventa/atenciones/${base.id}"`));
  }
} finally {
  if (creada) {
    await pg.query(`delete from atenciones where id = $1 and es_prueba`, [creada]);
    const { rows: [q] } = await pg.query(`select count(*) n from atenciones where id = $1`, [creada]);
    afirmar("la incidencia de práctica se borró", q.n === "0");
  }
  await pg.end();
}
console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
