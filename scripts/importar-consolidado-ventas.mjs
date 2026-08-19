// Importa el "CONSOLIDADO CIERRE VENTAS" de un comercial: el cuadro donde
// cada uno lleva sus cierres con monto, N° de presupuesto y empresa
// facturadora. Es la información COMPLEMENTARIA al CRM de prospectos que
// gerencia entrega por separado (reunión con el ing. Carlos, 19-08-2026:
// "no te hemos entregado el cuadro de ventas de los demás… entonces
// necesitarías esa información").
//
// POR QUÉ HACE FALTA: las oportunidades históricas se importaron desde las
// hojas COTIZ del CRM de cada comercial, que casi nunca traían el importe.
// Por eso el panel mostraba a Brenda con 55 ventas y S/ 0 vendido ("C8 está
// en cero" en la reunión). Este cuadro es el que tiene los montos.
//
// CÓMO CRUZA (de más confiable a menos):
//   1. N° de presupuesto vía el JSON de la extracción original: si una fila
//      del consolidado tiene el mismo PPTO que la fila que creó una
//      oportunidad, es la misma venta. Es la llave fuerte.
//   2. Razón social normalizada + fecha cercana (±45 días), cuando el PPTO no
//      aparece en el JSON.
//   3. Sin coincidencia: la venta existe en el cuadro pero no en la hoja de
//      prospectos → se crea la oportunidad histórica (y la cuenta si falta).
// Una oportunidad que YA tiene venta registrada nunca se toca: duplicar
// ventas es el error más caro de este proyecto.
//
// CONVENCIONES (verificadas contra los datos ya cargados):
//   · monto = columna "Monto $ sin IGV", en USD. El CRM guarda importes SIN
//     IGV (en las cotizaciones subtotal = total; el IGV solo se calcula al
//     imprimir el PDF). Usar "MONTO INC IGV" inflaría las ventas un 18 %
//     frente a las de los demás comerciales.
//   · varias filas con el mismo PPTO son EQUIPOS de una misma venta: se suman
//     en un solo registro (el consolidado de Brenda trae 77 filas que son 48
//     ventas reales).
//
// Uso:
//   node --env-file=.env.local scripts/importar-consolidado-ventas.mjs \
//     --archivo "X:/C8 CONSOLIDADO/CONSOLIDADO ….xlsx" --comercial C1 \
//     [--json-comercial C8] [--aplicar]
//   (--json-comercial: con qué código figuraba en la extracción original, si
//    cambió de posición — Brenda es C1 hoy pero su historial se extrajo como C8)

import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import XLSX from "xlsx";

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}
const ARCHIVO = arg("archivo");
const COMERCIAL = arg("comercial");
const JSON_COMERCIAL = arg("json-comercial", COMERCIAL);
const APLICAR = process.argv.includes("--aplicar");
const JSON_HISTORICO = "scripts/data/ventas-historicas-COTIZ-v2.json";

