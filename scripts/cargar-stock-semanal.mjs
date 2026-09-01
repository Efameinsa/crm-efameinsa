// ============================================================
// CRM EFAMEINSA · Cargar el stock SEMANAL de Importaciones
// ============================================================
// El 01-09 el ing. Carlos decidió que el stock que ve el cotizador deje de
// ser la foto del maestro de Lesly y se alimente del Excel que Importaciones
// arma cada semana: «ese Excel brindarle para que lo pueda subir
// semanalmente… ya codificado todo, lo pones en la ruta y nada más… dale las
// columnas que necesitas». Las columnas pedidas están en
// docs/28-stock-semanal-importaciones.md.
//
// QUÉ TOCA. Un solo dato por producto: `ficha.stock_referencia`, el número
// que lee el cotizador (datos-cotizador.ts) y la pantalla de operaciones
// (catalogo-operaciones.ts). Nada más: ni precio, ni nombre, ni el resto de la
// ficha — «el catálogo es sagrado» (docs/19 §3). Por eso la escritura es un
// `ficha || {stock_referencia}` en la base y no un leer-modificar-guardar de
// la ficha entera: si alguien está editando la ficha en ese momento, no se le
// pisa nada.
//
// DE DÓNDE SALE EL DATO HOY. Hasta ahora el stock lo traía el maestro de
// Lesly (scripts/sincronizar-maestro2.mjs, columna STOCK) y operaciones podía
// corregirlo a mano en el catálogo. `inventario_equipos` (0117), el almacén
// por número de serie, sigue vacío; cuando se cargue, ese conteo se muestra
// aparte («en almacén») y esta cifra sigue siendo «(ref.)».
//
// REGISTRO DE LA CARGA. No hay columna `stock_actualizado_at` en `productos`
// y no se crea una migración por esto: la fecha y el nombre del archivo van
// en `ficha.origen.stock_semanal` / `ficha.origen.stock_semanal_at`, igual
// que el maestro2 deja `origen.maestro2_sync`. Solo se escribe en productos
// cuya ficha ya es un objeto (todos los activos lo son).
//
// CÓDIGOS REPETIDOS. LAV180, LAV280 y LAVA060 nombran dos máquinas cada uno
// (RX/FX) y en el CRM viven como -V1/-V2. Si el Excel trae «LAV180» a secas
// se intenta distinguir por el MODELO que diga la descripción (RX180 vs
// FX180), igual que hace el maestro2; si no alcanza, se reporta y NO se
// adivina. Lo correcto es que Importaciones escriba LAV180-V1 / LAV180-V2.
//
// LO QUE NO VIENE EN EL EXCEL CONSERVA SU CIFRA. Un producto activo que no
// aparece en la hoja no se pone en cero: se lista para que alguien pregunte.
// Cero es una afirmación («no queda ninguna») y solo la hace Importaciones
// escribiendo 0.
//
// Uso:
//   node --env-file=.env.local scripts/cargar-stock-semanal.mjs <archivo.xlsx>            (solo muestra el plan)
//   node --env-file=.env.local scripts/cargar-stock-semanal.mjs <archivo.xlsx> --ejecutar (aplica, en una transacción)
//   node --env-file=.env.local scripts/cargar-stock-semanal.mjs <carpeta>                 (toma el .xlsx más nuevo de la carpeta)
//   node --env-file=.env.local scripts/cargar-stock-semanal.mjs                           (idem, en CARPETA_POR_DEFECTO)
//   --hoja="NOMBRE"   fuerza la hoja cuando el libro trae varias con cabecera parecida.

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import XLSX from "xlsx";

const CARPETA_POR_DEFECTO = "V:/SANTOS/STOCK SEMANAL";

const EJECUTAR = process.argv.includes("--ejecutar");
const hojaForzada = (process.argv.find((a) => a.startsWith("--hoja=")) ?? "").slice("--hoja=".length).replace(/^"|"$/g, "") || null;
const rutaPedida = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? CARPETA_POR_DEFECTO;

