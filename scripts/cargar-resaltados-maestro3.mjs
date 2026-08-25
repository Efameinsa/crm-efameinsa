// ============================================================
// CRM EFAMEINSA · Lo RESALTADO del maestro3 (25-08, 16:53)
// ============================================================
// Orden: «subir el último excel que dio Lesly y solo considerar lo que está
// resaltado con resaltador» — V:\LESLY\CODIFICACION DE EQUIPOS3.xlsx.
//
// El resaltador es el relleno amarillo (FFFF00). Se verificó ANTES de tocar
// nada que el diff completo entre EQUIPOS2 y EQUIPOS3 coincide exactamente
// con las filas amarillas — la regla «solo lo resaltado» no deja nada fuera:
//
//   · 11 EQUIPOS NUEVOS con precio, todos con su Word verificado a mano
//     (UC100, GP100, Sailstar GDZ/GZZ, las 3 secadoras EFAMEIN, la calandria
//     FCU500, el rodillo GMP y las 2 mesas EFAMEIN).
//   · LAV1801 sube de 12.250 a 14.900 (la única cotización vieja a 12.250 es
//     histórica e inmutable, no se toca).
//   · PRPE01 (prensa PCV) gana su precio: 2.200 — deja de pedir aprobación.
//   · LAV180 corrige capacidad: 18 → 18-20 kg (variante RX180 = LAV180-V1).
//   · CAFCU20 se da de baja: Lesly lo reemplazó por CALFCU500 (el «FCU
//     2100/50» era errata del FCU 2080/500). Nunca se cotizó.
//
// Los demás amarillos (MEFENI1, calderines, prensas SIDI) ya estaban en el
// sistema con esos mismos datos — el amarillo ahí solo marca el lote nuevo.
//
// Uso: node --env-file=.env.local scripts/cargar-resaltados-maestro3.mjs [--aplicar]

import { Client } from "pg";
import XLSX from "xlsx";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const APLICAR = process.argv.includes("--aplicar");
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS3.xlsx";
const CONV = "scripts/data/fichas-convertidas";
const DESTINO_FOTOS = "public/productos";
const PAPELERIA_BYTES = 96654;

