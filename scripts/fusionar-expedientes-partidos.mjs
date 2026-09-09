// Une los expedientes que el importador partió en dos: una ficha CON documento
// y otra SIN_DOC, del mismo cliente y del mismo comercial.
//
// ══════ QUÉ PASÓ ══════
// El Excel repite al mismo cliente en varias filas y solo la primera trae el
// RUC; las siguientes vienen con la casilla del documento vacía. El importador
// creaba la cuenta por documento y la anotaba solo en su índice de documentos:
// cuando llegaba la fila sin RUC del mismo cliente, no la encontraba por
// ningún lado y creaba una segunda cuenta SIN_DOC. Muchas nacieron el MISMO
// SEGUNDO que su gemela.
//
// Ariana lo reportó el 09-09 con CUSTODIO DAMIAN LUIS GUSTAVO: una ficha con
// RUC y 10 gestiones (la última de ayer) y otra sin RUC con 2 gestiones y la
// próxima acción vencida el 24/08. Para ella eran dos clientes distintos y el
// bueno "no le salía".
//
// La causa está corregida en importar-oportunidades-historicas.mjs y en
// aplicar-cambios-comercial-22-08.mjs (función `recordarNombre`). Este script
// limpia lo que ya quedó partido.
//
// ══════ POR QUÉ NO SIRVIÓ fusionar-cuentas-mismo-nombre.mjs ══════
// Ese script agrupa `where tipo_doc = 'SIN_DOC'`: compara huérfanas contra
// huérfanas. Estos pares tienen una CON documento, así que caen fuera de su
// red y nunca los tocó.
//
// ══════ CUÁL SOBREVIVE ══════
// ⚠️ NO es "la del RUC". En 6 de los 13 casos vivos, la ficha que el comercial
// está trabajando HOY es la que no tiene documento, y la del RUC quedó en
// histórico o rechazada. Fusionar hacia el RUC mataría el hilo vivo.
//
// Gana la que tuvo ACTIVIDAD MÁS RECIENTE — la misma regla que ya usa
// lib-fusionar-cuentas.mjs para la cartera. Y no se pierde el documento:
// `fusionar()` adopta el num_doc de la que se va cuando a la que queda le
// falta. Empate exacto: gana la que tiene documento.
//
// ══════ QUÉ SE TOCA Y QUÉ NO ══════
//   · SEGUROS: hay señal adicional de que son el mismo cliente (mismo
//     departamento, teléfono compartido, o una de las dos sin nada que
//     perder). Se fusionan.
//   · A REVISAR: mismo nombre pero departamentos distintos y sin teléfono en
//     común. NO se tocan — "NATUCULTURA Piura" y "NATUCULTURA Ica" pueden ser
//     dos clientes. Salen listados para que el comercial confirme.
//
// Después de fusionar, si el cliente queda con DOS oportunidades vivas, la de
// menos recorrido pasa a `historico` con una nota que dice a dónde se fue: sale
// de Mi día sin borrarse, y se recupera con "Retomar" si hizo falta. El
// historial de gestión es por CUENTA (cargarHistorialCuenta), así que al unir
// las fichas las notas de las dos ya se ven juntas en la que queda.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-expedientes-partidos.mjs
//   node --env-file=.env.local scripts/fusionar-expedientes-partidos.mjs --vivos --ejecutar
//   node --env-file=.env.local scripts/fusionar-expedientes-partidos.mjs --seguros --ejecutar
//
// Sin --ejecutar solo muestra el plan y escribe el informe. Nada se escribe.

