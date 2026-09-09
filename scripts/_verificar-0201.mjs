import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: def } = await bd.query(`select pg_get_functiondef(oid) d from pg_proc where proname='asignar_lead'`);
console.log("asignar_lead lleva la regla nueva:", def[0].d.includes("celulares_de(v_lead.telefono)"),
            "| declara v_celulares:", def[0].d.includes("v_celulares     text[]"));

console.log("\n== celulares_de(), en la base de verdad ==");
for (const c of ["1 956 181 464","987524031 / 987524031","989 001 284 // 942 710 197","+51 987 524 031","+593984666031","73271348",null]) {
  const { rows } = await bd.query(`select celulares_de($1) v`, [c]);
  console.log(`  ${JSON.stringify(c).padEnd(30)} → ${JSON.stringify(rows[0].v)}`);
}

// La prueba de verdad: rehacer la búsqueda de asignar_lead —vieja y nueva— para
// los leads que la señorita marcó, sin tocar ningún dato.
console.log("\n== Qué ficha le tocaría hoy a cada uno de los leads del reclamo ==");
for (const cod of ["PRO-09114","PRO-09130","PRO-09143","PRO-09156","PRO-09165","PRO-09179","PRO-09181","PRO-09210"]) {
  const { rows } = await bd.query(`
    with l as (select * from leads where codigo = $1)
    select l.codigo, l.razon_social, l.telefono,
           (select c.razon_social from cuentas c, l
             where (l.num_doc is not null and c.num_doc = l.num_doc and c.tipo_doc <> 'SIN_DOC')
                or (l.telefono_normalizado is not null and empresa_compatible(l.razon_social, c.razon_social)
                    and exists (select 1 from contactos ct where ct.cuenta_id=c.id and ct.telefono_normalizado = l.telefono_normalizado))
             limit 1) regla_vieja,
           (select c.razon_social || ' · ' || coalesce(c.num_doc, 'sin doc')
              from contactos ct join cuentas c on c.id = ct.cuenta_id, l
             where celulares_de(ct.telefono) && celulares_de(l.telefono)
               and empresa_compatible(l.razon_social, c.razon_social)
             order by (c.tipo_doc <> 'SIN_DOC') desc, c.created_at limit 1) regla_nueva
      from l`, [cod]);
  const r = rows[0];
  console.log(`  ${r.codigo} | "${r.telefono}"\n      hoy: ${r.regla_vieja ?? "— ficha nueva —"}   |   respaldo 0201: ${r.regla_nueva ?? "— ficha nueva —"}`);
}
await bd.end();
