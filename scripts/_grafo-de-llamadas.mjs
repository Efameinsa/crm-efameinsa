// Quién llama a una función de la base y con qué permisos corre quien la llama.
// Sirve para saber si se le puede quitar EXECUTE a `authenticated` sin romper
// nada: una función SECURITY DEFINER llama como dueña; una INVOKER, un valor
// por defecto, una vista o una política llaman como el usuario. Solo lee.
//   node --env-file=.env.local scripts/_grafo-de-llamadas.mjs fn1 fn2 …
import { Client } from "pg";

const nombres = process.argv.slice(2);
if (!nombres.length) {
  console.error("Uso: _grafo-de-llamadas.mjs <función> [<función> …]");
  process.exit(1);
}

const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();
const q = async (sql) => (await cliente.query(sql)).rows;

const funciones = await q(`
  select proname, prosecdef, prosrc,
         has_function_privilege('authenticated', oid, 'execute') as aut,
         has_function_privilege('anon', oid, 'execute') as anon
    from pg_proc where pronamespace = 'public'::regnamespace`);
const porDefecto = await q(`
  select c.relname || '.' || a.attname as donde, pg_get_expr(d.adbin, d.adrelid) as e
    from pg_attrdef d join pg_class c on c.oid = d.adrelid
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'`);
const vistas = await q(`select viewname as donde, definition as e from pg_views where schemaname = 'public'`);
const politicas = await q(`
  select c.relname || '.' || p.polname as donde,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as e
    from pg_policy p join pg_class c on c.oid = p.polrelid`);
await cliente.end();

for (const s of nombres) {
  const re = new RegExp("(^|[^a-z_])" + s + "\\s*\\(");
  const propia = funciones.find((f) => f.proname === s);
  if (!propia) {
    console.log(`${s}: no existe`);
    continue;
  }
  const llaman = funciones.filter((f) => f.proname !== s && re.test(f.prosrc ?? ""));
  const invoker = llaman.filter((f) => !f.prosecdef).map((f) => f.proname);
  const usos = (lista) => lista.filter((x) => re.test(x.e ?? "")).map((x) => x.donde);
  console.log(
    `${s.padEnd(34)} anon:${propia.anon ? "sí" : "no"} aut:${propia.aut ? "sí" : "no"} ${propia.prosecdef ? "definer" : "INVOKER"}` +
      ` | la llaman ${llaman.length} (${llaman.map((f) => f.proname).slice(0, 6).join(", ")}${llaman.length > 6 ? "…" : ""})` +
      ` | INVOKER: ${invoker.join(", ") || "ninguna"}` +
      ` | por defecto: ${usos(porDefecto).join(", ") || "-"}` +
      ` | vistas: ${usos(vistas).join(", ") || "-"}` +
      ` | políticas: ${usos(politicas).length}`,
  );
}
