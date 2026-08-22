// Carga al CRM los productos del maestro de Lesly que ya están confirmados:
// foto, ficha técnica estructurada y precio de lista.
//
// Fuente: scripts/data/productos-listos-2026-08-22.json (lo arma el pipeline
// extraer-fotos-productos → extraer-ficha-tecnica) más el VALOR DE VENTA y
// el stock del propio Excel maestro.
//
// Decisiones que conviene tener presentes:
//
//   · El SKU es el código del maestro. Es la llave para volver a correr esto
//     sin duplicar: si el SKU ya existe se actualiza, no se inserta otro.
//   · Los códigos que el maestro usa para DOS equipos distintos (LAV180 es la
//     RX180 rígida y la FX180 flotante) se cargan con sufijo -V1/-V2, igual
//     que sus fotos, y quedan marcados en la ficha. Sin eso, uno pisaría al
//     otro.
//   · El precio entra como UN solo tier: 'base' para industrial y 'optimo'
//     para semi-industrial. El maestro trae una sola columna de precio; los
//     tres niveles de la semi-industrial (óptimo/medio/deseado) los define
//     gerencia, no este script (docs/03 R5). Se marca vigente_desde hoy.
//   · NO se tocan los 7 productos que ya estaban cargados (los 3 de demo y
//     los 4 LG de B4): esto solo agrega o actualiza por SKU.
//
// Uso: node --env-file=.env.local scripts/cargar-productos-catalogo.mjs [--aplicar]

import { Client } from "pg";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const ENTRADA = "scripts/data/productos-listos-2026-08-22.json";
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Correr con --env-file=.env.local");
  process.exit(1);
}

const productos = JSON.parse(readFileSync(ENTRADA, "utf-8"));

// Precio y stock salen del maestro; se indexan por código respetando el orden
// de aparición, que es el mismo con el que se numeraron las variantes -v1/-v2.
const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["Hoja1"], { header: 1, defval: "" })
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim());
const maestroPorCodigo = new Map();
for (const f of filas) {
  const c = String(f[1]).trim().toUpperCase();
  maestroPorCodigo.set(c, [...(maestroPorCodigo.get(c) ?? []), { stock: Number(f[3]) || 0, precio: Number(f[6]) || 0 }]);
}

/** Categoría a partir de lo que dice la descripción del equipo. */
function categoriaDe(equipo) {
  const t = equipo.toUpperCase();
  if (/LAVADORA\s*[-–/]?\s*SECADORA|TORRE/.test(t)) return "lavadora-secadora";
  if (/SECADORA/.test(t)) return "secadora";
  if (/LAVADORA/.test(t)) return "lavadora";
  if (/RODILLO|CALANDRIA|PLANCHADOR/.test(t)) return "planchador";
  if (/PRENSA/.test(t)) return "prensa";
  return null;
}

/** Semi-industrial vs industrial: el maestro lo dice en la descripción. */
function segmentoDe(equipo) {
  return /SEMI\s*INDUSTRIAL/i.test(equipo) ? "semi_industrial" : "industrial";
}

/** Nombre comercial corto: lo que va antes de la primera coma o del "MOD". */
function nombreDe(equipo) {
  return equipo.split(/,|\bMOD\b/i)[0].replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Modelo tal como lo declara el maestro. */
function modeloDe(equipo, codigo) {
  const m = equipo.match(/MOD\.?\s*:?\s*([A-Z0-9][^,]*)/i);
  if (!m) return codigo;
  return m[1].trim().split(/\s{2,}/)[0].slice(0, 60);
}

const cliente = new Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

const usado = {};
let insertados = 0, actualizados = 0, conPrecio = 0;
const sinPrecio = [];

try {
  await cliente.query("begin");

  for (const p of productos) {
    const veces = (maestroPorCodigo.get(p.codigo) ?? []).length;
    const n = (usado[p.codigo] = (usado[p.codigo] ?? 0) + 1);
    const sku = veces > 1 ? `${p.codigo}-V${n}` : p.codigo;
    const datosMaestro = (maestroPorCodigo.get(p.codigo) ?? [])[n - 1] ?? {};

    const ficha = {
      ...(p.ficha ?? { caracteristicas: [], dimensiones: [], medidas: [] }),
      panel: p.panel ?? null,
      controles: p.controles ?? null,
      calentamiento: p.calentamiento ?? null,
      stock_referencia: datosMaestro.stock ?? null,
      // Rastro de dónde salió cada cosa, para poder auditarlo después.
      origen: {
        maestro: "CODIFICACION DE EQUIPOS PARA MARKETING.xlsx",
        ficha_tecnica: p.especificacion ?? null,
        catalogos: p.catalogos ?? [],
        confianza: p.confianza ?? null,
        foto_prestada_de: p.fotoPrestadaDe ?? null,
        codigo_duplicado_en_maestro: p.codigoDuplicado ?? false,
      },
    };

    const segmento = segmentoDe(p.equipo);
    const { rows } = await cliente.query(
      `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       on conflict (sku) do update set
         marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
         categoria = excluded.categoria, segmento = excluded.segmento, capacidad = excluded.capacidad,
         foto_path = excluded.foto_path, ficha = excluded.ficha, activo = true
       returning id, (xmax = 0) as es_nuevo`,
      [
        sku,
        p.marca,
        modeloDe(p.equipo, p.codigo),
        nombreDe(p.equipo),
        categoriaDe(p.equipo),
        segmento,
        p.capacidad ?? null,
        "/" + p.foto,
        ficha,
      ],
    );
    const { id, es_nuevo } = rows[0];
    if (es_nuevo) insertados++;
    else actualizados++;

    // Precio de lista. Un solo tier, y solo si el maestro trae un valor.
    if (datosMaestro.precio > 0) {
      const tier = segmento === "industrial" ? "base" : "optimo";
      await cliente.query(
        `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
         values ($1,$2,$3,'USD',current_date)
         on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio`,
        [id, tier, datosMaestro.precio],
      );
      conPrecio++;
    } else sinPrecio.push(sku);
  }

  if (APLICAR) {
    await cliente.query("commit");
  } else {
    await cliente.query("rollback");
  }
} catch (e) {
  await cliente.query("rollback");
  console.error("Falló, no se escribió nada:", e.message);
  process.exit(1);
}

const { rows: totales } = await cliente.query(
  "select count(*)::int n, count(foto_path)::int con_foto from productos where activo",
);
await cliente.end();

console.log(`Productos del maestro procesados : ${productos.length}`);
console.log(`  nuevos                         : ${insertados}`);
console.log(`  actualizados (ya existía el SKU): ${actualizados}`);
console.log(`  con precio de lista            : ${conPrecio}`);
if (sinPrecio.length) console.log(`  sin precio en el maestro       : ${sinPrecio.join(", ")}`);
console.log(`\nEn la base quedarían ${totales[0].n} productos activos (${totales[0].con_foto} con foto).`);
console.log(APLICAR ? "\nAplicado." : "\n(Simulación: se hizo rollback, no se escribió nada. Correr con --aplicar.)");
