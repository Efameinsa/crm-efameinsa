// ============================================================
// CRM EFAMEINSA · Los cierres de postventa 2024-2026 (R:\)
// ============================================================
// Darwin dejó en R:\ el 27-08 las carpetas de cierres del área: los de Hever de
// este año y los de Brenda de 2024, 2025 y enero-abril 2026. Son 617 informes
// en Word, uno por servicio vendido, y son el ÚNICO registro de ese trabajo:
// postventa nunca tuvo un Excel maestro como el de los comerciales.
//
// QUÉ ENTRA Y QUÉ NO (instrucción de Darwin, 28-08):
//   · De las carpetas de Brenda hay que sacar SOLO mantenimientos y repuestos.
//     Los cierres de EQUIPO no entran: esas ventas son del comercial que las
//     hizo, no del área, y ya están en el histórico de su Excel.
//   · La carpeta «BRENDA 2023» se ignora: sus 80 archivos son byte a byte los
//     de «CIERRES DE POST VENTA 2026» de Hever —adentro dicen 2026—, así que
//     alguien copió la carpeta equivocada al renombrarla.
//
// A QUIÉN SE LE ASIGNA CADA UNO (decisión de Darwin, 28-08): mantenimientos a
// Ariana y repuestos a Hever, que es el reparto de oficios del plan 16 — ella
// vende el mantenimiento, él atiende el equipo. Un cierre que es servicio CON
// repuestos va a Ariana: lo que se vendió es el servicio.
//
// LA CUENTA NO CAMBIA DE DUEÑO. De los 217 clientes de estos informes, 188 ya
// están en el CRM y la mayoría son de la cartera de otro comercial. Eso no se
// toca (regla 1 del proyecto y migración 0080): lo que se le asigna a Ariana o
// a Hever es la OPORTUNIDAD de postventa, no el cliente. Solo se crean las
// cuentas que no existen.
//
// Uso:
//   node --env-file=.env.local scripts/importar-cierres-postventa.mjs
//   node --env-file=.env.local scripts/importar-cierres-postventa.mjs --aplicar
import { existsSync } from "node:fs";
import XLSX from "xlsx";
import { Client } from "pg";
import { leerTodos } from "./lib/cierres-postventa.mjs";

const APLICAR = process.argv.includes("--aplicar");

// Los cierres que el lector no puede jurar. Se sacan del automático y se
// mandan a confirmar a mano en este archivo: alguien escribe qué es cada uno y
// la siguiente corrida los toma de ahí. Es el mismo camino de
// `docs/ruc-a-confirmar.xlsx`, y existe porque la alternativa —adivinar— ya
// metió una venta de equipo de S/ 406.915 como si fuera un repuesto.
const A_CONFIRMAR = "docs/cierres-postventa-a-confirmar.xlsx";

// Un cierre de servicio es de Ariana; uno de repuesto, de Hever.
const DUENO_POR_TIPO = {
  mantenimiento: "C4",
  "mantenimiento+repuesto": "C4",
  repuesto: "PV",
};

// El tipo del informe en el vocabulario del CRM (`tipo_postventa`, 0080).
const TIPO_POSTVENTA = {
  mantenimiento: "mantenimiento",
  "mantenimiento+repuesto": "mantenimiento",
  repuesto: "repuesto",
};

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const perfiles = new Map(
  (await bd.query(`select id, nombre, codigo_comercial from perfiles where codigo_comercial in ('C4','PV')`)).rows.map(
    (p) => [p.codigo_comercial, p],
  ),
);
for (const codigo of ["C4", "PV"]) {
  if (!perfiles.has(codigo)) {
    console.error(`✗ No existe el perfil ${codigo}. Sin él no se puede asignar nada.`);
    process.exit(1);
  }
}

console.log("Leyendo los informes de R:\\ …");
const todos = await leerTodos();
const conError = todos.filter((d) => d.error);
const leidos = todos.filter((d) => !d.error);