const NUEVOS = [
  { sku: "LAVUC100", marca: "UNIMAC", modelo: "UC100", nombre: "LAVADORA INDUSTRIAL RÍGIDA", categoria: "lavadora", segmento: "industrial", capacidad: "45 kg", calentamiento: null, panel: "M 9", precio: 29500,
    ficha: "V:/LESLY/ALLIANCE ok/ESPECIFICACIONES TECNICAS/LAVUC100-LAVADORA UCT100-M9-INOX-200G-220V.docx",
    // La imagen MÁS GRANDE del Word es un pantallazo de unimac.com; la foto
    // real del equipo es la image1 (revisadas ambas a ojo el 25-08).
    fotoArchivo: "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/724a9c4c-38bb-489f-8cd7-4ba5af128d0c/scratchpad/uc100-img1.jpg" },
  { sku: "LAVGP100", marca: "SAILSTAR", modelo: "GP100", nombre: "LAVADORA CENTRÍFUGA INDUSTRIAL FLOTANTE", categoria: "lavadora", segmento: "industrial", capacidad: "100 kg", calentamiento: "VAPOR", panel: "PROGRAMADOR TÁCTIL", precio: 72500,
    ficha: `${CONV}/LAVGP100-Lavadora GP100.docx`,
    // La única imagen del Word es un PANTALLAZO DE ESCRITORIO completo
    // (pestañas del navegador incluidas) — visto a ojo el 25-08. La foto sale
    // recortada del catálogo de la familia GP (chasis idéntico GP50-GP125).
    fotoArchivo: "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/724a9c4c-38bb-489f-8cd7-4ba5af128d0c/scratchpad/gp100-crop-1.png",
    nota: "Foto recortada de V:\\LESLY\\SAILSTAR OK\\CATALAGO\\LAVADORA SAILSTAR GP 50 -70.pdf (el equipo de la foto es el GP50, mismo chasis de la familia). El Word solo trae un pantallazo de escritorio — pedir foto real del GP100." },
  { sku: "SECGDZ20", marca: "SAILSTAR", modelo: "GDZ-20E", nombre: "SECADORA INDUSTRIAL ELÉCTRICA", categoria: "secadora", segmento: "industrial", capacidad: "20 kg", calentamiento: "ELÉCTRICO", panel: null, precio: 7999,
    ficha: "V:/LESLY/SAILSTAR OK/ESPECIFICACIONES TECNICAS/SECGDZ20-GDZ-20E  Secadora Industrial Electrica 20 Kg..docx" },
  { sku: "SECGZZ50", marca: "SAILSTAR", modelo: "GZZ-50II", nombre: "SECADORA INDUSTRIAL A VAPOR", categoria: "secadora", segmento: "industrial", capacidad: "50 kg", calentamiento: "VAPOR", panel: null, precio: 13500,
    ficha: "V:/LESLY/SAILSTAR OK/ESPECIFICACIONES TECNICAS/SECGZZ50-GZZ-50DII Secadora Industrial a Vapor  50 Kg. - Panel de Acero inox.docx" },
  { sku: "SECEF60", marca: "EFAMEIN", modelo: "EFAS 60", nombre: "SECADORA INDUSTRIAL A VAPOR", categoria: "secadora", segmento: "industrial", capacidad: "60 kg", calentamiento: "VAPOR", panel: null, precio: 16999,
    ficha: `${CONV}/SECEF60-Secadora vapor EFAS60.docx` },
  { sku: "SECEFG125", marca: "EFAMEIN", modelo: "EFAS 125", nombre: "SECADORA INDUSTRIAL A GAS", categoria: "secadora", segmento: "industrial", capacidad: "125 kg", calentamiento: "GAS", panel: null, precio: 37500,
    ficha: `${CONV}/SECEFG125-Secadora gas EFAS125.docx` },
  { sku: "SECEFV125", marca: "EFAMEIN", modelo: "EFAS 125", nombre: "SECADORA INDUSTRIAL A VAPOR", categoria: "secadora", segmento: "industrial", capacidad: "125 kg", calentamiento: "VAPOR", panel: null, precio: 39500,
    ficha: `${CONV}/SECEFV125-Secadora vapor EFAS125.docx` },
  { sku: "CALFCU500", marca: "UNIMAC", modelo: "FCU 2080/500", nombre: "CALANDRIA A GAS NATURAL", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: "GAS NATURAL", panel: "UNILINC TOUCH", precio: 39900,
    ficha: "V:/LESLY/ALLIANCE ok/ESPECIFICACIONES TECNICAS/CALFCU500-CALANDRIA FCU2080-500-UNILINC TOUCH - GAS 220V 3PH.docx",
    // Las imágenes del Word: un pantallazo de navegador y dos EMF vectoriales
    // inservibles. La foto sale recortada del BROCHURE FCU500.pdf.
    fotoArchivo: "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/724a9c4c-38bb-489f-8cd7-4ba5af128d0c/scratchpad/fcu500-crop-1.png",
    nota: "Reemplaza al CAFCU20 («FCU 2100/50», errata): mismo equipo, ahora con código, ficha y precio del maestro3. Foto recortada del BROCHURE FCU500.pdf — el Word solo trae pantallazos." },
  { sku: "CALG1425", marca: "GMP", modelo: "G14.25", nombre: "RODILLO DE PLANCHADO INDUSTRIAL A GAS", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: "GAS", panel: null, precio: 15500,
    ficha: `${CONV}/CALG1425-Rodillo G14.25.docx` },
  { sku: "MEVA2", marca: "EFAMEIN", modelo: "EFALMV2000", nombre: "MESA VAPORIZADORA SIN CALDERO", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: null, panel: null, precio: 8500,
    ficha: `${CONV}/MEVA2-Mesa Vaporizadora EFALMV2000.docx` },
  { sku: "DESEFMD05", marca: "EFAMEIN", modelo: "EFAMD", nombre: "MESA DESMANCHADORA", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: null, panel: null, precio: 4350,
    ficha: `${CONV}/DESEFMD05-Mesa desmanchadora EFMD.docx` },
];

