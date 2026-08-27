// ============================================================
// CRM EFAMEINSA · Paso 12 · Cargar las fichas al sistema
// ============================================================
// La regla que fijó Darwin el 27-08: «en el sistema solo estarán los productos
// que figuran en dicho Excel, todo lo demás será retirado».
//
// QUÉ HACE, en este orden:
//
//   1. Actualiza cada producto del Excel con SU FICHA: la descripción leída del
//      Word (`ficha.bloques`, en su orden y con sus rótulos) y los datos de la
//      tabla técnica (panel, controles, calentamiento).
//   2. Copia sus imágenes ya preparadas a `public/productos/`: <sku>.png la del
//      equipo, <sku>-logo.png la de la marca y <sku>-panel.png la vista de
//      complemento.
//   3. Da de alta los códigos nuevos de Lesly con su precio del Excel.
//   4. RETIRA (activo = false) los productos que no figuran en el Excel. No se
//      borra nada: las cotizaciones viejas siguen apuntando a su producto y el
//      histórico queda intacto.
//
// Lo que NO toca: los precios de los productos que ya existen —los pone
// gerencia y son la referencia de aprobación—, `fotos_por_color` de los coches
// y cualquier otra clave de la ficha que no sea la descripción.
//
// Uso:
//   node --env-file=.env.local scripts/fichas-v-12-cargar.mjs            (ensayo)
//   node --env-file=.env.local scripts/fichas-v-12-cargar.mjs --aplicar

import { Client } from "pg";
import { readFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";
const LISTA = "scripts/data/fichas-v/lista.json";
const DESTINO_FOTOS = "public/productos";

const { fichas } = JSON.parse(readFileSync(FICHAS, "utf-8"));
const { fichas: imagenes } = JSON.parse(readFileSync(IMAGENES, "utf-8"));
const lista = JSON.parse(readFileSync(LISTA, "utf-8"));

/** Todo el catálogo de Lesly: con ficha y sin ella (los rojos también son suyos). */
const universo = new Map(
  [...lista.productos, ...lista.sinFicha].map((p) => [p.codigo.toUpperCase(), p]),
);

/** Categoría y segmento para un código que todavía no existe en el CRM. */
function clasificar(equipo) {
  const t = equipo.toUpperCase();
  const categoria = /COCHE|CARRO/.test(t)
    ? "coche"
    : /LAVADORA\s*SECADORA|TORRE/.test(t)
      ? "lavadora-secadora"
      : /LAVADORA/.test(t)
        ? "lavadora"
        : /SECADORA/.test(t)
          ? "secadora"
          : /RODILLO|CALANDRIA|PRENSA|MESA|CALDERIN|PLANCHAD/.test(t)
            ? "planchador"
            : "otro";
  // El segmento decide el piso de precio (migración 0074): semi-industrial son
  // los equipos de mostrador —calderines, mesas, torres LG—; el resto es
  // industrial.
  const segmento = /CALDERIN|MINI|SEMI\s*INDUSTRIAL|APILABLE/.test(t) ? "semi_industrial" : "industrial";
  return { categoria, segmento };
}

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: existentes } = await bd.query("select id, sku, activo, ficha, categoria, segmento from productos where sku is not null");
const porSku = new Map(existentes.map((p) => [p.sku.toUpperCase(), p]));

const plan = { actualiza: [], crea: [], retira: [], fotos: 0, sinFicha: [] };

for (const f of fichas) {
  const sku = f.codigo.toUpperCase();
  const actual = porSku.get(sku);
  (actual ? plan.actualiza : plan.crea).push(f);
}
for (const codigo of universo.keys()) {
  if (!fichas.some((f) => f.codigo.toUpperCase() === codigo)) plan.sinFicha.push(codigo);
}
plan.retira = existentes.filter((p) => p.activo && !universo.has(p.sku.toUpperCase()));

console.log(`Actualizar con su ficha: ${plan.actualiza.length}`);
console.log(`Crear: ${plan.crea.length}  ${plan.crea.map((f) => f.codigo).join(", ")}`);
console.log(`Retirar: ${plan.retira.length}  ${plan.retira.map((p) => p.sku).join(", ")}`);
console.log(`Del Excel sin ficha legible (se dejan como están): ${plan.sinFicha.length}  ${plan.sinFicha.join(", ")}`);

if (!APLICAR) {
  console.log("\nEnsayo. Nada se escribió. Con --aplicar se ejecuta.");
  await bd.end();
  process.exit(0);
}

mkdirSync(DESTINO_FOTOS, { recursive: true });
await bd.query("begin");

try {
  for (const f of fichas) {
    const sku = f.codigo.toUpperCase();
    const actual = porSku.get(sku);
    const datosExcel = universo.get(sku);
    const nombre = (f.equipo ?? "").split(",")[0].trim() || f.equipo;
    const { categoria, segmento } = clasificar(f.equipo ?? "");

    // Las imágenes preparadas, con el nombre que espera el PDF.
    const suyas = imagenes.find((i) => i.codigo === f.codigo)?.imagenes ?? [];
    let fotoPath = null;
    for (const img of suyas) {
      const nombreArchivo =
        img.rol === "producto" ? `${sku.toLowerCase()}.png` : `${sku.toLowerCase()}-${img.rol}.png`;
      copyFileSync(img.archivo, join(DESTINO_FOTOS, nombreArchivo));
      plan.fotos++;
      if (img.rol === "producto") fotoPath = `/productos/${nombreArchivo}`;
    }

    // La ficha: se conserva lo que ya había (stock, ubicación, colores, fotos
    // por color) y se reemplaza SOLO la descripción y los datos técnicos.
    const fichaPrevia = actual?.ficha ?? {};
    const ficha = {
      ...fichaPrevia,
      bloques: f.bloques,
      panel: f.cabecera.panel ?? null,
      controles: f.cabecera.controles ?? null,
      calentamiento: f.cabecera.calentamiento ?? null,
      origen_descripcion: "ficha word de Lesly",
      leida_at: new Date().toISOString().slice(0, 10),
    };

    if (actual) {
      await bd.query(
        `update productos set marca = coalesce($2, marca), modelo = coalesce($3, modelo),
                nombre = $4, capacidad = coalesce($5, capacidad),
                ficha = $6, foto_path = coalesce($7, foto_path), activo = true, updated_at = now()
           where id = $1`,
        [actual.id, f.cabecera.marca ?? f.marca, f.cabecera.modelo, nombre, f.cabecera.capacidad, ficha, fotoPath],
      );
    } else {
      const { rows } = await bd.query(
        `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning id`,
        [sku, f.cabecera.marca ?? f.marca, f.cabecera.modelo, nombre, categoria, segmento, f.cabecera.capacidad, fotoPath, ficha],
      );
      // Precio del Excel, en el nivel que usa su segmento.
      const precio = datosExcel?.precio ?? f.precio;
      if (precio) {
        await bd.query(
          `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
           values ($1, $2, $3, 'USD', current_date)`,
          [rows[0].id, segmento === "semi_industrial" ? "optimo" : "base", precio],
        );
      }
    }
  }

  for (const p of plan.retira) {
    await bd.query("update productos set activo = false, updated_at = now() where id = $1", [p.id]);
  }

  await bd.query("commit");
  console.log(`\n✓ ${plan.actualiza.length} actualizados · ${plan.crea.length} creados · ${plan.retira.length} retirados · ${plan.fotos} imágenes copiadas`);
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}

await bd.end();
