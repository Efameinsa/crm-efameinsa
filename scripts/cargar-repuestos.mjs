/**
 * LOS REPUESTOS EN EL CATÁLOGO (25-09).
 *
 * Santos, 25-09: «han actualizado archivos, creo un Excel de repuestos,
 * revísalo para subirlo al sistema». Fuente: P:\REPUESTOS.xlsx — código IM…
 * del ERP, descripción, modelo (el número de parte del fabricante), u/m,
 * stock, costo, marca y precio de venta.
 *
 * Se carga el PRECIO DE VENTA (la última columna) como precio base en USD,
 * neto como el resto del catálogo: el PDF suma el IGV. El costo y el stock NO
 * entran: el costo no lo debe ver el comercial y el stock cambia cada día (lo
 * lleva el ERP). Sin precio de venta, la fila no se carga y se informa.
 *
 * Solo AGREGA productos nuevos (segmento y categoría «repuesto»). No toca los
 * que ya existen: el catálogo lo gestiona Lesly.
 *
 * Uso: node --env-file=.env.local scripts/cargar-repuestos.mjs          (prueba)
 *      APLICAR=1 node --env-file=.env.local scripts/cargar-repuestos.mjs
 */
import XLSX from "xlsx";
import { Client } from "pg";

const EXCEL = "P:/REPUESTOS.xlsx";
const limpio = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const tabla = XLSX.utils.sheet_to_json(XLSX.readFile(EXCEL).Sheets["REPUESTOS"], { header: 1, defval: null });
// Las columnas se ubican por su encabezado: el 25-09 por la tarde el Excel
// volvió sin la columna de costo y todo lo que venía después se corrió.
const encabezado = tabla[0].map((c) => limpio(c).toLowerCase());
const col = (re) => encabezado.findIndex((c) => re.test(c));
const C = { sku: col(/^c[oó]digo/), nombre: col(/^descrip/), modelo: col(/^modelo/), um: col(/^u\/m/), costo: col(/^costo/), marca: col(/^marca/), precio: col(/precio/) };
for (const k of ["sku", "nombre", "marca", "precio"]) if (C[k] < 0) throw new Error(`Falta la columna «${k}» en ${EXCEL}`);
const filas = tabla
  .slice(1)
  .filter((r) => limpio(r[C.sku]))
  .map((r) => ({
    sku: limpio(r[C.sku]).toUpperCase(),
    nombre: limpio(r[C.nombre]),
    modelo: C.modelo >= 0 ? limpio(r[C.modelo]) : "",
    um: C.um >= 0 ? limpio(r[C.um]) : "",
    costo: C.costo >= 0 ? Number(r[C.costo]) || null : null,
    marca: limpio(r[C.marca]).replace(/´/g, "'").replace(/^SAIL STAR$/, "SAILSTAR").replace(/WHRILPOOL/, "WHIRLPOOL"),
    precio: Number(String(r[C.precio] ?? "").replace(/[^0-9.]/g, "")) || null,
  }));

const repetidos = filas.map((f) => f.sku).filter((s, i, a) => a.indexOf(s) !== i);

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: existentes } = await pg.query("select sku from productos where sku = any($1)", [filas.map((f) => f.sku)]);
const yaEstan = new Set(existentes.map((r) => r.sku));

for (const f of filas) {
  const aviso = [
    !f.precio && "SIN PRECIO DE VENTA: no se carga",
    f.precio && f.costo && f.precio < f.costo && `OJO: venta ${f.precio} menor que el costo ${f.costo}`,
    yaEstan.has(f.sku) && "YA EXISTE: no se toca",
    repetidos.includes(f.sku) && "CÓDIGO REPETIDO",
  ].filter(Boolean);
  console.log(`${f.sku.padEnd(13)} ${f.marca.slice(0, 14).padEnd(14)} ${f.modelo.slice(0, 16).padEnd(16)} US$ ${String(f.precio ?? "—").padStart(5)}  ${f.nombre.slice(0, 60)}${aviso.length ? "  ← " + aviso.join(" · ") : ""}`);
}
const cargables = filas.filter((f) => f.precio && !yaEstan.has(f.sku) && !repetidos.includes(f.sku));
console.log(`\nTotal: ${filas.length} filas, ${cargables.length} por cargar, ${filas.filter((f) => !f.precio).length} sin precio, ${yaEstan.size} ya existían.`);

if (process.env.APLICAR === "1") {
  await pg.query("begin");
  for (const f of cargables) {
    const ficha = {
      bloques: [],
      descripcion_maestro: f.nombre,
      encabezado_extra: [
        ...(f.modelo ? [{ rotulo: "N.º de parte", valor: f.modelo }] : []),
        ...(f.um ? [{ rotulo: "Unidad", valor: f.um === "PZA" ? "Pieza" : "Unidad" }] : []),
      ],
      origen: { cargado: "2026-09-25", excel: "REPUESTOS.xlsx" },
    };
    const { rows } = await pg.query(
      `insert into productos (sku, marca, modelo, nombre, categoria, segmento, ficha, activo)
       values ($1, $2, $3, $4, 'repuesto', 'repuesto', $5, true) returning id`,
      [f.sku, f.marca, f.modelo, f.nombre, ficha],
    );
    await pg.query(`insert into precios_producto (producto_id, tier, precio, moneda) values ($1, 'base', $2, 'USD')`, [rows[0].id, f.precio]);
  }
  await pg.query("commit");
  console.log(`✔ cargados ${cargables.length} repuestos`);
}
await pg.end();
