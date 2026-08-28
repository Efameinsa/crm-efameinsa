// ============================================================
// CRM EFAMEINSA · La venta que le faltaba a Katerine (C5)
// ============================================================
// Mostró su consolidado de agosto: nueve filas. Ocho estaban en el CRM; la
// novena, la ÚLTIMA que agregó a su Excel, no:
//
//   19/08/2026 · SEM 33 · presupuesto 429-26 · ZERCOM PERU SAC - AGUILAR
//   PACARA JESUS GREGORIO · MESA DE PLANCHADO ASPIRANTE SEMI-INDUSTRIAL CON
//   CALDERIN INCORPORADA 4 litros SIDI MONDIAL/FEONIX · 1 · US$ 2.350,00
//
// Por qué faltaba: el import de su Excel corrió el 24-08 y esa fila la escribió
// después, fuera de orden de fecha (va detrás de la del 21-08). Nadie la
// perdió: nunca llegó.
//
// A QUÉ OPORTUNIDAD SE CUELGA. No se crea una nueva: la que corresponde ya
// existe y es la del presupuesto —creada el 15-08, etapa «cotizada», con su
// gestión «Se envia propuesta al correo y al whastapp CON OPEN · Presupuesto
// 429-26». Crear otra dejaría el cliente con dos oportunidades por la misma
// mesa de planchado.
//
// Y DE PASO, EL PDF. El presupuesto OPEN 429-26 está en el archivo, con su PDF
// ("TENESE INGENIERIA S.A.C.- AGUILAR PACARA JESUS GREGORIO", mesa de planchado,
// asesora C5), pero quedó sin `cuenta_id`: por eso no aparecía en la ficha. Se
// engancha a la ficha para que ella pueda abrirlo desde la venta. OJO: hay otro
// 429-26 de la misma serie y fecha que es de MINERA LAS BAMBAS —el correlativo
// se repite— y ese NO se toca.
//
// Uso:
//   node --env-file=.env.local scripts/registrar-venta-zercom-429-26.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");

const CUENTA = "ea9be9e4-88cb-4192-a2cd-f21734ffb6ca"; // ZERCOM - AGUILAR PACARA - TENESE
const OPORTUNIDAD = "302a28d0-a3a8-4c69-b5b7-f4ec9d0f4688"; // la del presupuesto 429-26
const COTIZACION_ARCHIVO = "ccff7901-b7cf-4372-b9ed-a56b28a0826d"; // el PDF, hoy sin cuenta
const FECHA = "2026-08-19";
const MONTO = "2350.00";
const EQUIPO = "Mesa de planchado aspirante semi-industrial con calderín incorporado 4 litros SIDI MONDIAL / FEONIX";
const NOTA =
  "Registrada el 28-08 a partir del consolidado de agosto de C5 (fila del 19-08, SEM 33): mesa de planchado " +
  "aspirante semi-industrial con calderín, US$ 2.350. Presupuesto OPEN 429-26 del 15-08, que consta en el " +
  "archivo con su PDF. No entró con el import porque esa fila se escribió después del 24-08.";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Nadie la cargó ya por otro lado: si existiera, duplicaríamos US$ 2.350 en el
// reporte de gerencia (la lección de SAN AGUSTIN PARACAS, 27-08).
const { rows: yaEsta } = await bd.query(
  `select v.id, v.monto_total, v.fecha_venta::date f from ventas v
     join oportunidades o on o.id = v.oportunidad_id
    where o.cuenta_id = $1 and (v.referencia_historica ilike '%429-26%' or v.fecha_venta = $2)`,
  [CUENTA, FECHA],
);
if (yaEsta.length) {
  console.log("YA EXISTE una venta que calza — no se toca nada:");
  console.table(yaEsta);
  await bd.end();
  process.exit(0);
}

const { rows: [op] } = await bd.query(
  `select o.id, o.etapa, o.cuenta_id, p.codigo_comercial com, p.id perfil, cu.razon_social
     from oportunidades o join cuentas cu on cu.id = o.cuenta_id
     left join perfiles p on p.id = o.comercial_id where o.id = $1`,
  [OPORTUNIDAD],
);
if (!op || op.cuenta_id !== CUENTA) { console.error("La oportunidad no es la esperada."); await bd.end(); process.exit(1); }

console.log(`CLIENTE : ${op.razon_social}`);
console.log(`COMERCIAL: ${op.com}`);
console.log(`OPORTUNIDAD: ${op.etapa} → venta`);
console.log(`VENTA   : ${FECHA} · US$ ${MONTO} · OPEN 429-26 · ${EQUIPO}`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  await bd.query(
    `update cotizaciones_historicas set cuenta_id = $1 where id = $2 and cuenta_id is null`,
    [CUENTA, COTIZACION_ARCHIVO],
  );
  await bd.query(
    `insert into ventas (oportunidad_id, serie, fecha_venta, monto_total, moneda, registrada_por,
                         notas, origen, referencia_historica, equipo_historico)
     values ($1, 'OPEN', $2, $3, 'USD', $4, $5, 'historico_excel', '429-26', $6)`,
    [OPORTUNIDAD, FECHA, MONTO, op.perfil, NOTA, EQUIPO],
  );
  await bd.query(
    `update oportunidades set etapa = 'venta', cerrada_at = $2, updated_at = now() where id = $1`,
    [OPORTUNIDAD, `${FECHA}T12:00:00-05:00`],
  );
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  throw e;
}

const { rows: [final] } = await bd.query(
  `select cu.razon_social, cu.ultima_venta_at::date ultima_venta,
          (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = cu.id)::int ventas,
          (select coalesce(sum(v.monto_total),0) from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = cu.id)::numeric vendido
     from cuentas cu where cu.id = $1`,
  [CUENTA],
);
console.log("\nCómo quedó la ficha:");
console.table([final]);

const { rows: mes } = await bd.query(
  `select count(*)::int n, coalesce(sum(v.monto_total),0)::numeric usd
     from ventas v join oportunidades o on o.id = v.oportunidad_id
     join perfiles p on p.id = o.comercial_id
    where p.codigo_comercial = 'C5' and v.moneda = 'USD'
      and v.fecha_venta between '2026-08-01' and '2026-08-31'`,
);
console.log(`Agosto de C5: ${mes[0].n} ventas · US$ ${mes[0].usd}`);
console.log(`Ficha: /comercial/cartera/${CUENTA}`);
await bd.end();