// ---- 0. Qué archivo -------------------------------------------------------
function archivoMasNuevo(carpeta) {
  const xlsx = fs
    .readdirSync(carpeta)
    .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ f, t: fs.statSync(path.join(carpeta, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (xlsx.length === 0) throw new Error(`No hay ningún .xlsx en ${carpeta}`);
  return path.join(carpeta, xlsx[0].f);
}

if (!fs.existsSync(rutaPedida)) {
  console.error(`No existe: ${rutaPedida}`);
  process.exit(1);
}
const ARCHIVO = fs.statSync(rutaPedida).isDirectory() ? archivoMasNuevo(rutaPedida) : rutaPedida;
const NOMBRE_ARCHIVO = path.basename(ARCHIVO);
const HOY_LIMA = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Lima" }); // YYYY-MM-DD

// ---- 1. Leer el Excel con cabeceras tolerantes ----------------------------
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
const rotulo = (t) => sinTildes(t).toUpperCase().replace(/[.:]/g, "").replace(/\s+/g, " ").trim();
/** Un código se compara siempre en mayúsculas, sin tildes y sin ningún espacio. */
const normalizarCodigo = (t) => sinTildes(t).toUpperCase().replace(/\s+/g, "");

const CABECERAS = {
  codigo: [/^COD(IGO)?( DEL? (EQUIPO|PRODUCTO|ARTICULO|ITEM))?$/, /^SKU$/, /^CODIGO /],
  stock: [/^STOCK/, /^CANT(IDAD)?( DISPONIBLE| FISICA| REAL)?$/, /^UNIDADES$/, /^UND$/, /^EXISTENCIAS?$/, /^DISPONIBLES?$/],
  ubicacion: [/^UBICACION/, /^ALMACEN/, /^LOCAL$/, /^SEDE$/],
  descripcion: [/^DESCRIPCION/, /^EQUIPO$/, /^DETALLE$/, /^NOMBRE/, /^PRODUCTO$/, /^ARTICULO$/],
};
function columnaDe(fila, clave) {
  for (let i = 0; i < fila.length; i++) {
    const r = rotulo(fila[i]);
    if (r && CABECERAS[clave].some((re) => re.test(r))) return i;
  }
  return -1;
}

/** Busca, en las primeras 30 filas de la hoja, la fila que tiene a la vez una
 *  columna de código y una de stock. Importaciones puede poner un título o
 *  la fecha arriba de la tabla: por eso no se asume que la cabecera es la
 *  fila 1. */
function detectarTabla(ws) {
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const f = filas[i];
    const codigo = columnaDe(f, "codigo");
    const stock = columnaDe(f, "stock");
    if (codigo >= 0 && stock >= 0 && codigo !== stock) {
      return {
        cabeceraEn: i,
        col: { codigo, stock, ubicacion: columnaDe(f, "ubicacion"), descripcion: columnaDe(f, "descripcion") },
        rotulos: { codigo: String(f[codigo]), stock: String(f[stock]) },
        filas: filas.slice(i + 1),
      };
    }
  }
  return null;
}

const wb = XLSX.readFile(ARCHIVO);
let hoja = null;
let tabla = null;
for (const nombre of hojaForzada ? [hojaForzada] : wb.SheetNames) {
  if (!wb.Sheets[nombre]) continue;
  const t = detectarTabla(wb.Sheets[nombre]);
  if (t) {
    hoja = nombre;
    tabla = t;
    break;
  }
}
if (!tabla) {
  console.error(
    `En «${NOMBRE_ARCHIVO}» no encontré ninguna hoja con una columna de CÓDIGO y otra de STOCK en las primeras 30 filas` +
      (hojaForzada ? ` (hoja pedida: «${hojaForzada}»)` : ` (hojas: ${wb.SheetNames.join(", ")})`) +
      `.\nEl formato pedido a Importaciones está en docs/28-stock-semanal-importaciones.md.`,
  );
  process.exit(1);
}

/** «3», 3, «3 und», «3,0» → 3. Vacío → null (no es cero: es «no dijeron»).
 *  Cualquier otra cosa → NaN, y la fila se reporta como inválida. */
function leerCantidad(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : NaN;
  const m = String(v).trim().replace(",", ".").match(/^(\d+)(?:\.0+)?(?:\s*(?:UND|UNID|UNIDADES|U|PZA|PZAS))?\.?$/i);
  return m ? Number(m[1]) : NaN;
}

const filasExcel = [];
const filasInvalidas = [];
tabla.filas.forEach((f, i) => {
  const numFila = tabla.cabeceraEn + i + 2; // como se ve en Excel (1-based, después de la cabecera)
  const codigoCrudo = f[tabla.col.codigo];
  const codigo = normalizarCodigo(codigoCrudo);
  const todoVacio = f.every((x) => x === null || String(x).trim() === "");
  if (todoVacio) return;
  if (!codigo) {
    filasInvalidas.push({ fila: numFila, motivo: "sin código", detalle: String(f[tabla.col.descripcion] ?? "").slice(0, 60) });
    return;
  }
  if (rotulo(codigoCrudo) === "TOTAL" || /^TOTAL/.test(codigo)) return; // pie de tabla
  const stock = leerCantidad(f[tabla.col.stock]);
  if (Number.isNaN(stock)) {
    filasInvalidas.push({ fila: numFila, motivo: `cantidad ilegible «${f[tabla.col.stock]}»`, detalle: codigo });
    return;
  }
  if (stock === null) {
    filasInvalidas.push({ fila: numFila, motivo: "cantidad en blanco (no se toma como 0)", detalle: codigo });
    return;
  }
  filasExcel.push({
    fila: numFila,
    codigo,
    stock,
    ubicacion: tabla.col.ubicacion >= 0 ? String(f[tabla.col.ubicacion] ?? "").trim() || null : null,
    descripcion: tabla.col.descripcion >= 0 ? String(f[tabla.col.descripcion] ?? "").replace(/\s+/g, " ").trim() || null : null,
  });
});

// Un código puede venir en varias filas si el Excel está partido por almacén
// (PLANTA / EXHIBICIÓN / TIENDA). En ese caso el stock es la suma. Si viene
// repetido SIN ubicación y con cantidades distintas, no se sabe cuál vale:
// se reporta y no se toca.
const porCodigo = new Map();
for (const r of filasExcel) {
  const xs = porCodigo.get(r.codigo) ?? [];
  xs.push(r);
  porCodigo.set(r.codigo, xs);
}
const pedidos = []; // { codigo, stock, ubicaciones, descripcion, filas }
const conflictos = [];
for (const [codigo, xs] of porCodigo) {
  const descripcion = xs.map((x) => x.descripcion).find(Boolean) ?? null;
  const filas = xs.map((x) => x.fila);
  if (xs.length === 1) {
    pedidos.push({ codigo, stock: xs[0].stock, ubicaciones: xs[0].ubicacion ? [`${xs[0].ubicacion}: ${xs[0].stock}`] : [], descripcion, filas });
    continue;
  }
  const ubicaciones = new Set(xs.map((x) => x.ubicacion ?? ""));
  const cantidades = new Set(xs.map((x) => x.stock));
  if (ubicaciones.size === xs.length && !ubicaciones.has("")) {
    pedidos.push({
      codigo,
      stock: xs.reduce((s, x) => s + x.stock, 0),
      ubicaciones: xs.map((x) => `${x.ubicacion}: ${x.stock}`),
      descripcion,
      filas,
    });
  } else if (cantidades.size === 1) {
    pedidos.push({ codigo, stock: xs[0].stock, ubicaciones: [], descripcion, filas }); // repetido idéntico
  } else {
    conflictos.push({ codigo, filas, cantidades: xs.map((x) => x.stock), descripcion });
  }
}

// ---- 2. El catálogo del CRM ----------------------------------------------
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const { rows: productos } = await bd.query(
  `select id, sku, nombre, marca, modelo, activo, ficha, jsonb_typeof(ficha) = 'object' as ficha_es_objeto
     from productos order by sku`,
);
// Un producto sin código no puede recibir stock de ningún Excel: se avisa.
const activosSinSku = productos.filter((p) => p.activo && !p.sku);
const porSku = new Map();
for (const p of productos) if (p.sku) porSku.set(normalizarCodigo(p.sku), p);
const variantesDe = (codigo) => productos.filter((p) => p.sku && normalizarCodigo(p.sku).startsWith(`${codigo}-V`));

const stockActualDe = (p) => {
  const v = p.ficha?.stock_referencia;
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v);
  return null;
};

