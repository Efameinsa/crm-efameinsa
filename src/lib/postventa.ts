/**
 * El pedido de postventa, leído como lo que es: una carrera de postas.
 *
 * Cada paso del circuito tiene un dueño distinto —Central, Almacén, Finanzas,
 * el cliente y postventa— y por eso la pregunta que importa en la pantalla no
 * es «en qué estado está» sino **quién lo tiene frenado**. Eso es lo que
 * calcula `estadoPedido()`: no un estado, sino el siguiente paso y de quién
 * depende.
 *
 * Los pasos salen del procedimiento real relevado el 27-08 con el ing. Carlos
 * y del manual del área (ítems XI a XIV). Se agrupan en tres bloques porque su
 * reacción al ver la lista completa fue «uf, son bastantes etapas»: son diez
 * marcas, pero se leen de a tres.
 */

export interface ServicioPostventa {
  id: string;
  cliente_texto: string | null;
  cuenta_id: string | null;
  equipo: string | null;
  tipo_servicio: string;
  ubicacion: string | null;
  observaciones: string | null;
  monto: number | null;
  moneda: string;
  forma_pago: string | null;
  fecha_confirmacion: string | null;
  fecha_despacho: string | null;
  despacho_nota: string | null;
  puesta_en_marcha: string | null;
  puesta_nota: string | null;
  completado: boolean;
  origen: string;
  // Texto libre de las filas importadas del Excel ("SI", "NO", "POR COORDINAR").
  confirmacion_abono: string | null;
  prueba_embalaje: string | null;
  planos_preinstalacion: string | null;
  // Campos del flujo digital (migración 0087).
  informe_cierre_id: string | null;
  numero_pedido_erp: string | null;
  pedido_ejecutado_at: string | null;
  liquidacion_at: string | null;
  aprobado_at: string | null;
  modalidad: string | null;
  monto_pagado: number | null;
  pago_confirmado_at: string | null;
  despacho_sin_cancelar_motivo: string | null;
  prueba_solicitada_at: string | null;
  prueba_lista_at: string | null;
  protocolo_prueba_ref: string | null;
  plano_enviado_at: string | null;
  preinstalacion_ok_at: string | null;
  preinstalacion_nota: string | null;
  direccion_verificada_at: string | null;
  direccion_verificada_con: string | null;
  direccion_entrega: string | null;
  despachado_at: string | null;
  transportista: string | null;
  guia: string | null;
  recibe_nombre: string | null;
  cerrado_at: string | null;
}

export type ResponsablePaso = "postventa" | "almacen" | "finanzas" | "cliente" | "central";

export interface PasoPedido {
  clave: string;
  etiqueta: string;
  /** Quién tiene que mover esto. Es lo que reparte la responsabilidad. */
  responsable: ResponsablePaso;
  hecho: boolean;
  /** Fecha ISO en que se marcó, si la hay. */
  cuando: string | null;
  /** Por qué no se puede avanzar todavía. */
  trabado?: string;
  detalle?: string;
}

export interface BloquePedido {
  numero: 1 | 2 | 3;
  titulo: string;
  pasos: PasoPedido[];
  completo: boolean;
  enCurso: boolean;
}

const ETIQUETA_RESPONSABLE: Record<ResponsablePaso, string> = {
  postventa: "Postventa",
  almacen: "Almacén",
  finanzas: "Finanzas",
  cliente: "El cliente",
  central: "Central",
};

export function etiquetaResponsable(r: ResponsablePaso): string {
  return ETIQUETA_RESPONSABLE[r];
}

/** Una fila del Excel viejo dice "SI" donde el flujo nuevo pone una fecha. */
function marcadoEnExcel(texto: string | null): boolean {
  if (!texto) return false;
  const t = texto.trim().toUpperCase();
  return t === "SI" || t === "SÍ" || t === "OK" || t === "LISTO" || t === "X";
}

export function saldoPendiente(s: ServicioPostventa): number {
  if (s.monto == null) return 0;
  return Math.max(0, Number(s.monto) - Number(s.monto_pagado ?? 0));
}

export function esProvincia(s: ServicioPostventa): boolean {
  return s.modalidad === "provincia";
}

/**
 * Los tres bloques del pedido, con su estado ya resuelto.
 *
 * El orden importa: un paso «trabado» no es un paso pendiente cualquiera, es
 * el que hay que ir a destrabar, y casi siempre está en manos de otra área.
 */
