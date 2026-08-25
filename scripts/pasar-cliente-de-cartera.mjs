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
//   SÍ  las oportunidades ABIERTAS (asignada, filtrada, cotizada, seguimiento,
//       potencial). Son trabajo pendiente, y el trabajo pendiente sobre un
//       cliente es de quien tiene el cliente.
//
//       ⚠️ ESTO CAMBIÓ EL 25-08 Y EL MOTIVO IMPORTA. La primera versión las
//       dejaba todas con el dueño anterior, apoyándose en que la RLS de la
//       migración 0013 deja ver las oportunidades de cualquier cuenta de tu
//       cartera. Ver no es gestionar: «Mis oportunidades»
//       (listar_oportunidades, migración 0054), el tablero Kanban, Mi día y la
//       agenda filtran todos por `oportunidades.comercial_id`. Resultado con
//       SAYWA: a Brenda el cliente le salía en Mi cartera y en ningún lado
//       más —no lo podía gestionar— y a Ariana le seguía apareciendo en su
//       tablero un «Llamar al cliente» de un cliente que ya no es suyo.
//
//   NO  las oportunidades CERRADAS (venta, rechazada, derivada). Son historia
//       terminada: registran quién hizo ese trabajo, y moverlas llevaría las
//       ventas y los rechazos de un año a los números de otra persona. El
//       nuevo dueño las ve igual —para eso sí alcanza la RLS de la 0013— en el
//       historial de la ficha del cliente.
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

// Las cinco etapas de trabajo del tablero. Las otras tres —venta, rechazada,
// derivada— son cierres. La misma lista está en ETAPAS_TABLERO de
// src/app/(app)/comercial/oportunidades/page.tsx.
const ETAPAS_ABIERTAS = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"];

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
  `select o.id, o.etapa, o.created_at, o.proxima_accion, p.codigo_comercial,
          o.etapa::text = any($2::text[]) as abierta
     from oportunidades o left join perfiles p on p.id = o.comercial_id
    where o.cuenta_id = $1 order by o.created_at`,
  [cuenta.id, ETAPAS_ABIERTAS],
);
// Las que ya son del destino no se anuncian como movimiento: no hay nada que
// mover y listarlas haría pensar que el traspaso toca más de lo que toca.
const aMover = ops.filter((o) => o.abierta && o.codigo_comercial !== destino.codigo_comercial);
const cerradas = ops.filter((o) => !o.abierta);

console.log(`\n${cuenta.razon_social}  (${cuenta.tipo_doc} ${cuenta.num_doc})`);
console.log(`  hoy es de : ${cuenta.dueno_codigo ?? "—"} ${cuenta.dueno ?? "sin comercial"}`);
console.log(`  pasa a    : ${destino.codigo_comercial} ${destino.nombre}`);
console.log(`  última venta: ${cuenta.ultima_venta_at ? String(cuenta.ultima_venta_at).slice(0, 10) : "nunca"}`);
console.log(`\n  oportunidades ABIERTAS que pasan a ${destino.codigo_comercial} (${aMover.length}):`);
for (const o of aMover) {
  const fecha = new Date(o.created_at).toISOString().slice(0, 10);
  const accion = o.proxima_accion ? ` · ${o.proxima_accion}` : "";
  console.log(
    `     ${o.etapa.padEnd(12)} ${fecha}  de ${o.codigo_comercial ?? "—"}${accion}`,
  );
}
if (aMover.length === 0) console.log("     (ninguna — el cliente pasa sin trabajo pendiente)");
console.log(`\n  oportunidades CERRADAS que se quedan con quien las trabajó (${cerradas.length}):`);
for (const o of cerradas) {
  console.log(`     ${o.etapa.padEnd(12)} ${new Date(o.created_at).toISOString().slice(0, 10)}  de ${o.codigo_comercial ?? "—"}`);
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
const { rowCount: movidas } = await bd.query(
  `update oportunidades set comercial_id = $1, updated_at = now() where id = any($2::uuid[])`,
  [destino.id, aMover.map((o) => o.id)],
);
const { rowCount: enganchadas } = await bd.query(
  `update cotizaciones_historicas set cuenta_id = $1 where id = any($2::uuid[])`,
  [cuenta.id, sueltas.map((s) => s.id)],
);

console.log(`\n✓ ${cuenta.razon_social} pasó a ${destino.codigo_comercial} ${destino.nombre}.`);
console.log(`✓ ${movidas} oportunidad(es) abiertas ahora se gestionan desde su cartera.`);
console.log(`✓ ${enganchadas} cotización(es) del archivo enganchadas a su ficha.`);
console.log(`  Las ${cerradas.length} oportunidades cerradas siguen a nombre de quien las trabajó.\n`);
await bd.end();