// ---- extracción de ficha (mismo pipeline que el cargador del maestro2) ----
function textoConParrafos(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64e6, encoding: "latin1" });
  return Buffer.from(xml, "latin1").toString("utf-8")
    .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]*>/g, "")
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
}
const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b|^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];
function fichaDe(docx) {
  const lineas = textoConParrafos(docx);
  const bloques = { caracteristicas: [], dimensiones: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) { actual = sec.clave; continue; }
    if (!actual) continue;
    if (linea.length < 6 || linea.length > 320) continue;
    if (/^item\b/i.test(linea)) continue;
    if (/^(marca|modelo|capacidad|calentamiento|controles|potencia|autom[aá]tico)\b/i.test(linea) && linea !== linea.toUpperCase() && linea.length <= 30) continue;
    bloques[actual].push(linea);
  }
  const cabecera = lineas.slice(0, 14).join(" | ");
  const controles = cabecera.match(/(\d{3}\s*V?\s*\/?\s*60\s*Hz?\s*\/?\s*(?:[\d-]+\s*PH|TRIF[AÁ]SICO|1N)?)/i);
  return {
    caracteristicas: [...new Set(bloques.caracteristicas)],
    dimensiones: [...new Set(bloques.dimensiones)],
    medidas: [...new Set(bloques.medidas)],
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
  };
}
function imagenesDe(docx) {
  const lista = execFileSync("unzip", ["-Z1", docx], { encoding: "utf-8" }).split("\n");
  const out = [];
  for (const l of lista) {
    const interno = l.trim();
    if (!/^word\/media\/.*\.(png|jpe?g)$/i.test(interno)) continue;
    const buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6 });
    out.push({ interno, buf, hash: createHash("sha1").update(buf).digest("hex") });
  }
  return out;
}

// ---- descripciones y stock del maestro3 para los códigos tocados ---------
const limpiar = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const wb = XLSX.readFile(EXCEL);
const filas = XLSX.utils.sheet_to_json(wb.Sheets["EQUIPOS CODIFICADOS "], { header: 1, defval: null });
const filaDe = new Map();
for (const f of filas.slice(3)) {
  const c = limpiar(f[1]);
  if (!c) continue;
  if (!filaDe.has(c)) filaDe.set(c, []);
  filaDe.get(c).push({ equipo: limpiar(f[2]), stock: typeof f[3] === "number" ? f[3] : null, ubicacion: limpiar(f[5]).toUpperCase() || null, precio: typeof f[6] === "number" ? f[6] : null });
}

// membrete compartido en el lote
const repeticiones = new Map();
const imagenesPorSku = new Map();
for (const n of NUEVOS) {
  if (!existsSync(n.ficha)) continue;
  const imgs = imagenesDe(n.ficha);
  imagenesPorSku.set(n.sku, imgs);
  for (const h of new Set(imgs.map((i) => i.hash))) repeticiones.set(h, (repeticiones.get(h) ?? 0) + 1);
}
const mejorFoto = (sku) =>
  (imagenesPorSku.get(sku) ?? [])
    .filter((i) => (repeticiones.get(i.hash) ?? 0) < 6 && i.buf.length >= 3000 && i.buf.length !== PAPELERIA_BYTES)
    .sort((a, b) => b.buf.length - a.buf.length)[0] ?? null;

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

async function ponerPrecio(productoId, segmento, precio) {
  const tier = segmento === "semi_industrial" ? "optimo" : "base";
  await bd.query(`update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null`, [productoId]);
  await bd.query(
    `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
     values ($1, $2, $3, 'USD', current_date)
     on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
    [productoId, tier, precio],
  );
}

// ---- 1. Los 11 nuevos ----------------------------------------------------
for (const n of NUEVOS) {
  const m = (filaDe.get(n.sku) ?? [])[0];
  if (!m) { console.log(`✗ ${n.sku}: no está en el maestro3 — se salta`); continue; }
  if (m.precio !== n.precio) { console.log(`✗ ${n.sku}: precio de la tabla (${n.precio}) ≠ maestro (${m.precio}) — se salta`); continue; }
  if (!existsSync(n.ficha)) { console.log(`✗ ${n.sku}: ficha no encontrada — se salta`); continue; }
  const f = fichaDe(n.ficha);
  const foto = n.fotoArchivo
    ? { interno: n.fotoArchivo, buf: (await import("node:fs")).readFileSync(n.fotoArchivo) }
    : mejorFoto(n.sku);
  console.log(`\n${n.sku.padEnd(10)} ${n.marca} ${n.modelo} · ${n.nombre}`);
  console.log(`   ${f.caracteristicas.length} caract · ${f.dimensiones.length} dim · ${f.medidas.length} med · foto ${foto ? `${Math.round(foto.buf.length / 1024)} KB` : "NINGUNA"} · US$ ${n.precio}`);
  if (!APLICAR) continue;

  let fotoPath = null;
  if (foto) {
    const ext = foto.interno.match(/\.(png|jpe?g)$/i)[1].toLowerCase().replace("jpeg", "jpg");
    fotoPath = `/productos/${n.sku.toLowerCase()}.${ext}`;
    writeFileSync(join(DESTINO_FOTOS, `${n.sku.toLowerCase()}.${ext}`), foto.buf);
  }
  const { rows } = await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       categoria = excluded.categoria, segmento = excluded.segmento, capacidad = excluded.capacidad,
       foto_path = coalesce(excluded.foto_path, productos.foto_path),
       ficha = excluded.ficha, activo = true, updated_at = now()
     returning id`,
    [
      n.sku, n.marca, n.modelo, n.nombre, n.categoria, n.segmento, n.capacidad, fotoPath,
      JSON.stringify({
        caracteristicas: f.caracteristicas,
        dimensiones: f.dimensiones,
        medidas: f.medidas,
        panel: n.panel,
        controles: f.controles,
        calentamiento: n.calentamiento,
        stock_referencia: m.stock,
        descripcion_maestro: m.equipo,
        ubicacion_maestro: m.ubicacion,
        origen: {
          maestro: "V:\\LESLY\\CODIFICACION DE EQUIPOS3.xlsx (fila resaltada)",
          ficha_tecnica: n.ficha.split("/").join("\\"),
          confianza: "codigo_verificado",
          nota: n.nota ?? null,
        },
      }),
    ],
  );
  await ponerPrecio(rows[0].id, n.segmento, n.precio);
  console.log(`   ✓ cargado`);
}

