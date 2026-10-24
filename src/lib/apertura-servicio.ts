import { fechaCalendario } from "@/lib/fechas";
import { tipoDocRecibe } from "@/lib/documento";

/**
 * LA APERTURA DE SERVICIO — el formato con el que postventa avisa al equipo.
 *
 * Lesly, 05-09: «una vez que postventa hace todos los pasos —confirmación de
 * finanzas, prueba de embalaje, coordinar con el cliente— y llena datos como
 * dirección a dónde llega, con qué agencia, la persona que recibe, teléfono y
 * DNI, todo eso va plasmado en una apertura de servicio donde se va a detallar
 * todo lo que se va a hacer (…) aquí se tienen los tres formatos y todo se
 * debe llenar en automático con todos los datos que ya se tienen».
 *
 * NO CONFUNDIR CON LA APERTURA DE DESPACHO (0150). Esa es interna: el papel
 * con el que almacén despacha sin preguntarle a nadie. Esta sale al equipo
 * —al ingeniero, a contabilidad, al técnico— y lleva las nueve filas
 * numeradas del correo de siempre.
 *
 * LOS TRES FORMATOS SON EL MISMO y solo cambia el encabezado de la fila 1.
 * Todo lo demás —cliente, RUC, dirección, quién recibe, equipo con su serie—
 * ya está en el sistema y se llena solo.
 */

export type TipoApertura =
  | "entrega"
  | "entrega_puesta_marcha"
  | "puesta_marcha"
  | "servicio_instalacion"
  | "traslado"
  | "mantenimiento"
  | "entrega_garantia"
  | "servicio_tecnico"
  | "revision_garantia"
  | "capacitacion";

export const TIPOS_APERTURA: { clave: TipoApertura; titulo: string; ayuda: string }[] = [
  {
    clave: "entrega",
    titulo: "ENTREGA DE:",
    ayuda: "El equipo sale a la agencia. No va técnico.",
  },
  {
    clave: "entrega_puesta_marcha",
    titulo: "ENTREGA Y PUESTA EN MARCHA DE:",
    ayuda: "El técnico lleva la máquina y la instala.",
  },
  // SOLO PUESTA EN MARCHA (Rubí, 05-10): el equipo ya está donde el cliente
  // —llegó por agencia o lo recogió— y el técnico va sin equipo a instalarlo.
  {
    clave: "puesta_marcha",
    titulo: "PUESTA EN MARCHA DE:",
    ayuda: "El equipo ya está con el cliente. El técnico va sin equipo a instalarlo.",
  },
  // SERVICIO E INSTALACIÓN (buzón Rubí 16-10, 0518): lo que se vendió es el
  // servicio de instalación —el kit, las conexiones, la obra—, no solo poner
  // en marcha una máquina.
  {
    clave: "servicio_instalacion",
    titulo: "SERVICIO E INSTALACIÓN DE:",
    ayuda: "El técnico va a hacer el servicio y la instalación que se vendió.",
  },
  // SERVICIO DE TRASLADO (Santos 24-10): el equipo se mueve de un lugar a otro
  // —de la planta al cliente, de una sede a otra, o vuelve a planta—.
  {
    clave: "traslado",
    titulo: "SERVICIO DE TRASLADO DE:",
    ayuda: "El equipo se lleva de un lugar a otro: de planta al cliente, entre sedes o de vuelta a planta.",
  },
  {
    clave: "mantenimiento",
    titulo: "SERVICIO DE MANTENIMIENTO:",
    ayuda: "El técnico va a hacer mantenimiento preventivo o correctivo.",
  },
  // REPUESTOS POR GARANTÍA (buzón Rubí 12-10, 0441): salen sin cobro desde
  // un caso del cliente, con la lista de repuestos como en un pedido.
  {
    clave: "entrega_garantia",
    titulo: "ENTREGA DE REPUESTOS POR GARANTÍA:",
    ayuda: "Repuestos que salen por garantía, sin cobro. Puede no ir técnico.",
  },
  // LO QUE HACE EL TÉCNICO, EN EL ENCABEZADO (reunión de postventa 13-10, 0456):
  // «¿hace una entrega? ¿entrega y puesta en marcha? ¿mantenimiento preventivo?
  // ¿o va a hacer una revisión por garantía? Esos títulos van a tu apertura».
  {
    clave: "servicio_tecnico",
    titulo: "SERVICIO TÉCNICO DE:",
    ayuda: "El técnico va a ver una falla o un problema del equipo.",
  },
  {
    clave: "revision_garantia",
    titulo: "REVISIÓN POR GARANTÍA DE:",
    ayuda: "El técnico revisa una máquina que está en garantía.",
  },
  {
    clave: "capacitacion",
    titulo: "REFUERZO DE CAPACITACIÓN DE:",
    ayuda: "El técnico vuelve a capacitar al personal del cliente en el equipo.",
  },
];

