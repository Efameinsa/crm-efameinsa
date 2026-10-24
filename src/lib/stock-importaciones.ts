import * as XLSX from "xlsx";

/**
 * SUBIR EL STOCK DE IMPORTACIONES, YA CODIFICADO (Lesly y el ing., 21-10-2026).
 *
 * Lesly codificaba a mano la columna CODIFICACION del Excel de Importaciones y
 * se le duplicaban códigos: «subimos esta plantilla y que haya alguna opción
 * que nos diga, oye, a este sí le pertenece este código, no le pertenece este
 * código… y qué es lo que falta codificar y le dé un código tentativo». Este
 * archivo hace las dos cosas sin tocar la base: lee el Excel y propone.
 *
 * QUÉ HOJAS. Solo las de stock («STOCK DE EQUIPOS INDUSTRIALES» y «STOCK DE
 * EQUIPOS LG»). RESERVA y VENDIDO no se suben: «la reserva no la vamos a
 * subir… ya está para un cliente».
 *
 * LOS COSTOS. El 21-10 no se leían («las comerciales van a decir: ah, ya puedo
 * vender sobre esto»). El 23-10 gerencia decidió que sí deben figurar: la columna
 * COSTO se lee y se guarda en inventario_costos, que solo leen operaciones y
 * gerencia (0596). Las comerciales siguen sin verlo.
 *
 * POR QUÉ NO BASTA EL MODELO. La UT075 tiene una decena de códigos: cambia el
 * control (Dual Digital / Unilinc), el calentamiento (GLP, gas natural,
 * eléctrico, vapor), el cilindro (galvanizado / inox) y el voltaje. Se comparan
 * esos rasgos entre la descripción del Excel y la descripción oficial del
 * producto en el CRM; en LG manda el código de sistema (CWG27MSCRS = lavadora,
 * CDG27… = secadora). Así salió el 21-10 que 46 lavadoras Giant C Max estaban
 * con códigos de secadora.
 */

export type EstadoFila = "ok" | "sugerido" | "elegir" | "nuevo" | "revisar" | "falta";

export interface FilaStock {
  hoja: string;
  fila: number;
  /** El código interno de Importaciones (I25014): no es el código del catálogo. */
  item: string | null;
  codigoExcel: string | null;
  modelo: string;
  descripcion: string;
  serie: string | null;
  capacidad: string | null;
  cantidad: number;
  ubicacion: string | null;
  ingreso: string | null;
  marca: string | null;
  /** Proveedor según Importaciones (ALLIANCES LAUNDRY, GMP, SIDI MONDIAL…): el resumen general se agrupa por él (22-10). */
  proveedor?: string | null;
  /** De qué empresa es la máquina, OPEN o EFAMEINSA (Carlos 22-10), si la hoja trae la columna. */
  empresa?: string | null;
  /** Costo de Importaciones (0596): solo lo ven operaciones y gerencia. */
  costo?: number | null;
}

/** OPEN / EFAMEINSA, como lo escriba el Excel («Open », «EFAMEINSA», «Efameinsa S.A.»). */
export function empresaDe(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toUpperCase();
  if (/OPEN/.test(t)) return "OPEN";
  if (/EFAME/.test(t)) return "EFAMEINSA";
  return null;
}

export interface ProductoCatalogo {
  id: string;
  sku: string;
  activo: boolean;
  marca: string | null;
  modelo: string | null;
  nombre: string;
  descripcion: string | null;
  panel: string | null;
  calentamiento: string | null;
  nombreFicha: string | null;
  /** Creado desde una subida de stock y todavía sin ficha ni activar (0576). */
  enPreparacion?: boolean;
}

export interface SerieOcupada {
  serie: string;
  cliente: string | null;
  /** Para llevar a Lesly directo a la ficha y al pedido (reunión 21-10: fue a buscar a mano para quién era). */
  cuentaId?: string | null;
  pedidoId?: string | null;
  pedido?: string | null;
}

/** Lavadora, secadora, rodillo… lo que Lesly pidió ver junto al código (21-10). */
export function tipoEquipo(texto: unknown): string {
  const t = sinTildes(texto);
  if (/LAVADORA|\bLAV\b|LAV\.|LAVAD\./.test(t)) return "lavadora";
  if (/SECADORA|\bSEC\b/.test(t)) return "secadora";
  if (/RODILLO|CALANDRIA/.test(t)) return "rodillo";
  if (/PRENSA/.test(t)) return "prensa";
  if (/MESA/.test(t)) return "mesa de planchado";
  if (/CALDERIN/.test(t)) return "calderín";
  if (/COCHE|CARRO/.test(t)) return "coche";
  return "equipo";
}

/** La configuración en una frase corta: «M9 · 220V 1-3PH», «Unilinc · GLP · inox». */
export function resumenRasgos(r: Rasgos): string {
  return [r.control, r.calentamiento, r.cilindro, r.voltaje, r.sistemaLg, r.apilable === "sí" ? "apilable" : r.apilable === "no" ? "no apilable" : null, r.dosificador]
    .filter(Boolean)
    .join(" · ");
}

