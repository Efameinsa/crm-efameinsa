/**
 * LA APERTURA DE LLAMADA (0281, reunión 23-09).
 *
 * La orden que postventa le da al almacén para una videollamada o una
 * atención: qué equipos, qué día y a qué hora, qué hay que ver. El almacén da
 * el check («ya lo estoy gestionando»), hace la llamada y sube su informe
 * (versión 1: lo que vio, lo que le falta al cliente). Postventa lo revisa y
 * deja la versión que se le manda al cliente (versión 2). Hasta el 23-09 todo
 * esto iba por correo y nadie sabía si «ya llamaron al cliente».
 */

export const TIPOS_APERTURA = [
  "videollamada_preinstalacion",
  "videollamada_puesta_marcha",
  "soporte_videollamada",
  "atencion_in_situ",
  "revision",
] as const;
export type TipoApertura = (typeof TIPOS_APERTURA)[number];

export const ETIQUETA_TIPO_APERTURA: Record<TipoApertura, string> = {
  videollamada_preinstalacion: "Videollamada de preinstalación",
  videollamada_puesta_marcha: "Videollamada de puesta en marcha",
  soporte_videollamada: "Soporte técnico por videollamada",
  atencion_in_situ: "Atención técnica en el local del cliente",
  revision: "Revisión del equipo",
};

export interface AperturaLlamada {
  id: string;
  cuenta_id: string;
  servicio_id: string | null;
  atencion_id: string | null;
  tipo: TipoApertura;
  programada_para: string;
  equipos: string;
  indicaciones: string | null;
  contacto: string | null;
  solicitada_por: string;
  solicitada_at: string;
  tomada_at: string | null;
  tomada_por: string | null;
  tecnico: string | null;
  informe_almacen: string | null;
  faltantes: string | null;
  informe_fotos: { path: string; nombre: string; tipo?: string; tamano?: number }[] | null;
  informe_at: string | null;
  informe_por: string | null;
  informe_cliente: string | null;
  revisada_at: string | null;
  revisada_por: string | null;
  enviada_cliente_at: string | null;
  anulada_at: string | null;
  anulada_motivo: string | null;
  /** Sin pedido, autorizada con el código de gerencia (0295). */
  urgente?: boolean | null;
  /** El FORMATO DE LLAMADA de siempre (0297). */
  formato?: FormatoLlamada | null;
  /** El informe de soporte técnico numerado que subió el almacén (0297). */
  informe_servicio_id?: string | null;
}

/**
 * EL FORMATO DE LLAMADA (0297; Santos, 24-09: «ese es el formato de informe
 * de llamada, así que ajustarlo a ello en el CRM»). Es la tabla que se
 * mandaba por correo al almacén: casi todo sale solo del parque instalado y
 * del pedido; postventa lo corrige si hace falta.
 */
export interface FormatoLlamada {
  fecha_compra?: string | null;
  entrega_guia?: string | null;
  contacto?: string | null;
  problema?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  fecha_mantenimiento?: string | null;
  protocolo?: string | null;
  garantia?: string | null;
  provincia?: string | null;
  puesta_en_marcha?: string | null;
  cambios_correctivos?: string | null;
}

/** Las filas de la tabla, en el orden del formato de siempre. */
export const FILAS_FORMATO: { clave: keyof FormatoLlamada; etiqueta: string }[] = [
  { clave: "fecha_compra", etiqueta: "Fecha de compra" },
  { clave: "entrega_guia", etiqueta: "Fecha de entrega y N.º de guía" },
  { clave: "contacto", etiqueta: "Contacto" },
  { clave: "problema", etiqueta: "Problema" },
  { clave: "fecha_mantenimiento", etiqueta: "Fecha de mantenimiento" },
  { clave: "protocolo", etiqueta: "Protocolo de prueba" },
  { clave: "garantia", etiqueta: "Garantía" },
  { clave: "provincia", etiqueta: "Provincia" },
  { clave: "puesta_en_marcha", etiqueta: "Fecha de puesta en marcha" },
  { clave: "cambios_correctivos", etiqueta: "Cambios correctivos" },
];

/** El texto del problema con marca, modelo y serie debajo, como en el formato. */
export function problemaConEquipo(f: FormatoLlamada): string {
  return [
    f.problema?.trim(),
    f.marca?.trim() ? `MARCA: ${f.marca.trim()}` : null,
    f.modelo?.trim() ? `MODELO: ${f.modelo.trim()}` : null,
    f.serie?.trim() ? `SERIE: ${f.serie.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export type EstadoApertura = "enviada" | "en_gestion" | "informe_almacen" | "revisada" | "enviada_cliente" | "anulada";

export const ETIQUETA_ESTADO_APERTURA: Record<EstadoApertura, string> = {
  enviada: "Enviada al almacén",
  en_gestion: "El almacén la tomó",
  informe_almacen: "Informe del almacén: falta revisarlo",
  revisada: "Revisada, falta mandarla al cliente",
  enviada_cliente: "Enviada al cliente",
  anulada: "Anulada",
};

/** El estado sale de las marcas, en orden: nunca se guarda aparte. */
export function estadoApertura(a: Pick<AperturaLlamada, "anulada_at" | "enviada_cliente_at" | "revisada_at" | "informe_at" | "tomada_at">): EstadoApertura {
  if (a.anulada_at) return "anulada";
  if (a.enviada_cliente_at) return "enviada_cliente";
  if (a.revisada_at) return "revisada";
  if (a.informe_at) return "informe_almacen";
  if (a.tomada_at) return "en_gestion";
  return "enviada";
}

/** A quién le toca moverla ahora. */
export function aQuienLeToca(e: EstadoApertura): "almacen" | "postventa" | null {
  if (e === "enviada" || e === "en_gestion") return "almacen";
  if (e === "informe_almacen" || e === "revisada") return "postventa";
  return null;
}

/** Abierta = todavía alguien tiene que hacer algo. */
export function aperturaAbierta(a: Parameters<typeof estadoApertura>[0]): boolean {
  return aQuienLeToca(estadoApertura(a)) !== null;
}

/** El texto de partida de la versión para el cliente: la del almacén, sin lo interno. */
export function borradorParaCliente(a: Pick<AperturaLlamada, "informe_almacen" | "faltantes">): string {
  const partes = [a.informe_almacen?.trim() ?? ""];
  if (a.faltantes?.trim()) partes.push(`Para dejar la instalación lista se necesita:\n${a.faltantes.trim()}`);
  return partes.filter(Boolean).join("\n\n");
}
