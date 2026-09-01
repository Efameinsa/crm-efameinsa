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
  /**
   * El pago, resuelto ANTES de tapar las cifras (ver `sinPrecios`).
   *
   * No viene de la base: lo calcula el servidor. Existe porque el estado del
   * pago se deducía de los montos, y a quien no puede verlos había que
   * seguir diciéndole si el pedido está cobrado — sin decirle cuánto.
   */
  pago_estado?: EstadoPago;
}

/**
 * El pago dicho sin plata: es lo único que postventa necesita saber para
 * decidir un despacho.
 *
 * `sin_registrar` no es «no pagó»: es «nadie cargó el dato». Casi todas las
 * filas del Excel están así y afirmarles un saldo sería inventarlo.
 */
export type EstadoPago = "completo" | "parcial" | "sin_registrar";

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  completo: "Pagado completo",
  parcial: "Pago parcial",
  sin_registrar: "Pago sin registrar",
};

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

/**
 * En qué está el pago, mirando los montos crudos.
 *
 * Se calcula UNA vez en el servidor, antes de que `sinPrecios` borre las
 * cifras. Después, `bloquesPedido` lee este campo y no vuelve a mirar los
 * montos: si los mirara, un pedido con `monto` en null —que es lo que queda
 * tras tapar— daría saldo cero y se leería «pagado», que es justo lo contrario
 * de lo que pasa.
 */
export function estadoPago(s: ServicioPostventa): EstadoPago {
  if (s.pago_estado) return s.pago_estado;
  const pagado =
    saldoPendiente(s) === 0 || s.pago_confirmado_at != null || marcadoEnExcel(s.confirmacion_abono);
  if (pagado) return "completo";
  // Las filas del Excel nunca cargaron el monto pagado: la columna era texto y
  // casi todas están vacías. Decir «falta el saldo» sobre una venta que quizá
  // se cobró hace un año sería inventar un dato.
  const desconocido =
    s.informe_cierre_id == null && Number(s.monto_pagado ?? 0) === 0 && s.pago_confirmado_at == null;
  return desconocido ? "sin_registrar" : "parcial";
}

/**
 * El pedido sin una sola cifra de venta, para quien no debe verlas.
 *
 * «Como política es eso: ni almacén ni postventa deberían tener acceso a los
 * precios… que puedas mirar la forma de pago sí, pero que no te muestre el
 * detalle» (Carlos, 27-08).
 *
 * Se tapa en el SERVIDOR y no con CSS: lo que no debe verse no viaja al
 * navegador. Y se resuelve el estado del pago antes de borrar, porque después
 * ya no hay con qué deducirlo.
 */
export function sinPrecios(s: ServicioPostventa): ServicioPostventa {
  return { ...s, pago_estado: estadoPago(s), monto: null, monto_pagado: null };
}

/**
 * Quién ve las cifras de la venta. Gerencia y admin, todo; el área de
 * postventa, nada. Un comercial que además hace postventa (0093) SÍ las ve:
 * es vendedor y cotiza — la política es sobre el área, no sobre el sombrero.
 */
export function puedeVerPrecios(perfil: { rol: string; es_postventa?: boolean | null }): boolean {
  if (perfil.rol === "gerencia" || perfil.rol === "admin") return true;
  return !perfil.es_postventa;
}

/**
 * ¿Ve TODO el trabajo de postventa, esté en la cartera de quien esté?
 *
 * Santos, 01-09, con la señorita de postventa buscando a la Congregación
 * Mercedaria (cartera de Ariana) sin encontrarla: «queremos ver todo en
 * postventa; luego vemos cómo lo debe ver comercial». El área (es_postventa),
 * quien tiene la llave que reparte operaciones (hace_postventa, 0116) y
 * gerencia ven el área entera; la RLS (0124) ya lo permitía —«ver no es
 * contabilizar»—, faltaba que las pantallas dejaran de recortar por
 * comercial. Es UNA regla para la agenda, los casos, Mi día y la ruta.
 */
