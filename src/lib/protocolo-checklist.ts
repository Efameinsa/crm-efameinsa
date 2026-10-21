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
 * 14-10 llegaron los demás papeles (Santos, fotos de almacén): secadora,
 * desmanchadora, prensa de planchado, rodillo y calderín. Secadora y
 * desmanchadora siguen el molde de la lavadora sin programación; prensa,
 * rodillo y calderín marcan cada componente por energía (GAS, ELÉCTRICO,
 * VAPOR) y no tienen funcionamiento en vacío y con carga.
 */

/** «na» = no aplica a esta máquina (sin quemador, prueba sin carga…): cuenta como respondida (0465). */
export type Resultado = "ok" | "falla" | "na";

export type Chequeo = {
  plantilla: string;
  /** Datos de cabecera: marca, voltaje, capacidad, horas… */
  datos: Record<string, string>;
  /** Resultado de cada renglón: «ok» = ✓, «falla» = ✗, «na» = N/A. */
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
  /**
   * La cabecera como el papel: filas de una grilla de 6 columnas, cada celda
   * es etiqueta + valor (el valor ocupa `span` columnas). Clave con «#» = dato
   * que ya trae el informe (#cliente, #modelo, #serie, #fecha, #protocolo);
   * «voltaje+fases» = dos datos en la misma casilla; «vacio» deja el hueco.
   */
  cabecera: ({ etiqueta: string; clave: string; span: number; ayuda?: string } | { vacio: number; texto?: string })[][];
  /** Bloques con observación por renglón. */
  conObservacion: { clave: string; titulo: string; renglones: string[] }[];
  /** Componentes con ✓/✗ por energía y una observación (prensa, rodillo, calderín). */
  porEnergia?: { clave: string; titulo: string; energias: string[]; renglones: string[] };
  /** Funcionamiento: la misma lista en vacío y con carga ([] = el papel no lo tiene). */
  funcionamiento: string[];
  /** Los títulos de las dos mitades del funcionamiento, como los dice el papel. */
  modos?: { vacio: string; carga: string };
  /** Programación: de fábrica y de prueba, cada una con sus fases (solo la lavadora). */
  programacion?: { fases: string[] };
  pie: { clave: string; etiqueta: string }[];
};

