// ============================================================
// CRM EFAMEINSA · Pasar un cliente de una cartera a otra
// ============================================================
// Por orden de gerencia. La regla del 14-08 dice que un cliente pertenece al
// comercial que lo atendió y que reasignarlo es una decisión manual de
// gerencia, no automática — así que esto no se ejecuta solo ni tiene botón:
// se corre cuando alguien lo pide y queda dicho quién lo pidió.
//
// QUÉ MUEVE Y QUÉ NO
//
//   SÍ  la cuenta pasa al nuevo comercial, y `cartera_desde` queda con la
//       fecha de hoy: es el dato que después decide si el cliente vuelve a
//       estar liberable a los 6 meses sin venta.
//
//   NO  las oportunidades viejas. Registran quién hizo ESE trabajo en su
//       momento; cambiarles el dueño movería ventas y gestiones de un año a
//       los números de otra persona. Y no hace falta para que el nuevo dueño
//       las vea: la RLS de oportunidades (migración 0013) ya deja ver las de
//       cualquier cuenta que esté en tu cartera, sea de quien sea la
//       oportunidad. Se queda la historia con quien la hizo y la ve quien la
//       gestiona.
//
//   SÍ  las cotizaciones del archivo de ese cliente que hubieran quedado
//       sueltas: se enganchan a la cuenta. Es lo que Brenda reportó el 25-08
//       —su 1549-25 de SAYWA no aparecía en la ficha del cliente— y sin esto
//       el cliente cambia de manos con su historia a medias.
//
// Uso:
//   node --env-file=.env.local scripts/pasar-cliente-de-cartera.mjs <RUC|DNI> <CODIGO> [--aplicar]
//   ej. node --env-file=.env.local scripts/pasar-cliente-de-cartera.mjs 20527672539 C1 --aplicar

import { Client } from "pg";

const [documento, codigoDestino] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--aplicar");

if (!documento || !codigoDestino) {
  console.error("Uso: pasar-cliente-de-cartera.mjs <RUC|DNI> <CODIGO_COMERCIAL> [--aplicar]");
  process.exit(1);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: destinos } = await bd.query(
  `select id, nombre, codigo_comercial from perfiles
    where upper(codigo_comercial) = upper($1) and rol = 'comercial' and activo`,
  [codigoDestino],
);
if (destinos.length !== 1) {
  console.error(`✗ No hay un comercial activo con código ${codigoDestino}.`);
  process.exit(1);
}
const destino = destinos[0];

const { rows: cuentas } = await bd.query(
  `select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.ultima_venta_at, c.cartera_desde,
          p.nombre as dueno, p.codigo_comercial as dueno_codigo
     from cuentas c left join perfiles p on p.id = c.comercial_id
    where c.num_doc = $1`,
  [documento.replace(/\D/g, "")],
);
if (cuentas.length === 0) {
  console.error(`✗ No hay ninguna cuenta con documento ${documento}.`);
  process.exit(1);
}
if (cuentas.length > 1) {
  // Dos cuentas con el mismo documento es un problema de datos, no algo que
  // este script deba resolver eligiendo una.
  console.error(`✗ Hay ${cuentas.length} cuentas con ese documento. Hay que fusionarlas antes.`);
  for (const c of cuentas) console.error(`    ${c.id}  ${c.razon_social}  (${c.dueno_codigo ?? "sin dueño"})`);
  process.exit(1);
}
const cuenta = cuentas[0];

// Cotizaciones del archivo de este cliente que quedaron sin enganchar. Se
// buscan por nombre porque el archivo casi nunca trae el RUC.
//
// El cruce ignora la FORMA SOCIETARIA y nada más: el archivo escribe «SAYWA
// HOTEL TOURS SCRL» y la cuenta «SAYWA HOTEL TOURS S.R.L.», y comparar letra
// por letra no engancha ninguna. Quitando la terminación, la parte que
// identifica al cliente tiene que coincidir ENTERA — no se acepta un parecido,
// porque enganchar la cotización de un cliente a la ficha de otro le pondría
// delante a un comercial un precio que nunca se dio.
const FORMA_SOCIETARIA = "(SOCIEDADANONIMA|SAC|SCRL|SRL|EIRL|SA|SCA|SAA)";
const { rows: sueltas } = await bd.query(
  `with limpio as (
     select regexp_replace(
              regexp_replace(upper($1), '[^A-Z0-9]', '', 'g'),
              '${FORMA_SOCIETARIA}$', '') as nombre
   )
   select h.id, h.codigo, h.fecha, h.cliente, h.comercial_id
     from cotizaciones_historicas h, limpio
    where h.cuenta_id is null
      and regexp_replace(
            regexp_replace(upper(h.cliente), '[^A-Z0-9]', '', 'g'),
            '${FORMA_SOCIETARIA}$', '') = limpio.nombre
      and length(limpio.nombre) >= 8`,
  [cuenta.razon_social],
);

const { rows: ops } = await bd.query(
  `select o.etapa, o.created_at, p.codigo_comercial
     from oportunidades o left join perfiles p on p.id = o.comercial_id
    where o.cuenta_id = $1 order by o.created_at`,
  [cuenta.id],
);

console.log(`\n${cuenta.razon_social}  (${cuenta.tipo_doc} ${cuenta.num_doc})`);
console.log(`  hoy es de : ${cuenta.dueno_codigo ?? "—"} ${cuenta.dueno ?? "sin comercial"}`);
console.log(`  pasa a    : ${destino.codigo_comercial} ${destino.nombre}`);
console.log(`  última venta: ${cuenta.ultima_venta_at ? String(cuenta.ultima_venta_at).slice(0, 10) : "nunca"}`);
console.log(`\n  oportunidades que NO cambian de dueño (${ops.length}):`);
for (const o of ops) {
  console.log(`     ${o.etapa.padEnd(12)} ${String(o.created_at).slice(0, 10)}  de ${o.codigo_comercial ?? "—"}`);
}
console.log(`\n  cotizaciones del archivo que se enganchan a la ficha (${sueltas.length}):`);
for (const s of sueltas) {
  console.log(`     ${String(s.codigo).padEnd(10)} ${String(s.fecha ?? "sin fecha").slice(0, 10)}  ${s.cliente}`);
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar para hacerlo.\n");
  await bd.end();
  process.exit(0);
}

await bd.query(`update cuentas set comercial_id = $2, cartera_desde = current_date where id = $1`, [
  cuenta.id,
  destino.id,
]);
const { rowCount: enganchadas } = await bd.query(
  `update cotizaciones_historicas set cuenta_id = $1 where id = any($2::uuid[])`,
  [cuenta.id, sueltas.map((s) => s.id)],
);

console.log(`\n✓ ${cuenta.razon_social} pasó a ${destino.codigo_comercial} ${destino.nombre}.`);
console.log(`✓ ${enganchadas} cotización(es) del archivo enganchadas a su ficha.`);
console.log(`  Las ${ops.length} oportunidades anteriores siguen a nombre de quien las trabajó.\n`);
await bd.end();
