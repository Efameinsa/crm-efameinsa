/**
 * La atención técnica de postventa, leída como la dictó el ing. Carlos.
 *
 * Nueve etapas, dos ejes de clasificación y un cierre. La tabla la crea la
 * migración 0131; acá vive el vocabulario y las tres o cuatro preguntas que la
 * pantalla necesita contestar: en qué anda, quién la tiene frenada, si se cobra
 * y si se está pasando de tiempo.
 *
 * POR QUÉ EL VOCABULARIO VIVE ACÁ Y NO EN LA BASE. Porque las palabras cambian
 * —«soporte técnico» pasó a «casos», «agenda de despachos» a «calendario», y
 * las tres veces fue Carlos mirando la pantalla— y una migración por cada
 * palabra es una migración de más.
 */

export const ETAPAS_ATENCION = [
  "solicitud",
  "registro",
  "diagnostico",
  "planificacion",
  "atencion",
  "pruebas",
  "conformidad",
  "cierre",
  "seguimiento",
] as const;

export type EtapaAtencion = (typeof ETAPAS_ATENCION)[number];
export type TipoAtencion =
  | "puesta_en_marcha"
  | "problema_tecnico"
  | "solicitud_repuesto"
  | "solicitud_mantenimiento";
export type ClasificacionAtencion = "garantia" | "preventivo" | "correctivo" | "facturable";

/**
 * Las etiquetas de las nueve etapas.
 *
 * Se escriben como él las dictó, con una sola licencia: «Cierre CRM» se muestra
 * «Cierre». Dentro del CRM, aclarar que el cierre es del CRM es como poner un
 * cartel que diga «cartel».
 */
export const ETIQUETA_ETAPA: Record<EtapaAtencion, string> = {
  solicitud: "Solicitud",
  registro: "Registro",
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  atencion: "Atención",
  pruebas: "Pruebas",
  conformidad: "Conformidad",
  cierre: "Cierre",
  seguimiento: "Seguimiento",
};

/** Qué significa estar en cada etapa, para quien no se sabe el flujo de memoria. */
export const AYUDA_ETAPA: Record<EtapaAtencion, string> = {
  solicitud: "Registrada y derivada a Central. Central decide si la atiende el área o un comercial.",
  registro: "Central la devolvió al área. Falta tomarla y verificar garantía.",
  diagnostico: "Se sabe qué le pasa al equipo y quién paga.",
  planificacion: "Con día, hora y técnico asignado.",
  atencion: "El técnico está en el cliente o ya fue.",
  pruebas: "Se probó el equipo después de la intervención.",
  conformidad: "El cliente firmó que quedó conforme.",
  cierre: "Cerrada en el CRM, con su informe.",
  seguimiento: "Cerrada, en seguimiento posterior.",
};

export const ETIQUETA_TIPO_ATENCION: Record<TipoAtencion, string> = {
  puesta_en_marcha: "Puesta en marcha",
  problema_tecnico: "Problema técnico",
  solicitud_repuesto: "Solicitud de repuesto",
  solicitud_mantenimiento: "Solicitud de mantenimiento",
};

/**
 * Qué pista sigue cada tipo. Es la frase textual de su nota del 31-08: la
 * puesta en marcha y el problema técnico van por la pista técnica; el repuesto
 * y el mantenimiento «aplican el proceso regular de clasificación y etapas de
 * un gestor comercial».
 */
export const PISTA_DE_TIPO: Record<TipoAtencion, "tecnica" | "comercial"> = {
  puesta_en_marcha: "tecnica",
  problema_tecnico: "tecnica",
  solicitud_repuesto: "comercial",
  solicitud_mantenimiento: "comercial",
};

export const ETIQUETA_CLASIFICACION: Record<ClasificacionAtencion, string> = {
  garantia: "Garantía",
  preventivo: "Mantenimiento preventivo",
  correctivo: "Mantenimiento correctivo",
  facturable: "Servicio facturable",
};

/** Si se cobra o no. Es la pregunta que el área contesta antes que ninguna. */
export const SE_COBRA: Record<ClasificacionAtencion, boolean> = {
  garantia: false,
  preventivo: true,
  correctivo: true,
  facturable: true,
};

export const COLOR_CLASIFICACION: Record<ClasificacionAtencion, string> = {
  garantia: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  preventivo: "bg-primary/10 text-primary",
  correctivo: "bg-amber-500/10 text-amber-700",
  facturable: "bg-secondary text-foreground",
};

export interface Atencion {
  id: string;
  cuenta_id: string | null;
  equipo_id: string | null;
  cliente_texto: string | null;
  equipo_texto: string | null;
  tipo: TipoAtencion;
  clasificacion: ClasificacionAtencion | null;
  etapa: EtapaAtencion;
  en_garantia: boolean | null;
  hizo_preventivo: boolean | null;
  asignado_a: string | null;
  tecnico: string | null;
  solicitado_at: string;
  registrado_at: string | null;
  diagnosticado_at: string | null;
  programada_at: string | null;
  atendido_at: string | null;
  pruebas_at: string | null;
  conformidad_at: string | null;
  cerrado_at: string | null;
  seguimiento_at: string | null;
  /** Primera vez que alguien del área hizo algo: gestión en el caso ligado o
   *  avance de etapa. La fija la base (migración 0146). Puede faltar en
   *  consultas viejas, por eso es opcional. */
  tomada_at?: string | null;
  tomada_por?: string | null;
  conformidad_nombre: string | null;
  informe_servicio_id: string | null;
  resultado: "resuelto" | "no_procede" | "derivado" | null;
  detalle: string | null;
  motivo_cierre: string | null;
}

