/**
 * «¿ES EL MISMO CLIENTE?» — candidatas por apellido raro compartido o por
 * distrito + rubro (ítem 9 de la reunión del 22-09).
 *
 * Carlos, 11:00: «A mí cuando han derivado un cliente relacionado a otro me
 * aparece por defecto: dos relacionados, y yo puedo abrir. Acá Ruiz Pangalima
 * solamente aparece él.» El panel de relacionados de hoy se arma por RUC o
 * teléfono; con nombres escritos distinto y sin RUC (el caso real: tres
 * fichas de INVERSIONES HUAMAN RUIZ) no hay nada que cruzar.
 *
 * «RARO» SE VERIFICA, NO SE ADIVINA. El primer intento marcaba «raro» a
 * cualquier palabra de 6 letras que no fuera una sigla o del rubro, y
 * «HUAMAN» pasaba esa prueba — pero es un apellido de 241 cuentas en una
 * cartera de 16.226, así que cada ficha de un Huamán sugería casi cualquier
 * otro Huamán. `tokensRaros` junta palabras SEGUIDAS en pares en vez de
 * palabras sueltas, y quien llama a esto todavía debe descartar los pares que
 * resulten comunes contando cuántas cuentas los llevan (`candidatosMismoCliente`
 * en `lib/acciones/cuentas.ts` es quien hace esa cuenta, porque necesita la
 * base).
 *
 * Esto SOLO sugiere — nunca une sola: la persona mira las dos fichas y decide.
 * Por eso se muestra únicamente cuando la ficha actual no tiene RUC: con RUC,
 * el documento manda y no hay ambigüedad que resolver por parecido de nombre.
 */

const GENERICAS = new Set([
  "SRL",
  "SAC",
  "SA",
  "SAA",
  "EIRL",
  "SCRL",
  "LTDA",
  "CIA",
  "INVERSIONES",
  "CORPORACION",
  "CORPORATION",
  "EMPRESA",
  "GRUPO",
  "COMERCIAL",
  "SERVICIOS",
  "GENERAL",
  "GENERALES",
  "SOCIEDAD",
  "ANONIMA",
  "CERRADA",
  "RESPONSABILIDAD",
  "LIMITADA",
  "HOTEL",
  "HOSTAL",
  "HOSPEDAJE",
  "RESORT",
  "LODGE",
  "PERU",
  "LIMA",
  "INDUSTRIAL",
  "INDUSTRIALES",
  "NEGOCIOS",
  "COMPANIA",
  "AGRICOLA",
  "AGROINDUSTRIAL",
]);

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

/** ¿Distingue esta palabra, sola, algo? Ni sigla societaria ni palabra de rubro, y con 4 letras por lo menos. */
function esDistintiva(palabra: string): boolean {
  return palabra.length >= 4 && palabra !== "-" && !GENERICAS.has(palabra);
}

/**
 * Las frases que de verdad distinguen esta razón social de cualquier otra.
 *
 * UNA PALABRA SOLA NO ALCANZA, aunque sea larga y no esté en la lista de
 * genéricas: «HUAMAN» tiene 241 cuentas de 16.226 — es un apellido común, no
 * un apellido raro. «HUAMAN RUIZ», las dos palabras SEGUIDAS tal como están
 * en el texto, la tienen solo 2 — que es justo el caso real que probó esto
 * (INVERSIONES HUAMAN RUIZ S.R.L., escrito de dos formas distintas). Por eso
 * se buscan pares de palabras distintivas adyacentes primero, y solo se cae a
 * una palabra sola cuando el nombre no tiene ninguna pareja que ofrecer.
 */
export function tokensRaros(razonSocial: string): string[] {
  const crudo = sinTildes(razonSocial).replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  const frases: string[] = [];
  for (let i = 0; i < crudo.length - 1; i++) {
    if (esDistintiva(crudo[i]) && esDistintiva(crudo[i + 1])) frases.push(`${crudo[i]} ${crudo[i + 1]}`);
  }
  if (frases.length > 0) return frases;
  return crudo.filter((p) => esDistintiva(p) && p.length >= 6);
}

export interface CandidataRelacionada {
  id: string;
  razonSocial: string;
  numDoc: string | null;
  distrito: string | null;
  rubroNombre: string | null;
  comercialNombre: string | null;
  /** Por qué se sugiere: «apellido compartido: HUAMAN» o «mismo distrito y rubro». */
  motivo: string;
}
