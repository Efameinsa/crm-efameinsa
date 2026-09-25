/**
 * LA FICHA DE UN SERVICIO DE MANTENIMIENTO (25-09).
 *
 * Las fichas de servicio de P:\ no son como las de equipo: no traen la tabla
 * de marca/modelo/capacidad ni fotos, sino «ITEM I: <el equipo>» y una tabla
 * ITEM | DESCRIPCIÓN con cada sistema numerado (1, Exteriores…) y sus tareas,
 * cada una con su «✓». El lector de equipos (`ficha-docx.mjs`) las desarma:
 * los números salen como títulos sueltos, los ✓ como viñetas y el servicio
 * queda clasificado como «lavadora industrial». Lesly, 25-09: quiere poder
 * corregir los servicios subiendo el Word, como con los equipos.
 */

const MARCAS = ["UNIMAC", "PRIMUS", "SAILSTAR", "SAIL STAR", "LG", "GMP", "SPEED QUEEN", "ADC", "ALLIANCE", "IPSO", "HUEBSCH", "ELECTROLUX", "GIRBAU", "FAGOR", "EFAMEIN"];

/** Los párrafos del documento, en orden y sin vacíos. */
export function parrafosDeXml(xml) {
  return xml
    .split("</w:p>")
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** ¿Es la ficha de un servicio de mantenimiento? Por el nombre del archivo o por su tabla de tareas. */
export function esFichaDeServicio(nombreArchivo, parrafos) {
  if (/SERVICIO DE MANTENIMIENTO|^SER[VM]MA/i.test(nombreArchivo ?? "")) return true;
  return parrafos.some((p) => /^ITEM\s+[IVX]+\s*:/i.test(p)) && parrafos.some((p) => /^DESCRIPCI[OÓ]N$/i.test(p));
}

/** El Word → { equipo, marca, modelo, bloques }: cada sistema como subtítulo numerado y sus tareas como viñetas. */
export function leerFichaDeServicio(parrafos) {
  const equipo = (parrafos.find((p) => /^ITEM\s+[IVX]+\s*:/i.test(p)) ?? "").replace(/^ITEM\s+[IVX]+\s*:\s*/i, "").trim();
  const inicio = parrafos.findIndex((p) => /^DESCRIPCI[OÓ]N$/i.test(p));
  const cuerpo = parrafos.slice(inicio + 1);
  const bloques = [{ t: "titulo", texto: "TRABAJOS QUE INCLUYE EL SERVICIO" }];
  for (let i = 0; i < cuerpo.length; i++) {
    const p = cuerpo[i];
    if (/^[✓✔]+$/.test(p) || p === "") continue;
    if (/^\d{1,2}$/.test(p) && cuerpo[i + 1]) {
      bloques.push({ t: "subtitulo", texto: `${p}. ${cuerpo[i + 1]}` });
      i++;
      continue;
    }
    // Un sub-sistema dentro de un sistema («Descarga»): viene seguido de su ✓.
    if (/^[✓✔]+$/.test(cuerpo[i + 1] ?? "") && p.length < 40) {
      bloques.push({ t: "subtitulo", texto: p });
      continue;
    }
    bloques.push({ t: "vineta", texto: p });
  }
  const mayus = equipo.toUpperCase();
  const marcaDicha = mayus.match(/MARCA\s*:?\s*([A-Z][A-Z ]{1,20}?)(?=[,.]|\s+(?:MOD\w*|CAP\w*|FUERZA|CONTROL)\b|$)/)?.[1]?.trim();
  // «MARCA: UNIMAC UNLINC TOUCH…»: si empieza por una marca conocida, es esa.
  const conocida = marcaDicha && MARCAS.find((m) => marcaDicha.startsWith(m));
  const marca = (conocida ?? marcaDicha ?? MARCAS.find((m) => new RegExp(`\\b${m}\\b`).test(mayus)) ?? null)?.replace(/^SAIL STAR$/, "SAILSTAR") ?? null;
  const modelo = mayus.match(/MOD(?:ELO)?\.?\s*:?\s*([A-Z0-9][A-Z0-9.\-/ ]*?)(?=\s*,|\s+(?:MARCA|FUERZA|CAP\w*|CONTROL|CON|\d+\s*KG|\d{3}V)\b|\s*\(|$)/)?.[1]?.trim() ?? null;
  return { equipo, marca, modelo, bloques };
}
