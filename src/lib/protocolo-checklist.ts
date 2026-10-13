/**
 * LA HOJA DE CHEQUEO DEL PROTOCOLO, COMO EL PAPEL (Ariana, almacén, 13-10).
 *
 * El papel «PROTOCOLO DE LAVADORA» que el técnico llena a lapicero: datos de
 * la máquina arriba, estructura y componentes con su observación,
 * funcionamiento en vacío y con carga, la programación (cantidad y minutos)
 * y al pie observaciones, supervisor, inspector y técnico electricista.
 * Ariana: «tiene que estar tal cual está aquí, solamente que se habiliten
 * unas casillas para que le des check… vamos a tener una tablet». Va al
 * final del mismo informe de protocolo, no adelante ni en otro archivo.
 *
 * Por ahora solo lavadora; calandrias, secadoras y prensas tienen su propio
 * papel y entran cuando Ariana los comparta (se agregan aquí como otra
 * plantilla, sin tocar la pantalla).
 */

export type Resultado = "ok" | "falla";

export type Chequeo = {
  plantilla: string;
  /** Datos de cabecera: marca, voltaje, capacidad, horas… */
  datos: Record<string, string>;
  /** Resultado de cada renglón: «ok» = ✓, «falla» = ✗. */
  marcas: Record<string, Resultado>;
  /** Observación por renglón (estructura y componentes). */
  obs: Record<string, string>;
  /** Programación: «vacio.fabrica.lavado.cant» → «1». */
  prog: Record<string, string>;
};

export type Plantilla = {
  clave: string;
  titulo: string;
  /** Tipos de máquina (en mayúsculas, como en la hoja) que usan esta plantilla. */
  tipos: string[];
  cabecera: { clave: string; etiqueta: string; ayuda?: string; tipo?: "time" }[];
  /** Bloques con observación por renglón. */
  conObservacion: { clave: string; titulo: string; renglones: string[] }[];
  /** Funcionamiento: la misma lista en vacío y con carga. */
  funcionamiento: string[];
  /** Programación: de fábrica y de prueba, cada una con sus fases. */
  programacion: { fases: string[] };
  pie: { clave: string; etiqueta: string }[];
};

const LAVADORA: Plantilla = {
  clave: "lavadora",
  titulo: "PROTOCOLO DE LAVADORA",
  tipos: ["LAVADORA"],
  cabecera: [
    { clave: "marca", etiqueta: "Marca" },
    { clave: "pot_kw", etiqueta: "Pot. (Kw)" },
    { clave: "voltaje", etiqueta: "V (volt.)", ayuda: "220 V" },
    { clave: "fases", etiqueta: "Fases", ayuda: "Monofásico / Trifásico" },
    { clave: "frecuencia", etiqueta: "Frec. (Hz)", ayuda: "60 Hz" },
    { clave: "corriente", etiqueta: "Corriente (Amp.)" },
    { clave: "capacidad", etiqueta: "Cap. (Kg)", ayuda: "17 Kg" },
    { clave: "pot_term", etiqueta: "Pot. Term. (HP)" },
    { clave: "hora_inicio", etiqueta: "Hora de inicio", tipo: "time" },
    { clave: "hora_final", etiqueta: "Hora final", tipo: "time" },
  ],
  conObservacion: [
    { clave: "estructura", titulo: "ESTRUCTURA", renglones: ["Dimensiones", "Presentación de forros", "Ajuste de niplería", "Presentación de niplería"] },
    {
      clave: "componentes",
      titulo: "COMPONENTES DEL EQUIPO",
      renglones: ["Programador", "Motor de tambor", "Contactores", "Velocidad de motor", "Controlador quemador", "Combustible", "Faja de tambor", "Fugas en válvulas", "Visor de puerta"],
    },
  ],
  funcionamiento: [
    "Motor del tambor",
    "Doble inversión de giro del tambor",
    "Tiempo rotación del tambor",
    "Tiempo espera tambor",
    "Funcionamiento del PLC",
    "Tiempo de temperatura programada",
    "Temperatura programada",
    "Lámpara de señalización",
    "Temperatura de inicio del proceso",
    "Temperatura a los 10 min",
    "Vibraciones",
    "Ruidos",
  ],
  programacion: { fases: ["Pre lavado", "Lavado", "Enjuague", "Centrifugado"] },
  pie: [
    { clave: "supervisor", etiqueta: "Supervisor" },
    { clave: "inspector", etiqueta: "Inspector" },
    { clave: "tecnico_electricista", etiqueta: "Técnico electricista" },
  ],
};

