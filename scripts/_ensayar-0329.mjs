// Ensayo de la 0329 contra producción, dentro de UNA transacción que se deshace.
// Compara quién puede qué antes y después, y prueba como anónimo, como extraño
// con sesión y como personas reales del CRM. No deja nada escrito.
//   node --env-file=.env.local scripts/_ensayar-0329.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(RAIZ, "supabase", "migrations", "0329_la_clave_publica_no_abre_nada.sql"), "utf8");

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p = []) => (await c.query(s, p)).rows;

const ROLES = ["anon", "authenticated", "service_role", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "dashboard_user"];

async function foto() {
  const roles = (await q(`select rolname from pg_roles where rolname = any($1)`, [ROLES])).map((r) => r.rolname);
  const f = {};
  for (const rol of roles) {
    const fn = await q(
      `select p.oid::regprocedure::text as x from pg_proc p
        where p.pronamespace = 'public'::regnamespace and has_function_privilege($1, p.oid, 'execute') order by 1`,
      [rol],
    );
    const tb = await q(
      `select c.relname || ':' ||
              (case when has_table_privilege($1, c.oid, 'select') then 'S' else '-' end) ||
              (case when has_table_privilege($1, c.oid, 'insert') then 'I' else '-' end) ||
              (case when has_table_privilege($1, c.oid, 'update') then 'U' else '-' end) ||
              (case when has_table_privilege($1, c.oid, 'delete') then 'D' else '-' end) as x
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`,
      [rol],
    );
    f[rol] = { fn: new Set(fn.map((r) => r.x)), tb: new Set(tb.map((r) => r.x)) };
  }
  return f;
}

