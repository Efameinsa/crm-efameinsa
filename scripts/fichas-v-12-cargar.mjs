// ============================================================
// CRM EFAMEINSA · Paso 12 · Cargar las fichas al sistema
// ============================================================
// La regla que fijó Darwin el 27-08: «en el sistema solo estarán los productos
// que figuran en dicho Excel, todo lo demás será retirado». Desde el 28-08 el
// Excel es `V:\Fichas tecnicas por codigo v2.xlsx` (132 códigos, 120 con
// ficha), y con él llegaron tres decisiones de Darwin:
//
//   · COCHES POR COLOR — el maestro nuevo codifica cada color por separado
//     (CO401A, CO402A/B/G, CO408A/B) y cada uno trae su Word con su foto. Cada
//     color pasa a ser un producto propio y los códigos por modelo
//     (CO401/CO402/CO408) se retiran, aunque el maestro todavía los liste: su
//     equipo ya está codificado por color.
//   · SOLO ENTRA LO QUE TIENE FICHA — al sistema suben únicamente los códigos
//     de la hoja ENCONTRADOS, los que tienen su Word (Darwin, 28-08). Los que
//     el maestro lista sin ficha —casi todos el mismo equipo codificado dos
//     veces: SEC75E ≡ SECU75E, CALM23 ≡ CALMI23, LAV135S ≡ LAV1355…— quedan
//     FUERA del catálogo hasta que Lesly unifique el código y mande el Word.
//     Un producto sin descripción ni foto no se puede cotizar.
//   · LOS PRECIOS SE ACTUALIZAN con este Excel: el libro más nuevo de Lesly
//     (MODIF. UT120 26-08) subió los coches y varias UT075.
//
// QUÉ HACE, en este orden:
//
//   1. Actualiza cada producto del Excel con SU FICHA: la descripción leída del
//      Word (`ficha.bloques`, en su orden y con sus rótulos) y los datos de la
//      tabla técnica (panel, controles, calentamiento).
//   2. Copia sus imágenes ya preparadas a `public/productos/`: <sku>.png la del
//      equipo, <sku>-logo.png la de la marca y <sku>-panel.png la vista de
//      complemento.
//   3. Da de alta los códigos nuevos de Lesly que traen ficha.
//   4. Pone el precio del maestro donde cambió: cierra el vigente
//      (`vigente_hasta = hoy`) y abre uno nuevo, sin borrar el anterior.
//   5. RETIRA (activo = false) todo lo demás: lo que no figura en el Excel y
//      también lo que figura sin ficha. No se borra nada: las cotizaciones
//      viejas siguen apuntando a su producto y el histórico queda intacto.
//
// Uso:
//   node --env-file=.env.local scripts/fichas-v-12-cargar.mjs            (ensayo)
//   node --env-file=.env.local scripts/fichas-v-12-cargar.mjs --aplicar

import { Client } from "pg";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";
const LISTA = "scripts/data/fichas-v/lista.json";
const DESTINO_FOTOS = "public/productos";

const { fichas } = JSON.parse(readFileSync(FICHAS, "utf-8"));
const { fichas: imagenes } = JSON.parse(readFileSync(IMAGENES, "utf-8"));
const lista = JSON.parse(readFileSync(LISTA, "utf-8"));

/** Todo lo que el maestro nombra, con ficha y sin ella: de acá salen los datos
 *  (precio, marca) de cada código. */
const universo = new Map(
  [...lista.productos, ...lista.sinFicha].map((p) => [p.codigo.toUpperCase(), p]),
);
/** El catálogo del CRM son los ENCONTRADOS: los que tienen su Word. */
const conFicha = new Set(fichas.map((f) => f.codigo.toUpperCase()));
const enCatalogo = (sku) => conFicha.has(sku);

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

/** El color de un coche sale del nombre de su Word (…HM 402 AZUL.docx), que es
 *  como Lesly separó las fichas. Sin él, los tres colores del HM-402 se
 *  llamarían igual en la lista del comercial. */
function colorDeLaFicha(archivo) {
  const nombre = String(archivo ?? "").toUpperCase();
  for (const color of ["AZUL", "BLANCO", "GRIS", "VERDE", "ROJO", "NEGRO", "AMARILLO"]) {
    if (new RegExp(`(^|[^A-Z])${color}([^A-Z]|$)`).test(nombre)) return color[0] + color.slice(1).toLowerCase();
  }
  return null;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: existentes } = await bd.query(
  `select p.id, p.sku, p.activo, p.ficha, p.categoria, p.segmento, p.nombre,
          pp.id as precio_id, pp.tier, pp.precio
     from productos p
     left join precios_producto pp on pp.producto_id = p.id and pp.vigente_hasta is null
    where p.sku is not null`,
);
const porSku = new Map(existentes.map((p) => [p.sku.toUpperCase(), p]));

const plan = { actualiza: [], crea: [], fueraSinFicha: [], retira: [], precios: [], fotos: 0 };

