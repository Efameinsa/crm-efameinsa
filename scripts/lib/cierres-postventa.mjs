// ============================================================
// CRM EFAMEINSA · Leer un informe de cierre de postventa (.doc)
// ============================================================
// El área cierra cada venta de servicio o de repuesto con un informe en Word
// —el mismo formato desde 2024— y esos informes son el único registro que
// existe de ese trabajo: no hay un Excel maestro de postventa como el de los
// comerciales. Acá se lee lo que cada informe declara de sí mismo.
//
// Lo usan el censo (`_censo-cierres-postventa.mjs`) y la importación
// (`importar-cierres-postventa.mjs`). Vive en un solo archivo a propósito: dos
// copias del lector se habrían separado al primer formato raro, y entonces el
// censo diría una cosa y la carga haría otra.

import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import WordExtractor from "word-extractor";

/**
 * Las carpetas de R:\ tal como las dejó Darwin el 27-08, más «BRENDA 2023»
 * desde el 29-08.
 *
 * La historia de la 2023: el 28-08 sus 80 archivos eran byte a byte los de
 * «CIERRES DE POST VENTA 2026» de Hever —alguien copió la carpeta equivocada
 * al renombrarla— y se ignoró. El 29-08 la volvieron a llenar con los 272
 * informes de 2023 de verdad… pero la copia mala sigue pegada adentro, en sus
 * subcarpetas EFAMEINSA/ y OPEN/. Por eso `leerTodos` deduplica POR CONTENIDO
 * (huella md5): un archivo cuyo contenido ya apareció en otra carpeta no se
 * lee dos veces, viva donde viva. Hever-2026 va primero para que los
 * duplicados mueran ahí.
 */
export const CARPETAS = [
  { clave: "hever-2026", ruta: "COPIA DE CIERRES DE POST VENTA 2026" },
  { clave: "brenda-2023", ruta: "COPIA DE CIERRES POST VENTA BRENDA 2023" },
  { clave: "brenda-2024", ruta: "COPIA DE CIERRES POST VENTA BRENDA 2024" },
  { clave: "brenda-2025", ruta: "COPIA DE CIERRES POST VENTA BRENDA 2025" },
  { clave: "brenda-2026", ruta: "COPIA DE CIERRES POST VENTA BRENDA ENERO - ABRIL 2026" },
];

export const extractor = new WordExtractor();

/** Todos los .doc de una carpeta, sin los archivos de bloqueo de Word (~$…). */
export function listarInformes(dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) salida.push(...listarInformes(p));
    else if (/\.docx?$/i.test(e.name) && !e.name.startsWith("~$")) salida.push(p);
  }
  return salida;
}

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const MONEDA = String.raw`(US\$|U\$D|U\$\$|USD|S\/\.?)?`;
const CIFRA = String.raw`([\d][\d.,]*\d)`;

const ROTULOS = new Set([
  "ITEM", "ÍTEM", "DESCRIPCION", "DESCRIPCIÓN", "CONCEPTO", "CANT", "CANTIDAD", "PRECIO", "UNITARIO",
  "SUB", "TOTAL", "IGV", "UND", "USD", "US", "U", "D", "S", "P", "SOLES", "DOLARES", "DÓLARES",
  "INCLUIDO", "ESPECIAL", "PARCIAL", "N", "Nº", "N°", "EQUIPOS",
]);

const REPUESTOS =
  /REPUESTO|KIT\b|RESISTENCIA|CONTACTOR|VALVULA|VÁLVULA|RODAMIENTO|CORREA|BOMBA|SENSOR|TARJETA|EMPAQUETADURA|MANGUERA|TERMOSTATO|FUSIBLE|POLEA|CHUMACERA|RELE|RELÉ|SUMINISTRO DE/i;
const SERVICIOS =
  /SERVICIO DE MANTENIMIENTO|MANTENIMIENTO (PREVENTIVO|CORRECTIVO)|SERVICIO T[EÉ]CNICO|REVISI[OÓ]N T[EÉ]CNICA|DIAGN[OÓ]STICO|SERVICIO DE REPARACI[OÓ]N|SERVICIO DE INSTALACI[OÓ]N|CAPACITACI[OÓ]N/i;