/**
 * El formato que corresponde al TIPO DEL CASO (reunión 13-10): el caso ya dice
 * qué pidió el cliente, así que la apertura arranca con ese encabezado. Se
 * propone; postventa lo cambia si el caso es otro.
 */
export function formatoDelCaso(tipo: string | null | undefined): "mantenimiento" | "puesta_marcha" | "servicio_tecnico" | "revision_garantia" | "capacitacion" {
  switch (tipo) {
    case "puesta_en_marcha":
      return "puesta_marcha";
    case "revision_garantia":
      return "revision_garantia";
    case "capacitacion":
      return "capacitacion";
    case "solicitud_mantenimiento":
      return "mantenimiento";
    default:
      return "servicio_tecnico";
  }
}

export function tituloDe(tipo: TipoApertura | null | undefined): string {
  return TIPOS_APERTURA.find((t) => t.clave === tipo)?.titulo ?? TIPOS_APERTURA[1].titulo;
}

/**
 * Cuál de los tres formatos corresponde, propuesto a partir de lo que ya se
 * sabe del pedido. Se propone, no se impone: postventa lo corrige en la
 * pantalla si el caso es otro.
 */
export function tipoSugerido(s: {
  tipo_servicio?: string | null;
  equipo?: string | null;
  modalidad?: string | null;
  ubicacion?: string | null;
}): TipoApertura {
  const texto = `${s.tipo_servicio ?? ""} ${s.equipo ?? ""}`.toLowerCase();
  if (/mantenimiento|preventivo|correctivo|limpieza/.test(texto)) return "mantenimiento";

  // Si va por agencia, nadie de la casa lo instala: es una entrega a secas.
  // «Agencia», «cargo» y los nombres de las agencias que más se repiten.
  const destino = `${s.ubicacion ?? ""}`.toLowerCase();
  if (/agencia|cargo|shalom|marvisur|olva|transporte/.test(destino)) return "entrega";

  return "entrega_puesta_marcha";
}