/** El índice de la etapa, para pintar la barra de avance. */
export function pasoDe(etapa: EtapaAtencion): number {
  return ETAPAS_ATENCION.indexOf(etapa);
}

/** La etapa que sigue, o null si ya está cerrada. */
export function siguienteEtapa(etapa: EtapaAtencion): EtapaAtencion | null {
  const i = pasoDe(etapa);
  return i >= 0 && i < ETAPAS_ATENCION.length - 1 ? ETAPAS_ATENCION[i + 1] : null;
}

/** La marca de tiempo que le corresponde a cada etapa al entrar en ella. */
export const SELLO_DE_ETAPA: Partial<Record<EtapaAtencion, keyof Atencion>> = {
  registro: "registrado_at",
  diagnostico: "diagnosticado_at",
  planificacion: "programada_at",
  atencion: "atendido_at",
  pruebas: "pruebas_at",
  conformidad: "conformidad_at",
  cierre: "cerrado_at",
  seguimiento: "seguimiento_at",
};

/**
 * Quién la tiene frenada, que es la pregunta que de verdad se hace el área.
 *
 * Es el mismo criterio que ya usa el pedido de postventa (`estadoPedido`, en
 * lib/postventa.ts): en una carrera de postas no importa tanto «en qué estado
 * está» como «a quién hay que ir a buscar».
 */
export function queLeFalta(a: Atencion): { texto: string; responsable: string; urgente: boolean } {
  switch (a.etapa) {
    case "solicitud":
      return { texto: "Central tiene que derivarla", responsable: "Central", urgente: false };
    case "registro":
      return a.en_garantia === null
        ? { texto: "Verificar la garantía", responsable: "Postventa", urgente: true }
        : { texto: "Diagnosticar qué le pasa", responsable: "Postventa", urgente: false };
    case "diagnostico":
      return { texto: "Poner día, hora y técnico", responsable: "Postventa", urgente: true };
    case "planificacion":
      return a.programada_at && a.programada_at < new Date().toISOString()
        ? { texto: "La atención ya pasó y no está marcada", responsable: "Técnico", urgente: true }
        : { texto: "Esperando la fecha de atención", responsable: "Técnico", urgente: false };
    case "atencion":
      return { texto: "Probar el equipo", responsable: "Técnico", urgente: false };
    case "pruebas":
      return { texto: "Falta la conformidad del cliente", responsable: "Cliente", urgente: false };
    case "conformidad":
      return { texto: "Cerrar y adjuntar el informe", responsable: "Postventa", urgente: true };
    case "cierre":
      return { texto: "En seguimiento", responsable: "Postventa", urgente: false };
    default:
      return { texto: "Cerrada", responsable: "—", urgente: false };
  }
}

/**
 * El reloj. Una garantía corre distinto que un mantenimiento programado — el
 * mismo criterio de horas que ya usa `slaCaso` para los casos, porque un equipo
 * parado es un cliente parado.
 */
const HORAS_LIMITE: Record<TipoAtencion, number> = {
  problema_tecnico: 2,
  puesta_en_marcha: 24,
  solicitud_repuesto: 24,
  solicitud_mantenimiento: 24,
};

export function relojAtencion(a: Atencion): { estado: "verde" | "ambar" | "rojo"; horas: number; limite: number } {
  const limite = HORAS_LIMITE[a.tipo] ?? 24;
  // El reloj de respuesta se detiene en la PRIMERA gestión del área
  // (`tomada_at`), no cuando el técnico ejecuta: NESSUS, 01-09 — la señorita
  // llamó y mandó la cotización a las 10:19 y la pantalla seguía contando.
  const hasta = a.tomada_at ?? a.atendido_at ?? a.cerrado_at;
  const horas = ((hasta ? new Date(hasta).getTime() : Date.now()) - new Date(a.solicitado_at).getTime()) / 36e5;
  if (hasta) return { estado: "verde", horas, limite };
  if (horas > limite) return { estado: "rojo", horas, limite };
  if (horas > limite * 0.6) return { estado: "ambar", horas, limite };
  return { estado: "verde", horas, limite };
}

/**
 * El primer bloque del cierre semanal del área, tal como lo pidió:
 * «has recibido 20 problemas en esta semana, cuántos han sido atendidos,
 * cuántos están en proceso, cuántos ya han sido cerrados».
 */
export interface ResumenAtenciones {
  recibidas: number;
  atendidas: number;
  enProceso: number;
  cerradas: number;
  enGarantia: number;
  facturables: number;
}

export function resumirAtenciones(lista: Atencion[]): ResumenAtenciones {
  return {
    recibidas: lista.length,
    // «Atendida» en el sentido del área: alguien ya hizo algo con ella
    // (gestión o avance), no solo que el técnico haya ejecutado.
    atendidas: lista.filter((a) => a.tomada_at || a.atendido_at).length,
    enProceso: lista.filter((a) => !a.cerrado_at).length,
    cerradas: lista.filter((a) => a.cerrado_at).length,
    enGarantia: lista.filter((a) => a.clasificacion === "garantia").length,
    facturables: lista.filter((a) => a.clasificacion && SE_COBRA[a.clasificacion]).length,
  };
}