export const PLANTILLAS: Plantilla[] = [LAVADORA];

/** La plantilla que le toca a la máquina por lo que dice su hoja («LAVADORA 13 KG»). */
export function plantillaPara(equipo: string | null | undefined): Plantilla | null {
  const e = (equipo ?? "").toUpperCase();
  return PLANTILLAS.find((p) => p.tipos.some((t) => e.startsWith(t))) ?? null;
}

/** Clave de un renglón: «componentes.motor-de-tambor», «vacio.vibraciones». */
export const claveRenglon = (bloque: string, renglon: string) =>
  `${bloque}.${renglon
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

/** Todos los renglones con ✓/✗ de la plantilla, en orden. */
export function renglonesConMarca(p: Plantilla): string[] {
  return [
    ...p.conObservacion.flatMap((b) => b.renglones.map((r) => claveRenglon(b.clave, r))),
    ...p.funcionamiento.map((r) => claveRenglon("vacio", r)),
    ...p.funcionamiento.map((r) => claveRenglon("carga", r)),
  ];
}

const MARCAS = ["LG", "UNIMAC", "SPEED QUEEN", "ELECTROLUX", "IPSO", "PRIMUS", "GIRBAU", "HUEBSCH", "WASCOMAT", "CONTINENTAL", "MILNOR", "DEXTER", "SAMSUNG", "WHIRLPOOL", "CHICAGO", "JENSEN", "EFAMEINSA"];

/**
 * Lo que se lee de la descripción del cierre para no escribirlo a mano:
 * marca, voltaje, fases y frecuencia. La capacidad y el modelo ya vienen de
 * la hoja del informe.
 */
export function cabeceraDeLaDescripcion(descripcion: string): Record<string, string> {
  const d = ` ${descripcion.toUpperCase()} `;
  const r: Record<string, string> = {};
  const marca = d.match(/\bMARCA\s*:?\s*([A-Z][A-Z0-9 &.-]{1,30}?)(?=\s+(?:MODELO|CAPACIDAD|SERIE|GAS|VOLTAJE|POTENCIA)\b|[\n,;]|\s{2}|$)/);
  if (marca) r.marca = marca[1].trim();
  else {
    const conocida = MARCAS.find((m) => new RegExp(`[^A-Z]${m}[^A-Z]`).test(d));
    if (conocida) r.marca = conocida;
  }
  const v = d.match(/(\d{3})\s*(?:V|VAC|VOLT(?:IOS)?)\b/);
  if (v) r.voltaje = `${v[1]} V`;
  // «220V/60Hz/1Ph» en las descripciones de LG.
  if (/TRIF[AÁ]SIC|(?<![\dA-Z])3\s*PH\b/.test(d)) r.fases = "Trifásico";
  else if (/MONOF[AÁ]SIC|(?<![\dA-Z])1\s*PH\b/.test(d)) r.fases = "Monofásico";
  const hz = d.match(/(50|60)\s*HZ\b/);
  r.frecuencia = hz ? `${hz[1]} Hz` : "60 Hz";
  return r;
}

export const chequeoVacio = (plantilla: string): Chequeo => ({ plantilla, datos: {}, marcas: {}, obs: {}, prog: {} });