for (const f of fichas) {
  const sku = f.codigo.toUpperCase();
  (porSku.has(sku) ? plan.actualiza : plan.crea).push(f);
}

// Códigos que el maestro lista sin ficha: no entran al catálogo.
for (const [sku, datos] of universo) {
  if (conFicha.has(sku)) continue;
  plan.fueraSinFicha.push({ sku, equipo: datos.equipo, estaba: porSku.get(sku)?.activo ? "activo" : "fuera" });
}

plan.retira = existentes.filter((p) => p.activo && !enCatalogo(p.sku.toUpperCase()));

// Precios: solo donde el maestro dice algo distinto de lo vigente.
for (const [sku, datos] of universo) {
  if (!enCatalogo(sku) || !datos.precio) continue;
  const actual = porSku.get(sku);
  const vigente = actual?.precio != null ? Number(actual.precio) : null;
  if (vigente === Number(datos.precio)) continue;
  plan.precios.push({ sku, de: vigente, a: Number(datos.precio), nuevo: !actual });
}

console.log(`Actualizar con su ficha: ${plan.actualiza.length}`);
console.log(`Crear con ficha: ${plan.crea.length}  ${plan.crea.map((f) => f.codigo).join(", ")}`);
console.log(`Del maestro SIN ficha (no entran al catálogo): ${plan.fueraSinFicha.length}`);
for (const a of plan.fueraSinFicha) {
  console.log(`   · ${a.sku.padEnd(10)} ${a.estaba === "activo" ? "estaba activo → se retira" : "ya estaba fuera"}`);
}
console.log(`Retirar: ${plan.retira.length}  ${plan.retira.map((p) => p.sku).join(", ")}`);
console.log(`Precios que cambian: ${plan.precios.length}`);
for (const p of plan.precios) console.log(`   · ${p.sku.padEnd(10)} ${p.de ?? "(sin precio)"} → ${p.a}${p.nuevo ? " (producto nuevo)" : ""}`);

if (!APLICAR) {
  console.log("\nEnsayo. Nada se escribió. Con --aplicar se ejecuta.");
  await bd.end();
  process.exit(0);
}

mkdirSync(DESTINO_FOTOS, { recursive: true });
await bd.query("begin");

try {
  const idPorSku = new Map(existentes.map((p) => [p.sku.toUpperCase(), p.id]));

  // ---------- 1 y 2 · las fichas ----------
  for (const f of fichas) {
    const sku = f.codigo.toUpperCase();
    if (!enCatalogo(sku)) continue;
    const actual = porSku.get(sku);
    const datosExcel = universo.get(sku);
    const color = colorDeLaFicha(datosExcel?.archivo);
    const base = (f.equipo ?? "").split(",")[0].trim() || f.equipo;
    // Los tres colores del HM-402 se llaman igual en el maestro: sin el color
    // en el nombre, el comercial ve tres filas idénticas. El modelo se agrega
    // solo si el nombre no lo trae ya («…MOD. HM-402» lo trae).
    const modelo = f.cabecera.modelo ?? "";
    const conModelo = modelo && !base.toUpperCase().includes(modelo.toUpperCase()) ? `${base} ${modelo}` : base;
    const nombre = color ? `${conModelo} ${color}`.replace(/\s+/g, " ").trim() : base;
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

    // La ficha: se conserva lo que ya había (stock, ubicación) y se reemplaza
    // SOLO la descripción y los datos técnicos. Los coches por color ya no
    // necesitan `fotos_por_color`: cada color es su propio producto.
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
    if (color) {
      ficha.color = color;
      delete ficha.fotos_por_color;
      delete ficha.colores;
    }

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
      idPorSku.set(sku, rows[0].id);
    }
  }

  // ---------- 3 · los precios del maestro ----------
  for (const p of plan.precios) {
    const id = idPorSku.get(p.sku);
    if (!id) continue;
    const { rows: seg } = await bd.query("select segmento from productos where id = $1", [id]);
    const tier = porSku.get(p.sku)?.tier ?? (seg[0]?.segmento === "semi_industrial" ? "optimo" : "base");
    // El precio viejo no se borra: se cierra. Si mañana gerencia pregunta de
    // dónde salió un número de una cotización vieja, tiene que poder verlo.
    await bd.query(
      "update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null",
      [id],
    );
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
       values ($1, $2, $3, 'USD', current_date)`,
      [id, tier, p.a],
    );
  }

  // ---------- 4 · lo que sale del catálogo ----------
  for (const p of plan.retira) {
    await bd.query("update productos set activo = false, updated_at = now() where id = $1", [p.id]);
  }

  await bd.query("commit");
  console.log(
    `\n✓ ${plan.actualiza.length} actualizados · ${plan.crea.length} creados · ` +
      `${plan.precios.length} precios · ` +
      `${plan.retira.length} retirados · ${plan.fotos} imágenes copiadas`,
  );
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}

await bd.end();