// ---- 2. Cambios sobre existentes (también resaltados) --------------------
console.log("\n── Cambios resaltados sobre existentes ──");
const cambios = [
  { sku: "LAV1801", precio: 14900, porque: "maestro3: 12.250 → 14.900" },
  { sku: "PRPE01", precio: 2200, porque: "maestro3 le pone precio (antes pedía aprobación por «sin precio»)" },
];
for (const c of cambios) {
  const { rows } = await bd.query(
    `select p.id, p.segmento, (select pp.precio from precios_producto pp where pp.producto_id = p.id and pp.vigente_hasta is null limit 1) precio
       from productos p where p.sku = $1 and p.activo`, [c.sku]);
  if (!rows[0]) { console.log(`✗ ${c.sku} no está activo`); continue; }
  console.log(`  ${c.sku.padEnd(9)} ${rows[0].precio ?? "SIN PRECIO"} → ${c.precio} (${c.porque})`);
  if (APLICAR) await ponerPrecio(rows[0].id, rows[0].segmento, c.precio);
}
// LAV180 (variante RX180 = -V1): capacidad 18 → 18-20 kg y descripción nueva.
const lav180 = filaDe.get("LAV180")?.find((x) => x.equipo.includes("RX180"));
console.log(`  LAV180-V1  capacidad «18 kg» → «18-20 kg» + descripción del maestro3`);
if (APLICAR && lav180) {
  await bd.query(
    `update productos set capacidad = '18-20 kg',
        ficha = jsonb_set(ficha, '{descripcion_maestro}', to_jsonb($1::text)), updated_at = now()
      where sku = 'LAV180-V1'`,
    [lav180.equipo],
  );
}
// LAV1801: su descripción también cambió con el precio.
const lav1801 = filaDe.get("LAV1801")?.[0];
if (APLICAR && lav1801) {
  await bd.query(
    `update productos set ficha = jsonb_set(ficha, '{descripcion_maestro}', to_jsonb($1::text)), updated_at = now() where sku = 'LAV1801'`,
    [lav1801.equipo],
  );
}

// ---- 3. Baja de CAFCU20 (reemplazado por CALFCU500) ----------------------
console.log("\n── Baja ──");
console.log("  CAFCU20    reemplazado por CALFCU500 en el maestro3 · nunca se cotizó");
if (APLICAR) {
  await bd.query(
    `update productos set activo = false, updated_at = now(),
        ficha = jsonb_set(ficha, '{origen,nota_baja}', to_jsonb('Baja 25-08: el maestro3 lo reemplaza por CALFCU500 (el «FCU 2100/50» era errata del FCU 2080/500). Nunca se cotizó.'::text))
      where sku = 'CAFCU20'`,
  );
}

await bd.end();
if (!APLICAR) console.log("\nNada se ha modificado. Agregá --aplicar.\n");
