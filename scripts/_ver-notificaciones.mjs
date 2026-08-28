// Qué avisos recibió cada persona y cuáles siguen sin leer.
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: porPersona } = await bd.query(
  `select p.nombre, p.rol, count(*) as avisos,
          count(*) filter (where n.leida_at is null) as sin_leer,
          max(n.created_at) as ultimo
     from notificaciones n join perfiles p on p.id = n.user_id
    where n.created_at > now() - interval '7 days'
    group by 1,2 order by 3 desc`,
);
console.log("== avisos de los últimos 7 días ==");
console.table(porPersona);

const { rows: brenda } = await bd.query(
  `select n.tipo, n.titulo, n.leida_at, n.created_at
     from notificaciones n join perfiles p on p.id = n.user_id
    where p.nombre ilike '%brenda%' order by n.created_at desc limit 15`,
);
console.log("== últimos avisos de Brenda ==");
console.table(brenda);

const { rows: perfiles } = await bd.query(
  `select id, nombre, rol, codigo_comercial, activo from perfiles where nombre ilike '%brenda%' or nombre ilike '%arian%'`,
);
console.table(perfiles.map((p) => ({ ...p, id: p.id.slice(0, 8) })));

// ¿Los prospectos que le llegan hoy le generan aviso?
const { rows: asignados } = await bd.query(
  `select o.id, cu.razon_social, o.created_at, o.origen
     from oportunidades o join cuentas cu on cu.id = o.cuenta_id join perfiles p on p.id = o.comercial_id
    where p.nombre ilike '%brenda%' and o.created_at > now() - interval '3 days' order by o.created_at desc limit 10`,
);
console.log("== oportunidades nuevas de Brenda (3 días) ==");
console.table(asignados.map((o) => ({ ...o, id: o.id.slice(0, 8) })));
await bd.end();
