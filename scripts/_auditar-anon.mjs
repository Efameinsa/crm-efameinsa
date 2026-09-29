// Auditoría de lo que alcanza la clave pública (rol anon) en la base. Solo lee.
//   node --env-file=../crm-efameinsa/.env.local scripts/_auditar-anon.mjs [salida.json]
import { writeFileSync } from "node:fs";
import { Client } from "pg";

const cliente = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await cliente.connect();
const q = async (sql, p = []) => (await cliente.query(sql, p)).rows;

const salida = {};

salida.ultimasMigraciones = await q(
  `select archivo, aplicado_at from _migraciones_aplicadas order by aplicado_at desc limit 8`,
);

// Tablas y vistas de public con algún privilegio para anon.
salida.relaciones = await q(`
  select c.relname as nombre,
         case c.relkind when 'r' then 'tabla' when 'v' then 'vista' when 'm' then 'vista_mat' when 'p' then 'tabla' else c.relkind::text end as tipo,
         c.relrowsecurity as rls,
         coalesce(array_to_string(c.reloptions, ','), '') as opciones,
         has_table_privilege('anon', c.oid, 'select') as anon_select,
         has_table_privilege('anon', c.oid, 'insert') as anon_insert,
         has_table_privilege('anon', c.oid, 'update') as anon_update,
         has_table_privilege('anon', c.oid, 'delete') as anon_delete,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
         (select count(*) from pg_policy p where p.polrelid = c.oid
            and (p.polroles = '{0}' or p.polroles @> array[(select oid from pg_roles where rolname = 'anon')])) as politicas_que_alcanzan_anon
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p')
   order by 2, 1`);

// Funciones de public que anon puede ejecutar.
salida.funciones = await q(`
  select p.oid::int as oid, p.proname as nombre,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as devuelve,
         p.prosecdef as definer,
         case p.provolatile when 'i' then 'inmutable' when 's' then 'estable' else 'volatil' end as volatilidad,
         l.lanname as lenguaje,
         p.prokind as clase,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as autenticado,
         coalesce(p.proacl::text, '(por defecto: PUBLIC)') as acl,
         p.prosrc as fuente
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public'
   order by 2, 3`);

salida.privilegiosPorDefecto = await q(`
  select pg_get_userbyid(d.defaclrole) as rol, coalesce(n.nspname, '(todos)') as esquema,
         d.defaclobjtype as tipo, d.defaclacl::text as acl
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
   order by 1, 2, 3`);

// Funciones usadas por políticas RLS, por vistas o como disparadores: no se les quita nada a ciegas.
salida.politicas = await q(`
  select c.relname as tabla, p.polname as politica, p.polcmd as cmd,
         array(select rolname from pg_roles r where r.oid = any(p.polroles)) as roles,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') as usando,
         coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as con_check
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage')`);

salida.disparadores = await q(`
  select distinct p.proname as funcion
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not t.tgisinternal`);

await cliente.end();

const destino = process.argv[2];
if (destino) writeFileSync(destino, JSON.stringify(salida, null, 1));

const f = salida.funciones;
console.log("últimas migraciones:", salida.ultimasMigraciones.map((m) => m.archivo).join(" | "));
console.log("funciones en public:", f.length,
  "| anon puede ejecutar:", f.filter((x) => x.anon).length,
  "| de esas, SECURITY DEFINER:", f.filter((x) => x.anon && x.definer).length);
console.log("\nrelaciones con algún privilegio para anon:");
for (const r of salida.relaciones.filter((r) => r.anon_select || r.anon_insert || r.anon_update || r.anon_delete))
  console.log(" ", r.tipo.padEnd(9), r.nombre.padEnd(42), "rls:", String(r.rls).padEnd(5),
    "S/I/U/D:", [r.anon_select, r.anon_insert, r.anon_update, r.anon_delete].map((b) => (b ? "x" : "-")).join(""),
    "políticas:", r.politicas, "alcanzan anon:", r.politicas_que_alcanzan_anon, r.opciones);
console.log("\nprivilegios por defecto:");
for (const d of salida.privilegiosPorDefecto) console.log(" ", d.rol, d.esquema, d.tipo, d.acl);
