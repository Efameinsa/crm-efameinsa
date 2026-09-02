// Santos, 02-09: Katerine explicó que sí atendió a FREDDY MEJIA (lead PRO-08913,
// Google Ads, derivado por Central el 24-08) y no lo registró. Textual:
// «Se procedió al filtrado, el sr no contestó, se mandó msj el mismo día que
// se recibió; al siguiente día se llamó nuevamente, no entró llamadas y msj
// no ha respondido». Santos: «actualiza eso en su sistema». Se insertan las
// dos gestiones con sus fechas reales, a nombre de ella, y la oportunidad
// queda filtrada con próxima acción para mañana (la pantalla no permite
// registrar hacia atrás, a propósito; esto es un ajuste autorizado).
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const OP = "1f6f6c36-1bfc-4b5c-a111-f0a2b8ebfa7c", KAT = "4379b0d4-1d15-419a-9090-a22686f5eef8", NO_CONTESTO = 7;
const { rows: ya } = await bd.query(`select count(*)::int n from actividades where oportunidad_id=$1`, [OP]);
if (ya[0].n > 0) { console.log("Ya tiene gestiones; no se duplica."); await bd.end(); process.exit(0); }
await bd.query("begin");
await bd.query(`insert into actividades (oportunidad_id, realizada_por, tipo, nota, realizada_at, resultado_id, adjuntos, proxima_accion, proxima_accion_at)
  values ($1, $2, 'llamada', 'Se procedió al filtrado: el señor no contestó la llamada. Se le envió mensaje por WhatsApp el mismo día que se recibió el contacto. (Registrado el 02-09 por Santos a pedido de Katerine, con la fecha real.)', '2026-08-24T12:00:00-05:00', $3, '[]'::jsonb, 'Volver a llamar', '2026-08-25')`, [OP, KAT, NO_CONTESTO]);
await bd.query(`insert into actividades (oportunidad_id, realizada_por, tipo, nota, realizada_at, resultado_id, adjuntos, proxima_accion, proxima_accion_at)
  values ($1, $2, 'llamada', 'Se llamó nuevamente: no entran las llamadas y el mensaje de WhatsApp sigue sin respuesta. (Registrado el 02-09 por Santos a pedido de Katerine, con la fecha real.)', '2026-08-25T12:00:00-05:00', $3, '[]'::jsonb, 'Volver a intentar contacto', '2026-09-03')`, [OP, KAT, NO_CONTESTO]);
await bd.query(`update oportunidades set etapa='filtrada', proxima_accion='Volver a intentar contacto', proxima_accion_at='2026-09-03', updated_at=now() where id=$1`, [OP]);
await bd.query("commit");
const { rows } = await bd.query(`select o.etapa, o.proxima_accion, o.proxima_accion_at, (select count(*) from actividades a where a.oportunidad_id=o.id)::int gestiones from oportunidades o where o.id=$1`, [OP]);
console.log("✓ Freddy Mejía:", rows[0]);
await bd.end();
