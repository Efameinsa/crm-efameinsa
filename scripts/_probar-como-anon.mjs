// Qué consigue el rol anónimo (la clave pública sin sesión) en la base.
// Todo corre dentro de una transacción que se deshace: no queda nada escrito.
// No imprime datos: solo cuántas filas o si devolvió algo.
//   node --env-file=.env.local scripts/_probar-como-anon.mjs
import { Client } from "pg";

const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();

async function comoAnon(sql, params = []) {
  await cliente.query("begin");
  try {
    await cliente.query("set local statement_timeout = '8s'");
    await cliente.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await cliente.query("set local role anon");
    const r = await cliente.query(sql, params);
    return { filas: r.rows };
  } catch (e) {
    return { error: `${e.code ?? ""} ${e.message}`.trim() };
  } finally {
    await cliente.query("rollback");
  }
}

// 1. Tablas y vistas: ¿anon ve alguna fila?
const { rows: relaciones } = await cliente.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`);
const visibles = [], negadas = [], lentas = [];
for (const { relname } of relaciones) {
  const r = await comoAnon(`select count(*)::int as n from (select 1 from public."${relname}" limit 1) x`);
  if (r.error) (/42501/.test(r.error) ? negadas : lentas).push(`${relname} (${r.error.slice(0, 60)})`);
  else if (r.filas[0].n > 0) visibles.push(relname);
}
console.log(`tablas/vistas: ${relaciones.length} · anon VE filas en: ${visibles.length ? visibles.join(", ") : "ninguna"}`);
console.log(`  permiso negado: ${negadas.length} · sin respuesta/otro error: ${lentas.length ? lentas.join("; ") : 0}`);

// 2. La cadena del PIN de supervisor.
const sup = await comoAnon("select id from supervisores_del_pin()");
console.log("\nsupervisores_del_pin():", sup.error ?? `${sup.filas.length} supervisores devueltos`);
if (!sup.error && sup.filas.length) {
  const v = await comoAnon("select ventana_pin_actual() as v");
  console.log("ventana_pin_actual():", v.error ?? "devuelve la ventana vigente");
  if (!v.error) {
    const pin = await comoAnon("select codigo_pin_supervisor($1, $2) as pin", [sup.filas[0].id, v.filas[0].v]);
    const p = pin.filas?.[0]?.pin;
    console.log("codigo_pin_supervisor():", pin.error ?? (p ? `DEVUELVE un código de ${String(p).length} caracteres` : "devuelve vacío"));
    if (p) {
      const val = await comoAnon("select validar_pin_supervisor($1) as quien", [p]);
      console.log("validar_pin_supervisor(ese código):", val.error ?? (val.filas[0].quien ? "LO ACEPTA como válido" : "no lo acepta"));
    }
  }
}

// 3. Lecturas sin guarda.
for (const [nombre, sql] of [
  ["uso_de_listas()", "select count(*)::int as n from uso_de_listas()"],
  ["pin_libre_hasta()", "select pin_libre_hasta() is not null as n"],
  ["sedes_de_documento(RUC de una ficha real)", "select jsonb_array_length(coalesce(sedes_de_documento((select num_doc from (select '20100000000'::text as num_doc) z)), '[]'::jsonb)) as n"],
  ["finanzas_marketing (con guarda)", "select 1 as n from pg_proc where proname = 'finanzas_marketing' limit 1"],
]) {
  const r = await comoAnon(sql);
  console.log(`${nombre}:`, r.error ?? `responde (${JSON.stringify(r.filas[0].n)})`);
}

// 4. Escrituras sin guarda, deshechas: ¿llegan a escribir?
for (const [nombre, sql] of [
  ["siguiente_correlativo('prueba_auditoria_anon')", "select siguiente_correlativo('prueba_auditoria_anon') as n"],
  ["crear_notificacion a un usuario cualquiera", null],
]) {
  if (!sql) continue;
  const r = await comoAnon(sql);
  console.log(`${nombre}:`, r.error ?? `EJECUTA y devuelve ${JSON.stringify(r.filas[0].n)} (deshecho)`);
}
const firma = await cliente.query(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname = 'crear_notificacion' and pronamespace = 'public'::regnamespace`);
console.log("crear_notificacion firma:", firma.rows.map((r) => r.a).join(" | "));

await cliente.end();
