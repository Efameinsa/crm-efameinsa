// ============================================================
// CRM EFAMEINSA · Paso 13 · Auditoría de la carga de fichas
// ============================================================
// Cruza los cuatro archivos que dejó la cadena de fichas (lista, clasificación,
// fichas y sus imágenes ya preparadas) con lo que HOY tiene la base, y deja en
// `scripts/data/fichas-v/auditoria.json` una fila por código del Excel de
// Lesly con lo que falta o hay que confirmar. De ese JSON salen el Excel y el
// Word del reporte (paso 14).
//
// Uso: node --env-file=.env.local scripts/fichas-v-13-auditar.mjs

import { Client } from "pg";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";

/** Cómo se llama HOY el archivo de ese código en V: — Lesly los renombra. */
function archivoDeHoy(rutaExcel, codigo) {
  try {
    const carpeta = dirname(String(rutaExcel).replace(/\\/g, "/"));
    return readdirSync(carpeta)
      .filter((n) => /\.docx?$/i.test(n) && n.toUpperCase().startsWith(codigo.toUpperCase()))
      .join(" · ");
  } catch {
    return "";
  }
}

/** Para un código sin ruta: busca su archivo en todas las carpetas de fichas
 *  conocidas. Sirve para los que Lesly renombró (los coches, por color). */
function buscarEnCarpetasConocidas(carpetas, codigo) {
  const encontrados = [];
  for (const carpeta of carpetas) {
    try {
      for (const n of readdirSync(carpeta)) {
        if (/\.docx?$/i.test(n) && n.toUpperCase().startsWith(codigo.toUpperCase())) encontrados.push(n);
      }
    } catch {
      /* carpeta inaccesible: se ignora */
    }
  }
  return encontrados.join(" · ");
}

const D = "scripts/data/fichas-v";
const lista = JSON.parse(readFileSync(`${D}/lista.json`, "utf-8"));
const { fichas: clasif } = JSON.parse(readFileSync(`${D}/clasificacion.json`, "utf-8"));
const { fichas: listas } = JSON.parse(readFileSync(`${D}/imagenes-listas.json`, "utf-8"));

const porCodigo = (arr) => new Map(arr.map((f) => [f.codigo.toUpperCase(), f]));
const cl = porCodigo(clasif);
const im = porCodigo(listas);

// El universo es el Excel de Lesly: los que tienen ruta a una ficha y los que no.
const universo = [
  ...lista.productos.map((p) => ({ ...p, enExcel: "con ruta" })),
  ...lista.sinFicha.map((p) => ({ ...p, enExcel: "sin ruta" })),
];

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows: productos } = await bd.query(
  `select id, sku, nombre, activo, foto_path, ficha, categoria,
          (select precio from precios_producto pp where pp.producto_id = p.id
             and (pp.vigente_hasta is null or pp.vigente_hasta > current_date)
           order by vigente_desde desc limit 1) as precio
     from productos p where sku is not null`,
);
// Lo que la carga de hoy movió en el catálogo, preguntándoselo a la base.
const { rows: movimientos } = await bd.query(
  `select 'alta' as que, sku, nombre, null::numeric as precio from productos where created_at::date = current_date
   union all
   select 'retiro', sku, nombre, null from productos where not activo and updated_at::date = current_date
   union all
   select 'precio', p.sku, p.nombre, x.precio
     from precios_producto x join productos p on p.id = x.producto_id
    where x.vigente_desde = current_date and x.vigente_hasta is null
   order by 1, 2`,
);
await bd.end();
const bdPorSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));

// --- la misma foto de equipo en varias fichas ---------------------------
const porHuella = new Map();
for (const f of clasif) {
  const prod = (f.imagenes ?? []).find((i) => i.rol === "producto");
  if (!prod) continue;
  const r = prod.recorte ?? {};
  const huella = `${prod.hash}|${[r.l, r.t, r.r, r.b].map((v) => (v ?? 0).toFixed(3)).join(",")}`;
  if (!porHuella.has(huella)) porHuella.set(huella, []);
  porHuella.get(huella).push(f.codigo.toUpperCase());
}
const compartidas = [...porHuella.values()].filter((g) => g.length > 1);
const compartidaDe = new Map();
for (const g of compartidas) for (const c of g) compartidaDe.set(c, g.filter((x) => x !== c));

// --- una fila por código -------------------------------------------------
/** Todas las carpetas de V: donde viven fichas, para buscar renombrados. */
const carpetasDeFichas = [
  ...new Set(
    lista.productos
      .map((p) => p.archivo ?? p.rutaExcel)
      .filter(Boolean)
      .map((r) => dirname(String(r).replace(/\\/g, "/"))),
  ),
];