/** «08:00 AM» a partir de un `time` de Postgres («08:00:00»). */
export function horaAmPm(hora: string | null | undefined): string | null {
  if (!hora) return null;
  const m = String(hora).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hora);
  const h = Number(m[1]);
  const sufijo = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m[2]} ${sufijo}`;
}

export interface DatosApertura {
  tipo: TipoApertura;
  empresa: string;
  cliente: string;
  ruc: string | null;
  /** Descripción del equipo, tal como se escribe en el correo. */
  equipo: string | null;
  serie: string | null;
  nota: string | null;
  direccion: string | null;
  direccionFinal: string | null;
  /** Observación del destino (0388, Rubí 03-10): la sede o la dirección de la agencia en destino adonde tiene que llegar. */
  destinoObservacion?: string | null;
  /**
   * La NOTA en amarillo del destino final (0438, Rubí 12-10): null = la de
   * siempre («EQUIPO DEBERÁ LLEGAR A DOMICILIO» cuando la agencia lo lleva al
   * cliente); "" = sin nota; otro texto = esa nota.
   */
  destinoNota?: string | null;
  /** A domicilio o en agencia, y cuál (0259: en Cusco hay seis agencias). */
  entregaModo: "domicilio" | "agencia" | "planta" | null;
  agenciaDestino: string | null;
  /** Dirección de la agencia donde lo deja el almacén: el primer destino (0345). */
  agenciaDireccion?: string | null;
  /** Horario de atención de esa agencia (0505; Lesly, 15-10): lo levanta postventa en la coordinación. */
  agenciaHorario?: string | null;
  fecha: string | null;
  hora: string | null;
  recibeNombre: string | null;
  recibeDoc: string | null;
  recibeTelefono: string | null;
  tecnico: string | null;
  transporte: string | null;
  /** La guía que se pide con la apertura (0371, Lesly 02-10): ya no se escribe a mano en la nota. */
  guia?: GuiaApertura | null;
  guiaDetalle?: string | null;
  /** Con quién coordina el técnico movilidad y viáticos (0371): varía, ya no es un nombre fijo. */
  coordinaContabilidad?: string | null;
  /** Con quién coordina herramientas, repuestos y EPP (0371). Vacío = «Almacén». */
  coordinaLogistica?: string | null;
  /**
   * Observaciones escritas a mano por fila (0445, Rubí 12-10: «opción para
   * editar en observación de cliente»): {"6": "…"}. Van en la columna de
   * observaciones de esa fila, debajo de lo que ya sale solo.
   */
  obsFilas?: Record<string, string> | null;
  /** Fila 2 (buzón Rubí 16-10): si el cliente mandó orden de compra u orden de servicio, o ninguna. */
  ordenTipo?: OrdenApertura | null;
  ordenNumero?: string | null;
}

/**
 * ORDEN DE COMPRA U ORDEN DE SERVICIO (buzón Rubí 16-10: «después de
 * "SERVICIO A REALIZAR" debe estar para seleccionar ORDEN DE COMPRA U ORDEN
 * DE SERVICIO»). Va en la fila 2; sin elegir, sale «—».
 */
export type OrdenApertura = "compra" | "servicio" | "sin";

export const ORDENES_APERTURA: { clave: OrdenApertura; etiqueta: string }[] = [
  { clave: "compra", etiqueta: "Orden de compra" },
  { clave: "servicio", etiqueta: "Orden de servicio" },
  { clave: "sin", etiqueta: "El cliente no mandó orden" },
];

export type GuiaApertura = "traslado" | "materiales" | "repuestos" | "ambas";

export const GUIAS_APERTURA: { clave: GuiaApertura; etiqueta: string }[] = [
  // 14-10 (Contabilidad): «traslado» es un MOTIVO de guía (servicios); el motivo
  // lo define Contabilidad al autorizarla (0486). Postventa solo pide la guía de salida.
  { clave: "traslado", etiqueta: "Guía de salida del equipo" },
  { clave: "materiales", etiqueta: "Guía adicional para llevar materiales" },
  // Santos, 05-10: el técnico de mantenimiento lleva un manómetro para posible venta.
  { clave: "repuestos", etiqueta: "Guía para llevar repuestos" },
  { clave: "ambas", etiqueta: "Equipo y materiales" },
];

/** Las líneas de la guía, como van en el apartado NOTAS de la fila 1. */
export function lineasGuia(guia: GuiaApertura | null | undefined, detalle?: string | null): string[] {
  if (!guia) return [];
  const extra = detalle?.trim() ? `: ${detalle.trim().toUpperCase()}` : "";
  const traslado = "SE SOLICITA GUÍA DE SALIDA DEL EQUIPO";
  const materiales = `SE SOLICITA GUÍA ADICIONAL PARA LLEVAR MATERIALES${extra}`;
  if (guia === "traslado") return [`${traslado}${extra}`];
  if (guia === "materiales") return [materiales];
  if (guia === "repuestos") return [`SE SOLICITA GUÍA DE SALIDA DE REPUESTOS${extra}`];
  return [traslado, materiales];
}

/**
 * Lo que dicen las filas de contabilidad y logística es del formato (modelo de
 * Lesly, 01-10). CON QUIÉN se coordina, no: Lesly, 02-10, «no es Sara, es
 * Jhon (…) puede ser variable el personal». Se escribe en la apertura; si
 * no, contabilidad sale con quien confirmó el pago y logística con «Almacén».
 */
export const GESTION_CONTABILIDAD = "Gestión de Contabilidad";
export const COORDINACION_LOGISTICA = "Herramientas, repuestos traídos anteriormente y EPP";
export const LOGISTICA_POR_DEFECTO = "Almacén";

export interface FilaApertura {
  n: number;
  /**
   * Con qué se guardan sus observaciones escritas a mano (0445). Es el número
   * que tenía la fila antes de que entrara la orden en la fila 2 (16-10): así
   * lo ya escrito en aperturas anteriores sigue en su sitio.
   */
  clave: string;
  descripcion: string;
  informacion: string;
  observaciones: string;
  /** Texto en amarillo debajo de las observaciones. Desde el 12-10 (Rubí) la nota del destino final ya no lo usa: va en «observaciones». */
  resaltado?: string | null;
  /** El apartado NOTAS de la fila 1: la guía que se pide y avisos para quien despacha (Lesly, 02-10). */
  notas?: string[];
}

/** «despacho» para las entregas, «servicio» cuando no sale equipo: como dice el correo de siempre. */
export function queQuedaEnAgenda(tipo: TipoApertura | null | undefined): string {
  return tipo === "mantenimiento" || tipo === "puesta_marcha" || tipo === "servicio_instalacion" ? "servicio" : "despacho";
}

/** Las filas que no tienen campo propio para sus observaciones: se escriben en la apertura (0445). */
export const FILAS_CON_OBSERVACION_LIBRE: { n: number; clave: string; etiqueta: string; ejemplo: string }[] = [
  { n: 2, clave: "oc", etiqueta: "Orden de compra / servicio", ejemplo: "ej. Adjuntar copia de la orden a la guía" },
  { n: 3, clave: "2", etiqueta: "Cliente", ejemplo: "ej. Facturar a nombre de la sede Cusco" },
  { n: 4, clave: "3", etiqueta: "Primer destino", ejemplo: "ej. Entregar en ventanilla de carga" },
  { n: 6, clave: "5", etiqueta: "Programación", ejemplo: "ej. Solo de lunes a viernes" },
  { n: 7, clave: "6", etiqueta: "Persona que recibe", ejemplo: "ej. Si no está, recibe el Sr. Pérez (encargado de mantenimiento)" },
  { n: 8, clave: "7", etiqueta: "Personal asignado", ejemplo: "ej. Llevar SCTR" },
  { n: 9, clave: "8", etiqueta: "Medio de transporte", ejemplo: "ej. Bus Cruz del Sur, salida 9 p. m." },
];

/** Deja solo las filas con texto; nada escrito = null. */
export function limpiarObsFilas(o: Record<string, string | null | undefined> | null | undefined): Record<string, string> | null {
  const filas = new Set(FILAS_CON_OBSERVACION_LIBRE.map((f) => f.clave));
  const limpio = Object.fromEntries(
    Object.entries(o ?? {})
      .filter(([k, v]) => filas.has(k) && typeof v === "string" && v.trim())
      .map(([k, v]) => [k, (v as string).trim()]),
  );
  return Object.keys(limpio).length ? limpio : null;
}

export const NOTA_LLEGA_A_DOMICILIO = "EQUIPO DEBERÁ LLEGAR A DOMICILIO";

/** La nota que sale sola en el destino final si postventa no escribió otra: por agencia y con dirección final. */
export function notaDestinoAutomatica(d: Pick<DatosApertura, "entregaModo" | "direccionFinal">): string | null {
  return d.entregaModo === "agencia" && d.direccionFinal?.trim() ? NOTA_LLEGA_A_DOMICILIO : null;
}

/** ¿El texto ya contiene esa dirección? Sin mirar mayúsculas, espacios ni signos. */
function yaDice(texto: string | null | undefined, direccion: string): boolean {
  const limpio = (x: string) => x.toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÑ]/g, "");
  return Boolean(texto) && limpio(texto as string).includes(limpio(direccion));
}

/**
 * Las doce filas del formato, en su orden (la orden de compra o de servicio
 * entró de 2.ª el 16-10). Lo que falta se deja como «—»
 * bien visible en vez de inventarse: el correo sale igual y quien lo revisa
 * ve de un vistazo qué le falta llenar.
 */
export function filasApertura(d: DatosApertura): FilaApertura[] {
  const equipo = [tituloDe(d.tipo), "", d.equipo ?? "—", d.serie ? `Serie: ${d.serie}` : null]
    .filter((x) => x !== null)
    .join("\n")
    .trim();
  // NOTAS (Lesly, 02-10): «un espacio más que haya notas (…) que se solicita
  // una guía, ya sea para el traslado o una guía adicional para llevar
  // materiales». La guía tiene su campo; la nota libre va debajo.
  const notas = [...lineasGuia(d.guia, d.guiaDetalle), ...(d.nota?.trim() ? [d.nota.trim()] : [])];

  // PRIMER DESTINO Y DESTINO FINAL, EN DOS FILAS (Lesly, 02-10: «en dirección
  // abarcan dos cosas, primer destino y el destino final. Deberíamos tener
  // para que se separen»). Antes iban juntos en la fila DIRECCIÓN, el final
  // en observaciones (modelo del 01-10).
  //   · Primer destino: adonde lo lleva el almacén — la agencia y su
  //     dirección, o la del cliente si va a domicilio (Carlos, 21-09: decir
  //     si va A DOMICILIO o EN AGENCIA, y cuál).
  //   · Destino final: donde queda el equipo.
  let primerDestino: string;
  let destinoFinal: string;
  // NOTA EDITABLE (Rubí, 12-10: «agregar un item de NOTA en destino final
  // para poder modificar y poner alguna observación»): si postventa la
  // escribió manda la suya; vacía, no sale. Va en observaciones.
  const resaltadoDestino = d.destinoNota == null ? notaDestinoAutomatica(d) : d.destinoNota.trim() || null;
  // ANDINAS, 30-09: la dirección final ya venía dentro de la otra y salía dos veces.
  const finalAparte = d.direccionFinal && !yaDice(d.direccion, d.direccionFinal) ? d.direccionFinal : null;
  if (d.entregaModo === "agencia") {
    // «AGENCIA AGENCIA SHALOM» (CRISTO REY, 01-10): si el nombre ya lo dice (o «ANGENCIA»), no se repite.
    const agencia = d.agenciaDestino ?? "(agencia por confirmar)";
    primerDestino = [
      /^\s*an?gencia\b/i.test(agencia) ? agencia : `AGENCIA ${agencia}`,
      d.agenciaDireccion ?? "(falta la dirección de la agencia)",
      // El horario de atención (0505; Lesly, 15-10): que el almacén no llegue con la agencia cerrada.
      d.agenciaHorario?.trim() ? `HORARIO DE ATENCIÓN: ${d.agenciaHorario.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    destinoFinal = [d.direccion ?? "—", finalAparte].filter(Boolean).join("\n");
  } else if (d.entregaModo === "planta") {
    // EL CLIENTE LO RECOGE (Ariana, 10-10; 0434): equipos industriales que
    // vienen a buscar con su transporte. El almacén no lo lleva a ninguna
    // parte; la dirección es adonde va el equipo (la puesta en marcha).
    primerDestino = "RECOJO EN NUESTRAS INSTALACIONES\n(el cliente lo recoge en planta con su transporte)";
    destinoFinal = [d.direccion ?? "—", finalAparte].filter(Boolean).join("\n");
  } else {
    primerDestino = [d.entregaModo === "domicilio" ? "ENTREGA A DOMICILIO" : null, d.direccion ?? "—"].filter(Boolean).join("\n");
    destinoFinal = finalAparte ?? (d.direccion ? "EL MISMO (se entrega directo al cliente)" : "—");
  }

  // LA NOTA VA EN «OBSERVACIONES», SIN RESALTAR (Rubí, 12-10: primero «quitar
  // el resaltado… ponerla en la parte de información»; luego «la nota de
  // DESTINO FINAL tiene que ir en la columna de observaciones»): debajo de la
  // observación del destino, si la hay.
  const obsDestino = d.destinoObservacion?.trim() ?? "";
  const observacionesDestino = [obsDestino, resaltadoDestino && !yaDice(obsDestino, resaltadoDestino) ? resaltadoDestino : null]
    .filter(Boolean)
    .join("\n");

  const recibe = [d.recibeNombre ?? "—", d.recibeDoc ? `${tipoDocRecibe(d.recibeDoc)}: ${d.recibeDoc}` : null, d.recibeTelefono ? `Cel: ${d.recibeTelefono}` : null]
    .filter(Boolean)
    .join("\n");
  const contabilidad = d.coordinaContabilidad?.trim() || "—";
  const logistica = d.coordinaLogistica?.trim() || LOGISTICA_POR_DEFECTO;

  const orden = filaOrden(d);
  // La fila 2 es la orden (16-10) y las demás corren un número. La clave es
  // la de antes: con ella se guardan las observaciones escritas (0445).
  const filas: FilaApertura[] = (
    [
      { clave: "1", descripcion: "SERVICIO A REALIZAR", informacion: equipo, observaciones: d.hora ?? "—", notas },
      { clave: "oc", descripcion: orden.descripcion, informacion: orden.informacion, observaciones: "" },
      { clave: "2", descripcion: "CLIENTE", informacion: `${d.cliente}${d.ruc ? `\nRUC: ${d.ruc}` : ""}`, observaciones: "" },
      { clave: "3", descripcion: "PRIMER DESTINO", informacion: primerDestino, observaciones: "" },
      { clave: "4", descripcion: "DESTINO FINAL", informacion: destinoFinal, observaciones: observacionesDestino },
      { clave: "5", descripcion: "PROGRAMACIÓN", informacion: d.fecha ? fechaCalendario(d.fecha) : "—", observaciones: "" },
      { clave: "6", descripcion: "PERSONA QUE RECIBE", informacion: recibe, observaciones: "" },
      { clave: "7", descripcion: "PERSONAL ASIGNADO PARA EL SERVICIO", informacion: d.tecnico ?? "—", observaciones: "" },
      { clave: "8", descripcion: "MEDIO DE TRANSPORTE PERSONAL TÉCNICO", informacion: d.transporte ?? "—", observaciones: "" },
      { clave: "9", descripcion: "REQUISICIÓN POR MOVILIDAD (IDA Y VUELTA, REFERENCIA).", informacion: GESTION_CONTABILIDAD, observaciones: contabilidad },
      { clave: "10", descripcion: "MONTO DE VIÁTICOS", informacion: GESTION_CONTABILIDAD, observaciones: contabilidad },
      { clave: "11", descripcion: "COORDINACIÓN CON LOGÍSTICA", informacion: COORDINACION_LOGISTICA, observaciones: logistica },
    ] as Omit<FilaApertura, "n">[]
  ).map((f, i) => ({ ...f, n: i + 1 }));
  // LO QUE POSTVENTA ESCRIBIÓ EN CADA FILA (Rubí, 12-10; 0445): debajo de lo
  // que ya sale solo; un «—» vacío se reemplaza.
  const obsFilas = limpiarObsFilas(d.obsFilas);
  if (!obsFilas) return filas;
  return filas.map((f) => {
    const extra = obsFilas[f.clave];
    if (!extra) return f;
    const base = f.observaciones.trim() === "—" ? "" : f.observaciones;
    return { ...f, observaciones: [base, extra].filter(Boolean).join("\n") };
  });
}