if (!ARCHIVO || !COMERCIAL) {
  console.error('Faltan parámetros. Ej: --archivo "X:/…/CONSOLIDADO.xlsx" --comercial C1 [--json-comercial C8] [--aplicar]');
  process.exit(1);
}
if (!existsSync(ARCHIVO)) {
  console.error("No existe el archivo:", ARCHIVO);
  process.exit(1);
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Los dos documentos escriben al MISMO cliente de formas distintas ("NEWREST
// PERU S.A.C." vs "NEWREST PERU SAC", "HOTEL CURASI S.R.L." vs "HOTEL
// CURASI", "\u2026ABZUL EIRL" vs "\u2026AZUL EIRL"). Comparar el texto tal cual daba
// 15 "ventas nuevas" que en realidad ya exist\u00edan: aplicarlo habr\u00eda duplicado
// diez ventas en el reporte de gerencia. Se compara sin puntuaci\u00f3n ni
// espacios y con similitud de bigramas (Dice), exigiendo adem\u00e1s que la fecha
// de cierre coincida \u2014 dos documentos que dicen la misma fecha y un nombre
// casi igual son, con certeza pr\u00e1ctica, la misma venta.
const compacta = (s) => norm(s).replace(/ /g, "");
function similitud(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramas = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const [ma, mb] = [bigramas(a), bigramas(b)];
  let comunes = 0, total = 0;
  for (const [g, n] of ma) { comunes += Math.min(n, mb.get(g) ?? 0); total += n; }
  for (const n of mb.values()) total += n;
  return (2 * comunes) / total;
}
const SIMILITUD_MINIMA = 0.55; // por debajo empiezan los falsos positivos
const DIAS_TOLERANCIA = 2;
const normPpto = (p) => String(p ?? "").trim().toUpperCase().replace(/\s+/g, "");
const excelFecha = (v) => (typeof v === "number" && v > 0 ? new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
// Postgres devuelve las columnas `date` como Date a medianoche LOCAL y el
// Excel da texto "YYYY-MM-DD" que JS lee como medianoche UTC: restarlos
// directo da 0,2 días de diferencia y "mismo día" nunca era exactamente 0.
// Todo se compara como texto YYYY-MM-DD.
const iso = (f) => (f instanceof Date
  ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`
  : String(f ?? "").slice(0, 10));
const dias = (a, b) => Math.abs((new Date(`${iso(a)}T12:00:00Z`) - new Date(`${iso(b)}T12:00:00Z`)) / 86_400_000);

// ---------- 1. Leer el consolidado ----------
const wb = XLSX.readFile(ARCHIVO);
const hojaTotal = wb.SheetNames.find((n) => /TOTAL CONSOLIDADO|CONSOLIDADO/i.test(n)) ?? wb.SheetNames[0];
const filas = XLSX.utils.sheet_to_json(wb.Sheets[hojaTotal], { header: 1 });

// La fila de encabezados es la que contiene "RAZON SOCIAL" (las hojas traen
// uno o dos títulos arriba, que varían entre comerciales).
const iCab = filas.findIndex((r) => (r ?? []).some((c) => /RAZON SOCIAL/i.test(String(c ?? ""))));
if (iCab === -1) throw new Error(`No se encontró la fila de encabezados en la hoja "${hojaTotal}"`);
const cab = filas[iCab];
const col = (re) => cab.findIndex((c) => re.test(String(c ?? "")));
const iRazon = col(/RAZON SOCIAL/i);
const iPpto = col(/N.?\s*PPTO/i);
const iCierre = col(/FECHA CIERRE/i);
const iMonto = col(/Monto\s*\$?\s*sin\s*IGV/i);
const iEquipo = col(/^ARTÍCULO|^ARTICULO/i);
const iProv = col(/Prov_Prosp/i);
const iEstado = col(/^CANCELADO/i);
if (iMonto === -1) throw new Error('No se encontró la columna "Monto $ sin IGV"');

const ventasPorPpto = new Map();
let sinPpto = 0;
for (let i = iCab + 1; i < filas.length; i++) {
  const r = filas[i];
  if (!r || !r[iRazon]) continue;
  // Las hojas repiten la fila de encabezados al empezar cada bloque mensual.
  if (/^RAZON SOCIAL$/i.test(String(r[iRazon]).trim())) continue;
  const ppto = r[iPpto] ? normPpto(r[iPpto]) : null;
  if (!ppto) { sinPpto++; continue; }
  const monto = typeof r[iMonto] === "number" ? r[iMonto] : null;
  const actual = ventasPorPpto.get(ppto) ?? {
    ppto, razon: String(r[iRazon]).trim(), razonN: norm(r[iRazon]),
    fecha: null, monto: 0, equipos: [], prov: null, estado: null,
  };
  actual.fecha ??= excelFecha(r[iCierre]);
  actual.prov ??= r[iProv] ? String(r[iProv]).trim() : null;
  actual.estado ??= r[iEstado] ? String(r[iEstado]).trim() : null;
  if (monto) actual.monto += monto;
  if (iEquipo !== -1 && r[iEquipo]) actual.equipos.push(String(r[iEquipo]).trim());
  ventasPorPpto.set(ppto, actual);
}
const ventas = [...ventasPorPpto.values()];
console.log(`\nConsolidado "${hojaTotal}": ${ventas.length} ventas (por N° PPTO)${sinPpto ? `, ${sinPpto} fila(s) sin PPTO ignoradas` : ""}`);
console.log(`Monto total (sin IGV): US$ ${Math.round(ventas.reduce((s, v) => s + v.monto, 0)).toLocaleString("es-PE")}`);

// ---------- 2. Empresa facturadora (hojas "POR EMPRESA") ----------
// Vienen como secciones tituladas "MES - EFAMEINSA - CANCELADOS" seguidas de
// sus filas, no como una columna: se recorre de arriba abajo recordando la
// última sección vista.
const seriePorPpto = new Map();
for (const nombre of wb.SheetNames.filter((n) => /EMPRESA/i.test(n))) {
  const hoja = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1 });
  let serieActual = null;
  let iPptoHoja = -1;
  for (const r of hoja) {
    const texto = (r ?? []).map((x) => String(x ?? "")).join(" ");
    if (/OPEN\s*INVESTMENTS/i.test(texto) && texto.length < 120) serieActual = "OPEN";
    else if (/EFAMEINSA/i.test(texto) && texto.length < 120) serieActual = "EFAMEINSA";
    if ((r ?? []).some((c) => /RAZON SOCIAL/i.test(String(c ?? "")))) {
      iPptoHoja = (r ?? []).findIndex((c) => /N.?\s*PPTO/i.test(String(c ?? "")));
      continue;
    }
    if (serieActual && iPptoHoja !== -1 && r?.[iPptoHoja]) {
      const p = normPpto(r[iPptoHoja]);
      if (p && !seriePorPpto.has(p)) seriePorPpto.set(p, serieActual);
    }
  }
}
const conSerie = ventas.filter((v) => seriePorPpto.has(v.ppto)).length;
console.log(`Empresa facturadora identificada en ${conSerie} de ${ventas.length} ventas (el resto queda "sin empresa")`);

// ---------- 3. Puente por N° de presupuesto con la extracción original ----------
const puente = new Map(); // pptoNorm → { razonN, fecha }
if (existsSync(JSON_HISTORICO)) {
  const arr = JSON.parse(readFileSync(JSON_HISTORICO, "utf8"));
  for (const f of arr) {
    if (String(f.comercialCarpeta ?? "").toUpperCase() !== String(JSON_COMERCIAL).toUpperCase()) continue;
    if (!f.ppto) continue;
    puente.set(normPpto(f.ppto), { razonN: norm(f.razon), fecha: excelFecha(f.fEstado) ?? excelFecha(f.fAccion) });
  }
  console.log(`Puente con la extracción original (${JSON_COMERCIAL}): ${puente.size} presupuestos`);
}

// ---------- 4. Estado actual en la base ----------
const cliente = new Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

const { rows: perfilRows } = await cliente.query(
  `select id, nombre, codigo_comercial from perfiles where codigo_comercial = $1`, [COMERCIAL]);
if (!perfilRows.length) throw new Error(`No existe el comercial ${COMERCIAL}`);
const perfil = perfilRows[0];
console.log(`Comercial destino: ${perfil.nombre} (${perfil.codigo_comercial})\n`);

const { rows: ops } = await cliente.query(`
  select o.id, o.created_at::date as fecha, o.cuenta_id, cu.razon_social,
         (select count(*) from ventas v where v.oportunidad_id = o.id)::int as n_ventas
  from oportunidades o join cuentas cu on cu.id = o.cuenta_id
  where o.comercial_id = $1 and o.etapa = 'venta'`, [perfil.id]);
const { rows: cuentas } = await cliente.query(
  `select id, razon_social from cuentas where comercial_id = $1`, [perfil.id]);
const cuentaPorRazon = new Map();
for (const c of cuentas) if (!cuentaPorRazon.has(norm(c.razon_social))) cuentaPorRazon.set(norm(c.razon_social), c.id);

// ---------- 5. Resolver cada venta ----------
const plan = { conVenta: [], aOportunidad: [], aCrear: [] };
const opsUsadas = new Set();

function buscarOportunidad(v) {
  const candidatas = ops.filter((o) => !opsUsadas.has(o.id));
  const p = puente.get(v.ppto);
  if (p) {
    const porPuente = candidatas.filter((o) => norm(o.razon_social) === p.razonN &&
      (!p.fecha || dias(o.fecha, p.fecha) <= 5));
    if (porPuente.length === 1) return { op: porPuente[0], via: "n° presupuesto" };
    if (porPuente.length > 1) {
      const exacta = porPuente.find((o) => p.fecha && dias(o.fecha, p.fecha) === 0);
      if (exacta) return { op: exacta, via: "n° presupuesto" };
    }
  }
  if (v.fecha) {
    const porNombre = candidatas
      .filter((o) => norm(o.razon_social) === v.razonN && dias(o.fecha, v.fecha) <= 45)
      .sort((a, b) => dias(a.fecha, v.fecha) - dias(b.fecha, v.fecha));
    if (porNombre.length) return { op: porNombre[0], via: "razón social + fecha" };

    // Mismo día (±2) y nombre casi igual: los dos documentos escriben al
    // cliente distinto pero es la misma venta.
    const parecidas = candidatas
      .filter((o) => dias(o.fecha, v.fecha) <= DIAS_TOLERANCIA)
      .map((o) => ({ o, s: similitud(compacta(o.razon_social), compacta(v.razon)) }))
      .filter((x) => x.s >= SIMILITUD_MINIMA)
      .sort((a, b) => b.s - a.s || dias(a.o.fecha, v.fecha) - dias(b.o.fecha, v.fecha));
    if (parecidas.length) return { op: parecidas[0].o, via: "fecha + nombre similar", similitud: parecidas[0].s };
  }
  return null;
}

for (const v of ventas) {
  if (!v.monto || !v.fecha) { plan.conVenta.push({ ...v, motivo: "sin monto o sin fecha de cierre" }); continue; }
  const hallada = buscarOportunidad(v);
  if (!hallada) { plan.aCrear.push(v); continue; }
  opsUsadas.add(hallada.op.id);
  if (hallada.op.n_ventas > 0) plan.conVenta.push({ ...v, motivo: `la oportunidad ya tiene venta registrada (${hallada.via})` });
  else plan.aOportunidad.push({ ...v, op: hallada.op, via: hallada.via, similitud: hallada.similitud });
}

console.log("PLAN:");
console.table([
  { accion: "Agregar monto a una oportunidad existente", ventas: plan.aOportunidad.length, "US$": Math.round(plan.aOportunidad.reduce((s, v) => s + v.monto, 0)) },
  { accion: "Crear oportunidad + venta (no estaba en el CRM)", ventas: plan.aCrear.length, "US$": Math.round(plan.aCrear.reduce((s, v) => s + v.monto, 0)) },
  { accion: "Omitir (ya tiene venta / sin datos)", ventas: plan.conVenta.length, "US$": Math.round(plan.conVenta.reduce((s, v) => s + v.monto, 0)) },
]);
const porVia = {};
for (const v of plan.aOportunidad) porVia[v.via] = (porVia[v.via] ?? 0) + 1;
console.log("Cruces por:", porVia);
const difusos = plan.aOportunidad.filter((v) => v.via === "fecha + nombre similar");
if (difusos.length) {
  console.log("Cruces por nombre similar (revisar que sean el mismo cliente):");
  for (const v of difusos) {
    console.log(`  ${((v.similitud ?? 0) * 100).toFixed(0)}%  ${v.fecha}  "${v.razon.slice(0, 40)}"  ←→  "${v.op.razon_social.slice(0, 40)}"`);
  }
}
if (plan.conVenta.length) console.log("Omitidas:", plan.conVenta.map((v) => `${v.ppto} ${v.razon.slice(0, 28)} — ${v.motivo}`));

// Control anti-duplicado: lo que se va a CREAR, junto a las oportunidades que
// quedaron sin cruzar. Si una venta "nueva" es en realidad una de esas escrita
// distinto, se ve aquí — y hay que corregir el nombre antes de aplicar, no
// después (una venta duplicada infla el reporte de gerencia sin dejar rastro).
const huerfanas = ops.filter((o) => !opsUsadas.has(o.id));
console.log(`\nOportunidades del comercial sin dato en el consolidado: ${huerfanas.length} (quedan sin monto)`);
// Una venta a crear que cae el MISMO DÍA que una oportunidad sin monto y con
// otro nombre puede ser la misma (en Perú es común que un documento use la
// razón social y el otro el nombre del titular: "DON JOSE GUEST HOUSE
// E.I.R.L." / "JOSE CAMPOS CAMPOS"). No se enlazan solas —enlazar al cliente
// equivocado también es un error— pero quedan señaladas para que gerencia lo
// confirme, y la advertencia se guarda en las notas de la venta.
for (const v of plan.aCrear) {
  v.sospechosas = huerfanas.filter((o) => iso(o.fecha) === v.fecha).map((o) => o.razon_social);
}
if (plan.aCrear.length) {
  console.log("\nSE CREARÍAN (⚠ = hay una oportunidad sin monto el mismo día: confirmar con gerencia):");
  for (const v of plan.aCrear) {
    console.log(`  ${v.sospechosas.length ? "⚠" : " "} ${v.fecha}  US$ ${String(Math.round(v.monto)).padStart(7)}  ${v.ppto.padEnd(11)} ${v.razon.slice(0, 42)}`);
    for (const s of v.sospechosas) console.log(`      ↳ mismo día en el CRM: "${s.slice(0, 46)}"`);
  }
  console.log("\nOPORTUNIDADES SIN CRUZAR (siguen sin monto):");
  for (const o of huerfanas) console.log(`  ${iso(o.fecha)}  ${o.razon_social.slice(0, 46)}`);
}

if (!APLICAR) {
  console.log("\nSimulación terminada — no se escribió nada. Repita con --aplicar.");
  await cliente.end();
  process.exit(0);
}

// ---------- 6. Aplicar ----------
try {
  await cliente.query("begin");
  let nVentas = 0, nOps = 0, nCuentas = 0;

  const insertarVenta = async (oportunidadId, v) => {
    await cliente.query(
      `insert into ventas (oportunidad_id, serie, fecha_venta, monto_total, moneda, registrada_por,
                           origen, referencia_historica, equipo_historico, notas)
       values ($1, $2, $3, $4, 'USD', $5, 'historico_excel', $6, $7, $8)`,
      [oportunidadId, seriePorPpto.get(v.ppto) ?? null, v.fecha, v.monto, perfil.id,
       v.ppto, v.equipos.join(" · ").slice(0, 500) || null,
       `Consolidado de cierre de ventas${v.estado ? ` · ${v.estado}` : ""}` +
         (v.sospechosas?.length ? ` · ⚠ posible duplicado de la oportunidad del mismo día: ${v.sospechosas.join(" / ")}` : "")],
    );
    nVentas++;
  };

  for (const v of plan.aOportunidad) await insertarVenta(v.op.id, v);

  for (const v of plan.aCrear) {
    let cuentaId = cuentaPorRazon.get(v.razonN);
    if (!cuentaId) {
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, razon_social, comercial_id, cartera_desde)
         values ('SIN_DOC', $1, $2, $3) returning id`,
        [v.razon, perfil.id, v.fecha],
      );
      cuentaId = rows[0].id;
      cuentaPorRazon.set(v.razonN, cuentaId);
      nCuentas++;
    }
    const { rows: opRows } = await cliente.query(
      `insert into oportunidades (cuenta_id, comercial_id, etapa, origen, procedencia, created_at, cerrada_at, monto_estimado, moneda)
       values ($1, $2, 'venta', 'historico_excel', $3, $4, $4, $5, 'USD') returning id`,
      [cuentaId, perfil.id, v.prov ? v.prov.toUpperCase() : null, `${v.fecha}T12:00:00-05:00`, v.monto],
    );
    nOps++;
    await insertarVenta(opRows[0].id, v);
  }

  await cliente.query("commit");
  console.log(`\n✓ Aplicado: ${nVentas} venta(s), ${nOps} oportunidad(es) nueva(s), ${nCuentas} cuenta(s) nueva(s).`);
} catch (e) {
  await cliente.query("rollback");
  console.error("\n✗ Error — se revirtió todo:", e.message);
  await cliente.end();
  process.exit(1);
}

const { rows: [fin] } = await cliente.query(`
  select count(*)::int as ventas, coalesce(round(sum(v.monto_total)), 0) as usd,
         count(v.serie)::int as con_empresa
  from ventas v join oportunidades o on o.id = v.oportunidad_id
  where o.comercial_id = $1`, [perfil.id]);
console.log(`Estado final de ${perfil.nombre}: ${fin.ventas} ventas con monto, US$ ${Number(fin.usd).toLocaleString("es-PE")}, ${fin.con_empresa} con empresa identificada.`);
await cliente.end();