const MIN_BLOQUES = 20;   // por debajo, la descripción es mucho más corta que la media (50)
const MIN_PPP_ORIG = 150; // por debajo hubo que ampliarla con máscara de enfoque

const filas = universo.map((p) => {
  const codigo = p.codigo.toUpperCase();
  const f = cl.get(codigo);
  const prep = im.get(codigo);
  const enBd = bdPorSku.get(codigo);
  const pendientes = [];

  const estado = f
    ? "Cargada con su ficha"
    : p.enExcel === "con ruta"
      ? "NO se pudo leer el Word"
      : "Sin ficha en V:";

  const imgs = prep?.imagenes ?? [];
  const rol = (r) => imgs.find((i) => i.rol === r);
  const equipo = rol("producto");
  const logo = rol("logo");
  const panel = rol("panel");
  const pppOriginal = (r) => {
    const i = (f?.imagenes ?? []).find((x) => x.rol === r);
    if (!i?.px || !i.anchoMm) return null;
    return Math.round(i.px.ancho / (i.anchoMm / 25.4));
  };
  const pppOrigEquipo = pppOriginal("producto");

  if (f) {
    if (!equipo) pendientes.push("La ficha no trae foto del equipo");
    if (!logo) pendientes.push("La ficha no trae el logo de la marca");
    if (!panel) pendientes.push("No trae vista de complemento (panel o botonera)");
    if (equipo && pppOrigEquipo && pppOrigEquipo < MIN_PPP_ORIG)
      pendientes.push(`Foto del equipo de baja resolución (${pppOrigEquipo} ppp al tamaño impreso; se amplió a ${equipo.ppp})`);
    if (equipo && equipo.ppp < 200)
      pendientes.push(`La foto del equipo queda por debajo de la norma aun ampliada (${equipo.ppp} ppp)`);
    const otras = compartidaDe.get(codigo);
    if (otras?.length) pendientes.push(`Usa la misma foto de equipo que ${otras.join(", ")}`);
    const descartadas = (f.imagenes ?? []).filter((i) => i.rol === "descartar").length;
    if (descartadas) pendientes.push(`Trae ${descartadas} imagen(es) de más: en la cotización solo entran el logo, el equipo y una vista de complemento`);
    const nb = (f.bloques ?? []).length;
    if (nb < MIN_BLOQUES) pendientes.push(`Descripción muy corta (${nb} líneas; la media de las fichas es 50)`);
    const faltanCab = ["capacidad", "calentamiento", "panel"].filter((k) => !f.cabecera?.[k]);
    if (faltanCab.length) pendientes.push(`La tabla de cabecera no dice: ${faltanCab.join(", ")}`);
    const marcaExcel = (p.marca ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    const marcaFicha = (f.cabecera?.marca ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    if (marcaExcel && marcaFicha && !marcaFicha.startsWith(marcaExcel) && !marcaExcel.startsWith(marcaFicha))
      pendientes.push(`El maestro dice marca ${p.marca} y la ficha dice ${f.cabecera.marca}`);
  } else if (p.enExcel === "con ruta") {
    const hoy = archivoDeHoy(p.rutaExcel, codigo);
    pendientes.push(
      `El archivo que indica el maestro ya no existe con ese nombre` +
        (hoy ? `; en la carpeta hay hoy: ${hoy}` : ""),
    );
  } else {
    // El maestro los trae en rojo, en la hoja «NO ENCONTRADOS», con la nota
    // que escribió la propia Lesly.
    const nota = String(p.quePasa ?? "").trim();
    const esRuta = /^[A-Z]:[\\/]/i.test(nota);
    pendientes.push(
      esRuta
        ? `El maestro lo marca en rojo: la ruta que indica no existe (${nota})`
        : `El maestro lo marca en rojo: «${nota || "no hay ficha para este código"}»`,
    );
    // La v2 dice, cuando puede, con qué otro código está la misma máquina.
    if (p.pista) pendientes.push(`El maestro apunta: ${p.pista}`);
    const hoy = buscarEnCarpetasConocidas(carpetasDeFichas, codigo);
    if (hoy) pendientes.push(`En V: hay archivos que empiezan con ese código: ${hoy}`);
  }

  if (p.precio == null) pendientes.push("El maestro no le pone precio");

  return {
    codigo,
    equipo: p.equipo ?? enBd?.nombre ?? "",
    marca: p.marca ?? "",
    marcaFicha: f?.cabecera?.marca ?? "",
    modelo: f?.cabecera?.modelo ?? "",
    estado,
    archivo: (p.archivo ?? p.rutaExcel ?? "").split(/[\\/]/).pop() ?? "",
    ruta: p.rutaExcel ?? "",
    fotoEquipo: equipo ? `sí · ${equipo.px.ancho}×${equipo.px.alto} px · ${equipo.ppp} ppp` : "NO",
    pppOriginal: pppOrigEquipo ?? "",
    logo: logo ? `sí · ${logo.ppp} ppp` : "NO",
    panel: panel ? `sí · ${panel.ppp} ppp` : "no",
    compartidaCon: (compartidaDe.get(codigo) ?? []).join(", "),
    pistaMaestro: p.pista ?? null,
    lineas: (f?.bloques ?? []).length,
    precioMaestro: p.precio ?? null,
    enSistema: enBd ? (enBd.activo ? "activo" : "retirado") : "no está",
    tieneFotoEnSistema: enBd ? Boolean(enBd.foto_path) : false,
    descripcionDelWord: enBd?.ficha?.origen_descripcion === "ficha word de Lesly",
    pendientes,
  };
});

// Productos del sistema que el maestro de Lesly ya no lista.
const codigosExcel = new Set(universo.map((p) => p.codigo.toUpperCase()));
const retirados = productos
  .filter((p) => !codigosExcel.has(p.sku.toUpperCase()))
  .map((p) => ({ sku: p.sku, nombre: p.nombre, estado: p.activo ? "TODAVÍA ACTIVO" : "retirado", precio: p.precio }));

const cuenta = (fn) => filas.filter(fn).length;
const tiene = (t) => (f) => f.pendientes.some((x) => x.startsWith(t));

const resumen = {
  generado: new Date().toISOString(),
  totalExcel: filas.length,
  cargadas: cuenta((f) => f.estado === "Cargada con su ficha"),
  noLeidas: cuenta((f) => f.estado === "NO se pudo leer el Word"),
  sinFicha: cuenta((f) => f.estado === "Sin ficha en V:"),
  sinFotoEquipo: cuenta((f) => f.fotoEquipo === "NO" && f.estado === "Cargada con su ficha"),
  sinLogo: cuenta((f) => f.logo === "NO" && f.estado === "Cargada con su ficha"),
  sinPanel: cuenta((f) => f.panel === "no" && f.estado === "Cargada con su ficha"),
  bajaResolucion: cuenta(tiene("Foto del equipo de baja")),
  bajoNorma: cuenta((f) => f.pendientes.some((x) => x.includes("por debajo de la norma"))),
  fotoCompartida: cuenta((f) => f.compartidaCon),
  gruposCompartidos: compartidas.length,
  descripcionCorta: cuenta(tiene("Descripción muy corta")),
  cabeceraIncompleta: cuenta(tiene("La tabla de cabecera")),
  marcaDistinta: cuenta(tiene("El maestro dice marca")),
  descartadas: cuenta((f) => f.pendientes.some((x) => x.includes("imagen(es) de más"))),
  sinPrecio: cuenta((f) => f.precioMaestro == null),
  conAlgoQueCorregir: cuenta((f) => f.pendientes.length),
  retirados: retirados.length,
  retiradosTodaviaActivos: retirados.filter((r) => r.estado === "TODAVÍA ACTIVO").length,
};

resumen.altasHoy = movimientos.filter((m) => m.que === "alta").length;
resumen.retirosHoy = movimientos.filter((m) => m.que === "retiro").length;
resumen.preciosHoy = movimientos.filter((m) => m.que === "precio").length;

writeFileSync(
  `${D}/auditoria.json`,
  JSON.stringify({ resumen, filas, compartidas, retirados, movimientos }, null, 1),
);
console.log(resumen);
const lista2 = (fn, etiqueta) => console.log(`\n${etiqueta}: ` + filas.filter(fn).map((f) => f.codigo).join(", "));
lista2((f) => f.logo === "NO", "Sin logo");
console.log("\nBaja resolución: " + filas.filter(tiene("Foto del equipo de baja")).map((f) => `${f.codigo}(${f.pppOriginal})`).join(", "));
console.log("\nGrupos con la misma foto:");
for (const g of compartidas) console.log("   " + g.join(" = "));
console.log("\nMarca distinta: " + filas.filter(tiene("El maestro dice marca")).map((f) => `${f.codigo} ${f.marca}→${f.marcaFicha}`).join(" · "));
lista2((f) => f.pendientes.some((x) => x.includes("imagen(es) de más")), "Con imágenes de más");
lista2(tiene("Descripción muy corta"), "Descripción corta");
console.log("\nRetirados todavía activos: " + (retirados.filter((r) => r.estado === "TODAVÍA ACTIVO").map((r) => r.sku).join(", ") || "ninguno"));
