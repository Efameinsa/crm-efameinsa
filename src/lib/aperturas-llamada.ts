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
}

export type EstadoApertura = "enviada" | "en_gestion" | "informe_almacen" | "revisada" | "enviada_cliente" | "anulada";

export const ETIQUETA_ESTADO_APERTURA: Record<EstadoApertura, string> = {
  enviada: "Enviada al almacén",
  en_gestion: "El almacén la está gestionando",
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
