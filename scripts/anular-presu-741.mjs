/**
 * 23-09-2026 · Katerine (C5): anular la Presu_741-26 de JULCA GUEVARA YANET.
 *
 * La venta del 18-09 quedó dos veces: una con la 741 (la original, atada al
 * informe de cierre 024-2026) y otra con la 824, que Katerine hizo hoy para
 * que la cotización dijera lo mismo que el cierre (USD 3,850 con IGV).
 * Queda UNA venta, la de la 824, con el informe 024-2026; la de la 741 se
 * anula y la cotización pasa a «anulada» (0286).
 *
 * Uso: node --env-file=.env.local scripts/anular-presu-741.mjs [--aplicar]
 * Sin --aplicar solo muestra lo que haría (y deshace).
 */
import pg from "pg";

const COT_741 = "7b668c13-bb8f-4786-ba19-3f30361f8985";
const VENTA_741 = "85d69acb-829d-4269-8e96-2ae9c29230b9";
const VENTA_824 = "bf93853b-47aa-4a53-9354-56484fa2c61b";
const INFORME_024 = "ec07ee4c-5de4-49bb-8947-3ab0ac8a9627";
const MOTIVO =
  "Venta repetida: el 23-09 Katerine rehízo la cotización como Presu_824-26 (USD 3,850 con IGV, lo del informe 024-2026) y le registró la venta. Queda la de la 824; la Presu_741-26 se anula a su pedido.";

const aplicar = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (s, p = []) => c.query(s, p).then((r) => r.rows);
try {
  await q("begin");
  // Solo si está como se encontró: si alguien ya lo tocó, no se adivina.
  const [inf] = await q("select venta_id, anulado_at from informes_cierre where id = $1", [INFORME_024]);
  const ventas = await q("select id, anulada_at from ventas where id = any($1)", [[VENTA_741, VENTA_824]]);
  if (inf.venta_id !== VENTA_741 || inf.anulado_at || ventas.some((v) => v.anulada_at)) throw new Error(`estado distinto al esperado: ${JSON.stringify({ inf, ventas })}`);

  // El informe emitido es inmutable salvo por anular_cierre(); este es el
  // mismo movimiento que hace esa función al pasar la venta al heredero (0162).
  await q("select set_config('app.anulando_cierre', 'si', true)");
  await q("update informes_cierre set venta_id = $2 where id = $1", [INFORME_024, VENTA_824]);
  await q("update ventas set anulada_at = now(), anulada_motivo = $2::text where id = $1", [VENTA_741, MOTIVO]);
  await q("update ventas set notas = concat_ws(E'\n', notas, $2::text) where id = $1", [VENTA_824, "Lleva el informe de cierre 024-2026, que antes estaba en la venta de la Presu_741-26 (anulada el 23-09)."]);
  await q("update cotizaciones set estado = 'anulada' where id = $1", [COT_741]);

  console.log(await q("select c.codigo, c.estado, v.monto_total, v.anulada_at, i.codigo informe from cotizaciones c left join ventas v on v.cotizacion_id = c.id left join informes_cierre i on i.venta_id = v.id where c.oportunidad_id = (select oportunidad_id from cotizaciones where id = $1) order by c.created_at", [COT_741]));
  await q(aplicar ? "commit" : "rollback");
  console.log(aplicar ? "APLICADO" : "ensayo: deshecho (use --aplicar)");
} catch (e) {
  await q("rollback");
  console.error("NO se aplicó:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