export function veTodoPostventa(perfil: {
  rol: string;
  es_postventa?: boolean | null;
  hace_postventa?: boolean | null;
}): boolean {
  return (
    perfil.rol === "gerencia" ||
    perfil.rol === "admin" ||
    Boolean(perfil.es_postventa) ||
    Boolean(perfil.hace_postventa)
  );
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
  const provincia = esProvincia(s);

  // El estado del pago se le pregunta a `estadoPago`, nunca a los montos: si la
  // ficha viene con las cifras tapadas (`sinPrecios`) los montos ya no están y
  // mirarlos daría saldo cero, o sea «pagado», que es lo contrario del dato.
  // Cuando no se sabe, la pantalla dice que no se sabe.
  const estado = estadoPago(s);
  const pagado = estado === "completo";
  const pagoDesconocido = estado === "sin_registrar";

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

/**
 * La serie escondida dentro de la descripción del equipo.
 *
 * El área escribe la máquina y su serie en una sola frase, como en su Excel y
 * en los informes del manual: «LAVADORA TITAN MAX S: 509KWSB0A214», «CALDERA
 * GENERADORA DE VAPOR EFAMEIN S: EFAC1215», «SECADORA … SERIE: 707KWVQ1V255».
 * Sacarla de ahí es lo que permite enlazar un informe viejo con la ficha de la
 * máquina, sin pedirle a nadie que vuelva a tipear nada.
 *
 * Se aceptan las variantes que aparecen en los documentos reales —`S:`, `S/N`,
 * `SERIE:`, con o sin espacio— y también la del manual con el typo («SERE:»),
 * porque está en un informe emitido y ese informe existe.
 *
 * LOS DOS PUNTOS SON OBLIGATORIOS y no es un capricho: sin ellos, la `S` de
 * «LAVADORA-SECADORA APILABLE» se lee como marca de serie y devuelve
 * «ECADORA». Lo agarró la prueba antes que la pantalla.
 */
export function seriesDeTexto(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const encontradas = texto.matchAll(
    /(?:\bS\/N\s*[:.]?|\b(?:S|SN|SERE|SERIES|SERIE)\s*[:.])\s*([A-Z0-9][A-Z0-9-]{4,})/gi,
  );
  const vistas = new Set<string>();
  for (const m of encontradas) {
    const serie = m[1].toUpperCase().replace(/[.,;]$/, "");
    if (!vistas.has(serie)) vistas.add(serie);
  }
  return [...vistas];
}

// Los tipos de servicio del manual (ítem XII), tal como los nombra el área, más
// los cuatro que la reunión del 27-08 aclaró que son los informes que de verdad
// se emiten (D9): el de llamada, el de revisión al recibir un equipo, el final
// y el informe técnico de servicio. Los ocho primeros describen QUÉ se hizo;
// estos cuatro, QUÉ documento volvió — comparten tabla porque comparten
// cabecera, fotos y conformidad del cliente (migración 0096).
export const TIPOS_SERVICIO = [
  { valor: "puesta_en_marcha", etiqueta: "Puesta en marcha" },
  { valor: "garantia", etiqueta: "Servicio técnico por garantía" },
  { valor: "mantenimiento_preventivo", etiqueta: "Mantenimiento preventivo" },
  { valor: "mantenimiento_correctivo", etiqueta: "Mantenimiento correctivo" },
  { valor: "preinstalacion", etiqueta: "Visita de preinstalación" },
  { valor: "evaluacion", etiqueta: "Evaluación / levantamiento de observaciones" },
  { valor: "capacitacion", etiqueta: "Capacitación" },
  { valor: "entrega", etiqueta: "Entrega de equipo o repuesto" },
  { valor: "llamada", etiqueta: "Informe de llamada" },
  { valor: "revision", etiqueta: "Revisión al recibir el equipo" },
  { valor: "informe_final", etiqueta: "Informe final" },
  { valor: "tecnico", etiqueta: "Informe técnico de servicio" },
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
  // Días de CALENDARIO, no milisegundos. Restando instantes, una garantía
  // vencida ayer seguía dando «en garantía» durante media tarde: la diferencia
  // caía en −0.3 días, que redondea a −0, y −0 < 0 es falso. La garantía se
  // mide por fecha, y la fecha que manda es la de Lima.
  const hoyLima = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const hoy = Date.UTC(hoyLima.getFullYear(), hoyLima.getMonth(), hoyLima.getDate());
  const [anio, mes, dia] = hasta.split("-").map(Number);
  const dias = Math.round((Date.UTC(anio, (mes ?? 1) - 1, dia ?? 1) - hoy) / 864e5);
  if (dias < 0) return { vigente: false, diasRestantes: dias, etiqueta: "Fuera de garantía", porVencer: false };
  const meses = Math.round(dias / 30);
  return {
    vigente: true,
    diasRestantes: dias,
    etiqueta: meses <= 1 ? "En garantía, vence este mes" : `En garantía, ${meses} meses`,
    porVencer: dias <= 60,
  };
}
