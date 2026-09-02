// 02-09-2026. Brenda emitió dos veces el cierre de dos clientes (001→005 Inversiones
// Nacionales de Turismo, 003→004 Grupo Alimenticio San José) porque el primero
// llevaba un código de equipo errado. Central anula el viejo, pero anular_cierre()
// anula también la venta atada, y el informe nuevo nació sin venta (la 0105 no lo
// ató porque la venta ya era del viejo). Acá la venta pasa al informe nuevo y las
// filas de postventa del informe viejo se cierran para que no salgan dos pedidos.
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p=[]) => (await bd.query(s, p)).rows;
const foto = async () => {
  console.table(await q(`select i.codigo, i.cliente_nombre, i.venta_id is not null as con_venta, i.oportunidad_id is not null as con_oportunidad, i.anulado_at::date anulado, v.monto_total venta_monto, v.anulada_at::date venta_anulada, s.completado serv_completado, s.cerrado_at::date serv_cerrado
    from informes_cierre i left join ventas v on v.id=i.venta_id left join servicios_postventa s on s.informe_cierre_id=i.id
    where i.cliente_doc in ('20602498833','20114803228') order by i.codigo`));
};
console.log("== ANTES"); await foto();
const INF = { i001:'536f6cb1-0dd3-482b-b86b-0aecab14f236', i003:'6b05c752-cea5-4346-8d97-2627208b7079', i004:'3b4bf8d4-a8b9-4f43-9402-a12c578853b4', i005:'e903af30-6bf3-4439-a682-5e2eaf221bdc' };
const VENTA = { turismo:'901eccfb-0f03-4ad4-aa87-31c6dbac8f87', alimenticio:'8200b493-8a0b-40aa-8d38-2a3fb997ff14' };
const OPO = { turismo:'70306447-07b1-4a8a-ba49-e93ca4a4c91e', alimenticio:'2dc61582-fbb6-41ff-b6af-d89af54bedf0' };
const SERV = { s001:'578ecfa1-b551-4805-9a4a-e1ef6affcc9a', s003:'b99f4be8-c5b3-4135-9555-308db4d3d81e' };
try {
  await bd.query("begin");
  await bd.query(`select set_config('app.anulando_cierre','si',true)`);
  // Inversiones Nacionales de Turismo: 001 (anulado hoy 17:36) → 005
  await bd.query(`update ventas set anulada_at=null, anulada_motivo=null,
      notas=concat_ws(E'\n', notas, 'Reactivada el 02-09-2026: el informe 001-2026 se anuló por duplicado (código de equipo errado), pero la venta es la misma y pasa al informe 005-2026.')
    where id=$1`, [VENTA.turismo]);
  await bd.query(`update informes_cierre set venta_id=null where id=$1`, [INF.i001]);
  await bd.query(`update informes_cierre set venta_id=$2, oportunidad_id=$3 where id=$1`, [INF.i005, VENTA.turismo, OPO.turismo]);
  await bd.query(`update cuentas c set ultima_venta_at=(select max(v.fecha_venta) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=c.id and v.anulada_at is null) where c.id=(select cuenta_id from oportunidades where id=$1)`, [OPO.turismo]);
  await bd.query(`update servicios_postventa set cerrado_at=now(), completado=true,
      observaciones=concat_ws(E'\n', observaciones, 'Cerrado el 02-09-2026: el informe 001-2026 se anuló por duplicado. El pedido 508-26 sigue en la fila del informe 005-2026.')
    where id=$1`, [SERV.s001]);
  // Grupo Alimenticio San José: 003 (Central lo anula con el código) → 004
  await bd.query(`update informes_cierre set venta_id=null where id=$1`, [INF.i003]);
  await bd.query(`update informes_cierre set venta_id=$2, oportunidad_id=$3 where id=$1`, [INF.i004, VENTA.alimenticio, OPO.alimenticio]);
  await bd.query(`update servicios_postventa set cerrado_at=now(), completado=true,
      observaciones=concat_ws(E'\n', observaciones, 'Cerrado el 02-09-2026: el informe 003-2026 se anula por duplicado. El pedido 480-26 sigue en la fila del informe 004-2026.')
    where id=$1`, [SERV.s003]);
  await bd.query("commit");
  console.log("== DESPUÉS (aplicado)"); await foto();
} catch (e) {
  await bd.query("rollback");
  console.error("ROLLBACK:", e.message);
}
await bd.end();
