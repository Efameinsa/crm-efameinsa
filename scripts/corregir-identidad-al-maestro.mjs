// ============================================================
// CRM EFAMEINSA · Que el equipo se llame como lo llama el maestro
// ============================================================
// Reportado el 25-08: «LG GIANT C MAX (CDG27MSCPS) está en el sistema pero no
// lo encuentro en el Excel de Lesly, y solo lo que está en ese Excel debe
// figurar».
//
// QUÉ PASÓ, Y ES UN ERROR MÍO DE HACE UN RATO. Al alinear los precios les puse
// el código y el precio del maestro, pero les dejé el NOMBRE y el MODELO del
// catálogo de ejemplo del piloto. Así que el equipo quedaba con el precio bueno
// y con un nombre que no existe en ningún documento de la empresa.
//
// Y EMPAREJÉ MAL UNO. Elegí la variante por lo que decía el nombre del piloto
// —«no menciona apilable, entonces es single»— cuando el dato duro estaba a la
// vista: el maestro trae el CÓDIGO DE FÁBRICA de cada equipo, y el producto lo
// llevaba en su modelo.
//
//     CDG27MSCPS  →  SECGIA102  GIANT-C MAX SINGLE     (lo que en verdad es)
//     CDG27MUCPS  →  SECGIA10   GIANT-C MAX APILABLE   (lo que le puse)
//
// Una letra de diferencia, dos equipos distintos. El precio es el mismo en los
// dos (2.090) así que no salió mal a ningún cliente, pero el equipo estaba mal
// identificado — y es justo lo que hace que alguien busque en el Excel y no lo
// encuentre.
//
// LA REGLA QUE FALTABA: la variante NO se deduce del nombre, se lee del código
// de fábrica. Es el único dato que distingue apilable de single sin ambigüedad.
//
// Uso: node --env-file=.env.local scripts/corregir-identidad-al-maestro.mjs [--aplicar]

import { Client } from "pg";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";

const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["Hoja1"], { header: 1, defval: "" })
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim());

/** Del renglón del maestro se sacan las piezas que el CRM guarda por separado. */
function leerDelMaestro(equipo) {
  return {
    fabrica: equipo.match(/COD\.?:?\s*([A-Z0-9]{6,})/i)?.[1] ?? null,
    modelo: equipo.match(/MOD\.?:?\s*([^,]+)/i)?.[1]?.trim() ?? null,
    capacidad: equipo.match(/CAP\.?:?\s*([\d.,]+)\s*KG/i)?.[1]?.replace(",", ".") ?? null,
    // El tipo es lo que va antes de la primera coma: "SECADORA C." / "LAVADORA
    // C." / "LAVADORA IND.RIGIDA". Se completa con el segmento para que el
    // comercial lea algo que signifique algo.
    tipo: equipo.split(",")[0].trim(),
  };
}

const maestro = new Map();
for (const f of filas) {
  const cod = String(f[1]).trim().toUpperCase();
  if (maestro.has(cod)) continue;
  const equipo = String(f[2]).trim();
  maestro.set(cod, { equipo, precio: Number(f[6]) || null, ...leerDelMaestro(equipo) });
}
// Índice por código de fábrica, que es la llave que distingue las variantes.
const porFabrica = new Map();
for (const [cod, m] of maestro) if (m.fabrica) porFabrica.set(m.fabrica.toUpperCase(), { sku: cod, ...m });

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// SOLO los tres que arrastran identidad del catálogo de ejemplo. No se toca
// nada más: los equipos que vinieron del pipeline real ya tienen su nombre y su
// capacidad tomados de la FICHA TÉCNICA, que en varios casos discrepa del
// maestro a propósito —la SECFDEE dice 10.2 kg en su ficha y 10.5 en el
// maestro, y se decidió que manda la ficha, que es el documento técnico que ve
// el cliente—. Re-identificarlos desde el maestro desharía esa decisión.
const DEL_PILOTO = ["SECGIA10", "LAVGIA13", "LAVMA172"];
const { rows: productos } = await bd.query(
  `select id, sku, marca, modelo, nombre, capacidad, segmento,
          ficha->'origen'->>'maestro' declara_maestro,
          (select count(*) from cotizacion_items i where i.producto_id = p.id) usos
     from productos p where activo order by sku`,
);