export interface Propuesta extends FilaStock {
  estado: EstadoFila;
  motivo: string;
  codigo: string | null;
  candidatos: { sku: string; activo: boolean; choques: string[]; resumen: string }[];
  rasgos: Rasgos;
  tipo: string;
  /** El código propuesto no existe: hay que crear el producto. */
  crear: boolean;
  /**
   * El código que el CRM sugiere cuando el Excel no trae ninguno (Lesly 23-10: «que el CRM
   * le recomiende códigos y ella dé el visto bueno»). Nunca entra solo: queda escrito en la
   * casilla y la máquina entra recién cuando ella pulsa «Entra al almacén».
   */
  sugerido?: string | null;
  /** La serie ya está con un cliente en el CRM. */
  ocupada: { cliente: string | null; cuentaId: string | null; pedidoId: string | null; pedido: string | null } | null;
}

// ------------------------------------------------------------------ texto

const sinTildes = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

const soloAlfanum = (t: unknown) => sinTildes(t).replace(/[^A-Z0-9]/g, "");
const digitos = (t: string) => t.replace(/\D/g, "");

/** La familia del modelo, para que UT055L, UT055 y «UT 055» sean lo mismo. */
export function familia(modelo: unknown): string {
  let m = soloAlfanum(modelo).replace("UTC", "UCT");
  m = m.replace(/^(UT\d{3})[LEN]$/, "$1");
  m = m.replace(/^UW(\d{3})N?$/, "UWT$1");
  m = m.replace(/^WETSS/, "WET");
  // Importaciones escribe UTS30 lo que el catálogo tiene como UT030N (la UT030 con Unilinc).
  m = m.replace(/^UTS(\d\d)$/, "UT0$1").replace(/^UT(\d\d)N$/, "UT0$1");
  return m;
}

const SISTEMA_LG = /C[WD][GT]\d\dM[A-Z]{3}S/;

export interface Rasgos {
  control?: string;
  calentamiento?: string;
  cilindro?: string;
  voltaje?: string;
  sistemaLg?: string;
  apilable?: string;
  tipo?: string;
  /** Sailstar 2026 (Lesly 21-10): llegaron «con sistema de aire FRL y dosificador externo» y no son las mismas que ya están. */
  dosificador?: string;
}

const NOMBRE_RASGO: Record<keyof Rasgos, string> = {
  control: "control",
  calentamiento: "calentamiento",
  cilindro: "cilindro",
  voltaje: "voltaje",
  sistemaLg: "código LG",
  apilable: "apilable",
  tipo: "tipo de equipo",
  dosificador: "aire FRL / dosificador",
};

/** Un código como los escribe Lesly: letras, números y guion. */
const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9-]{1,24}$/;

export function rasgos(texto: unknown): Rasgos {
  const t = sinTildes(texto);
  const r: Rasgos = {};
  if (/UNI?L[IU]?N?[CK]?H?\s*TOUCH|UNLINC|UNILIC/.test(t)) r.control = "Unilinc Touch";
  else if (t.includes("DUAL")) r.control = "Dual Digital";
  else if (/\bM\s?30\b/.test(t)) r.control = "M30";
  else if (/\bM\s?9\b/.test(t)) r.control = "M9";
  else if (/X\s*CONTROL\s*(\+|PLUS)|CONTROL\s*X\s*\+|CONTROL PLUS/.test(t)) r.control = "X Control +";
  else if (/X\s*CONTROL/.test(t)) r.control = "X Control";

  if (t.includes("GLP")) r.calentamiento = "GLP";
  else if (t.includes("NATURAL")) r.calentamiento = "gas natural";
  else if (/ELECTRIC|CALEFACCION ELEC|\bELECT\b|\.ELECT\./.test(t)) r.calentamiento = "eléctrico";
  else if (/DIRECT STEAM|CALENTAMIENTO A VAPOR|DIRECTO CON VAPOR|, VAPOR/.test(t)) r.calentamiento = "vapor";

  if (/CILINDRO[:\s]*GALV|TAMBOR GALV|TAMB\.GAL/.test(t)) r.cilindro = "galvanizado";
  else if (/CILINDRO[:\s]*INOX|CIL\.? INOX|CILN?D?\s*INOX/.test(t)) r.cilindro = "inoxidable";

  if (/380\s*V/.test(t)) r.voltaje = "380V";
  else if (/220\s*V?\s*\/\s*60\s*(HZ)?\s*\/\s*1\s*-\s*3/.test(t)) r.voltaje = "220V 1-3PH";
  else if (/(220|240)\s*V?\s*\/\s*60\s*(HZ)?\s*\/\s*3/.test(t)) r.voltaje = "220V 3PH";
  else if (/220\s*V?\s*\/\s*60\s*(HZ)?\s*\/\s*1\s*(PH|N)/.test(t)) r.voltaje = "220V 1PH";

  const lg = t.match(SISTEMA_LG);
  if (lg) r.sistemaLg = lg[0];
  if (/NO\s+APIL/.test(t)) r.apilable = "no";
  else if (t.includes("APIL")) r.apilable = "sí";
  if (/LAVADORA|\bLAV\b|LAV\.|LAVAD\./.test(t)) r.tipo = "lavadora";
  else if (t.includes("SECADORA")) r.tipo = "secadora";
  // Lo que distingue a las Sailstar nuevas es el sistema de aire FRL (así las codificó Lesly el 21-10:
  // con FRL = variante nueva; solo con dosificador externo = el código de siempre).
  if (/AIRE FRL|AIRE COMPRIMIDO FRL|SISTEMA DE AIRE/.test(t)) r.dosificador = "sistema de aire FRL";
  return r;
}