/** Con qué producto va este código. Exacto por SKU normalizado; si no, las
 *  variantes -V1/-V2 de un código repetido (las activas primero), distinguidas
 *  por el modelo que diga la descripción. `undefined` = ambiguo, se reporta y
 *  no se toca.
 *
 *  Hoy (01-09) el catálogo activo tiene LAV180 = RX180, LAV280 = RX280 y la
 *  FX280 con código propio LAVF280; las -V1/-V2 quedaron inactivas. Así que el
 *  exacto gana y la rama de variantes es el respaldo por si eso cambia. */
function productoDe(pedido) {
  if (porSku.has(pedido.codigo)) return porSku.get(pedido.codigo);
  const todas = variantesDe(pedido.codigo);
  if (todas.length === 0) return null;
  const variantes = todas.some((p) => p.activo) ? todas.filter((p) => p.activo) : todas;
  if (variantes.length === 1) return variantes[0];
  if (pedido.descripcion) {
    const eq = normalizarCodigo(pedido.descripcion);
    const porModelo = variantes.filter((p) => p.modelo && eq.includes(normalizarCodigo(p.modelo)));
    if (porModelo.length === 1) return porModelo[0];
  }
  return undefined;
}

// ---- 3. Comparar ----------------------------------------------------------
const cambios = []; // { p, de, a, pedido }
const sinCambio = [];
const desconocidos = [];
const ambiguos = [];
const inactivos = [];
const sinFicha = [];
const repetidosAvisados = [];
const vistos = new Set();

