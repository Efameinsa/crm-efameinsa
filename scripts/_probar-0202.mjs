// Ensayo REAL de pedir_expediente, haciéndose pasar por la cuenta de postventa
// y deshaciendo todo al final. No deja nada movido.
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const PV = "4d16b185";                                  // Post Venta
const { rows: [pv] } = await bd.query(`select id, nombre from perfiles where id::text like $1`, [PV + "%"]);
const { rows: [op] } = await bd.query(`
  select o.id, o.comercial_id, c.razon_social, p.codigo_comercial
    from oportunidades o join cuentas c on c.id=o.cuenta_id join perfiles p on p.id=o.comercial_id
   where o.cuenta_id='a82a70d6-70ae-45e1-8e06-3cc9b27f90d8' and o.tipo_postventa='mantenimiento'
     and p.codigo_comercial='C4' limit 1`);
console.log(`Expediente de prueba: ${op.id.slice(0,8)} · ${op.razon_social} · hoy es de ${op.codigo_comercial}`);
console.log(`Quien pide: ${pv.nombre}\n`);

const comoPV = async (sql, args) => {
  await bd.query(`select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true)`, [pv.id]);
  await bd.query(`set local role authenticated`);
  return bd.query(sql, args);
};

const probar = async (titulo, pin, motivo, opId = op.id) => {
  await bd.query("begin");
  try {
    const { rows } = await comoPV(`select pedir_expediente($1,$2,$3) m`, [opId, pin, motivo]);
    console.log(`  ✔ ${titulo} → ${rows[0].m}`);
  } catch (e) {
    console.log(`  ✘ ${titulo} → ${e.message}`);
  }
  await bd.query("rollback");
};

console.log("== Lo que debe RECHAZAR ==");
await probar("motivo corto", "1234", "no");
await probar("código de 3 dígitos", "123", "el cliente me llamó a mí y ya le coticé el preventivo");
await probar("código inventado", "0000", "el cliente me llamó a mí y ya le coticé el preventivo");

console.log("\n== Con el código de verdad del supervisor ==");
const { rows: [g] } = await bd.query(`select id, nombre from perfiles where rol='gerencia' and activo order by created_at limit 1`);
const { rows: [c] } = await bd.query(`select codigo_pin_supervisor($1, ventana_pin_actual()) codigo`, [g.id]);
console.log(`  (código de ${g.nombre}: ${c.codigo})`);
await bd.query("begin");
try {
  const { rows } = await comoPV(`select pedir_expediente($1,$2,$3) m`, [op.id, c.codigo, "el cliente me llamó a mí y ya le cotice el preventivo, necesito anotar la gestion"]);
  console.log(`  ✔ ${rows[0].m}`);
  await bd.query(`reset role`);
  const { rows: [d] } = await bd.query(`select p.nombre, p.codigo_comercial from oportunidades o join perfiles p on p.id=o.comercial_id where o.id=$1`, [op.id]);
  console.log(`  → el expediente quedó de: ${d.codigo_comercial} ${d.nombre}`);
  const { rows: [ct] } = await bd.query(`select p.codigo_comercial from cuentas c left join perfiles p on p.id=c.comercial_id where c.id='a82a70d6-70ae-45e1-8e06-3cc9b27f90d8'`);
  console.log(`  → la CARTERA del cliente sigue de: ${ct.codigo_comercial ?? "sin dueño"}  (no se movió)`);
  const { rows: [n] } = await bd.query(`select titulo, cuerpo from notificaciones order by created_at desc limit 1`);
  console.log(`  → aviso al dueño anterior: «${n.titulo}» — ${n.cuerpo}`);
  const { rows: [a] } = await bd.query(`select nota from actividades where oportunidad_id=$1 order by realizada_at desc limit 1`, [op.id]);
  console.log(`  → nota en el expediente: ${a.nota}`);
  const { rows: [au] } = await bd.query(`select accion, motivo from autorizaciones_supervisor order by creado_at desc limit 1`);
  console.log(`  → firma: ${au.accion} · ${au.motivo}`);
} catch (e) { console.log(`  ✘ ${e.message}`); }
await bd.query("rollback");

console.log("\n== Deshecho: nada quedó movido ==");
const { rows: [fin] } = await bd.query(`select p.codigo_comercial from oportunidades o join perfiles p on p.id=o.comercial_id where o.id=$1`, [op.id]);
console.log(`  el expediente sigue de ${fin.codigo_comercial}`);
await bd.end();
