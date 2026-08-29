// ============================================================
// CRM EFAMEINSA · Sacar de las fichas el texto de los cuadros flotantes
// ============================================================
// Darwin, 29-08, con dos cotizaciones reales abiertas (Presu_511-26 y
// Presu_512-26): «¿por qué razón estas cotizaciones salen mal? Se repite a cada
// rato modelo 2023».
//
// QUÉ PASABA. En la ficha de la SECNDE, encima de la foto, Lesly puso siete
// cuadros de texto que dicen «Modelo 2023» —una etiqueta, como un sticker—. El
// lector de fichas recorría el XML del Word con expresiones regulares y se los
// llevaba como si fueran descripción, y encima DOS VECES cada uno, porque Word
// guarda cada forma dos veces (una moderna y otra de repuesto para un Word
// viejo). Catorce «Modelo 2023» seguidos abriendo la descripción de la máquina,
// en un documento que va al cliente. La causa y el arreglo están explicados en
// `lib-ficha-docx.mjs`, que es donde vive el lector desde hoy.
//
// Este script arregla lo YA CARGADO. Toca tres fichas —SECNDE, SECMAX152 y
// SECGIA10, las únicas de las 121 con texto en un cuadro flotante— y solo les
// QUITA bloques: si al releer el Word apareciera texto nuevo, o cambiara alguno
// de los que hoy están guardados, no aplica nada y lo reporta. Eso protege las
// correcciones a mano que las fichas fueron recibiendo desde que se cargaron
// (el mismo cuidado que tomó `reparar-subtitulos-fichas.mjs` en su momento).
//
// Uso:
//   node --env-file=.env.local scripts/reparar-cuadros-de-texto-fichas.mjs            (solo informa)
//   node --env-file=.env.local scripts/reparar-cuadros-de-texto-fichas.mjs --aplicar

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { leerZip, textoDeZip } from "./lib-zip.mjs";
import { leerFichaDeXml } from "./lib-ficha-docx.mjs";

const APLICAR = process.argv.includes("--aplicar");
const LISTA = "scripts/data/fichas-v/lista.json";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** El texto de cada cuadro flotante del Word, párrafo por párrafo. */
function textosDeLosCuadros(xml) {
  const textos = new Set();
  for (const caja of xml.matchAll(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g)) {
    for (const parrafo of caja[1].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
      const t = [...parrafo[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
      if (t) textos.add(t);
    }
  }
  return [...textos];
}

/**
 * ¿Este bloque es de los que sobran?
 *
 * Lo es si su texto sale de un cuadro flotante, o si lo que queda al sacarle el
 * texto del cuadro son puros números: así se reconoce
 * «2413011176000121031010468610Modelo», el código de barras de la plantilla
 * UniMac con la etiqueta pegada al final porque el párrafo de afuera terminaba
 * en el cierre del de adentro.
 */
/**
 * Un bloque, comparable. Postgres guarda el jsonb con las claves en SU orden
 * —primero las cortas—, así que el mismo bloque vuelve de la base como
 * {t, valor, rotulo} donde el lector lo armó {t, rotulo, valor}. Comparar el
 * JSON tal cual daba «distinto» en las seis medidas de cada ficha.
 */
const normal = (b) =>
  JSON.stringify(
    Object.keys(b)
      .sort()
      .map((k) => [k, b[k]]),
  );

function esDeUnCuadro(bloque, textosCuadro) {
  const texto = String(bloque.texto ?? "");
  if (!texto) return false;
  let resto = texto;
  for (const t of textosCuadro) resto = resto.split(t).join("");
  return resto.trim() === "" || /^[\d\s.,\-/]+$/.test(resto);
}

const lista = JSON.parse(readFileSync(LISTA, "utf-8"));
let revisadas = 0;
let sinCambio = 0;
const paraAplicar = [];
const conProblema = [];

for (const p of lista.productos) {
  if (!p.docx) continue;
  let xml;
  try {
    xml = textoDeZip(leerZip(p.docx), "word/document.xml");
  } catch {
    continue;
  }
  const textosCuadro = textosDeLosCuadros(xml);
  if (textosCuadro.length === 0) continue; // sin cuadros, no hay nada que sacar
  revisadas++;

  const { data: producto } = await db
    .from("productos")
    .select("id, sku, nombre, ficha")
    .eq("sku", p.codigo)
    .maybeSingle();
  if (!producto?.ficha?.bloques) {
    conProblema.push({ codigo: p.codigo, motivo: "no está en el catálogo o no tiene bloques" });
    continue;
  }

  const enBd = producto.ficha.bloques;
  const limpios = enBd.filter((b) => !esDeUnCuadro(b, textosCuadro));
  if (limpios.length === enBd.length) {
    sinCambio++;
    continue;
  }

  // La red: lo que queda tiene que ser exactamente lo que el lector corregido
  // saca del Word de hoy. Si no coincide, la ficha se editó a mano después y
  // este script no es quién para pisarla.
  const delWord = leerFichaDeXml(xml).bloques;
  const igual = limpios.map(normal).join("|") === delWord.map(normal).join("|");
  const quitados = enBd.filter((b) => esDeUnCuadro(b, textosCuadro));
  if (!igual) {
    conProblema.push({
      codigo: p.codigo,
      motivo: `lo que quedaría (${limpios.length} bloques) no es lo que dice el Word (${delWord.length})`,
    });
    continue;
  }
  paraAplicar.push({ producto, limpios, quitados });
}

console.log(`Fichas con cuadros de texto: ${revisadas}  ·  ya limpias: ${sinCambio}  ·  por reparar: ${paraAplicar.length}\n`);

for (const { producto, limpios, quitados } of paraAplicar) {
  console.log(`── ${producto.sku} · ${producto.nombre}`);
  console.log(`   ${producto.ficha.bloques.length} → ${limpios.length} bloques; se van ${quitados.length}:`);
  const cuenta = new Map();
  for (const b of quitados) cuenta.set(b.texto, (cuenta.get(b.texto) ?? 0) + 1);
  for (const [texto, n] of cuenta) console.log(`     ${n} × «${texto}»`);
  if (!APLICAR) continue;
  const { error } = await db
    .from("productos")
    .update({ ficha: { ...producto.ficha, bloques: limpios } })
    .eq("id", producto.id);
  console.log(error ? `   ✗ no se pudo guardar: ${error.message}` : "   ✓ guardado");
}

for (const p of conProblema) console.log(`  ! ${p.codigo}: ${p.motivo} — no se toca`);

if (!APLICAR && paraAplicar.length > 0) console.log("\nEsto fue solo el informe. Para aplicarlo: --aplicar");