import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { esComodin, fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const EJECUTAR = process.argv.includes("--ejecutar");
// Por tandas: los vivos se revisan uno por uno con el comercial; el resto es
// archivo y se puede correr de una.
const SOLO_VIVOS = process.argv.includes("--vivos");
const SOLO_SEGUROS = process.argv.includes("--seguros");

// Etapas que significan "esto está sobre la mesa hoy". venta/rechazada están
// cerradas e historico es el archivo: ninguna de las tres estorba en Mi día.
const VIVAS = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial", "derivada"];

const normalizar = (t) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();

// "LA LIBERTAD" y "LA_LIBERTAD" son el mismo departamento escrito por dos
// importadores distintos. Sin esto, media docena de pares buenos caerían en
// "a revisar" por una barra baja.
const mismoDepto = (a, b) => Boolean(a) && Boolean(b) && normalizar(a) === normalizar(b);

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// `actividades.realizada_por` es NOT NULL: la nota de la unión necesita un
// autor. Va firmada por la cuenta de administración, igual que la reposición
// del histórico del 02-09 — es un movimiento del sistema, no una gestión del
// comercial, y el comercial no debe aparecer llamando a un cliente que no
// llamó.
const { rows: admins } = await bd.query(
  "select id from perfiles where nombre = 'Administrador' and rol = 'admin' limit 1",
);
if (!admins.length) {
  console.error("No se encontró el perfil 'Administrador' para firmar las notas de la unión.");
  process.exit(1);
}
const FIRMA = admins[0].id;

const { rows: pares } = await bd.query(
  `select sd.id sindoc_id, sd.razon_social sindoc_nombre, sd.departamento sindoc_depto,
          cd.id condoc_id, cd.razon_social condoc_nombre, cd.departamento condoc_depto,
          cd.tipo_doc, cd.num_doc, sd.comercial_id, p.nombre comercial,
          (sd.created_at = cd.created_at) mismo_instante,
          (select string_agg(distinct t.telefono_normalizado, ',') from contactos t
            where t.cuenta_id = sd.id and coalesce(t.telefono_normalizado, '') <> '') sindoc_tels,
          (select string_agg(distinct t.telefono_normalizado, ',') from contactos t
            where t.cuenta_id = cd.id and coalesce(t.telefono_normalizado, '') <> '') condoc_tels
     from cuentas sd
     join cuentas cd
       -- OJO: la clase POSIX [[:space:]], no la abreviatura de barra-s. En
       -- esta base esa abreviatura no colapsa nada: es un no-op silencioso que
       -- devuelve el texto igualito, y una medicion hecha con ella da cero
       -- diferencias sin que se note. Importa porque las razones sociales del
       -- Excel traen un salto de linea EN MEDIO del nombre (CANDELA PERU es el
       -- caso) y btrim solo limpia los extremos: sin normalizar, una ficha con
       -- el salto y su gemela sin el no se cruzan. Eran 23 pares de mismo
       -- comercial que este script no veia.
       on upper(btrim(regexp_replace(cd.razon_social, '[[:space:]]+', ' ', 'g')))
        = upper(btrim(regexp_replace(sd.razon_social, '[[:space:]]+', ' ', 'g')))
      and cd.comercial_id is not distinct from sd.comercial_id
      and cd.tipo_doc <> 'SIN_DOC' and cd.num_doc is not null
     left join perfiles p on p.id = sd.comercial_id
    where sd.tipo_doc = 'SIN_DOC'
    order by p.nombre, sd.razon_social`,
);

console.log(`Pares encontrados: ${pares.length}\n`);

const plan = [];
const aRevisar = [];
// Un mismo nombre puede traer varias filas (una SIN_DOC contra dos con RUC
// distinto). Eso ya no es un expediente partido: son documentos distintos y
// hay que mirarlo a mano.
const vecesPorSinDoc = new Map();
for (const p of pares) vecesPorSinDoc.set(p.sindoc_id, (vecesPorSinDoc.get(p.sindoc_id) ?? 0) + 1);

for (const par of pares) {
  const motivo = [];

  if (esComodin(par.sindoc_nombre)) {
    aRevisar.push({ ...par, porque: "nombre comodín (\"SIN NOMBRE\", \"ND\"…): no identifica a nadie" });
    continue;
  }
  // El umbral es el mismo que usa fusionar-cuentas-mismo-nombre.mjs, sobre el
  // nombre sin espacios ni puntuación. Deja fuera cosas como "TOPY TOP SA" o
  // "SENATI", que son empresas reales pero cuyo nombre corto no alcanza para
  // afirmar por sí solo que dos fichas son la misma: se listan para que el
  // comercial lo confirme, no se descartan.
  if (normalizar(par.sindoc_nombre).length < 12) {
    aRevisar.push({ ...par, porque: `nombre corto (${normalizar(par.sindoc_nombre).length} caracteres): el texto solo no alcanza para afirmar que son el mismo` });
    continue;
  }
  if (vecesPorSinDoc.get(par.sindoc_id) > 1) {
    aRevisar.push({ ...par, porque: `la ficha sin documento calza con ${vecesPorSinDoc.get(par.sindoc_id)} fichas con RUC distinto` });
    continue;
  }

  const hSin = await historia(bd, par.sindoc_id);
  const hCon = await historia(bd, par.condoc_id);
  const vacia = hSin.ops + hSin.cots + hSin.leads + hSin.ventas === 0 || hCon.ops + hCon.cots + hCon.leads + hCon.ventas === 0;

  const telsSin = new Set((par.sindoc_tels ?? "").split(",").filter(Boolean));
  const telsCon = new Set((par.condoc_tels ?? "").split(",").filter(Boolean));
  const telCompartido = [...telsSin].some((t) => telsCon.has(t));

  if (telCompartido) motivo.push("mismo teléfono");
  if (mismoDepto(par.sindoc_depto, par.condoc_depto)) motivo.push("mismo departamento");
  if (par.mismo_instante) motivo.push("creadas en el mismo segundo por el import");
  if (vacia) motivo.push("una de las dos no tiene nada que perder");

  // El "mismo segundo" por sí solo no basta: prueba que salieron de la misma
  // corrida, no que sean el mismo cliente. Se exige una señal de identidad.
  const hayIdentidad = telCompartido || mismoDepto(par.sindoc_depto, par.condoc_depto) || vacia;
  if (!hayIdentidad) {
    aRevisar.push({ ...par, porque: `departamentos distintos (${par.sindoc_depto ?? "—"} vs ${par.condoc_depto ?? "—"}) y sin teléfono en común` });
    continue;
  }

  const ultSin = await ultimaActividad(bd, par.sindoc_id);
  const ultCon = await ultimaActividad(bd, par.condoc_id);
  // Gana la que se movió último. Empate (las dos en 'epoch', sin nada): gana
  // la del documento, que es la que ya trae la identidad.
  const ganaSinDoc = new Date(ultSin) > new Date(ultCon);
  const destinoId = ganaSinDoc ? par.sindoc_id : par.condoc_id;
  const origenId = ganaSinDoc ? par.condoc_id : par.sindoc_id;

  const { rows: vivas } = await bd.query(
    `select o.id, o.cuenta_id, o.etapa, o.proxima_accion, o.proxima_accion_at,
            (select count(*) from actividades a where a.oportunidad_id = o.id)::int gestiones,
            (select max(a.realizada_at) from actividades a where a.oportunidad_id = o.id) ultima
       from oportunidades o
      where o.cuenta_id in ($1, $2) and o.etapa = any($3::etapa_oportunidad[])
      order by o.updated_at desc`,
    [par.sindoc_id, par.condoc_id, VIVAS],
  );

  // ⚠️ Dos oportunidades vivas NO significan siempre un duplicado. Solo lo son
  // si venían UNA DE CADA FICHA: eso es el hilo que el import cortó en dos. Si
  // las dos ya convivían en la misma cuenta, es un cliente con dos frentes
  // abiertos a propósito (SAN AGUSTIN AREQUIPA tiene la venta en seguimiento y
  // aparte un caso esperando derivar al técnico) y no se toca ninguna.
  const vivasEnDestino = vivas.filter((v) => v.cuenta_id === destinoId).length;
  const vivasEnOrigen = vivas.filter((v) => v.cuenta_id === origenId).length;
  const hiloPartido = vivasEnDestino >= 1 && vivasEnOrigen >= 1;

  plan.push({
    nombre: par.sindoc_nombre.replace(/\s+/g, " ").trim(),
    comercial: par.comercial,
    documento: `${par.tipo_doc} ${par.num_doc}`,
    destinoId,
    origenId,
    destinoEs: ganaSinDoc ? "la ficha SIN documento (es la que se está trabajando)" : "la ficha con documento",
    carteraId: par.comercial_id,
    motivo: motivo.join(" · "),
    vivas,
    hiloPartido,
  });
}

const conVivas = plan.filter((p) => p.hiloPartido);
const soloArchivo = plan.filter((p) => !p.hiloPartido);

console.log(`A FUSIONAR: ${plan.length}`);
console.log(`  · con el hilo de gestión partido en dos (revisar con el comercial): ${conVivas.length}`);
console.log(`  · solo archivo, sin nada vivo en juego: ${soloArchivo.length}`);
console.log(`A REVISAR A MANO (no se tocan): ${aRevisar.length}\n`);

console.log("═══ LOS QUE TIENEN EL HILO PARTIDO: UNA OPORTUNIDAD VIVA EN CADA FICHA ═══");
for (const p of conVivas) {
  console.log(`\n▸ ${p.nombre}  [${p.comercial}]  ${p.documento}`);
  console.log(`  queda: ${p.destinoEs}  ·  señal: ${p.motivo}`);
  for (const v of p.vivas) {
    const cual = v.cuenta_id === p.destinoId ? "QUEDA " : "se une";
    const ult = v.ultima ? new Date(v.ultima).toISOString().slice(0, 10) : "sin gestión";
    const prox = v.proxima_accion_at ? new Date(v.proxima_accion_at).toISOString().slice(0, 10) : "—";
    console.log(`    ${cual} [${v.etapa.padEnd(11)}] ${String(v.gestiones).padStart(2)} gest. · última ${ult} · sigue: ${v.proxima_accion ?? "—"} ${prox}`);
  }
}

console.log("\n═══ A REVISAR A MANO ═══");
for (const r of aRevisar) {
  console.log(`  ${r.sindoc_nombre.replace(/\s+/g, " ").trim()} [${r.comercial}] — ${r.porque}`);
}

const informe = `scripts/data/fusion-expedientes-partidos-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(informe, JSON.stringify({ generado: new Date().toISOString(), plan, aRevisar }, null, 2), "utf8");
console.log(`\nInforme: ${informe}`);

if (!EJECUTAR) {
  console.log("\nVISTA PREVIA — no se escribió nada. Para aplicarlo: --vivos --ejecutar  o  --seguros --ejecutar");
  await bd.end();
  process.exit(0);
}

const tanda = SOLO_VIVOS ? conVivas : SOLO_SEGUROS ? soloArchivo : plan;
console.log(`\nAPLICANDO ${tanda.length} fusiones…`);

await bd.query("begin");
try {
  let hechas = 0;
  let archivadas = 0;
  for (const p of tanda) {
    // ⚠️ EL DOCUMENTO SE MUDA ANTES, A MANO. `fusionar()` copia el num_doc de
    // la ficha que se va a la que queda y recién después borra la que se va:
    // con las dos vivas a la vez, `uq_cuentas_doc` (num_doc único entre las
    // cuentas con documento) rechaza el UPDATE y se cae toda la transacción.
    // Los otros scripts que usan esta librería nunca lo pisaron porque unen
    // SIN_DOC contra SIN_DOC, donde no hay documento que chocar. Acá pasa
    // siempre que gana la ficha sin documento (FIGUEROA, GARCIA CASTILLA).
    // Se libera primero el documento de la que se va y se le pone a la que
    // queda; después la fusión ya no tiene nada que adoptar.
    const { rows: origen } = await bd.query("select tipo_doc, num_doc from cuentas where id = $1", [p.origenId]);
    const { rows: destino } = await bd.query("select tipo_doc from cuentas where id = $1", [p.destinoId]);
    if (destino[0]?.tipo_doc === "SIN_DOC" && origen[0]?.num_doc) {
      await bd.query("update cuentas set tipo_doc = 'SIN_DOC', num_doc = null where id = $1", [p.origenId]);
      await bd.query("update cuentas set tipo_doc = $2, num_doc = $3 where id = $1",
        [p.destinoId, origen[0].tipo_doc, origen[0].num_doc]);
    }

    await fusionar(bd, p.destinoId, p.origenId, { carteraId: p.carteraId });
    hechas++;

    if (!p.hiloPartido) continue;

    // Ya son un solo cliente. Si quedaron dos frentes abiertos, el que menos
    // recorrido tiene se archiva: es el pedazo que el import partió, no una
    // segunda venta.
    //
    // ⚠️ MANDA LA ÚLTIMA GESTIÓN, NO LA CANTIDAD. Primero se ordenó por número
    // de gestiones y con GARCIA CASTILLA DIANA EDITH salió al revés: archivó
    // el hilo que Ariana había trabajado hasta el 27/08 y tenía la llamada
    // agendada para el 24/09, y dejó vivo el del Excel, detenido el 21/08 y
    // con la acción vencida el 19/08. Lo que el comercial tocó último es el
    // hilo real; el número de notas solo dice cuánto arrastró del Excel. Es la
    // misma regla con la que lib-fusionar-cuentas.mjs decide la cartera.
    const ordenadas = [...p.vivas].sort((a, b) => {
      const fa = new Date(a.ultima ?? 0).getTime();
      const fb = new Date(b.ultima ?? 0).getTime();
      if (fa !== fb) return fb - fa;
      return b.gestiones - a.gestiones;
    });
    const principal = ordenadas[0];
    for (const sobrante of ordenadas.slice(1)) {
      await bd.query(
        `update oportunidades set etapa = 'historico', updated_at = now() where id = $1`,
        [sobrante.id],
      );
      await bd.query(
        `insert into actividades (oportunidad_id, tipo, nota, realizada_por)
         values ($1, 'nota', $2, $3)`,
        [
          sobrante.id,
          `Expediente unificado el ${new Date().toLocaleDateString("es-PE")}: el import de los Excel había partido a este cliente en dos fichas ` +
            `(una con ${p.documento} y otra sin documento) y esta oportunidad era el pedazo con menos recorrido. ` +
            `El seguimiento sigue en la otra, que es la que se trabajó más recientemente. ` +
            `Nada se borró: toda la gestión de las dos fichas se ve junta en el historial del cliente. ` +
            `Si hacía falta trabajarla aparte, «Retomar» la devuelve a seguimiento.`,
          FIRMA,
        ],
      );
      archivadas++;
    }
  }
  await bd.query("commit");
  console.log(`\nListo: ${hechas} expedientes unidos · ${archivadas} oportunidades sobrantes pasadas al histórico.`);
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA SE ESCRIBIÓ (rollback):", e.message);
  process.exitCode = 1;
}

await bd.end();
