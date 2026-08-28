// Qué pasa DE VERDAD cuando Central corrige una derivación.
//
// Se simula su sesión (rol authenticated + su uuid en el JWT, igual que la
// aplicación) y se prueba la corrección sobre los contactos que ella derivó
// últimamente. Todo dentro de una transacción que se deshace: no mueve nada.
//
// Uso: node --env-file=.env.local scripts/_reproducir-correccion-derivacion.mjs
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: central } = await bd.query("select id, nombre from perfiles where rol = 'central' and not es_prueba limit 1");
const { rows: destino } = await bd.query(
  "select id, nombre, codigo_comercial from perfiles where rol='comercial' and activo and not es_prueba order by codigo_comercial limit 1",
);
console.log(`Central: ${central[0].nombre} · destino de prueba: ${destino[0].codigo_comercial} ${destino[0].nombre}\n`);

const { rows: leads } = await bd.query(
  `select l.id, l.codigo, l.nombre_contacto, l.asignado_at, p.nombre as comercial
     from leads l left join perfiles p on p.id = l.asignado_a
    where l.estado = 'asignado' and l.asignado_at > now() - interval '3 days'
    order by l.asignado_at desc limit 12`,
);

for (const l of leads) {
  await bd.query("begin");
  let resultado;
  try {
    await bd.query("set local role authenticated");
    await bd.query(`set local request.jwt.claims = '{"sub":"${central[0].id}","role":"authenticated"}'`);
    await bd.query("select redirigir_lead_con_pin($1, $2, $3, $4)", [
      l.id,
      destino[0].id,
      "0000",
      "Prueba de diagnóstico: no mueve nada, la transacción se deshace",
    ]);
    resultado = "SE PUEDE";
  } catch (e) {
    resultado = String(e.message).slice(0, 120);
  }
  await bd.query("rollback");
  console.log(`${(l.codigo ?? l.id.slice(0, 8)).padEnd(12)} ${String(l.nombre_contacto ?? "").slice(0, 28).padEnd(30)} → ${l.comercial ?? "sin asignar"}`);
  console.log(`   ${resultado}\n`);
}
await bd.end();