/** La fila 2: qué orden mandó el cliente y su número. */
function filaOrden(d: Pick<DatosApertura, "ordenTipo" | "ordenNumero">): { descripcion: string; informacion: string } {
  const numero = d.ordenNumero?.trim() || null;
  if (d.ordenTipo === "compra") return { descripcion: "ORDEN DE COMPRA", informacion: numero ? `N° ${numero}` : "(falta el número)" };
  if (d.ordenTipo === "servicio") return { descripcion: "ORDEN DE SERVICIO", informacion: numero ? `N° ${numero}` : "(falta el número)" };
  if (d.ordenTipo === "sin") return { descripcion: "ORDEN DE COMPRA / SERVICIO", informacion: "EL CLIENTE NO EMITIÓ ORDEN" };
  return { descripcion: "ORDEN DE COMPRA / SERVICIO", informacion: "—" };
}

/**
 * ¿Se puede partir entre dos hojas? Las filas cortas no: quedan enteras. Una
 * larga sí (TOMY JIRO, 02-10: la fila 1 con doce repuestos no cabía bajo la
 * cabecera, se iba entera a la hoja 2 y la primera salía en blanco).
 */
export function esFilaLarga(f: FilaApertura): boolean {
  return f.informacion.split("\n").length + (f.notas?.length ?? 0) > 12;
}

