// Qué hay HOY para practicar, cuenta por cuenta: lo que ya existe y lo que
// falta para poder recorrer el circuito entero sin tocar nada real.
//
// Uso: node --env-file=.env.local scripts/_inventario-de-pruebas.mjs
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const tabla = async (titulo, sql, params = []) => {
  const { rows } = await bd.query(sql, params);
  console.log(`\n== ${titulo}`);
  if (rows.length === 0) console.log("   (nada)");
  else console.table(rows);
};

await tabla(
  "Cuentas de práctica (perfiles marcados es_prueba)",
  `select codigo_comercial, nombre, rol, es_postventa from perfiles where es_prueba order by codigo_comercial`,
);

await tabla(
  "Contactos de práctica en la bandeja / derivados",
  `select l.codigo, left(coalesce(l.nombre_contacto, l.razon_social), 34) as contacto, l.estado,
          coalesce(p.codigo_comercial, '—') as en_manos_de
     from leads l left join perfiles p on p.id = l.asignado_a
    where l.es_prueba order by l.created_at desc`,
);

await tabla(
  "Cartera de los comerciales de práctica",
  `select p.codigo_comercial, count(distinct c.id) as clientes, count(distinct o.id) as oportunidades
     from perfiles p
     left join cuentas c on c.comercial_id = p.id
     left join oportunidades o on o.comercial_id = p.id
    where p.es_prueba group by 1 order by 1`,
);

await tabla(
  "Oportunidades de práctica, por etapa",
  `select p.codigo_comercial, o.etapa, count(*) as cuantas,
          count(*) filter (where o.cierre_proyectado is not null) as con_fecha_de_cierre
     from oportunidades o join perfiles p on p.id = o.comercial_id
    where p.es_prueba group by 1,2 order by 1,2`,
);

await tabla(
  "Cotizaciones de práctica",
  `select p.codigo_comercial, c.codigo, c.estado, c.estado_aprobacion, c.total, c.moneda
     from cotizaciones c
     join oportunidades o on o.id = c.oportunidad_id
     join perfiles p on p.id = o.comercial_id
    where p.es_prueba order by c.created_at desc limit 12`,
);

await tabla(
  "Agenda de práctica (lo que verían en «Mi día»)",
  `select p.codigo_comercial, o.proxima_accion, o.proxima_accion_at::date as para_cuando,
          left(cu.razon_social, 30) as cliente
     from oportunidades o join perfiles p on p.id = o.comercial_id join cuentas cu on cu.id = o.cuenta_id
    where p.es_prueba and o.proxima_accion is not null
    order by o.proxima_accion_at limit 12`,
);

await tabla(
  "Postventa de práctica",
  `select p.codigo_comercial, count(distinct s.id) as casos, count(distinct e.id) as equipos_instalados
     from perfiles p
     left join servicios_postventa s on s.asignado_a = p.id
     left join equipos_instalados e on e.cuenta_id in (select id from cuentas where comercial_id = p.id)
    where p.es_prueba group by 1 order by 1`,
);
await bd.end();