// Lo ya confirmado a mano en la corrida anterior manda sobre lo que el lector
// haya deducido: si alguien miró el informe y escribió qué es, esa es la
// verdad.
const confirmado = new Map();
if (existsSync(A_CONFIRMAR)) {
  const hoja = XLSX.readFile(A_CONFIRMAR).Sheets["A confirmar"];
  for (const fila of XLSX.utils.sheet_to_json(hoja, { defval: null })) {
    const veredicto = String(fila["QUÉ ES (equipo / mantenimiento / repuesto)"] ?? "").trim().toLowerCase();
    if (fila.archivo && ["equipo", "mantenimiento", "repuesto"].includes(veredicto)) {
      confirmado.set(String(fila.archivo), veredicto);
    }
  }
  if (confirmado.size) console.log(`  ${confirmado.size} cierres ya confirmados a mano en ${A_CONFIRMAR}`);
}
for (const d of leidos) {
  const v = confirmado.get(d.archivo);
  if (v) {
    d.tipo = v;
    d.dudoso = false;
  }
}

// Lo que se importa: ni equipos, ni lo que no se pudo clasificar, ni lo que no
// tiene ni fecha ni cliente —sin eso no hay dónde ponerlo—, ni lo dudoso, que
// va a confirmación humana.
const equipos = leidos.filter((d) => d.tipo === "equipo");
const sinDatos = leidos.filter((d) => d.tipo !== "equipo" && (!d.fecha || !d.cliente));
const candidatos = leidos.filter((d) => DUENO_POR_TIPO[d.tipo] && d.fecha && d.cliente && !d.dudoso);

console.log(`\n  ${todos.length} informes leídos${conError.length ? ` (${conError.length} ilegibles)` : ""}`);
console.log(`  ${equipos.length} son ventas de EQUIPO → no entran (son del comercial que las hizo)`);
if (sinDatos.length) console.log(`  ${sinDatos.length} sin fecha o sin cliente → no entran`);
console.log(`  ${candidatos.length} cierres de mantenimiento o repuesto para importar`);

const porDueno = new Map();
for (const d of candidatos) porDueno.set(DUENO_POR_TIPO[d.tipo], (porDueno.get(DUENO_POR_TIPO[d.tipo]) ?? 0) + 1);
for (const [codigo, n] of porDueno) console.log(`     ${perfiles.get(codigo).nombre} (${codigo}): ${n}`);

// ── Lo que ya está cargado ────────────────────────────────────────────────
const yaImportados = new Set(
  (
    await bd.query(`select documento_origen from oportunidades where documento_origen is not null`)
  ).rows.map((r) => r.documento_origen),
);
const nuevos = candidatos.filter((d) => !yaImportados.has(d.archivo));
console.log(`  ${candidatos.length - nuevos.length} ya estaban importados de una corrida anterior`);

// ── Los clientes ──────────────────────────────────────────────────────────
const docs = [...new Set(nuevos.map((d) => d.ruc ?? d.dni).filter(Boolean))];
const cuentas = new Map(
  (await bd.query(`select id, num_doc, razon_social, comercial_id from cuentas where num_doc = any($1)`, [docs])).rows.map(
    (c) => [c.num_doc, c],
  ),
);
const porCrear = nuevos.filter((d) => (d.ruc ?? d.dni) && !cuentas.has(d.ruc ?? d.dni));
const sinDoc = nuevos.filter((d) => !d.ruc && !d.dni);
console.log(`\n  clientes: ${cuentas.size} ya están en el CRM · ${new Set(porCrear.map((d) => d.ruc ?? d.dni)).size} por crear · ${sinDoc.length} informes sin RUC ni DNI`);