/** 220V 3PH y 220V 1-3PH no se contradicen: la 1-3 se conecta a las dos. */
function choca(k: keyof Rasgos, a: string, b: string): boolean {
  if (a === b) return false;
  if (k === "voltaje" && [a, b].every((v) => v === "220V 3PH" || v === "220V 1-3PH")) return false;
  return true;
}

// ------------------------------------------------------------------ Excel

function normCabecera(t: unknown) {
  return sinTildes(t).replace(/[^A-Z]/g, "");
}

/** PLANTA, EXHIBICIÓN… Una fórmula o un número en esa celda no es una ubicación. */
export function ubicacionDe(texto: string | null | undefined): string | null {
  const t = (texto ?? "").replace(/^=.*/, "").trim();
  if (!t || /^[\d.,\s-]+$/.test(t)) return null;
  return t;
}

/** La hoja es de stock libre. Reserva y vendidos no se suben. */
export function esHojaDeStock(nombre: string): boolean {
  const n = normCabecera(nombre);
  return n.includes("STOCK") && !n.includes("RESERV") && !n.includes("VENDID");
}

/**
 * Lee las hojas de stock. Cabeceras tolerantes (MODELO / MODELO␠, NOMBRE o
 * DESCRIPCION…). En la hoja LG la columna del código no tiene título: es la
 * primera columna cuando su cabecera está vacía. COSTO se lee (0596).
 */
export interface LecturaStock {
  filas: FilaStock[];
  hojas: string[];
  ignoradas: string[];
  /** Máquinas que están en una hoja suelta (Open / Efameinsa) y Lesly no pasó a la hoja unida: no entran. */
  soloEnSueltas: { hoja: string; serie: string; descripcion: string; empresa: string }[];
}

