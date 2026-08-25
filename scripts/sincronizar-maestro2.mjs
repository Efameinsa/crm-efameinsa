// ============================================================
// CRM EFAMEINSA · Sincronizar con «CODIFICACION DE EQUIPOS2.xlsx»
// ============================================================
// El 25-08 a las 15:45 Lesly guardó una versión nueva del maestro. Trae:
//   · Descripciones largas por equipo (panel, fuerza, boiler, voltaje…) — el
//    texto con el que las comerciales piden las máquinas. Se guarda en
//    ficha.descripcion_maestro y entra al texto buscable del cotizador.
//   · UBICACIÓN (planta / exhibición) y columna MARKETING.
//   · PRECIO PARA LOS COCHES (CO401/402/408) — dejan de pedir aprobación
//     de gerencia por «sin precio».
//   · Dos hojas más: «FALTA PRECIOS Y FICHA» y «EQUIPOS QUE NO TENEMOS
//     STOCK», que este script solo reporta (no cargan nada).
//
// TAMBIÉN CORRIGE EL CALENTAMIENTO. El cargador anterior hacía
// /VAPOR/.test(descripción) y las lavadoras «BOILER FED + PREPARADO A VAPOR»
// (preparadas para conexión de vapor, no calentadas a vapor) quedaron como
// calentamiento=VAPOR — 32 equipos, detectado el 25-08 en la LAV180 de una
// cotización. Acá se quita el «PREPARADO A/PARA VAPOR» ANTES de buscar el
// calentamiento real.
//
// CÓDIGOS REPETIDOS (LAV180, LAV280, LAVA060): el maestro usa un código para
// dos máquinas distintas; en el CRM ya viven como -V1/-V2. Se emparejan por
// el MODELO que dice la descripción (RX180 vs FX180…) o por el panel (M30 vs
// M9) — nunca por adivinar.
//
// Uso: node --env-file=.env.local scripts/sincronizar-maestro2.mjs [--aplicar]

import { Client } from "pg";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS2.xlsx";

const limpiar = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

/** El calentamiento REAL de la descripción del maestro: primero se quita el
 *  «preparado a/para vapor» (una conexión opcional, no su calentamiento) y
 *  recién ahí se pregunta por gas/eléctrico/vapor.
 *
 *  Tres lecciones del primer intento (25-08):
 *   · Sin tildes ANTES de comparar: «CALENTAMIENTO: ELÉCTRICO» no matchea
 *     /ELECTRIC/ por la É, y las secadoras eléctricas quedaban sin dato.
 *   · «GAS» a secas se queda «GAS»: el cargador viejo lo convertía en
 *     «GAS GLP», que es inventar. Lesly escribe GLP o NATURAL cuando lo sabe.
 *   · «CALENTAMIENTO DIRECTO CON VAPOR» (LAVUY4502) y «CON CALENTAMIENTO A
 *     VAPOR» (LAVG50) sí son vapor de verdad — el strip no los toca. */
function calentamientoDe(eq) {
  const plano = eq.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  const sinPrep = plano
    .replace(/PREPARAD[OA]?\s*(?:A|PARA)?\s*(?:EL\s*)?VAPOR/g, " ")
    .replace(/PREP\.?\s*(?:PARA\s*)?VAP(?:OR)?\.?/g, " ");
  if (/GAS\s*NATURAL|\bGN\b/.test(sinPrep)) return "GAS NATURAL";
  if (/GLP/.test(sinPrep)) return "GAS GLP";
  if (/\bGAS\b/.test(sinPrep)) return "GAS";
  if (/ELECTRIC/.test(sinPrep)) return "ELÉCTRICO";
  if (/VAPOR/.test(sinPrep)) return "VAPOR";
  return null;
}

const claseDe = (v) =>
  v == null ? null
  : /GAS/i.test(v) ? "gas"
  : /ELECTRIC/i.test(v.normalize("NFD").replace(/\p{Diacritic}/gu, "")) ? "electrico"
  : /VAPOR/i.test(v) ? "vapor" : "otro";

/** Qué calentamiento queda. Cambia solo cuando hay algo que corregir:
 *   · el maestro dice otra CLASE (gas vs eléctrico vs vapor) → manda el maestro;
 *   · el sistema decía VAPOR y el maestro no lo sostiene → era el falso
 *     «preparado a vapor», se limpia;
 *   · el sistema decía «GAS» genérico y el maestro precisa GLP/NATURAL → se
 *     precisa.
 *  Misma clase con otra grafía (ELÉCTRICA vs ELÉCTRICO) NO se toca: churn que
 *  además rompería la búsqueda «secadora electrica». */
