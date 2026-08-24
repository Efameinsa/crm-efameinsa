// ============================================================
// CRM EFAMEINSA · Separar la lavadora de la secadora en las fichas de torre
// ============================================================
// Reportado el 24-08 desde el área comercial: «en las cotizaciones solo sale
// características de la lavadora, pero no de la secadora».
//
// Es cierto, y por tres motivos encadenados. Las torres (lavadora-secadora
// apilable) traen en su .docx DOS máquinas, cada una con su bloque:
//
//     LAVADORA          SECADORA
//       CARACTERISTICAS   CARACTERISTICAS
//       DIMENSIONES       DIMENSIONES
//       MEDIDAS           MEDIDAS
//
// El extractor del 22-08 no conocía esa estructura y aplanó todo en tres
// listas sueltas. El resultado:
//
//   1. SE PIERDE QUIÉN ES QUIÉN. Salían 20 viñetas seguidas sin decir dónde
//      termina la lavadora y empieza la secadora, así que se leían todas como
//      de la lavadora — exactamente lo que reportaron.
//   2. EL `new Set()` BORRÓ LÍNEAS DE LA SECADORA. Varias viñetas son iguales
//      en las dos máquinas («Tambor conectado directamente al sistema de
//      transmisión», «Panel de control computarizado», «Fácil mantenimiento»).
//      Al deduplicar contra la lista entera, la copia de la secadora
//      desaparecía. En el impreso original la secadora tiene ~10 viñetas; en
//      el CRM quedaban 5.
//   3. LAS DIMENSIONES SE CONTRADICEN. Quedaban dos «Volumen del tambor» con
//      valores distintos (102.7 y 207 litros) uno debajo del otro, y un
//      «SECADORA» suelto colado como si fuera una medida.
//
// Acá se vuelve a extraer respetando las dos máquinas y se guarda en
// `ficha.secciones`. Las listas planas de siempre se mantienen —las lee el
// cotizador para saber si el equipo tiene ficha— pero el PDF ahora imprime las
// secciones cuando existen, con su rótulo, como el documento en papel.
//
// Uso: node --env-file=.env.local scripts/corregir-ficha-equipos-torre.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const APLICAR = process.argv.includes("--aplicar");

/** Un rótulo de máquina: va solo en su línea. La numeración «I.»/«II.» la pone
 *  Word como lista automática, así que NO está en el texto del documento. */
const RE_MAQUINA = /^(LAVADORA|SECADORA|PLANCHADORA?|CENTRIFUGA|CALANDRIA|PRENSA)\s*$/i;

