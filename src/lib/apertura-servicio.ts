import { fechaCalendario } from "@/lib/fechas";

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

export type TipoApertura = "entrega" | "entrega_puesta_marcha" | "mantenimiento";

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
  {
    clave: "mantenimiento",
    titulo: "SERVICIO DE MANTENIMIENTO:",
    ayuda: "El técnico va a hacer mantenimiento preventivo o correctivo.",
  },
];

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
  fecha: string | null;
  hora: string | null;
  recibeNombre: string | null;
  recibeDoc: string | null;
  recibeTelefono: string | null;
  tecnico: string | null;
  transporte: string | null;
}

/** Las filas 8 y 9 del formato son siempre estas: son del formato, no datos. */
export const GESTION_CONTABILIDAD = "Gestión de Contabilidad";

export interface FilaApertura {
  n: number;
  descripcion: string;
  informacion: string;
  observaciones: string;
}

/**
 * Las nueve filas del formato, en su orden. Lo que falta se deja como «—»
 * bien visible en vez de inventarse: el correo sale igual y quien lo revisa
 * ve de un vistazo qué le falta llenar.
 */
export function filasApertura(d: DatosApertura): FilaApertura[] {
  const equipo = [tituloDe(d.tipo), "", d.equipo ?? "—", d.serie ? `Serie: ${d.serie}` : null, d.nota ? `\n(${d.nota})` : null]
    .filter((x) => x !== null)
    .join("\n")
    .trim();

  const direccion = [d.direccion ?? "—", d.direccionFinal ? `DIRECCIÓN FINAL: ${d.direccionFinal}` : null]
    .filter(Boolean)
    .join("\n");

  const recibe = [d.recibeNombre ?? "—", d.recibeDoc ? `DNI: ${d.recibeDoc}` : null, d.recibeTelefono ? `Cel: ${d.recibeTelefono}` : null]
    .filter(Boolean)
    .join("\n");

  return [
    { n: 1, descripcion: "APERTURA DE SERVICIO", informacion: equipo, observaciones: d.hora ?? "—" },
    { n: 2, descripcion: "CLIENTE", informacion: `${d.cliente}${d.ruc ? `\nRUC: ${d.ruc}` : ""}`, observaciones: "" },
    { n: 3, descripcion: "DIRECCIÓN", informacion: direccion, observaciones: "" },
    { n: 4, descripcion: "DÍA DEL SERVICIO", informacion: d.fecha ? fechaCalendario(d.fecha) : "—", observaciones: "" },
    { n: 5, descripcion: "PERSONAL QUE RECIBE", informacion: recibe, observaciones: "" },
    { n: 6, descripcion: "PERSONAL ASIGNADO PARA EL SERVICIO", informacion: d.tecnico ?? "—", observaciones: "" },
    { n: 7, descripcion: "MEDIO DE TRANSPORTE PERSONAL TÉCNICO", informacion: d.transporte ?? "—", observaciones: "" },
    { n: 8, descripcion: "REQUISICIÓN POR MOVILIDAD (IDA Y VUELTA, REFERENCIA).", informacion: GESTION_CONTABILIDAD, observaciones: "" },
    { n: 9, descripcion: "MONTO DE VIÁTICOS", informacion: GESTION_CONTABILIDAD, observaciones: "" },
  ];
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
      const info = f.informacion.split("\n").filter(Boolean);
      const cabeza = `${f.n}. ${f.descripcion}${f.observaciones ? `   [${f.observaciones}]` : ""}`;
      return [cabeza, ...info.map((x) => `   ${x}`)].join("\n");
    })
    .join("\n\n");

  return (
    "Buen día Estimados,\n\n" +
    "Por medio de la presente, pongo de su conocimiento que en coordinación con el Ing. Carlos; " +
    "se ha quedado en agenda el siguiente servicio:\n\n" +
    filas +
    "\n"
  );
}

/** Lo que todavía falta llenar para que el correo salga completo. */
export function faltantesApertura(d: DatosApertura): string[] {
  const falta: string[] = [];
  if (!d.equipo) falta.push("la descripción del equipo");
  if (!d.direccion) falta.push("la dirección");
  if (!d.fecha) falta.push("el día del servicio");
  if (!d.hora) falta.push("la hora");
  if (!d.recibeNombre) falta.push("quién recibe");
  if (!d.recibeTelefono) falta.push("el teléfono de quien recibe");
  // El técnico no hace falta en una entrega por agencia: no va nadie.
  if (d.tipo !== "entrega" && !d.tecnico) falta.push("el técnico asignado");
  if (!d.transporte) falta.push("el medio de transporte");
  return falta;
}