export function bloquesPedido(s: ServicioPostventa): BloquePedido[] {
  const saldo = saldoPendiente(s);
  const pagado = saldo === 0 || s.pago_confirmado_at != null || marcadoEnExcel(s.confirmacion_abono);
  const provincia = esProvincia(s);

  // En las filas que vinieron del Excel el pago nunca se cargó como monto: la
  // columna era texto y muchas están vacías. Decir «falta el saldo de US$
  // 10.000» sobre una venta que quizá está cobrada hace un año sería inventar
  // un dato. Cuando no se sabe, la pantalla dice que no se sabe.
  const pagoDesconocido =
    !pagado && s.informe_cierre_id == null && Number(s.monto_pagado ?? 0) === 0 && s.pago_confirmado_at == null;

  const preparacion: PasoPedido[] = [
    {
      clave: "aprobado",
      etiqueta: "Pedido aprobado por postventa",
      responsable: "postventa",
      // Las filas que vinieron del Excel nunca pasaron por el acuse y ya
      // estaban en curso: exigírselo las mostraría todas trabadas en el paso 1.
      hecho: s.aprobado_at != null || s.informe_cierre_id == null,
      cuando: s.aprobado_at,
      detalle: s.numero_pedido_erp ? `Pedido ERP ${s.numero_pedido_erp}` : undefined,
    },
    {
      clave: "prueba",
      etiqueta: "Probado y embalado",
      responsable: "almacen",
      hecho: s.prueba_lista_at != null || marcadoEnExcel(s.prueba_embalaje),
      cuando: s.prueba_lista_at,
      detalle: s.protocolo_prueba_ref ? `Protocolo ${s.protocolo_prueba_ref}` : undefined,
      trabado:
        s.prueba_lista_at == null && s.prueba_solicitada_at != null
          ? "Solicitado al almacén, sin respuesta todavía"
          : undefined,
    },
    {
      clave: "plano",
      etiqueta: "Plano de preinstalación enviado",
      responsable: "postventa",
      hecho: s.plano_enviado_at != null || marcadoEnExcel(s.planos_preinstalacion),
      cuando: s.plano_enviado_at,
      detalle: "Cuanto antes salga, antes prepara el cliente agua, desagüe y energía",
    },
  ];

  const despacho: PasoPedido[] = [
    {
      clave: "pago",
      etiqueta: pagado
        ? "Pago confirmado"
        : pagoDesconocido
          ? "Pago sin registrar en el sistema"
          : `Falta el saldo${s.monto ? ` de ${s.moneda} ${saldo.toLocaleString("es-PE")}` : ""}`,
      responsable: "finanzas",
      hecho: pagado,
      cuando: s.pago_confirmado_at,
      detalle: pagoDesconocido ? "Viene del Excel: el monto pagado nunca se cargó" : undefined,
      trabado: pagado || pagoDesconocido ? undefined : "Lo confirma Finanzas. Postventa no cobra.",
    },
    {
      clave: "direccion",
      etiqueta: "Dirección verificada con el cliente",
      responsable: "postventa",
      hecho: s.direccion_verificada_at != null,
      cuando: s.direccion_verificada_at,
      detalle: s.direccion_verificada_con ? `Confirmó ${s.direccion_verificada_con}` : undefined,
    },
    // Solo en provincia: en Lima la verificación la hace el técnico al llegar.
    ...(provincia
      ? [
          {
            clave: "preinstalacion",
            etiqueta: "Preinstalación confirmada por el cliente",
            responsable: "cliente" as ResponsablePaso,
            hecho: s.preinstalacion_ok_at != null,
            cuando: s.preinstalacion_ok_at,
            detalle: s.preinstalacion_nota ?? "Foto de los puntos de agua, desagüe y energía",
          },
        ]
      : []),
    {
      clave: "despacho",
      etiqueta: s.despachado_at ? "Despachado" : "Despacho programado",
      responsable: "postventa",
      hecho: s.despachado_at != null,
      cuando: s.despachado_at ?? (s.fecha_despacho ? `${s.fecha_despacho}T12:00:00` : null),
      detalle: [s.transportista, s.guia ? `Guía ${s.guia}` : null].filter(Boolean).join(" · ") || undefined,
      trabado:
        !pagado && !pagoDesconocido && s.despachado_at == null && s.despacho_sin_cancelar_motivo == null
          ? "No se despacha con saldo pendiente sin autorización"
          : undefined,
    },
  ];

  const cierre: PasoPedido[] = [
    {
      clave: "puesta",
      etiqueta: "Puesta en marcha",
      responsable: "postventa",
      hecho: s.puesta_en_marcha != null,
      cuando: s.puesta_en_marcha ? `${s.puesta_en_marcha}T12:00:00` : null,
      detalle: provincia ? "En provincia, normalmente por videollamada" : "In situ",
    },
    {
      clave: "cerrado",
      etiqueta: "Pedido cerrado",
      responsable: "postventa",
      hecho: s.cerrado_at != null || s.completado,
      cuando: s.cerrado_at,
      detalle: "Al cerrar, el equipo entra al parque instalado con su garantía",
    },
  ];

  return [
    { numero: 1, titulo: "Preparación", pasos: preparacion, ...resumen(preparacion) },
    { numero: 2, titulo: "Despacho", pasos: despacho, ...resumen(despacho) },
    { numero: 3, titulo: "Puesta en marcha y cierre", pasos: cierre, ...resumen(cierre) },
  ];
}

function resumen(pasos: PasoPedido[]): { completo: boolean; enCurso: boolean } {
  const completo = pasos.every((p) => p.hecho);
  return { completo, enCurso: !completo && pasos.some((p) => p.hecho) };
}