let paso = 0;
async function como(claims, rol, s, p = []) {
  const sp = `s${++paso}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`set local role ${rol}`);
    const r = await c.query(s, p);
    return { filas: r.rows };
  } catch (e) {
    return { error: `${e.code ?? ""} ${e.message}`.trim().slice(0, 90) };
  } finally {
    await c.query(`rollback to savepoint ${sp}`);
    await c.query("reset role");
  }
}
const anon = (s, p) => como({ role: "anon" }, "anon", s, p);
const sesion = (id) => (s, p) => como({ role: "authenticated", sub: id, aud: "authenticated" }, "authenticated", s, p);

let mal = 0;
const dice = (ok, texto) => {
  if (!ok) mal++;
  console.log(`  ${ok ? "✓" : "✗"} ${texto}`);
};

await c.query("begin");
try {
  await c.query("set local lock_timeout = '5s'");
  await c.query("set local statement_timeout = '60s'");
  const antes = await foto();
  const t0 = Date.now();
  await c.query(sql);
  console.log(`la migración corre en ${Date.now() - t0} ms\n`);
  const despues = await foto();

  console.log("— Quién pierde qué —");
  for (const rol of Object.keys(antes)) {
    const pierdeFn = [...antes[rol].fn].filter((x) => !despues[rol].fn.has(x));
    const ganaFn = [...despues[rol].fn].filter((x) => !antes[rol].fn.has(x));
    const cambiaTb = [...despues[rol].tb].filter((x) => !antes[rol].tb.has(x));
    console.log(
      `  ${rol.padEnd(24)} funciones: ${antes[rol].fn.size} → ${despues[rol].fn.size}` +
        (pierdeFn.length && rol !== "anon" ? ` | pierde: ${pierdeFn.map((x) => x.split("(")[0]).join(", ")}` : "") +
        (ganaFn.length ? ` | gana: ${ganaFn.map((x) => x.split("(")[0]).join(", ")}` : "") +
        ` | tablas que cambian: ${rol === "anon" ? cambiaTb.length : cambiaTb.join(", ") || 0}`,
    );
  }
  const quedanAnon = [...despues.anon.fn].map((x) => x.split("(")[0]);
  const deExtension = new Set(
    (await q(`select p.proname from pg_proc p join pg_depend d on d.objid = p.oid and d.deptype = 'e' and d.classid = 'pg_proc'::regclass where p.pronamespace = 'public'::regnamespace`)).map((r) => r.proname),
  );
  console.log("  a anon le quedan, fuera de las de extensiones:", quedanAnon.filter((n) => !deExtension.has(n)).join(", ") || "ninguna");

  console.log("\n— Sin sesión (anon) —");
  for (const [nombre, s] of [
    ["leer notificaciones", "select 1 from notificaciones limit 1"],
    ["lista de supervisores", "select * from supervisores_del_pin()"],
    ["código del supervisor", `select codigo_pin_supervisor('${randomUUID()}', 1)`],
    ["gastar un correlativo", "select siguiente_correlativo_anual('Presu')"],
    ["dejar una notificación", `select crear_notificacion('${randomUUID()}', null, 'x', 'x', 'x', 'x')`],
  ]) {
    const r = await anon(s);
    dice(/42501/.test(r.error ?? ""), `${nombre}: ${r.error ?? "RESPONDE"}`);
  }
  const a = await anon(`select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'adjuntos' limit 5) x`);
  dice(a.filas?.[0]?.n === 0, `adjuntos visibles: ${a.error ?? a.filas[0].n}`);
  const pub = await anon(`select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'productos' limit 5) x`);
  dice(pub.filas?.[0]?.n > 0, `fotos de productos (bucket público) siguen visibles: ${pub.error ?? pub.filas[0].n}`);

  console.log("\n— Extraño con sesión y sin perfil —");
  const extrano = sesion(randomUUID());
  const e1 = await extrano(`select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'adjuntos' limit 5) x`);
  dice(e1.filas?.[0]?.n === 0, `adjuntos visibles: ${e1.error ?? e1.filas[0].n}`);
  const e2 = await extrano("select 1 from v_ventas_detalle limit 1");
  dice(/42501/.test(e2.error ?? ""), `ventas con montos: ${e2.error ?? "RESPONDE"}`);
  const e3 = await extrano(`select codigo_pin_supervisor('${randomUUID()}', 1)`);
  dice(/42501/.test(e3.error ?? ""), `código del supervisor: ${e3.error ?? "RESPONDE"}`);

  console.log("\n— Personas reales del CRM —");
  const gente = await q(`
    select distinct on (rol) id, rol::text as rol from perfiles
     where activo and rol::text in ('gerencia','comercial','central','postventa','operaciones','almacen','finanzas')
     order by rol, created_at`);
  const unaCuenta = (await q("select id from cuentas order by created_at desc limit 1"))[0]?.id;
  for (const p of gente) {
    const yo = sesion(p.id);
    const pruebas = [
      ["su campana", "select count(*)::int as n from notificaciones"],
      ["comunicado pendiente", "select * from comunicado_pendiente()"],
      ["adjuntos", "select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'adjuntos' limit 5) x"],
      ["supervisores del PIN", "select count(*)::int as n from supervisores_del_pin()"],
      ["tipificación WhatsApp", "select count(*)::int as n from (select 1 from tipificacion_whatsapp_actual limit 5) x"],
      ["grupo económico", `select count(*)::int as n from grupo_economico('${unaCuenta}')`],
      ["catálogo", "select count(*)::int as n from (select 1 from productos limit 5) x"],
      ["oportunidades", "select count(*)::int as n from (select 1 from oportunidades limit 5) x"],
    ];
    if (p.rol === "gerencia") pruebas.push(["su propio código", "select mi_pin_supervisor() is not null as n"], ["finanzas y marketing", "select 1 as n from pg_proc where proname = 'finanzas_marketing'"]);
    const res = [];
    for (const [nombre, s] of pruebas) {
      const r = await yo(s);
      if (r.error) res.push(`${nombre}: ✗ ${r.error}`);
      else res.push(`${nombre}: ${JSON.stringify(r.filas[0]?.n ?? "ok")}`);
    }
    const fallos = res.filter((x) => x.includes("✗"));
    dice(fallos.length === 0, `${p.rol.padEnd(12)} ${fallos.length ? fallos.join(" | ") : res.join(" · ")}`);
  }

  console.log("\n— Funciones que por dentro usan las piezas que se cerraron —");
  const dePostventa = gente.find((p) => p.rol === "postventa") ?? gente.find((p) => p.rol === "comercial");
  const deCentral = gente.find((p) => p.rol === "central");
  const deComercial = gente.find((p) => p.rol === "comercial");
  const unLead = (await q("select id from leads order by recibido_at desc limit 1"))[0]?.id;
  for (const [nombre, quien, s] of [
    ["número de informe de servicio (usa siguiente_correlativo_de_practica)", dePostventa, "select siguiente_correlativo_informe_servicio(2026) as n"],
    ["cartera en juego al asignar (usa sede_para_lead)", deCentral, `select count(*)::int as n from cartera_en_juego('${unLead}', '${deComercial?.id}')`],
    ["validar un código (usa codigo_pin_supervisor)", deCentral, "select validar_pin_supervisor('0000') is null as n"],
    ["subir un adjunto", deComercial, `insert into storage.objects (bucket_id, name, owner) values ('adjuntos', 'prueba-0329/${randomUUID()}.txt', '${deComercial?.id}') returning 1 as n`],
  ]) {
    if (!quien) continue;
    const r = await sesion(quien.id)(s);
    // Un «no» de la regla del negocio (P0001) también prueba que la función corrió.
    dice(!r.error || /^P0001/.test(r.error), `${nombre} [${quien.rol}]: ${r.error ?? JSON.stringify(r.filas[0]?.n)}`);
  }
  const sube = await sesion(randomUUID())(`insert into storage.objects (bucket_id, name) values ('adjuntos', 'prueba-0329/${randomUUID()}.txt') returning 1 as n`);
  dice(/42501/.test(sube.error ?? ""), `un extraño con sesión intenta subir un adjunto: ${sube.error ?? "SUBE"}`);

  console.log("\n— Lo que se cree desde hoy —");
  await c.query("create function public._prueba_0329() returns int language sql as 'select 1'");
  await c.query("create table public._prueba_0329_t (id int)");
  const n = await q(`select has_function_privilege('anon', 'public._prueba_0329()', 'execute') as fa,
                            has_function_privilege('authenticated', 'public._prueba_0329()', 'execute') as fu,
                            has_function_privilege('service_role', 'public._prueba_0329()', 'execute') as fs,
                            has_table_privilege('anon', 'public._prueba_0329_t', 'select') as ta,
                            has_table_privilege('authenticated', 'public._prueba_0329_t', 'select') as tu`);
  dice(!n[0].fa && n[0].fu && n[0].fs, `función nueva → anon: ${n[0].fa}, con sesión: ${n[0].fu}, servicio: ${n[0].fs}`);
  dice(!n[0].ta && n[0].tu, `tabla nueva → anon: ${n[0].ta}, con sesión: ${n[0].tu}`);
} catch (e) {
  mal++;
  console.error("✗ el ensayo reventó:", e.message);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(mal ? `\n${mal} cosas mal. No se aplica.` : "\nTodo bien. Deshecho: producción sigue como estaba.");
process.exitCode = mal ? 1 : 0;