for (const pedido of pedidos) {
  const p = productoDe(pedido);
  if (p === null) {
    desconocidos.push(pedido);
    continue;
  }
  if (p === undefined) {
    ambiguos.push({ pedido, variantes: variantesDe(pedido.codigo) });
    continue;
  }
  vistos.add(p.id);
  // Un código que en el maestro nombra dos máquinas: se carga al que está
  // activo con ese código exacto, pero se dice, porque Importaciones puede
  // estar contando la otra.
  const hermanas = variantesDe(pedido.codigo).filter((x) => x.id !== p.id);
  if (hermanas.length) repetidosAvisados.push({ pedido, p, hermanas });
  if (!p.activo) {
    inactivos.push({ pedido, p });
    continue;
  }
  if (!p.ficha_es_objeto) {
    sinFicha.push({ pedido, p });
    continue;
  }
  const de = stockActualDe(p);
  if (de === pedido.stock) sinCambio.push({ pedido, p, de });
  else cambios.push({ pedido, p, de, a: pedido.stock });
}

const activosSinFila = productos.filter((p) => p.activo && p.sku && !vistos.has(p.id));

// ---- 4. Informar ----------------------------------------------------------
const nombreCorto = (p) => `${p.marca ?? ""} ${p.modelo ?? ""}`.trim() || (p.nombre ?? "").slice(0, 40);
const stockTxt = (v) => (v === null ? "s/d" : String(v));

