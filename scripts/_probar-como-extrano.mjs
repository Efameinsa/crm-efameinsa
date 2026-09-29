// Qué consigue alguien que se registra solo en el CRM (sesión válida, SIN perfil)
// y qué hay en las cuentas: usuarios sin perfil, dominios de correo.
// Todo dentro de transacciones que se deshacen. No imprime datos de clientes.
//   node --env-file=.env.local scripts/_probar-como-extrano.mjs
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const extrano = randomUUID();
async function comoExtrano(sql, params = []) {
  await cliente.query("begin");
  try {
    await cliente.query("set local statement_timeout = '8s'");
    await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: "authenticated", sub: extrano, email: "extrano@ejemplo.com", aud: "authenticated" }),
    ]);
    await cliente.query("set local role authenticated");
    const r = await cliente.query(sql, params);
    return { filas: r.rows };
  } catch (e) {
    return { error: `${e.code ?? ""} ${e.message}`.trim() };
  } finally {
    await cliente.query("rollback");
  }
}

// 1. Cuentas.
const { rows: [u] } = await cliente.query(`
  select count(*)::int as total,
         count(*) filter (where p.id is null)::int as sin_perfil,
         count(*) filter (where u.email_confirmed_at is null)::int as sin_confirmar,
         count(*) filter (where u.last_sign_in_at > now() - interval '30 days')::int as entraron_30d,
         count(*) filter (where p.id is not null and p.activo)::int as perfiles_activos
    from auth.users u left join public.perfiles p on p.id = u.id`);
console.log("cuentas:", u);
const { rows: dominios } = await cliente.query(`
  select split_part(u.email, '@', 2) as dominio, count(*)::int as n,
         count(*) filter (where p.id is null)::int as sin_perfil
    from auth.users u left join public.perfiles p on p.id = u.id
   group by 1 order by 2 desc`);
console.log("dominios:", dominios.map((d) => `${d.dominio}: ${d.n}${d.sin_perfil ? ` (${d.sin_perfil} sin perfil)` : ""}`).join(" · "));
const { rows: sinPerfil } = await cliente.query(`
  select split_part(u.email, '@', 2) as dominio, u.created_at::date as creado, u.last_sign_in_at::date as ultimo
    from auth.users u left join public.perfiles p on p.id = u.id where p.id is null order by u.created_at desc limit 10`);
if (sinPerfil.length) console.log("sin perfil (dominio, creado, último ingreso):", sinPerfil);

// 2. Qué ve un extraño con sesión.
const { rows: relaciones } = await cliente.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`);
const ve = [], negadas = [], otros = [];
for (const { relname } of relaciones) {
  const r = await comoExtrano(`select count(*)::int as n from (select 1 from public."${relname}" limit 200) x`);
  if (r.error) (/42501/.test(r.error) ? negadas : otros).push(`${relname} (${r.error.slice(0, 50)})`);
  else if (r.filas[0].n > 0) ve.push(`${relname}${r.filas[0].n === 200 ? " (200+)" : ` (${r.filas[0].n})`}`);
}
console.log(`\nun extraño con sesión VE filas en ${ve.length} de ${relaciones.length}:`);
console.log("  " + (ve.join(", ") || "ninguna"));
console.log(`  permiso negado: ${negadas.length} · otros errores: ${otros.join("; ") || 0}`);

// 3. Las funciones de permiso: ¿alguna devuelve «no se sabe» (null) a quien no tiene perfil?
const { rows: guardas } = await cliente.query(`
  select proname from pg_proc
   where pronamespace = 'public'::regnamespace and pronargs = 0
     and prorettype = 'boolean'::regtype and proname ~ '^(es|puede|ve)_'`);
const nulas = [], ciertas = [];
for (const { proname } of guardas) {
  const r = await comoExtrano(`select public."${proname}"() as v`);
  if (r.error) continue;
  if (r.filas[0].v === null) nulas.push(proname);
  if (r.filas[0].v === true) ciertas.push(proname);
}
console.log(`\nfunciones de permiso probadas: ${guardas.length} · devuelven null: ${nulas.join(", ") || "ninguna"} · devuelven SÍ a un extraño: ${ciertas.join(", ") || "ninguna"}`);

// 4. Archivos: ¿qué ve en el bucket privado?
for (const [quien, fn] of [["extraño con sesión", comoExtrano]]) {
  const r = await fn(`select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'adjuntos' limit 500) x`);
  console.log(`\narchivos de «adjuntos» visibles para un ${quien}:`, r.error ?? (r.filas[0].n === 500 ? "500 o más" : r.filas[0].n));
}
await cliente.query("begin");
await cliente.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
await cliente.query("set local role anon");
const a = await cliente.query(`select count(*)::int as n from (select 1 from storage.objects where bucket_id = 'adjuntos' limit 500) x`).catch((e) => ({ rows: [{ n: e.message }] }));
await cliente.query("rollback");
console.log("archivos de «adjuntos» visibles SIN sesión (anon):", a.rows[0].n === 500 ? "500 o más" : a.rows[0].n);

const { rows: [pol] } = await cliente.query(
  `select pg_get_expr(polqual, polrelid) as e from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'adjuntos_lectura'`,
);
console.log("\npolítica adjuntos_lectura:\n ", pol.e.replace(/\s+/g, " "));

await cliente.end();