export function leerExcelStock(datos: ArrayBuffer | Uint8Array): LecturaStock {
  const libro = XLSX.read(datos, { type: "array", cellDates: true });
  const filas: FilaStock[] = [];
  const hojas: string[] = [];
  const ignoradas: string[] = [];

  /** Las máquinas de una hoja, o null si la hoja no tiene cabecera de stock (SERIE + MODELO). */
  const leerHoja = (nombre: string): FilaStock[] | null => {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null });
    const iCab = matriz.findIndex((r) => {
      const c = (r ?? []).map(normCabecera);
      return c.includes("SERIE") && (c.includes("MODELO") || c.includes("MOD"));
    });
    if (iCab < 0) return null;
    const cab = matriz[iCab].map(normCabecera);
    const col = (...nombres: string[]) => cab.findIndex((c) => nombres.includes(c));
    const cCodigo = col("CODIFICACION") >= 0 ? col("CODIFICACION") : cab[0] === "" ? 0 : -1;
    const cItem = col("CODIGO");
    // La hoja unida del 23-10 dice MOD, EQUIPO y «UBICAICION».
    const cModelo = col("MODELO", "MOD");
    const cDesc = col("NOMBRE", "DESCRIPCION", "EQUIPO");
    const cSerie = col("SERIE");
    const cCap = col("CAPACIDAD");
    const cStock = col("STOCK");
    const cSistema = col("SISTEMA");
    const cUbic = col("UBICACION", "UBICAICION");
    const cIngreso = col("INGRESO");
    const cMarca = col("MARCA");
    const cProveedor = col("PROVEEDOR");
    const cCosto = col("COSTO");
    // Carlos (22-10): cada máquina dice si es de Open o de Efameinsa. En las hojas de
    // reserva y vendidos Importaciones lo llama «C. INICIAL» o «SOLICITADO».
    // Desde el 23-10 la hoja unida y la de LG lo dicen en RAZÓN SOCIAL.
    const cEmpresa = col("EMPRESA", "RAZONSOCIAL", "PERTENECE", "CINICIAL", "SOLICITADO", "PROPIETARIO");

    const celda = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
    const textoDe = (v: unknown) => {
      if (v == null) return null;
      const s = String(v).trim();
      return s && !s.startsWith("=") ? s : null;
    };

    const deLaHoja: FilaStock[] = [];
    matriz.slice(iCab + 1).forEach((r, k) => {
      const item = textoDe(celda(r, cItem));
      // Las filas de subtítulo («SECADORA 15 KG - LG») y de totales no tienen ítem.
      if (!item || !/^[A-Z]{0,2}\d{3,}/i.test(item)) return;
      const modelo = [textoDe(celda(r, cModelo)), textoDe(celda(r, cSistema))].filter(Boolean).join(" ");
      const ingreso = celda(r, cIngreso);
      const serieTxt = textoDe(celda(r, cSerie));
      deLaHoja.push({
        hoja: nombre.trim(),
        fila: iCab + 2 + k,
        item,
        codigoExcel: textoDe(celda(r, cCodigo))?.toUpperCase() ?? null,
        modelo,
        descripcion: textoDe(celda(r, cDesc)) ?? "",
        // Una «serie» sin dígitos o vacía no es serie. El 1, 2, 3… de las mesas BIMAP es su
        // correlativo de caja y queda como serie (Santos 23-10, 0595): vale dentro de su código.
        serie: serieTxt && (esCorrelativo(serieTxt) || (/\d/.test(serieTxt) && serieTxt.length >= 3)) ? serieTxt.toUpperCase() : null,
        capacidad: textoDe(celda(r, cCap)),
        cantidad: Math.max(0, Math.round(Number(celda(r, cStock)) || 0)),
        // En dos filas del Excel del 22-10 la celda UBICACIÓN traía un número (un costo
        // corrido de columna): una ubicación es una palabra (PLANTA, EXHIBICIÓN), nunca un número.
        ubicacion: ubicacionDe(textoDe(celda(r, cUbic))),
        ingreso: ingreso instanceof Date ? ingreso.toISOString().slice(0, 10) : null,
        marca: textoDe(celda(r, cMarca)) ?? (/LG/i.test(nombre) ? "LG" : null),
        proveedor: textoDe(celda(r, cProveedor)) ?? (/LG/i.test(nombre) ? "LG" : null),
        empresa: empresaDe(textoDe(celda(r, cEmpresa))),
        costo: (() => {
          const v = celda(r, cCosto);
          const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
          return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
        })(),
      });
    });
    return deLaHoja;
  };

  // Lesly (23-10 14:24): «STOCK PARA SANTOS» es la hoja que ella une con las industriales de
  // Open y de Efameinsa. Si el libro la trae, las hojas sueltas no se leen (serían las mismas
  // máquinas dos veces); LG va aparte y se lee siempre.
  const hayUnida = libro.SheetNames.some((n) => esHojaDeStock(n) && normCabecera(n).includes("SANTOS"));
  const esSuelta = (n: string) => hayUnida && esHojaDeStock(n) && !normCabecera(n).includes("SANTOS") && !/LG/i.test(n);
  for (const nombre of libro.SheetNames) {
    const deLaHoja = !esHojaDeStock(nombre) || esSuelta(nombre) ? null : leerHoja(nombre);
    if (!deLaHoja) {
      ignoradas.push(nombre.trim());
      continue;
    }
    hojas.push(nombre.trim());
    filas.push(...deLaHoja);
  }

  // Santos (23-10 16:20): «ahí hay Efameinsa y Open». En la hoja unida Lesly dejó RAZÓN SOCIAL
  // en «EFAMEINSA» para todas las filas, también para las 19 que vienen de «STOCK INDUSTRIALES
  // PROV. OPEN». La hoja suelta de la que sale cada máquina dice de quién es: manda sobre la
  // columna. Y lo que está en una suelta y no pasó a la unida se avisa, porque no entra.
  const soloEnSueltas: LecturaStock["soloEnSueltas"] = [];
  const empresaPorSerie = new Map<string, string>();
  const enLaUnida = new Set(filas.filter((f) => f.serie).map((f) => f.serie!));
  for (const nombre of libro.SheetNames) {
    const empresa = empresaDe(nombre);
    if (!esSuelta(nombre) || !empresa) continue;
    for (const f of leerHoja(nombre) ?? []) {
      if (!f.serie) continue;
      empresaPorSerie.set(f.serie, empresa);
      if (!enLaUnida.has(f.serie)) soloEnSueltas.push({ hoja: nombre.trim(), serie: f.serie, descripcion: f.descripcion || f.modelo, empresa });
    }
  }
  for (const f of filas) {
    const deSuelta = f.serie ? empresaPorSerie.get(f.serie) : undefined;
    if (deSuelta) f.empresa = deSuelta;
  }
  return { filas, hojas, ignoradas, soloEnSueltas };
}

// ------------------------------------------------------------------ comparar

/** «PROFLEX» es la familia de «PROFLEX1001600226»: solo para familias con nombre (no números cortos). */
function esPrefijo(corto: string, largo: string): boolean {
  return corto.length >= 5 && /[A-Z]{4}/.test(corto) && largo.length > corto.length && largo.startsWith(corto);
}

interface Candidato {
  p: ProductoCatalogo;
  familias: Set<string>;
  r: Rasgos;
}

const PALABRAS_LG = ["TITAN LIGHT", "TITAN MAX", "GIANT C MAX", "GIANT C"];