/**
 * La frase de la cabecera: qué está frenando este pedido, o qué sigue.
 *
 * Responde de un vistazo la única pregunta que importa cuando alguien abre la
 * ficha, y de paso reparte la responsabilidad: un despacho detenido por el
 * saldo no es demora de postventa.
 */
export function queLoFrena(s: ServicioPostventa): { texto: string; responsable: ResponsablePaso; grave: boolean } | null {
  if (s.completado || s.cerrado_at) return null;
  if (s.aprobado_at == null && s.informe_cierre_id != null) {
    return { texto: "Esperando que postventa lo apruebe", responsable: "postventa", grave: false };
  }
  for (const bloque of bloquesPedido(s)) {
    for (const paso of bloque.pasos) {
      if (paso.hecho) continue;
      if (paso.trabado) return { texto: paso.trabado, responsable: paso.responsable, grave: true };
      return { texto: `Sigue: ${paso.etiqueta.toLowerCase()}`, responsable: paso.responsable, grave: false };
    }
  }
  return null;
}

/** Cuántos de los pasos del pedido están marcados (para la barra de avance). */
export function avancePedido(s: ServicioPostventa): { hechos: number; total: number } {
  const pasos = bloquesPedido(s).flatMap((b) => b.pasos);
  return { hechos: pasos.filter((p) => p.hecho).length, total: pasos.length };
}

// ── El otro flujo: los casos que deriva Central ────────────────────────────
//
// Carlos validó que las etapas comerciales sirven —«los estados están bien,
// funcionan bastante similar: esperando el repuesto entra en seguimiento»—, así
// que el DATO no cambia. Lo que cambia es la palabra en pantalla, porque
// «potencial» no significa nada cuando lo que se está haciendo es programar una
// visita técnica. Cero migración, vocabulario correcto.
export const ETIQUETA_ETAPA_POSTVENTA: Record<string, string> = {
  asignada: "Recibido",
  filtrada: "Diagnosticado",
  cotizada: "Cotizado al cliente",
  seguimiento: "Esperando repuesto o respuesta",
  potencial: "Programado",
  venta: "Ejecutado",
  rechazada: "No procede",
  derivada: "Derivado",
};

export function etiquetaEtapaPostventa(etapa: string): string {
  return ETIQUETA_ETAPA_POSTVENTA[etapa] ?? etapa;
}

/**
 * El reloj de los casos. Un equipo parado es un cliente parado: la garantía
 * corre distinto que un pedido de repuesto o un mantenimiento programado.
 */
const HORAS_SLA: Record<string, number> = { garantia: 2, repuesto: 24, mantenimiento: 24 };

export function slaCaso(
  tipo: string | null,
  desdeISO: string,
  atendido: boolean,
): { estado: "verde" | "ambar" | "rojo"; horas: number; limite: number } {
  const limite = HORAS_SLA[tipo ?? ""] ?? 24;
  const horas = (Date.now() - new Date(desdeISO).getTime()) / 36e5;
  if (atendido) return { estado: "verde", horas, limite };
  if (horas > limite) return { estado: "rojo", horas, limite };
  if (horas > limite * 0.6) return { estado: "ambar", horas, limite };
  return { estado: "verde", horas, limite };
}

// Los tipos de servicio del manual (ítem XII), tal como los nombra el área.
export const TIPOS_SERVICIO = [
  { valor: "puesta_en_marcha", etiqueta: "Puesta en marcha" },
  { valor: "garantia", etiqueta: "Servicio técnico por garantía" },
  { valor: "mantenimiento_preventivo", etiqueta: "Mantenimiento preventivo" },
  { valor: "mantenimiento_correctivo", etiqueta: "Mantenimiento correctivo" },
  { valor: "preinstalacion", etiqueta: "Visita de preinstalación" },
  { valor: "evaluacion", etiqueta: "Evaluación / levantamiento de observaciones" },
  { valor: "capacitacion", etiqueta: "Capacitación" },
  { valor: "entrega", etiqueta: "Entrega de equipo o repuesto" },
] as const;

export function etiquetaTipoServicio(tipo: string): string {
  return TIPOS_SERVICIO.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

/**
 * Estado de la garantía de un equipo, para la ficha y para el aviso.
 *
 * El punto de los 11 meses no es capricho: es cuando conviene llamar al cliente
 * a ofrecerle el mantenimiento, mientras la garantía todavía lo protege.
 */
export function estadoGarantia(hasta: string | null): {
  vigente: boolean;
  diasRestantes: number | null;
  etiqueta: string;
  porVencer: boolean;
} {
  if (!hasta) return { vigente: false, diasRestantes: null, etiqueta: "Sin garantía registrada", porVencer: false };
  const dias = Math.round((new Date(hasta + "T12:00:00").getTime() - Date.now()) / 864e5);
  if (dias < 0) return { vigente: false, diasRestantes: dias, etiqueta: "Fuera de garantía", porVencer: false };
  const meses = Math.round(dias / 30);
  return {
    vigente: true,
    diasRestantes: dias,
    etiqueta: meses <= 1 ? "En garantía, vence este mes" : `En garantía, ${meses} meses`,
    porVencer: dias <= 60,
  };
}