// La máquina tiene que estar AL PRINCIPIO del ítem: «VARIADOR PARA RODILLO
// PLANCHADOR MARCA: GMP» es un repuesto de un rodillo, no un rodillo.
const EQUIPOS =
  /^(?:[IVX\d]{1,3}[\s|.)-]*)?(LAVADORA|SECADORA|CALDERA|CENTRIFUGA|CENTRÍFUGA|PLANCHADORA|RODILLO (?:DE PLANCHADO|ELECTRICO|ELÉCTRICO|PLANCHADOR)|CALANDRA|MESA (?:DE PLANCHADO|DESMANCHADORA)|COCHE TRANSPORTADOR|HIDROLAVADORA|TERMA|GENERADOR DE VAPOR|T[UÚ]NEL)/i;

/**
 * ¿Es la fila de títulos de la tabla?
 *
 * Se quitan tabulaciones, símbolos de moneda y puntuación: si lo que queda son
 * puras palabras de encabezado, la línea es el título. Contar rótulos no
 * alcanzaba —fragmentos como «SUB TOTAL + IGV» quedaban pegados al primer ítem
 * y lo volvían ilegible— y leer desde «ÍTEM» sin saltar nada era peor: lo que
 * se clasificaba era el encabezado de la tabla y no lo que se vendió.
 */
