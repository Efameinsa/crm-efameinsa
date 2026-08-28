// Cotejo del maestro contra el catálogo del CRM, código por código.
// Uso: node --env-file=.env.local scripts/_auditar-catalogo.mjs
import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import XLSX from "xlsx";

const MAESTRO = "V:/Fichas tecnicas por codigo v2.xlsx";
const libro = XLSX.readFile(MAESTRO);
const filas = XLSX.utils.sheet_to_json(libro.Sheets["ENCONTRADOS"], { header: 1, defval: "" });
const cab = filas[0].map((t) => String(t).toUpperCase().trim());
const col = (n) => cab.indexOf(n);
const encontrados = filas.slice(1).filter((f) => String(f[col("CODIGO")]).trim());
const sinFicha = XLSX.utils
  .sheet_to_json(libro.Sheets["NO ENCONTRADOS"], { header: 1, defval: "" })
  .slice(1)
  .map((f) => String(f[0]).trim())
  .filter(Boolean);

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows: productos } = await bd.query(
  `select p.sku, p.nombre, p.activo, p.foto_path, p.ficha,
          (select precio from precios_producto x where x.producto_id = p.id and x.vigente_hasta is null) precio
     from productos p where p.sku is not null`,
);
await bd.end();
const enCrm = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));

const fallos = [];
const ok = [];
for (const f of encontrados) {
  const sku = String(f[col("CODIGO")]).trim().toUpperCase();
  const precioMaestro = Number(String(f[col("PRECIO")]).replace(/[^\d.]/g, "")) || null;
  const p = enCrm.get(sku);
  if (!p) { fallos.push(`${sku}: está en el maestro con ficha y NO existe en el CRM`); continue; }
  if (!p.activo) fallos.push(`${sku}: tiene ficha en el maestro pero está inactivo en el CRM`);
  const bloques = Array.isArray(p.ficha?.bloques) ? p.ficha.bloques.length : 0;
  if (bloques === 0) fallos.push(`${sku}: sin descripción cargada (ficha.bloques vacío)`);
  if (!p.foto_path) fallos.push(`${sku}: sin foto`);
  else if (!existsSync("public" + p.foto_path)) fallos.push(`${sku}: la foto ${p.foto_path} no está en el repo`);
  if (p.ficha?.origen_descripcion !== "ficha word de Lesly") fallos.push(`${sku}: la descripción no viene del Word`);
  if (precioMaestro && Number(p.precio) !== precioMaestro)
    fallos.push(`${sku}: precio CRM ${p.precio} ≠ maestro ${precioMaestro}`);
  if (!fallos.some((x) => x.startsWith(sku + ":"))) ok.push(sku);
}
for (const sku of sinFicha) {
  const p = enCrm.get(sku.toUpperCase());
  if (p?.activo) fallos.push(`${sku}: no tiene ficha en el maestro y está ACTIVO en el CRM`);
}
const sobran = productos.filter(
  (p) => p.activo && !encontrados.some((f) => String(f[col("CODIGO")]).trim().toUpperCase() === p.sku.toUpperCase()),
);
for (const p of sobran) fallos.push(`${p.sku}: activo en el CRM y no figura con ficha en el maestro`);

console.log(`Maestro: ${encontrados.length} con ficha · ${sinFicha.length} sin ficha`);
console.log(`CRM: ${productos.filter((p) => p.activo).length} activos · ${productos.filter((p) => !p.activo).length} retirados`);
console.log(`Cotejados sin una sola diferencia: ${ok.length}`);
if (fallos.length === 0) console.log("\n✓ El catálogo del CRM es exactamente la hoja ENCONTRADOS del maestro.");
else { console.log(`\n✗ ${fallos.length} diferencias:`); for (const f of fallos) console.log("   - " + f); }
process.exitCode = fallos.length ? 1 : 0;