function calentamientoFinal(actual, computado) {
  if (computado == null) return claseDe(actual) === "vapor" ? null : actual;
  if (actual == null || claseDe(actual) !== claseDe(computado)) return computado;
  if (claseDe(actual) === "gas" && actual.trim().toUpperCase() === "GAS" && computado !== "GAS") return computado;
  return actual;
}

// ---- 1. El maestro nuevo -------------------------------------------------
const wb = XLSX.readFile(EXCEL);
const filas = XLSX.utils.sheet_to_json(wb.Sheets["EQUIPOS CODIFICADOS "], { header: 1, defval: null });
const maestro = filas
  .slice(3)
  .filter((f) => limpiar(f[1]))
  .map((f) => ({
    codigo: limpiar(f[1]),
    equipo: limpiar(f[2]),
    stock: typeof f[3] === "number" ? f[3] : null,
    marca: limpiar(f[4]) || null,
    ubicacion: limpiar(f[5]) || null,
    precio: typeof f[6] === "number" ? f[6] : null,
    marketing: limpiar(f[7]) || null,
  }));

const porCodigo = new Map();
for (const m of maestro) {
  const xs = porCodigo.get(m.codigo) ?? [];
  xs.push(m);
  porCodigo.set(m.codigo, xs);
}

// ---- 2. El catálogo del CRM ----------------------------------------------
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const { rows: productos } = await bd.query(
  `select p.id, p.sku, p.marca, p.modelo, p.segmento, p.ficha,
          (select pp.tier   from precios_producto pp where pp.producto_id = p.id and pp.vigente_hasta is null limit 1) tier,
          (select pp.precio from precios_producto pp where pp.producto_id = p.id and pp.vigente_hasta is null limit 1) precio
     from productos p where p.activo order by p.sku`,
);
const productosPorSku = new Map(productos.map((p) => [p.sku, p]));

/** Con qué producto del CRM va esta fila del maestro. Para los códigos
 *  repetidos, el CRM tiene -V1/-V2: gana la variante cuyo MODELO aparece en
 *  la descripción; si no alcanza, el panel (M30/M9, sin espacios). */
function productoDe(m, repetido) {
  if (!repetido && productosPorSku.has(m.codigo)) return productosPorSku.get(m.codigo);
  const variantes = productos.filter((p) => p.sku === m.codigo || p.sku.startsWith(`${m.codigo}-V`));
  if (variantes.length === 0) return null;
  if (variantes.length === 1 && !repetido) return variantes[0];
  const eq = m.equipo.toUpperCase().replace(/\s+/g, "");
  const porModelo = variantes.filter((p) => p.modelo && eq.includes(p.modelo.toUpperCase().replace(/\s+/g, "")));
  if (porModelo.length === 1) return porModelo[0];
  const porPanel = variantes.filter((p) => {
    const panel = typeof p.ficha?.panel === "string" ? p.ficha.panel.toUpperCase().replace(/\s+/g, "") : "";
    return panel && eq.includes(panel);
  });
  if (porPanel.length === 1) return porPanel[0];
  return undefined; // ambiguo: se reporta, no se adivina
}

// ---- 3. Comparar ----------------------------------------------------------
const cambios = [];
const nuevos = [];
const ambiguos = [];
const emparejados = new Set();

for (const [codigo, filasDelCodigo] of porCodigo) {
  const repetido = filasDelCodigo.length > 1;
  for (const m of filasDelCodigo) {
    const p = productoDe(m, repetido);
    if (p === null) {
      nuevos.push(m);
      continue;
    }
    if (p === undefined) {
      ambiguos.push(m);
      continue;
    }
    emparejados.add(p.sku);

    const ficha = p.ficha ?? {};
    const c = { p, m, precio: null, stock: null, calent: null, descripcion: null, ubicacion: null };

    if (m.precio != null && Number(p.precio) !== m.precio) c.precio = { de: p.precio, a: m.precio };
    const stockActual = typeof ficha.stock_referencia === "number" ? ficha.stock_referencia : null;
    if (m.stock !== stockActual) c.stock = { de: stockActual, a: m.stock };
    const calActual = typeof ficha.calentamiento === "string" ? ficha.calentamiento : null;
    const calNuevo = calentamientoFinal(calActual, calentamientoDe(m.equipo));
    if (calNuevo !== calActual) c.calent = { de: calActual, a: calNuevo };
    if (ficha.descripcion_maestro !== m.equipo) c.descripcion = m.equipo;
    const ubicNueva = m.ubicacion ? m.ubicacion.toUpperCase() : null;
    if ((ficha.ubicacion_maestro ?? null) !== ubicNueva) c.ubicacion = ubicNueva;

    if (c.precio || c.stock || c.calent || c.descripcion || c.ubicacion) cambios.push(c);
  }
}