function prepararCatalogo(productos: ProductoCatalogo[]): Candidato[] {
  return productos
    .filter((p) => p.sku && !/^(SER|IM|EJ-)/i.test(p.sku))
    .map((p) => {
      // Manda la descripción oficial; la ficha (panel, calentamiento, nombre del Word) solo rellena.
      const r = rasgos([p.modelo, p.nombre, p.descripcion].join(" "));
      const deFicha = rasgos([p.panel, p.calentamiento, p.nombreFicha].join(" "));
      for (const k of Object.keys(deFicha) as (keyof Rasgos)[]) r[k] ??= deFicha[k];
      if (!r.calentamiento && /VAP/i.test(p.sku)) r.calentamiento = "vapor";
      // Un producto con descripción que no nombra el dosificador externo NO lo trae: las Sailstar nuevas sí.
      if (!r.dosificador && p.descripcion) r.dosificador = "sin sistema de aire FRL";
      const familias = new Set([familia(p.modelo)]);
      const m = sinTildes(p.modelo);
      const lg = PALABRAS_LG.find((w) => m.includes(w));
      if (lg) familias.add(soloAlfanum(lg));
      for (const x of sinTildes(p.descripcion).matchAll(/MOD(?:ELO)?[.:\s]*([A-Z0-9][A-Z0-9 .\-]{2,14}?)(?=,|\s\s|\s[A-Z]{3,}|$)/g)) {
        if (/\d/.test(x[1])) familias.add(familia(x[1]));
      }
      return { p, familias, r };
    });
}

function modeloDeLaDescripcion(desc: string): string | null {
  const m = sinTildes(desc).match(/MOD[.:\s]*([A-Z0-9][A-Z0-9 .\-]{2,12}?)(?=,|\s\s|\s[A-Z]{3,}|$)/);
  return m && /\d/.test(m[1]) ? m[1].trim() : null;
}

/** Siguiente código libre de una familia: LAVW065 → LAVW0651, PROF01 → PROF02. Nunca reutiliza uno retirado. */
export function siguienteCodigoLibre(base: string, ocupados: Set<string>): string {
  const b = base.toUpperCase();
  const m = b.match(/^(.*?)0(\d)$/);
  if (m) {
    for (let n = Number(m[2]) + 1; n <= 9; n++) if (!ocupados.has(`${m[1]}0${n}`)) return `${m[1]}0${n}`;
  }
  if (!ocupados.has(b)) return b;
  for (let n = 1; n < 100; n++) if (!ocupados.has(`${b}${n}`)) return `${b}${n}`;
  return `${b}-${Date.now() % 1000}`;
}

/** Código para un modelo que no tiene ninguno parecido: prefijo por tipo + el modelo. */
function codigoDesdeCero(fila: Pick<FilaStock, "modelo" | "descripcion" | "marca">, r: Rasgos): string {
  const d = sinTildes(fila.descripcion);
  const unimac = /UNIMAC|ALLIANCE/.test(sinTildes(fila.marca)) || /UNIMAC/.test(d);
  const prefijo =
    r.tipo === "lavadora" ? "LAV"
    : r.tipo === "secadora" ? (unimac ? "SECU" : "SEC")
    : /MESA/.test(d) ? "ME"
    : /RODILLO|CALANDRIA/.test(d) ? "CAL"
    : /PRENSA/.test(d) ? "PR"
    : /COCHE|CARRO/.test(d) ? "CO"
    : "EQ";
  const mod = soloAlfanum(fila.modelo.split(" ")[0]).replace(/^(UT|UWT|UW|UCT|RX|FX|UY)/, "");
  return prefijo + (mod.slice(0, 8) || "X");
}