const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b/i },
  { clave: "caracteristicas", re: /^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

function lineasDe(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "latin1",
  });
  return Buffer.from(xml, "latin1")
    .toString("utf-8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

function unirDigitos(s) {
  let previo;
  let out = s;
  do {
    previo = out;
    out = out.replace(/(\d) (\d)/g, "$1$2");
  } while (out !== previo);
  return out;
}

const parear = (xs) =>
  xs.map((x) =>
    x
      .replace(/\s*:\s*:\s*/, ": ")
      .replace(/\s*:\s*/, ": ")
      .replace(/(\d)(litros|mm|kg|rpm|cm|m)\b/gi, "$1 $2")
      .replace(/\s+/g, " ")
      .trim(),
  );

/** Extrae la ficha respetando las máquinas que contenga. */
function extraer(docx) {
  const lineas = lineasDe(docx);
  const maquinas = [];
  let actual = null; // clave de bloque dentro de la máquina
  let maquina = null;

  const nueva = (titulo) => {
    maquina = { titulo, caracteristicas: [], dimensiones: [], medidas: [] };
    maquinas.push(maquina);
    actual = null;
  };

  for (const linea of lineas) {
    // El rótulo de máquina manda sobre todo lo demás.
    if (RE_MAQUINA.test(linea)) {
      nueva(linea.toUpperCase().trim());
      continue;
    }
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) {
      actual = sec.clave;
      continue;
    }
    if (!actual) continue;
    // Un equipo simple no trae rótulo de máquina: se abre una sin título.
    if (!maquina) nueva(null);

    const limpia = actual === "caracteristicas" ? linea : unirDigitos(linea);
    if (limpia.length < 6 || limpia.length > 320) continue;

    // Los rótulos sueltos de la tabla de cabecera ("Panel computarizado",
    // "Controles Automático") no son características y hay que descartarlos.
    // Pero el filtro original miraba solo con qué palabra EMPIEZA la línea, y
    // así se comía viñetas de verdad que arrancan igual:
    //     «Panel frontal de acero tratado con pintura especial anticorrosiva…»
    //     «Panel de control computarizado de acero, no de plástico…»
    // Las dos están en el impreso que mandó el área comercial y no estaban en
    // el CRM. Un rótulo de tabla no pasa de dos o tres palabras, así que ahora
    // se descarta por rótulo Y por corto.
    if (/^item\b/i.test(limpia)) continue;
    if (limpia.length < 40 && /^(marca|modelo|capacidad|panel|controles|autom[aá]tico)\b/i.test(limpia)) continue;

    maquina[actual].push(limpia);
  }

  // Se deduplica DENTRO de cada máquina, nunca entre máquinas: la lavadora y la
  // secadora comparten viñetas y las dos tienen derecho a la suya.
  return maquinas
    .map((m) => ({
      titulo: m.titulo,
      caracteristicas: [...new Set(m.caracteristicas)],
      dimensiones: [...new Set(parear(m.dimensiones))],
      medidas: [...new Set(parear(m.medidas))],
    }))
    .filter((m) => m.caracteristicas.length + m.dimensiones.length + m.medidas.length > 0);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select id, sku, marca, modelo, nombre, ficha from productos where ficha ? 'origen' or sku is not null order by sku`,
);

let corregidos = 0;
for (const p of rows) {
  const origen = p.ficha?.origen;
  // `origen` es una cadena en lo que cargué a mano y un objeto en lo que dejó
  // el pipeline del 22-08, que guarda la ruta en `ficha_tecnica`.
  const docx = typeof origen === "string" ? origen : (origen?.ficha_tecnica ?? origen?.ficha);
  if (!docx || !/\.docx$/i.test(docx)) continue;

  let secciones;
  try {
    secciones = extraer(docx);
  } catch {
    continue;
  }
  if (secciones.length === 0) continue;

  const antes = p.ficha ?? {};
  const plano = (clave) => secciones.flatMap((s) => s[clave]);
  const delta = (clave) => plano(clave).length - (antes[clave] ?? []).length;

  const cambia =
    secciones.length > 1 || delta("caracteristicas") !== 0 || delta("dimensiones") !== 0 || delta("medidas") !== 0;
  if (!cambia) continue;

  const signo = (n) => (n > 0 ? `+${n}` : String(n));
  console.log(`\n${p.sku ?? "(sin SKU)"} · ${p.marca} ${p.modelo}`);
  console.log(
    `  características ${(antes.caracteristicas ?? []).length} → ${plano("caracteristicas").length} (${signo(delta("caracteristicas"))})` +
      ` · dimensiones ${(antes.dimensiones ?? []).length} → ${plano("dimensiones").length} (${signo(delta("dimensiones"))})` +
      ` · medidas ${(antes.medidas ?? []).length} → ${plano("medidas").length} (${signo(delta("medidas"))})`,
  );
  if (secciones.length > 1) {
    for (const s of secciones) {
      console.log(
        `     ${String(s.titulo ?? "(sin rótulo)").padEnd(10)} ${s.caracteristicas.length} car · ${s.dimensiones.length} dim · ${s.medidas.length} med`,
      );
    }
  }
  // Lo que aparece de nuevo, para poder revisar que sea legítimo.
  const nuevas = plano("caracteristicas").filter((c) => !(antes.caracteristicas ?? []).includes(c));
  for (const n of nuevas.slice(0, 3)) console.log(`     + ${n.slice(0, 88)}`);

  if (!APLICAR) continue;

  // Las listas planas se recalculan como la suma de las secciones (sin
  // deduplicar entre ellas) para que nada de lo que ya las lee se rompa.
  // `secciones` solo se guarda cuando el equipo trae más de una máquina: para
  // uno simple sería una envoltura que no dice nada.
  const nuevaFicha = {
    ...antes,
    ...(secciones.length > 1 ? { secciones } : {}),
    caracteristicas: plano("caracteristicas"),
    dimensiones: plano("dimensiones"),
    medidas: plano("medidas"),
  };
  await bd.query(`update productos set ficha = $2, updated_at = now() where id = $1`, [p.id, JSON.stringify(nuevaFicha)]);
  corregidos++;
  console.log("  ✓ corregido");
}

console.log(
  APLICAR
    ? `\n${corregidos} ficha(s) corregida(s).`
    : "\n(Simulación: no se escribió nada. Correr con --aplicar.)",
);

await bd.end();