const cambios = [];
for (const p of productos) {
  if (!DEL_PILOTO.includes(p.sku)) continue;
  const fabrica = p.modelo?.match(/\(([A-Z0-9]{6,})\)/i)?.[1]?.toUpperCase() ?? null;
  const porCodigo = fabrica ? porFabrica.get(fabrica) : null;
  const m = porCodigo ?? (p.sku ? { sku: p.sku, ...maestro.get(p.sku.toUpperCase()) } : null);
  if (!m || !m.equipo) {
    console.log(`  ⚠ ${p.sku ?? "(sin código)"} · ${p.marca} ${p.modelo}: no se pudo ubicar en el maestro`);
    continue;
  }
  // "SECADORA C." es como el maestro abrevia "SECADORA COMERCIAL"; se escribe
  // entero para que el comercial lea algo que signifique algo.
  const tipo = m.tipo.toUpperCase().replace(/^(\w+)\s+C\.$/, "$1 COMERCIAL");
  const segmento = p.segmento === "semi_industrial" ? "SEMI INDUSTRIAL" : "INDUSTRIAL";
  const nombre = tipo.includes("SEMI INDUSTRIAL") || tipo.includes("INDUSTRIAL") ? tipo : `${tipo} ${segmento}`;
  const capacidad = m.capacidad ? `${m.capacidad} kg` : p.capacidad;
  cambios.push({
    p,
    m,
    fabrica,
    porCodigo: Boolean(porCodigo),
    nuevo: { sku: m.sku, modelo: m.modelo ?? p.modelo, capacidad, nombre },
  });
}

console.log(`\nProductos que arrastraban identidad del piloto: ${cambios.length}\n`);
for (const { p, m, fabrica, porCodigo, nuevo } of cambios) {
  console.log(`  ${p.marca} ${p.modelo} · usado en ${p.usos} cotización(es)`);
  console.log(`     código de fábrica  : ${fabrica ?? "no lo trae"}${porCodigo ? " → así se ubicó la variante" : " → se usó el código ya puesto"}`);
  console.log(`     código  ${String(p.sku ?? "—").padEnd(11)} → ${nuevo.sku}${p.sku !== nuevo.sku ? "   ⚠ CAMBIA" : ""}`);
  console.log(`     modelo  ${String(p.modelo).padEnd(28)} → ${nuevo.modelo}`);
  console.log(`     capac.  ${String(p.capacidad).padEnd(28)} → ${nuevo.capacidad}`);
  console.log(`     nombre  ${String(p.nombre).slice(0, 28).padEnd(28)} → ${nuevo.nombre}`);
  console.log(`     maestro : ${m.equipo.slice(0, 96)}`);
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}

for (const { p, m, fabrica, nuevo } of cambios) {
  if (nuevo.sku !== p.sku) {
    const { rows: choca } = await bd.query(`select id from productos where sku = $1 and id <> $2`, [nuevo.sku, p.id]);
    if (choca.length) {
      console.error(`  ✗ ${nuevo.sku} ya lo tiene otro producto. Se salta ${p.modelo}.`);
      continue;
    }
  }
  await bd.query(
    `update productos
        set sku = $2, modelo = $3, capacidad = $4, nombre = $5,
            ficha = jsonb_set(
                      jsonb_set(coalesce(ficha, '{}'::jsonb), '{origen}', coalesce(ficha->'origen', '{}'::jsonb)),
                      '{origen,maestro}', to_jsonb($6::text)),
            updated_at = now()
      where id = $1`,
    [p.id, nuevo.sku, nuevo.modelo, nuevo.capacidad, nuevo.nombre, "CODIFICACION DE EQUIPOS PARA MARKETING.xlsx"],
  );
  if (fabrica) {
    await bd.query(
      `update productos set ficha = jsonb_set(ficha, '{origen,codigo_fabrica}', to_jsonb($2::text)) where id = $1`,
      [p.id, fabrica],
    );
  }
  // El precio se vuelve a fijar por si la variante cambió de código.
  if (m.precio) {
    await bd.query(
      `update precios_producto set vigente_hasta = current_date
        where producto_id = $1 and vigente_hasta is null and precio <> $2`,
      [p.id, m.precio],
    );
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
       values ($1, 'optimo', $2, 'USD', current_date)
       on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
      [p.id, m.precio],
    );
  }
  console.log(`  ✓ ${nuevo.sku} · ${nuevo.modelo} · US$ ${m.precio}`);
}

// Comprobación final: que no quede ningún equipo activo fuera del maestro.
const { rows: huerfanos } = await bd.query(`select sku, marca, modelo from productos where activo and sku is null`);
console.log(`\nEquipos activos sin código: ${huerfanos.length}`);
for (const h of huerfanos) console.log(`  ⚠ ${h.marca} ${h.modelo}`);
await bd.end();