const LAVADORA: Plantilla = {
  clave: "lavadora",
  titulo: "PROTOCOLO DE LAVADORA",
  tipos: ["LAVADORA"],
  cabecera: [
    [{ etiqueta: "CLIENTE:", clave: "#cliente", span: 5 }],
    [{ etiqueta: "MARCA:", clave: "marca", span: 2 }, { etiqueta: "N° PROTOCOLO:", clave: "#protocolo", span: 2 }],
    [{ etiqueta: "MODELO:", clave: "#modelo", span: 2 }, { etiqueta: "N° SERIE:", clave: "#serie", span: 2 }],
    [{ etiqueta: "FECHA:", clave: "#fecha", span: 1 }, { etiqueta: "Hora de inicio:", clave: "hora_inicio", span: 1, ayuda: "hh:mm" }, { etiqueta: "Hora final:", clave: "hora_final", span: 1, ayuda: "hh:mm" }],
    [{ etiqueta: "Pot. (Kw):", clave: "pot_kw", span: 1 }, { etiqueta: "Corriente (Amp.):", clave: "corriente", span: 1 }, { vacio: 2 }],
    [{ etiqueta: "V (volt.):", clave: "voltaje+fases", span: 1, ayuda: "220 V" }, { etiqueta: "Cap. (Kg):", clave: "capacidad", span: 1, ayuda: "17 Kg" }, { vacio: 2 }],
    [{ etiqueta: "Frec. (Hz):", clave: "frecuencia", span: 1, ayuda: "60 Hz" }, { etiqueta: "Pot. Term. (HP):", clave: "pot_term", span: 1 }, { vacio: 2, texto: "RESULTADOS" }],
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

/** La cabecera de los papeles de 14-10: cliente con el N° de protocolo, marca con la serie. */
const CABECERA_COMUN: Plantilla["cabecera"] = [
  [{ etiqueta: "CLIENTE:", clave: "#cliente", span: 2 }, { etiqueta: "N° PROTOCOLO:", clave: "#protocolo", span: 2 }],
  [{ etiqueta: "MARCA:", clave: "marca", span: 2 }, { etiqueta: "N° SERIE:", clave: "#serie", span: 2 }],
  [{ etiqueta: "MODELO:", clave: "#modelo", span: 2 }, { vacio: 3 }],
  [{ etiqueta: "FECHA:", clave: "#fecha", span: 1 }, { etiqueta: "Hora de inicio:", clave: "hora_inicio", span: 1, ayuda: "hh:mm" }, { etiqueta: "Hora final:", clave: "hora_final", span: 1, ayuda: "hh:mm" }],
  [{ etiqueta: "Pot. (Kw):", clave: "pot_kw", span: 1 }, { etiqueta: "Corriente (Amp.):", clave: "corriente", span: 1 }, { vacio: 2 }],
  [{ etiqueta: "V (volt.):", clave: "voltaje+fases", span: 1, ayuda: "220 V" }, { etiqueta: "Cap. (Kg):", clave: "capacidad", span: 1 }, { vacio: 2 }],
  [{ etiqueta: "Frec. (Hz):", clave: "frecuencia", span: 1, ayuda: "60 Hz" }, { etiqueta: "Pot. Term. (HP):", clave: "pot_term", span: 1 }, { vacio: 2, texto: "RESULTADOS" }],
];

const ESTRUCTURA = { clave: "estructura", titulo: "ESTRUCTURA", renglones: ["Dimensiones", "Presentación de forros", "Ajuste de niplería", "Presentación de niplería"] };

const SECADORA: Plantilla = {
  clave: "secadora",
  titulo: "PROTOCOLO DE SECADORA",
  tipos: ["SECADORA"],
  cabecera: CABECERA_COMUN,
  conObservacion: [ESTRUCTURA, LAVADORA.conObservacion[1]],
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
    "Presenta vibraciones",
    "Presenta ruidos",
  ],
  pie: LAVADORA.pie,
};

const DESMANCHADORA: Plantilla = {
  clave: "desmanchadora",
  titulo: "PROTOCOLO DE DESMANCHADORA",
  tipos: ["DESMANCHADORA", "MESA DESMANCHADORA", "MESA DE DESMANCHE", "MESA DESMANCHE"],
  cabecera: CABECERA_COMUN,
  conObservacion: [
    {
      ...ESTRUCTURA,
      renglones: [...ESTRUCTURA.renglones, "Manguera neumática", "Manguera de aire", "Potes blancos", "Bandeja superior inox", "Bandeja inferior inox"],
    },
    {
      clave: "componentes",
      titulo: "COMPONENTES DEL EQUIPO",
      renglones: [
        "Motor",
        "Turbina",
        "Pistola de desmanche inyectoras",
        "Mesa de trabajo en acero inox",
        "Pistola doble vía aire/vapor",
        "Recipiente plástico para productos",
        "Riel superior",
        "Pedales de inyección",
        "Ingreso de vapor",
        "Retorno de condensado",
        "Vacío central de 1/2",
        "Velocidad de motor",
        "Válvulas de ingreso de vapor",
        "Fuga de aire en las mangueras neumáticas",
        "Fugas en válvulas",
        "Tablero de control",
        "Switch rocker rojo",
      ],
    },
  ],
  funcionamiento: ["Motor del tambor", "Turbina", "Pistola inyectoras", "Pistola de aire", "Tablero de control", "Vibraciones", "Fuga de aire", "Fuga en las válvulas", "Ruidos"],
  modos: { vacio: "FUNCIONAMIENTO EN VACIO (VAPOR 0)", carga: "FUNCIONAMIENTO CON VAPOR" },
  pie: LAVADORA.pie,
};

const ENERGIAS = ["GAS", "ELECTRICO", "VAPOR"];

/** Los componentes de la prensa y el calderín (el mismo papel). */
const COMPONENTES_PRENSA = [
  "Programador",
  "Quemador",
  "Contactores",
  "Tablero eléctrico",
  "Velocidad de motor",
  "Controlador quemador",
  "Combustible",
  "Faja",
  "Cobertor",
  "Manija",
  "Visor de puerta",
  "Fugas en válvulas",
  "Motor extractor",
  "Tiempo rotación",
  "Funcionamiento del PLC",
  "Tiempo de temperatura programada",
  "Lámpara de señalización",
  "Presenta vibraciones",
  "Presenta ruidos",
  "Pulsador de emergencia",
  "Pedal de giro",
  "Llave",
];

const PRENSA: Plantilla = {
  clave: "prensa",
  titulo: "PROTOCOLO DE PRENSA DE PLANCHADO",
  tipos: ["PRENSA"],
  // El papel de la prensa ordena distinto: horas y fecha en una fila, y los datos eléctricos en dos.
  cabecera: [
    [{ etiqueta: "CLIENTE:", clave: "#cliente", span: 2 }, { etiqueta: "N° PROTOCOLO:", clave: "#protocolo", span: 2 }],
    [{ etiqueta: "MARCA:", clave: "marca", span: 2 }, { etiqueta: "N° SERIE:", clave: "#serie", span: 2 }],
    [{ etiqueta: "MODELO:", clave: "#modelo", span: 2 }, { vacio: 3 }],
    [{ etiqueta: "Hora de inicio:", clave: "hora_inicio", span: 1, ayuda: "hh:mm" }, { etiqueta: "Hora final:", clave: "hora_final", span: 1, ayuda: "hh:mm" }, { etiqueta: "FECHA:", clave: "#fecha", span: 1 }],
    [{ etiqueta: "Pot. (Kw):", clave: "pot_kw", span: 1 }, { etiqueta: "Corriente (Amp.):", clave: "corriente", span: 1 }, { etiqueta: "Frec. (Hz):", clave: "frecuencia", span: 1, ayuda: "60 Hz" }],
    [{ etiqueta: "V (volt.):", clave: "voltaje+fases", span: 1, ayuda: "220 V" }, { etiqueta: "Cap. (Kg):", clave: "capacidad", span: 1 }, { etiqueta: "Pot. Term. (HP):", clave: "pot_term", span: 1 }],
  ],
  conObservacion: [ESTRUCTURA],
  porEnergia: { clave: "componentes", titulo: "COMPONENTES DEL EQUIPO", energias: ENERGIAS, renglones: COMPONENTES_PRENSA },
  funcionamiento: [],
  pie: LAVADORA.pie,
};

const RODILLO: Plantilla = {
  clave: "rodillo",
  titulo: "PROTOCOLO DE RODILLO",
  tipos: ["RODILLO", "CALANDRIA", "CALANDRA"],
  cabecera: CABECERA_COMUN,
  conObservacion: [ESTRUCTURA],
  porEnergia: {
    clave: "componentes",
    titulo: "COMPONENTES DEL EQUIPO",
    energias: ENERGIAS,
    renglones: [
      "Programador",
      "Motorreductor de rodillo",
      "Contactores",
      "Velocidad de motor",
      "Controlador quemador",
      "Combustible",
      "Faja de rodillo",
      "Cobertor de rodillo",
      "Manija",
      "Visor de puerta",
      "Fugas en válvulas",
      "Motor extractor",
      "Tiempo rotación",
      "Funcionamiento del PLC",
      "Tiempo de temperatura programada",
      "Lámpara de señalización",
      "Presenta vibraciones",
      "Presenta ruidos",
      "Pulsador de emergencia",
      "Pedal de giro",
      "Llave",
    ],
  },
  funcionamiento: [],
  pie: LAVADORA.pie,
};

const CALDERIN: Plantilla = {
  clave: "calderin",
  titulo: "PROTOCOLO DE CALDERIN",
  tipos: ["CALDERIN", "CALDERÍN"],
  cabecera: CABECERA_COMUN,
  conObservacion: [ESTRUCTURA],
  porEnergia: { clave: "componentes", titulo: "COMPONENTES DEL EQUIPO", energias: ENERGIAS, renglones: COMPONENTES_PRENSA },
  funcionamiento: [],
  pie: LAVADORA.pie,
};

/**
 * La plancha vaporizante que va con el calderín en su propio renglón (Almacén,
 * 21-10, VITALIAN: el calderín BR-8 ya tenía su hoja y la plancha STAR SIDI,
 * su accesorio, no tenía ninguna, así que pedía un PDF/Word y no se podía
 * marcar probada). Con su hoja, el informe de prueba y embalaje es el protocolo.
 */
const PLANCHA: Plantilla = {
  clave: "plancha",
  titulo: "PROTOCOLO DE PLANCHA VAPORIZANTE",
  tipos: ["PLANCHA VAPOR", "PLANCHA DE VAPOR", "PLANCHA A VAPOR", "PLANCHA INDUSTRIAL"],
  cabecera: CABECERA_COMUN,
  conObservacion: [ESTRUCTURA],
  porEnergia: {
    clave: "componentes",
    titulo: "COMPONENTES DEL EQUIPO",
    energias: ["ELECTRICO", "VAPOR"],
    renglones: [
      "Suela de la plancha",
      "Mango",
      "Pulsador de vapor",
      "Termostato",
      "Resistencia",
      "Cable de alimentación",
      "Lámpara de señalización",
      "Manguera de vapor",
      "Conexión al calderín",
      "Salida de vapor",
      "Fugas de vapor",
      "Temperatura programada",
    ],
  },
  funcionamiento: [],
  pie: LAVADORA.pie,
};

export const PLANTILLAS: Plantilla[] = [LAVADORA, SECADORA, DESMANCHADORA, PRENSA, RODILLO, CALDERIN, PLANCHA];

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

/** Clave de una casilla por energía: «componentes.quemador.gas». */
export const claveEnergia = (bloque: string, renglon: string, energia: string) => `${claveRenglon(bloque, renglon)}.${energia.toLowerCase()}`;

/** Todos los renglones con ✓/✗ de la plantilla, en orden. */
export function renglonesConMarca(p: Plantilla): string[] {
  const e = p.porEnergia;
  return [
    ...p.conObservacion.flatMap((b) => b.renglones.map((r) => claveRenglon(b.clave, r))),
    ...(e ? e.renglones.flatMap((r) => e.energias.map((en) => claveEnergia(e.clave, r, en))) : []),
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