console.log(`\nArchivo: ${ARCHIVO}`);
console.log(`Hoja: «${hoja}» · cabecera en la fila ${tabla.cabeceraEn + 1} (código = «${tabla.rotulos.codigo}», stock = «${tabla.rotulos.stock}»` +
  `${tabla.col.ubicacion >= 0 ? ", con ubicación" : ""}${tabla.col.descripcion >= 0 ? ", con descripción" : ""})`);
console.log(`Filas con código y cantidad: ${filasExcel.length} · códigos distintos: ${porCodigo.size} · productos activos en el CRM: ${productos.filter((p) => p.activo).length}\n`);

if (pedidos.length > 0 && cambios.length + sinCambio.length + inactivos.length + ambiguos.length === 0) {
  console.error(`⚠ Ninguno de los ${pedidos.length} códigos del Excel existe en el catálogo. Esto no parece el Excel de stock (¿hoja equivocada? ¿códigos de otro sistema?). No se hace nada.`);
  await bd.end();
  process.exit(1);
}

console.log(`── Cambian (${cambios.length}) ──────────────────────────────────────────`);
if (cambios.length === 0) console.log("  (ninguno)");
for (const c of cambios) {
  const ubic = c.pedido.ubicaciones.length > 1 ? `  [${c.pedido.ubicaciones.join(" + ")}]` : "";
  console.log(`  ${c.p.sku.padEnd(12)} ${nombreCorto(c.p).padEnd(28).slice(0, 28)} stock ${stockTxt(c.de).padStart(3)} → ${String(c.a).padStart(3)}${ubic}`);
}

console.log(`\n── Sin cambio (${sinCambio.length}) ──`);
if (sinCambio.length) console.log(`  ${sinCambio.map((s) => `${s.p.sku}=${s.de}`).join("  ")}`);

if (desconocidos.length) {
  console.log(`\n── En el Excel pero NO en el catálogo (${desconocidos.length}) — no se cargan; hay que crear la ficha o corregir el código ──`);
  for (const d of desconocidos) console.log(`  ${d.codigo.padEnd(12)} stock ${String(d.stock).padStart(3)}  fila ${d.filas.join(",")}  ${(d.descripcion ?? "").slice(0, 70)}`);
}
if (ambiguos.length) {
  console.log(`\n── Códigos que nombran DOS equipos (${ambiguos.length}) — no se tocan: Importaciones debe escribir la variante ──`);
  for (const a of ambiguos) {
    console.log(`  ${a.pedido.codigo.padEnd(12)} stock ${String(a.pedido.stock).padStart(3)}  fila ${a.pedido.filas.join(",")}  ${(a.pedido.descripcion ?? "").slice(0, 60)}`);
    for (const v of a.variantes) console.log(`      ¿${v.sku}? ${nombreCorto(v)} (hoy ${stockTxt(stockActualDe(v))})`);
  }
}
if (repetidosAvisados.length) {
  console.log(`\n── OJO: códigos que en el maestro nombran DOS máquinas (${repetidosAvisados.length}) — se carga al activo con ese código; confirmar cuál contó Importaciones ──`);
  for (const r of repetidosAvisados) {
    const otras = r.hermanas.map((h) => `${h.sku} ${nombreCorto(h)}${h.activo ? "" : " [inactivo]"}`).join(", ");
    console.log(`  ${r.pedido.codigo.padEnd(12)} → ${r.p.sku} (${nombreCorto(r.p)}); también existe: ${otras}`);
  }
}
if (conflictos.length) {
  console.log(`\n── Repetidos en el Excel con cantidades distintas (${conflictos.length}) — no se tocan ──`);
  for (const c of conflictos) console.log(`  ${c.codigo.padEnd(12)} filas ${c.filas.join(",")} → ${c.cantidades.join(" / ")}`);
}
if (inactivos.length) {
  console.log(`\n── Existen en el CRM pero están INACTIVOS (${inactivos.length}) — no se tocan ──`);
  for (const i of inactivos) console.log(`  ${i.p.sku.padEnd(12)} ${nombreCorto(i.p)}  (Excel dice ${i.pedido.stock})`);
}
if (sinFicha.length) {
  console.log(`\n── Con ficha que no es un objeto (${sinFicha.length}) — no se tocan, revisar a mano ──`);
  for (const s of sinFicha) console.log(`  ${s.p.sku}`);
}
if (filasInvalidas.length) {
  console.log(`\n── Filas del Excel que no se pudieron leer (${filasInvalidas.length}) ──`);
  for (const f of filasInvalidas) console.log(`  fila ${String(f.fila).padStart(4)}  ${f.motivo}  ${f.detalle}`);
}
if (activosSinSku.length) {
  console.log(`\n── Activos en el CRM SIN código (${activosSinSku.length}) — ningún Excel les va a poder dar stock ──`);
  for (const p of activosSinSku) console.log(`  ${p.id}  ${nombreCorto(p)}  ${(p.nombre ?? "").slice(0, 50)}`);
}
if (activosSinFila.length) {
  console.log(`\n── Activos en el CRM que NO vienen en el Excel (${activosSinFila.length}) — conservan su cifra, preguntar a Importaciones ──`);
  const linea = activosSinFila.map((p) => `${p.sku}(${stockTxt(stockActualDe(p))})`);
  for (let i = 0; i < linea.length; i += 6) console.log(`  ${linea.slice(i, i + 6).join("  ")}`);
}

