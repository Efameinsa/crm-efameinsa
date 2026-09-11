// ============================================================
// CRM EFAMEINSA · Archivar el expediente gemelo de un cliente
// ============================================================
// Ariana, 11-09, con INVERSIONES FISA en «Vencidas»: «¿por qué sale como
// vencida si ya lo atendí ayer y lo agendé para el 29?». Porque el cliente
// tenía DOS expedientes abiertos en la misma ficha —la misma cotización
// 461-26 anotada en dos hojas del Excel—: en uno lo llamó el 10-09 y agendó el
// 29; el otro seguía en «Llamar al cliente · 17/08» y el 02-09 había vuelto del
// archivo con la reposición del histórico.
//
// Es la misma regla que fusionar-expedientes-partidos.mjs aplica desde el
// 09-09 cuando una fusión deja dos frentes abiertos: MANDA LA ÚLTIMA GESTIÓN,
// no la cantidad. El que el comercial tocó último es el hilo real; el otro
// pasa a `historico` con una nota que dice a dónde se fue. No se borra nada
// y «Retomar» lo devuelve a seguimiento si hacía falta.
//
// Solo toca expedientes del MISMO comercial dentro de la MISMA ficha. Si el
// que quedaría vivo no es claramente el más reciente (empate), se para.
//
// Uso:
//   node --env-file=.env.local scripts/archivar-expediente-gemelo.mjs <cuentaId> [<cuentaId>…] [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const CUENTAS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (CUENTAS.length === 0) {
  console.error("Falta el id de la ficha del cliente.");
  process.exit(1);
}
const VIVAS = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"];

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Las notas del sistema van firmadas por el Administrador, no por el
// comercial: el comercial no debe aparecer anotando algo que no hizo.
const { rows: admins } = await bd.query("select id from perfiles where nombre = 'Administrador' and rol = 'admin' limit 1");
if (!admins.length) { console.error("No se encontró el perfil 'Administrador'."); process.exit(1); }
const FIRMA = admins[0].id;

const plan = [];
for (const cuentaId of CUENTAS) {
  const { rows: [cuenta] } = await bd.query("select id, razon_social from cuentas where id = $1", [cuentaId]);
  if (!cuenta) { console.log(`✗ ${cuentaId}: no existe`); continue; }
  const { rows: vivas } = await bd.query(
    `select o.id, o.etapa, o.comercial_id, p.codigo_comercial comercial, o.proxima_accion, o.proxima_accion_at,
            (select count(*) from actividades a where a.oportunidad_id = o.id)::int gestiones,
            -- La última gestión DE UNA PERSONA: la reposición del histórico
            -- (02-09, sin autor) y las notas «Expediente unificado» (firmadas
            -- por el Administrador) tienen fecha del día en que se corrieron y
            -- hacían que el gemelo del Excel pareciera el hilo más reciente
            -- (CORDOVA VENTURO, 11-09: la regla iba a archivar el hilo bueno).
            (select max(a.realizada_at) from actividades a join perfiles p on p.id = a.realizada_por
              where a.oportunidad_id = o.id and p.rol <> 'admin') ultima
       from oportunidades o left join perfiles p on p.id = o.comercial_id
      where o.cuenta_id = $1 and o.cerrada_at is null and o.etapa = any($2::etapa_oportunidad[])
      order by ultima desc nulls last, gestiones desc`,
    [cuentaId, VIVAS],
  );
  console.log(`\n▸ ${cuenta.razon_social}`);
  if (vivas.length < 2) { console.log("  un solo expediente abierto: nada que archivar"); continue; }
  const comerciales = new Set(vivas.map((v) => v.comercial_id));
  if (comerciales.size > 1) { console.log("  ABORTA: los expedientes son de comerciales distintos, eso no se toca acá"); continue; }
  const [principal, ...sobrantes] = vivas;
  if (!principal.ultima || (sobrantes[0].ultima && new Date(sobrantes[0].ultima) >= new Date(principal.ultima))) {
    console.log("  ABORTA: no está claro cuál es el hilo vivo (empate de última gestión)");
    continue;
  }
  const f = (d) => (d ? new Date(d).toLocaleDateString("es-PE") : "—");
  console.log(`  QUEDA   [${principal.etapa.padEnd(11)}] ${String(principal.gestiones).padStart(2)} gest. · última ${f(principal.ultima)} · sigue: ${principal.proxima_accion ?? "—"} ${f(principal.proxima_accion_at)}`);
  for (const s of sobrantes) {
    console.log(`  archiva [${s.etapa.padEnd(11)}] ${String(s.gestiones).padStart(2)} gest. · última ${f(s.ultima)} · decía: ${s.proxima_accion ?? "—"} ${f(s.proxima_accion_at)}`);
    plan.push({ cuenta: cuenta.razon_social, sobrante: s, principal });
  }
}

if (!APLICAR) {
  console.log(`\nSIMULACIÓN — ${plan.length} expediente(s) se archivarían. Para aplicarlo: --aplicar\n`);
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  for (const p of plan) {
    await bd.query("update oportunidades set etapa = 'historico', updated_at = now() where id = $1", [p.sobrante.id]);
    await bd.query(
      `insert into actividades (oportunidad_id, tipo, nota, realizada_por) values ($1, 'nota', $2, $3)`,
      [
        p.sobrante.id,
        `Expediente unificado el ${new Date().toLocaleDateString("es-PE")}: este cliente tenía dos expedientes abiertos por la misma consulta ` +
          `(la misma llamada anotada en dos hojas del Excel) y este era el pedazo con menos recorrido — decía «${p.sobrante.proxima_accion ?? "sin acción"}» ` +
          `para el ${p.sobrante.proxima_accion_at ? new Date(p.sobrante.proxima_accion_at).toLocaleDateString("es-PE") : "—"} y salía como vencido. ` +
          `El seguimiento sigue en el otro expediente, que es el que se trabajó más recientemente. ` +
          `Nada se borró: toda la gestión se ve junta en el historial del cliente. Si hacía falta trabajarlo aparte, «Retomar» lo devuelve a seguimiento.`,
        FIRMA,
      ],
    );
    console.log(`✓ ${p.cuenta}: archivado el expediente ${p.sobrante.id.slice(0, 8)}`);
  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA SE ESCRIBIÓ (rollback):", e.message);
  process.exitCode = 1;
}
await bd.end();