/** El asunto exacto del correo: EMPRESA // APERTURA DE SERVICIO // CLIENTE. */
export function asuntoApertura(d: DatosApertura): string {
  return `${d.empresa} // APERTURA DE SERVICIO // ${d.cliente}`;
}

/**
 * El correo entero, listo para pegar.
 *
 * El CRM no manda correos —no tiene SMTP, y las alertas por correo están
 * apagadas por orden de gerencia— así que hace lo mismo que con el WhatsApp
 * de Central: deja el mensaje escrito y la persona lo pega y lo envía.
 */
export function cuerpoApertura(d: DatosApertura): string {
  const filas = filasApertura(d)
    .map((f) => {
      const info = [...f.informacion.split("\n").filter(Boolean), ...(f.notas?.length ? ["", "NOTAS:", ...f.notas.map((x) => `- ${x}`)] : [])];
      const obs = [...f.observaciones.split("\n"), f.resaltado ? `NOTA: ${f.resaltado}` : ""].map((x) => x.trim()).filter(Boolean);
      // Una observación corta (la hora, un nombre) va al lado; una larga (el destino final), debajo.
      const corta = obs.length === 1 && obs[0].length <= 20;
      const cabeza = `${f.n}. ${f.descripcion}${corta ? `   [${obs[0]}]` : ""}`;
      return [cabeza, ...info.map((x) => (x ? `   ${x}` : "")), ...(!corta && obs.length ? ["   Observaciones:", ...obs.map((x) => `   ${x}`)] : [])].join("\n");
    })
    .join("\n\n");

  // El saludo según la hora de Lima, como el modelo («Buenas Tardes Estimados,»).
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }));
  const saludo = hora < 12 ? "Buenos Días" : hora < 19 ? "Buenas Tardes" : "Buenas Noches";
  return (
    `${saludo} Estimados,\n\n` +
    "Por medio de la presente, pongo de su conocimiento que en coordinación con el Ing. Carlos; " +
    `se ha quedado en agenda el siguiente ${queQuedaEnAgenda(d.tipo)}:\n\n` +
    filas +
    "\n\nAtentamente,\n"
  );
}