export function emparejar(
  filas: FilaStock[],
  productos: ProductoCatalogo[],
  seriesOcupadas: SerieOcupada[],
): Propuesta[] {
  const catalogo = prepararCatalogo(productos);
  const porSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));
  const ocupados = new Set(productos.map((p) => p.sku.toUpperCase()));
  const ocupadas = new Map(seriesOcupadas.map((s) => [s.serie.toUpperCase(), s]));
  // Misma configuración = mismo código tentativo («si es lo mismo, le pongo el mismo código»).
  const tentativos = new Map<string, string>();

  return filas.map((f) => {
    const r = rasgos(`${f.descripcion} ${f.modelo}`);
    const esLg = !!r.sistemaLg || /LG/i.test(f.hoja);
    const familias = new Set<string>();
    let avisoModelo: string | null = null;
    if (!esLg) {
      familias.add(familia(f.modelo));
      const md = modeloDeLaDescripcion(f.descripcion);
      if (md) {
        if (digitos(familia(md)) !== digitos(familia(f.modelo))) {
          avisoModelo = `La columna MODELO dice ${f.modelo} pero la descripción dice ${md}`;
        }
        familias.add(familia(md));
      }
    }
    const familiaLg = soloAlfanum(sinTildes(f.modelo).replace(new RegExp(SISTEMA_LG.source, "g"), ""));

    const evaluados = catalogo
      .filter((c) => {
        if (esLg) {
          const enTexto = r.sistemaLg && sinTildes(`${c.p.nombre} ${c.p.modelo} ${c.p.descripcion}`).includes(r.sistemaLg);
          return enTexto || (c.familias.has(familiaLg) && c.r.tipo === r.tipo);
        }
        return [...familias].some((x) => c.familias.has(x) || [...c.familias].some((cf) => esPrefijo(cf, x)));
      })
      .map((c) => {
        let puntos = c.p.activo ? 0.5 : -2;
        const choques: string[] = [];
        // Misma familia pero modelo más largo en el Excel (PROFLEX → PROFLEX 100-16-00/226): parecido, no igual.
        if (!esLg && ![...familias].some((x) => c.familias.has(x))) {
          choques.push(`modelo: Excel ${f.modelo} / CRM ${c.p.modelo ?? ""}`);
          puntos -= 3;
        }
        for (const k of Object.keys(NOMBRE_RASGO) as (keyof Rasgos)[]) {
          const a = r[k];
          const b = c.r[k];
          if (!a || !b) continue;
          if (choca(k, a, b)) {
            choques.push(`${NOMBRE_RASGO[k]}: Excel ${a} / CRM ${b}`);
            puntos -= 3;
          } else puntos += 1;
        }
        // La torre LG (dos sistemas) no compite con la unidad suelta.
        if (esLg && (`${c.p.nombre} ${c.p.modelo}`.match(new RegExp(SISTEMA_LG.source, "g")) ?? []).length > 1) puntos -= 2;
        return { c, puntos, choques };
      })
      .sort((a, b) => b.puntos - a.puntos);

    const limpios = evaluados.filter((e) => e.choques.length === 0 && e.c.p.activo);
    const mejor = limpios[0];
    const empatados = mejor ? limpios.filter((e) => e.puntos === mejor.puntos) : [];
    const unico = mejor && empatados.length === 1 ? mejor.c.p.sku.toUpperCase() : null;
    const candidatos = evaluados
      .slice(0, 6)
      .map((e) => ({ sku: e.c.p.sku.toUpperCase(), activo: e.c.p.activo, choques: e.choques, resumen: resumenRasgos({ ...e.c.r, dosificador: e.c.r.dosificador?.startsWith("sin") ? undefined : e.c.r.dosificador }) }));

    let estado: EstadoFila;
    let motivo: string;
    let codigo: string | null = null;
    let crear = false;

    if (f.codigoExcel) {
      const propio = porSku.get(f.codigoExcel);
      const c = propio && catalogo.find((x) => x.p.id === propio.id);
      const choques = c
        ? (Object.keys(NOMBRE_RASGO) as (keyof Rasgos)[])
            .filter((k) => r[k] && c.r[k] && choca(k, r[k]!, c.r[k]!))
            .map((k) => `${NOMBRE_RASGO[k]}: Excel ${r[k]} / CRM ${c.r[k]}`)
        : [];
      if (!propio && unico) {
        // Lo que no existe es el CÓDIGO, no la máquina (Santos 21-10: la UCT080 sí está, como LAVT080).
        estado = "revisar";
        codigo = unico;
        motivo = `El código ${f.codigoExcel} no existe en el catálogo, pero esta máquina (${f.modelo}) SÍ está, con el código ${unico}: usar ${unico}`;
      } else if (!propio && CODIGO_VALIDO.test(f.codigoExcel)) {
        // Lesly ya escribió el código nuevo en su Excel (21-10 tarde: PROF02, LAVG501…): se crea con ese.
        estado = "nuevo";
        crear = true;
        codigo = f.codigoExcel;
        ocupados.add(codigo);
        motivo = evaluados[0]
          ? `Lesly ya le puso ${f.codigoExcel} en su Excel. Ese código todavía no está en el catálogo: al subir se agrega (el más parecido, ${evaluados[0].c.p.sku}, difiere en ${evaluados[0].choques.join("; ") || "el modelo"})`
          : `Lesly ya le puso ${f.codigoExcel} en su Excel. Ese código todavía no está en el catálogo: al subir se agrega`;
      } else if (!propio) {
        estado = "revisar";
        codigo = null;
        motivo = `«${f.codigoExcel}» no parece un código (solo letras, números y guion) y no encontré la máquina en el catálogo`;
      } else if (choques.length) {
        estado = "revisar";
        motivo = `El código ${f.codigoExcel} no calza: ${choques.join("; ")}`;
        codigo = unico;
      } else if (!propio.activo) {
        // Existe pero está retirado: las máquinas entran y Lesly lo activa cuando tenga la ficha.
        estado = "nuevo";
        crear = false;
        codigo = f.codigoExcel;
        motivo = `El código ${f.codigoExcel} existe pero está retirado del catálogo: las máquinas entran con él y queda por ponerle ficha y activarlo`;
      } else {
        estado = "ok";
        motivo = "El código que puso Lesly está bien";
        codigo = f.codigoExcel;
      }
    } else if (unico) {
      estado = "sugerido";
      motivo = "Ese código ya existe en el catálogo con la misma configuración: solo faltaba ponerlo";
      codigo = unico;
    } else if (empatados.length > 1) {
      estado = "elegir";
      motivo = `Calzan igual: ${empatados.map((e) => e.c.p.sku).join(", ")}. Elija uno`;
    } else {
      // No existe esta configuración: código tentativo, compartido por las máquinas iguales.
      const firma = `${esLg ? familiaLg : [...familias][0]}|${JSON.stringify(r)}`;
      const retirado = evaluados.find((e) => !e.c.p.activo && e.choques.length === 0);
      if (retirado) {
        codigo = retirado.c.p.sku.toUpperCase();
        motivo = `El código ${codigo} existe pero está retirado del catálogo: reactivarlo en vez de crear otro`;
      } else {
        codigo = tentativos.get(firma) ?? null;
        if (!codigo) {
          // La base es el código del MISMO modelo (FX180 → LAVF180 → LAVF1801; UWT065 → LAVW065 → LAVW0651),
          // que es como Lesly numera las variantes; si no hay, el más parecido.
          const mismoModelo = evaluados.find((e) => e.c.p.activo && [...familias].includes(familia(e.c.p.modelo)));
          const base = (mismoModelo ?? evaluados[0])?.c.p.sku ?? codigoDesdeCero(f, r);
          codigo = siguienteCodigoLibre(base, ocupados);
          ocupados.add(codigo);
          tentativos.set(firma, codigo);
        }
        crear = true;
        motivo = evaluados[0]
          ? `Ningún código tiene esta configuración (el más parecido, ${evaluados[0].c.p.sku}, difiere en ${evaluados[0].choques.join("; ") || "algo"}). Código tentativo`
          : "Este modelo no está en el CRM. Código tentativo";
      }
      estado = "nuevo";
    }

    const avisos: string[] = [];
    if (avisoModelo) avisos.push(avisoModelo);
    const ocupada = f.serie && !esCorrelativo(f.serie) ? ocupadas.get(f.serie) : undefined;
    if (f.serie && ocupada !== undefined) {
      // Lesly (21-10): «Importaciones me ha dado la liquidación después que ya hemos vendido la máquina».
      avisos.push(
        `Esta serie ya está en el CRM con ${ocupada?.cliente ?? "un cliente"}${ocupada?.pedido ? ` (pedido ${ocupada.pedido})` : ""}: ya se vendió o está reservada. Pásela a vendido o reserva en el Excel; aquí no se sube como stock libre`,
      );
    }
    if (avisos.length) {
      estado = "revisar";
      motivo = [...avisos, motivo].join(". ");
    }
    // El Excel a veces pone 1, 2, 3… en SERIE (las mesas BIMAP): eso no es una serie de placa.
    if (!f.serie && f.cantidad > 0 && /\d/.test(f.descripcion) && estado !== "ok") {
      motivo += ". Sin serie de placa en el Excel: entra como unidades, no por serie";
    }

    return {
      ...f,
      estado,
      motivo,
      codigo,
      candidatos,
      rasgos: r,
      tipo: tipoEquipo(`${f.descripcion} ${f.modelo}`),
      crear,
      ocupada: ocupada ? { cliente: ocupada.cliente, cuentaId: ocupada.cuentaId ?? null, pedidoId: ocupada.pedidoId ?? null, pedido: ocupada.pedido ?? null } : null,
    };
  });
}