if (!EJECUTAR) {
  console.log(`\nNada se ha modificado — es solo el plan. Para aplicarlo: agregá --ejecutar.\n`);
  await bd.end();
  process.exit(0);
}

// ---- 5. Aplicar -----------------------------------------------------------
// Todo o nada, y solo la clave del stock más el rastro de la carga. La ficha
// no se reescribe entera: `ficha || {...}` cambia esas claves y deja el resto
// como está, aunque alguien la haya editado hace un segundo.
if (cambios.length === 0) {
  console.log(`\n✓ No había nada que cambiar; el catálogo ya coincide con «${NOMBRE_ARCHIVO}».\n`);
  await bd.end();
  process.exit(0);
}

const rastro = JSON.stringify({ stock_semanal: NOMBRE_ARCHIVO, stock_semanal_at: HOY_LIMA });
try {
  await bd.query("begin");
  for (const c of cambios) {
    const r = await bd.query(
      `update productos
          set ficha = jsonb_set(ficha || jsonb_build_object('stock_referencia', $2::int),
                                '{origen}', coalesce(ficha->'origen', '{}'::jsonb) || $3::jsonb),
              updated_at = now()
        where id = $1 and activo and jsonb_typeof(ficha) = 'object'`,
      [c.p.id, c.a, rastro],
    );
    if (r.rowCount !== 1) throw new Error(`${c.p.sku}: la fila cambió mientras se cargaba (rowCount=${r.rowCount}); se deshace todo`);
  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback").catch(() => {});
  console.error(`\n✗ No se aplicó nada: ${e.message}\n`);
  await bd.end();
  process.exit(1);
}

console.log(`\n✓ ${cambios.length} producto(s) con stock nuevo desde «${NOMBRE_ARCHIVO}» (${HOY_LIMA}).`);
console.log(`  Quedó registrado en ficha.origen.stock_semanal / stock_semanal_at de cada uno.`);
if (desconocidos.length || ambiguos.length || conflictos.length) {
  console.log(`  Pendientes de Importaciones: ${desconocidos.length} código(s) desconocido(s), ${ambiguos.length} ambiguo(s), ${conflictos.length} repetido(s) con cantidades distintas.`);
}
if (activosSinFila.length) console.log(`  ${activosSinFila.length} activo(s) no venían en el Excel y conservan su cifra anterior.`);
console.log();
await bd.end();
