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
 * LOS COSTOS NO SE LEEN. «No se tiene que subir… si subimos esto nos va a
 * cargar el precio y las comerciales van a decir: ah, ya puedo vender sobre
 * esto». La columna COSTO no se mapea a ningún campo: no viaja ni al servidor
 * ni a la base.
 *
 * POR QUÉ NO BASTA EL MODELO. La UT075 tiene una decena de códigos: cambia el
 * control (Dual Digital / Unilinc), el calentamiento (GLP, gas natural,
 * eléctrico, vapor), el cilindro (galvanizado / inox) y el voltaje. Se comparan
 * esos rasgos entre la descripción del Excel y la descripción oficial del
 * producto en el CRM; en LG manda el código de sistema (CWG27MSCRS = lavadora,
 * CDG27… = secadora). Así salió el 21-10 que 46 lavadoras Giant C Max estaban
 * con códigos de secadora.
 */

export type EstadoFila = "ok" | "sugerido" | "elegir" | "nuevo" | "revisar";

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
}

export interface SerieOcupada {
  serie: string;
  cliente: string | null;
}

export interface Propuesta extends FilaStock {
  estado: EstadoFila;
  motivo: string;
  codigo: string | null;
  candidatos: { sku: string; activo: boolean; choques: string[] }[];
  rasgos: Rasgos;
  /** El código propuesto no existe: hay que crear el producto. */
  crear: boolean;
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
}

const NOMBRE_RASGO: Record<keyof Rasgos, string> = {
  control: "control",
  calentamiento: "calentamiento",
  cilindro: "cilindro",
  voltaje: "voltaje",
  sistemaLg: "código LG",
  apilable: "apilable",
  tipo: "tipo de equipo",
};

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

/** La hoja es de stock libre. Reserva y vendidos no se suben. */
export function esHojaDeStock(nombre: string): boolean {
  const n = normCabecera(nombre);
  return n.includes("STOCK") && !n.includes("RESERV") && !n.includes("VENDID");
}

/**
 * Lee las hojas de stock. Cabeceras tolerantes (MODELO / MODELO␠, NOMBRE o
 * DESCRIPCION…). En la hoja LG la columna del código no tiene título: es la
 * primera columna cuando su cabecera está vacía. COSTO no se lee.
 */
export function leerExcelStock(datos: ArrayBuffer | Uint8Array): { filas: FilaStock[]; hojas: string[]; ignoradas: string[] } {
  const libro = XLSX.read(datos, { type: "array", cellDates: true });
  const filas: FilaStock[] = [];
  const hojas: string[] = [];
  const ignoradas: string[] = [];

  for (const nombre of libro.SheetNames) {
    if (!esHojaDeStock(nombre)) {
      ignoradas.push(nombre.trim());
      continue;
    }
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null });
    const iCab = matriz.findIndex((r) => {
      const c = (r ?? []).map(normCabecera);
      return c.includes("SERIE") && c.includes("MODELO");
    });
    if (iCab < 0) {
      ignoradas.push(nombre.trim());
      continue;
    }
    hojas.push(nombre.trim());
    const cab = matriz[iCab].map(normCabecera);
    const col = (...nombres: string[]) => cab.findIndex((c) => nombres.includes(c));
    const cCodigo = col("CODIFICACION") >= 0 ? col("CODIFICACION") : cab[0] === "" ? 0 : -1;
    const cItem = col("CODIGO");
    const cModelo = col("MODELO");
    const cDesc = col("NOMBRE", "DESCRIPCION");
    const cSerie = col("SERIE");
    const cCap = col("CAPACIDAD");
    const cStock = col("STOCK");
    const cSistema = col("SISTEMA");
    const cUbic = col("UBICACION");
    const cIngreso = col("INGRESO");
    const cMarca = col("MARCA");

    const celda = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
    const textoDe = (v: unknown) => {
      if (v == null) return null;
      const s = String(v).trim();
      return s && !s.startsWith("=") ? s : null;
    };

    matriz.slice(iCab + 1).forEach((r, k) => {
      const item = textoDe(celda(r, cItem));
      // Las filas de subtítulo («SECADORA 15 KG - LG») y de totales no tienen ítem.
      if (!item || !/^[A-Z]{0,2}\d{3,}/i.test(item)) return;
      const modelo = [textoDe(celda(r, cModelo)), textoDe(celda(r, cSistema))].filter(Boolean).join(" ");
      const ingreso = celda(r, cIngreso);
      const serieTxt = textoDe(celda(r, cSerie));
      filas.push({
        hoja: nombre.trim(),
        fila: iCab + 2 + k,
        item,
        codigoExcel: textoDe(celda(r, cCodigo))?.toUpperCase() ?? null,
        modelo,
        descripcion: textoDe(celda(r, cDesc)) ?? "",
        // Una «serie» sin dígitos (1, 2, 3 en las mesas BIMAP sí tienen) o vacía no es serie.
        serie: serieTxt && /\d/.test(serieTxt) && serieTxt.length >= 3 ? serieTxt.toUpperCase() : null,
        capacidad: textoDe(celda(r, cCap)),
        cantidad: Math.max(0, Math.round(Number(celda(r, cStock)) || 0)),
        ubicacion: textoDe(celda(r, cUbic))?.replace(/^=.*/, "") || null,
        ingreso: ingreso instanceof Date ? ingreso.toISOString().slice(0, 10) : null,
        marca: textoDe(celda(r, cMarca)) ?? (/LG/i.test(nombre) ? "LG" : null),
      });
    });
  }
  return { filas, hojas, ignoradas };
}

// ------------------------------------------------------------------ comparar

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
  const ocupadas = new Map(seriesOcupadas.map((s) => [s.serie.toUpperCase(), s.cliente]));
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
        return [...familias].some((x) => c.familias.has(x));
      })
      .map((c) => {
        let puntos = c.p.activo ? 0.5 : -2;
        const choques: string[] = [];
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
    const candidatos = evaluados.slice(0, 6).map((e) => ({ sku: e.c.p.sku.toUpperCase(), activo: e.c.p.activo, choques: e.choques }));

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
      if (!propio) {
        estado = "revisar";
        motivo = `El código ${f.codigoExcel} no existe en el CRM`;
        codigo = unico;
      } else if (choques.length) {
        estado = "revisar";
        motivo = `El código ${f.codigoExcel} no calza: ${choques.join("; ")}`;
        codigo = unico;
      } else if (!propio.activo) {
        estado = "revisar";
        motivo = `El código ${f.codigoExcel} está retirado del catálogo`;
        codigo = unico ?? f.codigoExcel;
      } else {
        estado = "ok";
        motivo = "El código que puso Lesly está bien";
        codigo = f.codigoExcel;
      }
    } else if (unico) {
      estado = "sugerido";
      motivo = "Ya hay un código en el CRM con esta misma configuración";
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
          const base = evaluados[0]?.c.p.sku ?? codigoDesdeCero(f, r);
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
    if (f.serie && ocupadas.has(f.serie)) {
      const cliente = ocupadas.get(f.serie);
      avisos.push(`Esta serie ya está en el CRM con ${cliente ?? "un cliente"}: ¿se vendió o está reservada? No se sube como stock libre`);
    }
    if (avisos.length) {
      estado = "revisar";
      motivo = [...avisos, motivo].join(". ");
    }

    return { ...f, estado, motivo, codigo, candidatos, rasgos: r, crear };
  });
}