/** Lo que todavía falta llenar para que el correo salga completo. */
export function faltantesApertura(d: DatosApertura): string[] {
  const falta: string[] = [];
  if (!d.equipo) falta.push("la descripción del equipo");
  if (!d.ordenTipo) falta.push("si hay orden de compra u orden de servicio");
  if (!d.direccion) falta.push("la dirección");
  if (d.entregaModo === "agencia" && !d.agenciaDireccion) falta.push("la dirección de la agencia (primer destino)");
  if (d.entregaModo === "agencia" && !d.agenciaHorario?.trim()) falta.push("el horario de atención de la agencia (en «Dirección y quién recibe»)");
  if (!d.fecha) falta.push("el día del servicio");
  if (!d.hora) falta.push("la hora");
  if (!d.recibeNombre) falta.push("quién recibe");
  if (!d.recibeTelefono) falta.push("el teléfono de quien recibe");
  // El técnico no hace falta en una entrega por agencia: no va nadie.
  if (d.tipo !== "entrega" && d.tipo !== "entrega_garantia" && !d.tecnico) falta.push("el técnico asignado");
  if (!d.transporte) falta.push("el medio de transporte");
  if (d.tipo !== "entrega" && d.tipo !== "entrega_garantia" && !d.coordinaContabilidad?.trim()) falta.push("con quién coordina contabilidad (movilidad y viáticos)");
  return falta;
}
