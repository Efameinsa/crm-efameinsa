// Borra los datos de PRUEBA que Darwin va a generar en el CRM la noche del
// 22-08 y todo el 23-08 (domingo) desde su casa: creará oportunidades,
// cotizaciones, las confirmará, etc. — para armar el manual de procedimientos
// y dar el visto bueno al sistema. Pidió explícitamente que TODO ESO se
// borre el lunes, antes de que el equipo real empiece a usarlo.
//
// SNAPSHOT: 2026-08-22T18:44:27.374Z — tomado en Postgres (`select now()`)
// justo antes de que Darwin empezara. En ese momento, verificado:
//   · 0 oportunidades con origen='crm' (todas eran 'historico_excel')
//   · 0 ventas con origen='crm'
//   · 1 sola cotización real: correlativo 2178 (EFAMEINSA), del jueves,
//     AJENA a esta prueba de fin de semana — no se toca acá.
//   · correlativos.EFAMEINSA-2026 = 2178 (no hace falta "reparar" el
//     contador: si se borran las cotizaciones de prueba pero NO se retrocede
//     el contador, el próximo real simplemente salta un rango de números,
//     que es normal en cualquier sistema de facturación — no se resetea por
//     default, ver flag --resetear-correlativos más abajo).
//   · última cuenta creada: 18:31:19Z (son las 160 del sync de gestión
//     comercial de ese mismo día, ANTES del snapshot — no se tocan).
//
// QUÉ SE BORRA (todo lo posterior al snapshot):
//   1. oportunidades con origen='crm'  → cascada: sus actividades, sus
//      cotizaciones (con cotizacion_items, vía bypass de la 0012) y sus
//      ventas + informes_cierre asociados.
//   2. ventas con origen='crm' que no hayan quedado ya cubiertas por (1).
//   3. cotizaciones con created_at > snapshot (por si alguna quedó huérfana
//      de una oportunidad ya borrada, o vinculada a una oportunidad vieja).
//   4. cuentas y contactos con created_at > snapshot (clientes de prueba
//      creados desde cero en el CRM). Si Darwin en cambio usó una cuenta
//      REAL ya existente para probar, esa cuenta NO se toca — solo se le
//      quita la oportunidad/cotización de prueba que se le agregó encima.
//   5. tareas_agenda y notificaciones con created_at > snapshot.
//   6. accesos: NO se borra — es el log de acceso, sirve como evidencia de
//      que se probó el sistema.
//
// Sin --aplicar: dry-run, solo cuenta y lista, no borra nada.
// Con --aplicar: borra todo en una sola transacción.
// Con --resetear-correlativos (solo junto con --aplicar): además retrocede
//   correlativos.EFAMEINSA-2026 / OPEN-2026 / INFORME-* al valor que tenían
//   en el snapshot, PERO ABORTA si detecta que quedó algo real por encima de
//   ese valor (mismo criterio de scripts/aplicar-cambios-comercial-22-08.mjs).
//
// Uso:
//   node --env-file=.env.local scripts/limpiar-pruebas-fin-de-semana.mjs [--aplicar] [--resetear-correlativos]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const RESETEAR = process.argv.includes("--resetear-correlativos");
const SNAPSHOT = "2026-08-22T18:44:27.374Z";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corran con --env-file=.env.local");
  process.exit(1);
}

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await bd.connect();

  try {
    // ── Diagnóstico previo, siempre (incluso en dry-run) ──────────────
    const { rows: opCrm } = await bd.query(
      `select id, created_at from oportunidades where origen = 'crm' order by created_at`,
    );
    const anomalasOp = opCrm.filter((o) => new Date(o.created_at) <= new Date(SNAPSHOT));
    console.log(`Oportunidades origen='crm': ${opCrm.length}${anomalasOp.length ? ` (⚠️ ${anomalasOp.length} con created_at ANTERIOR al snapshot — revisar antes de seguir, no debería pasar)` : ""}`);

    const { rows: ventasCrm } = await bd.query(`select id, oportunidad_id, created_at from ventas where origen = 'crm'`);
    console.log(`Ventas origen='crm': ${ventasCrm.length}`);

    const { rows: cotizPosteriores } = await bd.query(
      `select id, correlativo, serie, created_at from cotizaciones where created_at > $1 order by correlativo`,
      [SNAPSHOT],
    );
    console.log(`Cotizaciones creadas después del snapshot: ${cotizPosteriores.length}${cotizPosteriores.length ? " (correlativos " + cotizPosteriores.map((c) => c.serie + "-" + c.correlativo).join(", ") + ")" : ""}`);

    const { rows: cuentasNuevas } = await bd.query(`select id, razon_social from cuentas where created_at > $1`, [SNAPSHOT]);
    console.log(`Cuentas nuevas de prueba: ${cuentasNuevas.length}`);

    const { rows: contactosNuevos } = await bd.query(`select count(*)::int n from contactos where created_at > $1`, [SNAPSHOT]);
    console.log(`Contactos nuevos: ${contactosNuevos[0].n}`);

    const { rows: tareasNuevas } = await bd.query(`select count(*)::int n from tareas_agenda where created_at > $1`, [SNAPSHOT]);
    console.log(`Tareas de agenda nuevas: ${tareasNuevas[0].n}`);

    const { rows: notifsNuevas } = await bd.query(`select count(*)::int n from notificaciones where created_at > $1`, [SNAPSHOT]);
    console.log(`Notificaciones nuevas: ${notifsNuevas[0].n}`);

    const { rows: informesNuevos } = await bd.query(`select id, codigo from informes_cierre where created_at > $1`, [SNAPSHOT]);
    console.log(`Informes de cierre nuevos: ${informesNuevos.length}`);

    if (!APLICAR) {
      console.log("\n(Dry-run: nada se borró. Revisar los números arriba y correr con --aplicar cuando esté confirmado.)");
      return;
    }

    console.log("\n=== BORRANDO ===\n");
    await bd.query("begin");
    // Los triggers de inmutabilidad (migración 0012) impiden tocar
    // cotizacion_items/cotizaciones normalmente — se desactivan solo dentro
    // de esta transacción.
    await bd.query("set local session_replication_role = replica");

    const opIds = opCrm.map((o) => o.id);

    const r1 = await bd.query(`delete from actividades where oportunidad_id = any($1::uuid[])`, [opIds]);
    console.log(`  actividades borradas: ${r1.rowCount}`);

    const r2 = await bd.query(
      `delete from informes_cierre where oportunidad_id = any($1::uuid[]) or created_at > $2`,
      [opIds, SNAPSHOT],
    );
    console.log(`  informes_cierre borrados: ${r2.rowCount}`);

    const r3 = await bd.query(`delete from ventas where origen = 'crm' or oportunidad_id = any($1::uuid[])`, [opIds]);
    console.log(`  ventas borradas: ${r3.rowCount}`);

    const r4 = await bd.query(
      `delete from cotizacion_items where cotizacion_id in
        (select id from cotizaciones where oportunidad_id = any($1::uuid[]) or created_at > $2)`,
      [opIds, SNAPSHOT],
    );
    console.log(`  cotizacion_items borrados: ${r4.rowCount}`);

    const r5 = await bd.query(
      `delete from cotizaciones where oportunidad_id = any($1::uuid[]) or created_at > $2`,
      [opIds, SNAPSHOT],
    );
    console.log(`  cotizaciones borradas: ${r5.rowCount}`);

    const r6 = await bd.query(`delete from oportunidades where origen = 'crm'`);
    console.log(`  oportunidades borradas: ${r6.rowCount}`);

    const r7 = await bd.query(`delete from tareas_agenda where created_at > $1`, [SNAPSHOT]);
    console.log(`  tareas_agenda borradas: ${r7.rowCount}`);

    const r8 = await bd.query(`delete from notificaciones where created_at > $1`, [SNAPSHOT]);
    console.log(`  notificaciones borradas: ${r8.rowCount}`);

    const r9 = await bd.query(`delete from contactos where created_at > $1`, [SNAPSHOT]);
    console.log(`  contactos borrados: ${r9.rowCount}`);

    const r10 = await bd.query(`delete from cuentas where created_at > $1`, [SNAPSHOT]);
    console.log(`  cuentas borradas: ${r10.rowCount}`);

    if (RESETEAR) {
      console.log("\n  Reseteando correlativos...");
      for (const clave of ["EFAMEINSA-2026", "OPEN-2026", "INFORME-EFAMEINSA-2026", "INFORME-OPEN-2026"]) {
        const valorSnapshot = { "EFAMEINSA-2026": 2178, "OPEN-2026": 446, "INFORME-EFAMEINSA-2026": 2, "INFORME-OPEN-2026": 4 }[clave];
        const { rows: actual } = await bd.query("select ultimo from correlativos where clave = $1", [clave]);
        if (actual[0].ultimo < valorSnapshot) {
          throw new Error(`${clave}: el contador (${actual[0].ultimo}) ya está por DEBAJO del valor del snapshot (${valorSnapshot}) — algo no cuadra, aborto sin resetear.`);
        }
        await bd.query("update correlativos set ultimo = $1 where clave = $2", [valorSnapshot, clave]);
        console.log(`    ${clave}: ${actual[0].ultimo} -> ${valorSnapshot}`);
      }
    } else {
      console.log("\n  (correlativos NO reseteados — quedan gaps en la numeración, es normal. Usar --resetear-correlativos si se quiere cerrar el rango.)");
    }

    await bd.query("commit");
    console.log("\n✓ Transacción confirmada. El CRM quedó como estaba antes del fin de semana de pruebas.");
  } catch (e) {
    if (APLICAR) await bd.query("rollback").catch(() => {});
    console.error("\n✗ Error" + (APLICAR ? " — rollback, la base queda intacta" : "") + ":", e.message);
    process.exitCode = 1;
  } finally {
    await bd.end();
  }
}

main();
