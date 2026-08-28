// El código de autorización que está vigente AHORA, para dictárselo a Central.
//
// Es el mismo que ve el supervisor en su barra lateral: se deriva de la semilla
// que vive en la base, así que no hay ninguna puerta de atrás — se calcula igual
// que lo hace el sistema. Se muestra el de esta ventana y el de la siguiente
// para poder dictarlo sin que se venza en la mitad de la frase.
//
// Uso: node --env-file=.env.local scripts/_pin-supervisor-ahora.mjs [nombre]
import { Client } from "pg";

const filtro = process.argv[2] ?? "santos";
const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: sup } = await bd.query(
  `select id, nombre, rol from perfiles where rol::text in ('gerencia','admin') and activo and nombre ilike $1`,
  [`%${filtro}%`],
);
if (sup.length === 0) {
  console.log(`No hay supervisor activo que se llame «${filtro}».`);
  process.exit(1);
}

const { rows: v } = await bd.query(
  `select ventana_pin_actual() as ventana,
          (120 - (floor(extract(epoch from now()))::bigint % 120))::int as quedan,
          to_char(now() at time zone 'America/Lima', 'HH24:MI:SS') as hora`,
);
const ventana = BigInt(v[0].ventana);

for (const s of sup) {
  const { rows: c } = await bd.query(
    `select codigo_pin_supervisor($1, $2) as ahora, codigo_pin_supervisor($1, $3) as siguiente`,
    [s.id, ventana.toString(), (ventana + 1n).toString()],
  );
  console.log(`\nSupervisor: ${s.nombre} (${s.rol})`);
  console.log(`   Código de AHORA .... ${c[0].ahora}   (vence en ${v[0].quedan} s, ${v[0].hora} en Lima)`);
  console.log(`   El siguiente ....... ${c[0].siguiente}   (los dos minutos que siguen)`);
}

// Si Central ya falló cinco veces, ningún código va a entrar: hay que esperar.
const { rows: intentos } = await bd.query(
  `select p.nombre, count(*) as fallidos, max(i.creado_at) as ultimo
     from intentos_pin_supervisor i join perfiles p on p.id = i.solicitante_id
    where i.creado_at > now() - interval '10 minutes'
    group by 1 order by 2 desc`,
);
console.log("\nIntentos fallidos en los últimos 10 minutos:");
console.table(intentos.length ? intentos : [{ nombre: "—", fallidos: 0, ultimo: null }]);

const { rows: ultimas } = await bd.query(
  `select p.nombre as supervisor, s.nombre as pidio, a.accion, a.motivo, a.creado_at
     from autorizaciones_supervisor a
     join perfiles p on p.id = a.supervisor_id
     join perfiles s on s.id = a.solicitante_id
    order by a.creado_at desc limit 5`,
);
console.log("Últimas autorizaciones concedidas:");
console.table(ultimas.length ? ultimas : [{ supervisor: "—" }]);
await bd.end();