function esTitulo(linea) {
  const palabras = linea
    .replace(/[\t|+$.,:/()°ºª%-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return true;
  if (palabras.length <= 2 && /^(?:[IVX]{1,4}|\d{1,3})$/i.test(palabras[0])) return true;
  return palabras.every((p) => ROTULOS.has(p.toUpperCase()));
}

/**
 * La descripción de la máquina, sin el encabezado de la tabla pegado adelante.
 *
 * El texto que precede a la serie arrastra la fila de títulos —«PRECIO UNITARIO
 * + IGV USD PRECIO + IGV USD I SERVICIO DE MANTENIMIENTO PREVENTIVO DE
 * LAVADORA…»— y así quedó escrito en las 216 fichas de la primera carga: en la
 * pantalla del parque instalado se leía el encabezado, no la máquina.
 *
 * La máquina empieza donde empieza su nombre, así que se corta desde la PRIMERA
 * mención de un tipo de equipo. La primera y no la última: «MESA DE PLANCHADO
 * ASPIRANTE SOPLANTE CON CALDERIN … CAPACIDAD: CALDERA DE 5 LITROS» es una mesa
 * de planchado, y quedarse con la última mención la fichaba como «CALDERA DE 5
 * LITROS».
 */
export function descripcionEquipo(texto) {
  if (!texto) return null;
  const limpio = texto.replace(/\s+/g, " ").trim();
  const nombres =
    /(LAVADORA|SECADORA|CALDERA|CENTRIFUGA|CENTRÍFUGA|PLANCHADORA|RODILLO|CALANDRA|MESA DE PLANCHADO|MESA DESMANCHADORA|COCHE|HIDROLAVADORA|TERMA|GENERADOR DE VAPOR|T[UÚ]NEL)/i;
  const corte = limpio.search(nombres);
  const desde = corte >= 0 ? limpio.slice(corte) : limpio;
  return (
    desde
      // Restos del encabezado cuando el informe no nombra la máquina.
      .replace(/^(?:[\s|.:+-]|CANT\.?|CANTIDAD|PRECIO|UNITARIO|SUB\s*TOTAL|TOTAL|IGV|USD|US\$|U\$D|S\/\.?|ITEM|[IVX]{1,3}\b)+/i, "")
      .trim()
      .slice(0, 200) || null
  );
}

/** Lo que el informe declara de sí mismo. */
export function leerCierre(texto, archivo) {
  const t = texto.replace(/\r/g, "\n");

  const cab = t.match(/INFORME\s*N[º°o]?\s*[:\s]*([\d]{1,5})\s*-?\s*(\d{2,4})?[^\n]*/i);
  const correlativo = cab ? Number(cab[1]) : null;
  const anioCab = cab && cab[2] ? Number(cab[2].length === 2 ? "20" + cab[2] : cab[2]) : null;

  const fechaM = t.match(/Fecha\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i);
  const fecha = fechaM
    ? `${fechaM[3].length === 2 ? "20" + fechaM[3] : fechaM[3]}-${String(fechaM[2]).padStart(2, "0")}-${String(fechaM[1]).padStart(2, "0")}`
    : null;

  const ruc = (t.match(/\bRUC\s*:?\s*(\d{11})\b/i) ?? t.match(/\b(\d{11})\b/))?.[1] ?? null;
  const dni = t.match(/\bDNI\s*:?\s*(\d{8})\b/i)?.[1] ?? null;

  // El «Asunto» a veces viene con el RUC pegado adelante —«10446037817 - QUISPE
  // TAPIA ALBERTINA»— porque quien escribió el informe copió la línea entera de
  // la factura. El documento ya se guarda en su columna: en la razón social
  // estorba y además la deja distinta de la del CRM, que es lo que se usa para
  // buscar al cliente.
  const cliente =
    (norm(t.match(/Asunto\s*:?\s*([^\n]+)/i)?.[1]) || norm(t.match(/\bCLIENTE\s*:\s*([^\n]+)/i)?.[1]) || "")
      .replace(/^\d{8,11}\s*[-–—]\s*/, "")
      // Y a veces arranca con el resto de los dos puntos del rótulo.
      .replace(/^[\s:–—-]+/, "")
      .trim() || null;

  const presupuesto = norm(t.match(/presupuesto\s*(?:N[º°o]?\s*)?([\d]{1,5}\s*-\s*\d{2})/i)?.[1])?.replace(/\s+/g, "");

  // EL TOTAL. Cada quien lo escribió a su manera —«MONTO TOTAL:», «TOTAL»,
  // «TOTAL, INCLUIDO IGV», «TOTAL incl. IGV»— y la cifra suele caer en la celda
  // siguiente de la tabla, o en la línea siguiente, con tabulaciones en medio.
  // Manda la etiqueta más específica: el monto declarado de la venta antes que
  // el total de la tabla, porque es el que se cobró.
  const plata = (etiqueta) => {
    const m = t.match(new RegExp(`${etiqueta}[^\\d\\n]{0,60}?\\n?[^\\d\\n]{0,20}?${MONEDA}\\s*${CIFRA}`, "i"));
    if (!m) return null;
    const crudo = m[2].replace(/\s/g, "");
    const valor = /,\d{2}$/.test(crudo)
      ? Number(crudo.replace(/\./g, "").replace(",", "."))
      : Number(crudo.replace(/,/g, ""));
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return { monto: valor, moneda: /S\//i.test(m[1] ?? "") ? "PEN" : "USD" };
  };
  const total =
    plata(String.raw`MONTO\s+TOTAL\s+VENTA`) ??
    plata(String.raw`MONTO\s+TOTAL`) ??
    plata(String.raw`TOTAL[, ]*\s*(?:incl\.?|INCLUIDO)\s*(?:EL\s*)?IGV`) ??
    plata(String.raw`\bTOTAL\b(?!\s*VENTA)`);

  // Las series, con el pedazo de texto que las precede: ahí viven la marca, el
  // modelo y la capacidad de esa máquina.
  const series = [];
  for (const m of t.matchAll(/\bSERIE\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})/gi)) {
    const serie = m[1].toUpperCase();
    // Una serie de máquina siempre trae dígitos —280067, EFAC1228,
    // 309KWGG53903—. Sin este filtro, un renglón partido metió «ERMISTOR» al
    // parque instalado como si fuera una máquina.
    if (!/\d/.test(serie)) continue;
    if (series.some((s) => s.serie === serie)) continue;
    const antes = norm(t.slice(Math.max(0, m.index - 260), m.index));
    series.push({ serie, descripcion: descripcionEquipo(antes) });
  }

  const iTabla = t.search(/[ÍI]TEM|CONCEPTO\s*\|?\s*CANT/i);
  const primerItem = (
    iTabla >= 0
      ? t
          .slice(iTabla)
          .split("\n")
          .filter((l) => !esTitulo(l.replace(/\t/g, " ")))
          .slice(0, 8)
          .join(" ")
      : t.slice(0, 600)
  )
    .replace(/\s+/g, " ")
    .slice(0, 600);

  const itemServicio = SERVICIOS.test(primerItem);
  const itemRepuesto = REPUESTOS.test(primerItem);
  // Un equipo vendido viene con su ficha: marca y modelo debajo del nombre. Un
  // mantenimiento «de la lavadora tal» nombra la máquina, pero no la ficha así.
  const itemEquipo = EQUIPOS.test(primerItem.trim()) && /MARCA\s*:/i.test(primerItem) && !itemServicio;

  // La regla, invertida a propósito: en un cierre de POSTVENTA, lo que no es un
  // servicio ni una máquina es un repuesto. Enumerar nombres de piezas no
  // termina nunca —termistor, faja, ensamblaje de rodillo, ducto, filtro de
  // pelusa, variador, cable vulcanizado— y cada nombre que faltaba dejaba el
  // cierre «sin clasificar», que en la práctica significaba sin importar.
  const tipo = itemEquipo
    ? "equipo"
    : itemServicio
      ? itemRepuesto
        ? "mantenimiento+repuesto"
        : "mantenimiento"
      : primerItem.trim().length < 10
        ? "sin_clasificar"
        : "repuesto";

  // Lo que hay que mirar a mano antes de cargarlo: un cierre de postventa de
  // más de US$ 3.000 es raro —los mantenimientos y repuestos andan en cientos
  // de dólares— así que si es tan caro y no está marcado como equipo, o al
  // revés, alguien tiene que confirmarlo.
  const caro = (total?.moneda === "PEN" ? (total?.monto ?? 0) / 3.7 : (total?.monto ?? 0)) > 3000;

  return {
    archivo: archivo.replace(/\\/g, "/"),
    correlativo,
    anio: anioCab ?? (fecha ? Number(fecha.slice(0, 4)) : null),
    fecha,
    cliente,
    ruc,
    dni,
    presupuesto: presupuesto ?? null,
    monto: total?.monto ?? null,
    moneda: total?.moneda ?? null,
    series,
    tipo,
    dudoso: tipo === "sin_clasificar" || (caro && tipo !== "equipo"),
    primerItem,
    // EFAMEINSA y OPEN son dos razones sociales distintas, con series de
    // cotización separadas: la carpeta lo dice.
    razonSocial: /\/OPEN\//i.test(archivo) ? "OPEN" : /\/EFAMEINSA\//i.test(archivo) ? "EFAMEINSA" : null,
  };
}

/**
 * Lee todos los informes de las carpetas de R:\ y devuelve sus fichas.
 *
 * Deduplica POR CONTENIDO: el mismo archivo copiado a dos carpetas (la copia
 * de Hever pegada dentro de «BRENDA 2023») se lee una sola vez, en la primera
 * carpeta de la lista donde aparezca. Sin esto, esos 80 informes entrarían de
 * nuevo con otra ruta y `documento_origen` no los detendría.
 */
export async function leerTodos(raiz = "R:/", carpetas = CARPETAS) {
  const salida = [];
  const vistos = new Set();
  let duplicados = 0;
  for (const { clave, ruta } of carpetas) {
    const dir = join(raiz, ruta);
    let archivos;
    try {
      archivos = listarInformes(dir);
    } catch {
      salida.push({ origen: clave, archivo: dir, error: "la carpeta no está en R:\\" });
      continue;
    }
    for (const a of archivos) {
      try {
        const huella = createHash("md5").update(readFileSync(a)).digest("hex");
        if (vistos.has(huella)) {
          duplicados++;
          continue;
        }
        vistos.add(huella);
        const d = await extractor.extract(a);
        salida.push({ origen: clave, ...leerCierre(`${d.getBody()}\n${d.getTextboxes?.() ?? ""}`, a) });
      } catch (e) {
        salida.push({ origen: clave, archivo: a.replace(/\\/g, "/"), error: e.message });
      }
    }
  }
  if (duplicados) console.log(`  ${duplicados} archivos con contenido repetido en otra carpeta: se leen una sola vez`);
  return salida;
}