const fueraDelMaestro = productos.filter((p) => !emparejados.has(p.sku));

// ---- 4. Informar ----------------------------------------------------------
console.log(`Maestro2: ${maestro.length} filas · ${porCodigo.size} códigos. CRM activos: ${productos.length}.\n`);

console.log(`── Cambios (${cambios.length} producto/s) ─────────────────────────`);
for (const c of cambios) {
  const partes = [];
  if (c.precio) partes.push(`precio ${c.precio.de ?? "SIN PRECIO"} → ${c.precio.a}`);
  if (c.stock) partes.push(`stock ${c.stock.de ?? "s/d"} → ${c.stock.a ?? "s/d"}`);
  if (c.calent) partes.push(`calentamiento «${c.calent.de ?? "—"}» → «${c.calent.a ?? "—"}»`);
  if (c.descripcion) partes.push("descripción");
  if (c.ubicacion) partes.push(`ubicación ${c.ubicacion}`);
  console.log(`  ${c.p.sku.padEnd(11)} ${partes.join(" · ")}`);
}

if (nuevos.length) {
  console.log(`\n── En el maestro pero NO en el CRM (${nuevos.length}) — necesitan ficha ──`);
  for (const m of nuevos) console.log(`  ${m.codigo.padEnd(11)} ${m.equipo.slice(0, 90)} · precio ${m.precio ?? "—"}`);
}
if (ambiguos.length) {
  console.log(`\n── Repetidos sin poder distinguir (${ambiguos.length}) — NO se tocan ──`);
  for (const m of ambiguos) console.log(`  ${m.codigo.padEnd(11)} ${m.equipo.slice(0, 90)}`);
}
if (fueraDelMaestro.length) {
  console.log(`\n── Activos en el CRM pero fuera del maestro2 (${fueraDelMaestro.length}) — revisar ──`);
  for (const p of fueraDelMaestro) console.log(`  ${p.sku.padEnd(11)} ${p.marca ?? ""} ${p.modelo ?? ""}`);
}

// Las otras dos hojas, solo para tener el panorama.
for (const hoja of ["FALTA PRECIOS Y FICHA", "EQUIPOS QUE NO TENEMOS STOCK"]) {
  const n = XLSX.utils.sheet_to_json(wb.Sheets[hoja] ?? {}, { header: 1, defval: null }).filter((f) => f.some((x) => x != null)).length;
  console.log(`\n(hoja «${hoja}»: ${n} filas — informativa, no se carga)`);
}

if (!APLICAR) {
  console.log("\nNada se ha modificado — agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}

// ---- 5. Aplicar -----------------------------------------------------------
for (const c of cambios) {
  const ficha = c.p.ficha ?? {};
  if (c.stock) ficha.stock_referencia = c.stock.a;
  if (c.calent) ficha.calentamiento = c.calent.a;
  if (c.descripcion != null) ficha.descripcion_maestro = c.descripcion;
  if (c.ubicacion !== null || c.m.ubicacion === null) ficha.ubicacion_maestro = c.ubicacion ?? ficha.ubicacion_maestro ?? null;
  ficha.origen = { ...(ficha.origen ?? {}), maestro2: EXCEL.split("/").join("\\"), maestro2_sync: new Date().toISOString().slice(0, 10) };

  await bd.query(`update productos set ficha = $2, updated_at = now() where id = $1`, [c.p.id, JSON.stringify(ficha)]);

  if (c.precio) {
    const tier = c.p.tier ?? (c.p.segmento === "semi_industrial" ? "optimo" : "base");
    await bd.query(
      `update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null`,
      [c.p.id],
    );
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
       values ($1, $2, $3, 'USD', current_date)
       on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
      [c.p.id, tier, c.precio.a],
    );
  }
}
console.log(`\n✓ ${cambios.length} producto(s) sincronizados con el maestro2.`);
await bd.end();