/**
 * MANDA EL EXCEL DE LESLY (Santos, 21-10 tarde: «mejor no te guíes del
 * catálogo»). El código que Lesly escribió es el que vale: no se compara con la
 * configuración de los productos ni se propone otro. Solo se avisa lo que de
 * verdad no se puede subir:
 *   · casilla sin código → «Falta código» (no se sugiere nada);
 *   · una serie que el CRM ya tiene con un cliente → «Revisar», viene «No subir»;
 *   · un mismo código puesto a modelos distintos dentro del propio Excel;
 *   · algo que no parece un código.
 * Del sistema solo se usa si el código ya existe (para darlo de alta o no al
 * subir), nunca para corregirlo.
 */
export function revisarSegunExcel(filas: FilaStock[], productos: ProductoCatalogo[], seriesOcupadas: SerieOcupada[]): Propuesta[] {
  const porSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));
  const ocupadas = new Map(seriesOcupadas.map((s) => [s.serie.toUpperCase(), s]));
  // El modelo de cada fila: el que dice la descripción si lo dice (SS23E), si no la columna MODELO.
  const modeloDe = (f: FilaStock) => {
    if (/LG/i.test(f.hoja)) return soloAlfanum(f.modelo);
    const md = modeloDeLaDescripcion(f.descripcion);
    return familia(md ?? f.modelo);
  };
  const modelosPorCodigo = new Map<string, Set<string>>();
  for (const f of filas) {
    if (!f.codigoExcel) continue;
    const m = modelosPorCodigo.get(f.codigoExcel) ?? new Set<string>();
    m.add(modeloDe(f));
    modelosPorCodigo.set(f.codigoExcel, m);
  }
  // Una serie de placa es una sola máquina: dos filas con la misma (los rodillos YC8-30 del
  // 23-10 traen las dos «16002») se taparían una a la otra en el almacén.
  const vecesSerie = new Map<string, number>();
  for (const f of filas) if (f.serie && !esCorrelativo(f.serie)) vecesSerie.set(f.serie, (vecesSerie.get(f.serie) ?? 0) + 1);

  // LO QUE EL CRM SUGIERE (Lesly 23-10): donde el Excel no trae código, o trae uno puesto a
  // modelos distintos, se compara la configuración con el catálogo como en «Códigos y series».
  // Manda el Excel: esto solo propone; no cambia un código que Lesly escribió.
  const aSugerir = filas.filter((f) => !f.codigoExcel || (modelosPorCodigo.get(f.codigoExcel)?.size ?? 0) > 1);
  const sugerencias = new Map<FilaStock, Propuesta>();
  if (aSugerir.length > 0) emparejar(aSugerir.map((f) => ({ ...f, codigoExcel: null })), productos, []).forEach((p, i) => sugerencias.set(aSugerir[i], p));
  const ocupadosSku = new Set(productos.map((p) => p.sku.toUpperCase()));

  return filas.map((f) => {
    const r = rasgos(`${f.descripcion} ${f.modelo}`);
    const tipo = tipoEquipo(`${f.descripcion} ${f.modelo}`);
    const ocupada = f.serie && !esCorrelativo(f.serie) ? ocupadas.get(f.serie) : undefined;
    let estado: EstadoFila;
    let motivo: string;
    let codigo: string | null = f.codigoExcel;
    let crear = false;

    const sug = sugerencias.get(f);
    const iguales = sug ? sug.candidatos.filter((c) => c.choques.length === 0) : [];
    // Un código del catálogo con la misma configuración; si hay varios, el primero (los demás quedan como opciones);
    // si no hay ninguno, el código nuevo que el CRM arma sin repetir ninguno, ni los retirados.
    const sugerido = !sug
      ? null
      : sug.codigo && !sug.crear
        ? sug.codigo
        : iguales[0]?.sku ?? (sug.crear && sug.codigo ? sug.codigo : siguienteCodigoLibre(sug.candidatos[0]?.sku ?? "EQ", ocupadosSku));
    const sugeridoEsNuevo = !!sugerido && !porSku.has(sugerido);

    if (!f.codigoExcel) {
      estado = "falta";
      codigo = null;
      motivo = sugerido
        ? sugeridoEsNuevo
          ? `En el Excel no tiene código. El CRM sugiere ${sugerido}, un código NUEVO: en el catálogo no hay uno con esta configuración. Revíselo y dé el visto bueno con «Entra al almacén», o escriba otro`
          : `En el Excel no tiene código. El CRM sugiere ${sugerido}${iguales.length > 1 ? ` (hay ${iguales.length} iguales en el catálogo: elija el que corresponde)` : ", que ya existe con la misma configuración"}. Dé el visto bueno con «Entra al almacén», o escriba otro`
        : "En el Excel no tiene código. Escriba el código que le corresponde";
    } else if (!CODIGO_VALIDO.test(f.codigoExcel)) {
      estado = "revisar";
      codigo = null;
      motivo = `«${f.codigoExcel}» no parece un código (solo letras, números y guion)`;
    } else if ((modelosPorCodigo.get(f.codigoExcel)?.size ?? 0) > 1) {
      estado = "revisar";
      motivo = `En el Excel el código ${f.codigoExcel} está puesto a modelos distintos (${[...modelosPorCodigo.get(f.codigoExcel)!].join(", ")}). Confirme que es el mismo equipo`;
      if (sugerido && sugerido !== f.codigoExcel) motivo += `. Para esta máquina el CRM sugiere ${sugerido}`;
    } else {
      const p = porSku.get(f.codigoExcel);
      if (!p) {
        estado = "nuevo";
        crear = true;
        motivo = `Código de Lesly. Todavía no está dado de alta en el sistema: al subir se agrega`;
      } else if (!p.activo) {
        estado = "nuevo";
        motivo = `Código de Lesly. Está retirado en el sistema: las máquinas entran con él y queda por activarlo`;
      } else {
        estado = "ok";
        motivo = "Código de Lesly";
      }
    }

    if (f.serie && (vecesSerie.get(f.serie) ?? 0) > 1) {
      estado = "revisar";
      motivo = `La serie ${f.serie} está en más de una fila del Excel. Cada máquina tiene su propia serie: corrija la que no es`;
    }
    if (ocupada) {
      estado = "revisar";
      motivo = `Esta serie ya está en el CRM con ${ocupada.cliente ?? "un cliente"}${ocupada.pedido ? ` (pedido ${ocupada.pedido})` : ""}: ya se vendió o está reservada. Pásela a vendido o reserva en el Excel; aquí no se sube como stock libre`;
    }
    if (!f.serie && f.cantidad > 0 && /MESA|PROFLEX/i.test(`${f.descripcion} ${f.modelo}`)) {
      motivo += ". Sin serie de placa en el Excel: entra como unidades, no por serie";
    }

    return {
      ...f,
      estado,
      motivo,
      codigo,
      candidatos: sug ? sug.candidatos : [],
      sugerido: estado === "falta" ? sugerido : null,
      rasgos: r,
      tipo,
      crear,
      ocupada: ocupada ? { cliente: ocupada.cliente, cuentaId: ocupada.cuentaId ?? null, pedidoId: ocupada.pedidoId ?? null, pedido: ocupada.pedido ?? null } : null,
    };
  });
}

/**
 * Un número de 1 a 3 cifras en SERIE es el correlativo de caja que Importaciones pone
 * a lo que no trae serie de placa (mesas BIMAP: 1, 2, 3…). Es serie, pero solo dentro
 * de su código: otra marca puede numerar sus cajas igual (0595).
 */
export const esCorrelativo = (serie: string | null | undefined) => /^\d{1,3}$/.test(String(serie ?? "").trim());