// ── Las máquinas ──────────────────────────────────────────────────────────
const seriesInforme = [...new Set(nuevos.flatMap((d) => d.series.map((s) => s.serie)))];
const equipoPorSerie = new Map(
  (
    await bd.query(`select id, upper(trim(serie)) serie from equipos_instalados where upper(trim(serie)) = any($1)`, [
      seriesInforme,
    ])
  ).rows.map((r) => [r.serie, r.id]),
);
console.log(`  máquinas: ${seriesInforme.length} series en los informes · ${equipoPorSerie.size} ya fichadas · ${seriesInforme.length - equipoPorSerie.size} entrarían al parque instalado`);

// ── Lo que hay que mirar a mano ───────────────────────────────────────────
const dudosos = leidos.filter(
  (d) => d.dudoso && d.tipo !== "equipo" && !yaImportados.has(d.archivo),
);
if (dudosos.length) {
  console.log(`\n  ⚠ ${dudosos.length} NO se importan hasta que alguien diga qué son:`);
  for (const d of dudosos.slice(0, 12)) {
    console.log(
      `     ${(d.moneda ?? "").padEnd(3)} ${String(d.monto ?? "—").padStart(9)}  ${d.tipo.padEnd(22)} ${(d.cliente ?? "").slice(0, 32).padEnd(34)} ${d.primerItem.slice(0, 46)}`,
    );
  }
  if (dudosos.length > 12) console.log(`     … y ${dudosos.length - 12} más`);

  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(
    dudosos.map((d) => ({
      "QUÉ ES (equipo / mantenimiento / repuesto)": "",
      cliente: d.cliente,
      fecha: d.fecha,
      moneda: d.moneda,
      monto: d.monto,
      "lo que dice el primer ítem": d.primerItem.slice(0, 300),
      "el sistema cree que es": d.tipo,
      presupuesto: d.presupuesto,
      "informe": `${d.correlativo ?? "s/n"}-${d.anio ?? ""}`,
      archivo: d.archivo,
    })),
  );
  hoja["!cols"] = [{ wch: 22 }, { wch: 38 }, { wch: 11 }, { wch: 7 }, { wch: 11 }, { wch: 70 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(libro, hoja, "A confirmar");
  XLSX.writeFile(libro, A_CONFIRMAR);
  console.log(`\n  → ${A_CONFIRMAR}: llenen la primera columna y vuelvan a correr esto.`);
}

if (!APLICAR) {
  console.log(`\nEnsayo. Nada se escribió. Para aplicarlo:`);
  console.log(`  node --env-file=.env.local scripts/importar-cierres-postventa.mjs --aplicar\n`);
  await bd.end();
  process.exit(0);
}

// ── La carga ──────────────────────────────────────────────────────────────
console.log(`\nAplicando…`);
let cuentasCreadas = 0,
  oportunidades = 0,
  ventas = 0,
  equiposFichados = 0,
  saltados = 0;

await bd.query("begin");
try {
  for (const d of nuevos) {
    const doc = d.ruc ?? d.dni;
    const dueno = perfiles.get(DUENO_POR_TIPO[d.tipo]);

    // 1. El cliente. Si ya existe NO se le toca el dueño: el cliente es de
    //    quien lo vendió (regla 1). Si no existe, nace en la cartera de quien
    //    atendió el servicio, que es el único vínculo real que tiene.
    let cuenta = doc ? cuentas.get(doc) : null;
    if (!cuenta) {
      const { rows } = await bd.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, notas)
         values ($1, $2, $3, $4, $5) returning id, num_doc, comercial_id`,
        [
          d.dni && !d.ruc ? "DNI" : d.ruc ? "RUC" : "SIN_DOC",
          doc,
          (d.cliente ?? "Cliente sin nombre").slice(0, 200),
          dueno.id,
          `Creado desde el cierre de postventa ${d.archivo.split("/").pop()}`,
        ],
      );
      cuenta = rows[0];
      if (doc) cuentas.set(doc, cuenta);
      cuentasCreadas++;
    }

    // 2. Las máquinas, ANTES de la oportunidad: así el cierre queda colgado de
    //    la serie, que es el eje de trazabilidad que pidió Carlos (D6). No se
    //    les inventa fecha de venta ni garantía —el informe es de un servicio,
    //    no de la venta del equipo—; sí queda el último mantenimiento cuando el
    //    cierre lo fue.
    const idsEquipos = [];
    for (const s of d.series) {
      let id = equipoPorSerie.get(s.serie);
      if (!id) {
        const esMantenimiento = d.tipo !== "repuesto";
        const { rows } = await bd.query(
          `insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, ultimo_mantenimiento,
                                           proximo_mantenimiento, observaciones)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict do nothing
           returning id`,
          [
            s.serie,
            cuenta.id,
            d.cliente,
            s.descripcion?.slice(0, 300) ?? null,
            esMantenimiento ? d.fecha : null,
            // El manual pide el preventivo cada 4-6 meses: se agenda a los seis.
            esMantenimiento
              ? new Date(new Date(`${d.fecha}T12:00:00`).getTime() + 182 * 864e5).toISOString().slice(0, 10)
              : null,
            `Fichado desde el cierre de postventa ${d.archivo.split("/").pop()}`,
          ],
        );
        id = rows[0]?.id;
        if (id) {
          equipoPorSerie.set(s.serie, id);
          equiposFichados++;
        }
      }
      if (id) idsEquipos.push(id);
    }

    // 3. La oportunidad, ya cerrada: esto es un trabajo hecho y cobrado.
    //    `origen = historico_excel` no es un capricho: marca que viene de una
    //    migración y la deja fuera de los tableros que miran la gestión del día
    //    —«corresponde cerrar», la agenda—, que es lo que evitó que el
    //    histórico de 25.000 filas ahogara la pantalla de cada comercial.
    const { rows: op } = await bd.query(
      `insert into oportunidades
         (cuenta_id, comercial_id, etapa, intencion, moneda, tipo_postventa, origen,
          monto_estimado, cerrada_at, created_at, documento_origen, serie_texto, equipo_id)
       values ($1, $2, 'venta', 'sin_definir', $3, $4, 'historico_excel', $5, $6, $6, $7, $8, $9)
       returning id`,
      [
        cuenta.id,
        dueno.id,
        d.moneda ?? "USD",
        TIPO_POSTVENTA[d.tipo],
        d.monto,
        `${d.fecha}T12:00:00-05:00`,
        d.archivo,
        d.series[0]?.serie ?? null,
        idsEquipos[0] ?? null,
      ],
    );
    oportunidades++;

    // 4. La venta. Sin monto no se registra: una venta sin cifra ensucia todos
    //    los totales y no dice nada.
    if (d.monto) {
      await bd.query(
        `insert into ventas (oportunidad_id, fecha_venta, monto_total, moneda, registrada_por, origen,
                             referencia_historica, equipo_historico, serie, notas)
         values ($1, $2, $3, $4, $5, 'historico_excel', $6, $7, $8, $9)`,
        [
          op[0].id,
          d.fecha,
          d.monto,
          d.moneda ?? "USD",
          dueno.id,
          d.presupuesto,
          d.primerItem.slice(0, 300),
          d.razonSocial,
          `Cierre de postventa · informe ${d.correlativo ?? "s/n"}-${d.anio ?? ""} · ${d.archivo.split("/").pop()}`,
        ],
      );
      ventas++;
    } else {
      saltados++;
    }

  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  console.error("\n✗ Nada se guardó. Error:", e.message);
  await bd.end();
  process.exit(1);
}

console.log(`\n✓ Listo:`);
console.log(`   ${cuentasCreadas} clientes nuevos`);
console.log(`   ${oportunidades} oportunidades de postventa cerradas`);
console.log(`   ${ventas} ventas registradas${saltados ? ` (${saltados} sin monto legible, quedaron sin venta)` : ""}`);
console.log(`   ${equiposFichados} máquinas al parque instalado`);
await bd.end();
