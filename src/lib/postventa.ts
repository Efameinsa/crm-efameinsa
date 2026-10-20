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
  /** Pedido de un cierre en Word anterior al CRM (REG, 0397): ya entregado, no suma venta. */
  regularizado?: boolean;
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
  es_prueba?: boolean;
  /** Lo que registra el almacén (0246). */
  almacen_listo_at?: string | null;
  almacen_listo_nota?: string | null;
  salida_fotos?: FotoAlmacen[] | null;
  salida_nota?: string | null;
  /** Salida del almacén con saldo pendiente, autorizada con código (0297). */
  salida_autorizada_at?: string | null;
  /** Finanzas revisó la apertura y autorizó la guía de salida (0308). */
  guia_confirmada_at?: string | null;
  guia_confirmada_nota?: string | null;
  /** Con qué comprobante autorizó Finanzas la guía (0384). */
  guia_comprobante_tipo?: "factura" | "boleta" | "sin_comprobante" | null;
  guia_comprobante_numero?: string | null;
  /** Motivo de la guía que define Contabilidad al autorizarla (0486): venta, traslado o consignacion. */
  guia_motivo?: string | null;
  /** Cuando el motivo es «otro» (0487): cuál. */
  guia_motivo_detalle?: string | null;
  salida_autorizada_motivo?: string | null;
  despacho_autorizado_por?: string | null;
  /** Visto bueno de Finanzas para que salga una venta a crédito (0469). */
  finanzas_vb_at?: string | null;
  finanzas_vb_por?: string | null;
  finanzas_vb_nota?: string | null;
  finanzas_vb_comision?: number | null;
  letras_cantidad?: number | null;
  letras_estado?: EstadoLetras | null;
  letras_firmadas_at?: string | null;
  /** Quién hizo cada etapa (0473): las que solo guardaban la hora. */
  prueba_solicitada_por?: string | null;
  plano_enviado_por?: string | null;
  direccion_verificada_por?: string | null;
  preinstalacion_ok_por?: string | null;
  apertura_enviada_almacen_por?: string | null;
  apertura_enviada_cliente_por?: string | null;
  despachado_por?: string | null;
  cerrado_por?: string | null;
  letras_recibidas_almacen_por?: string | null;
  letras_entregadas_por?: string | null;
  letras_firmadas_por?: string | null;
  /** Las letras que viajan con el equipo (0470): el almacén las tiene, y a quién se entregaron. */
  letras_recibidas_almacen_at?: string | null;
  letras_entregadas_at?: string | null;
  letras_entregadas_a?: string | null;
  letras_entregadas_fotos?: FotoAlmacen[] | null;
  letras_entregadas_nota?: string | null;
  agencia_at?: string | null;
  agencia_fotos?: FotoAlmacen[] | null;
  protocolo_fotos?: FotoAlmacen[] | null;
  despacho_verificado_at?: string | null;
  /** Qué se vendió, y por eso qué circuito sigue (0237/0239). */
  tipo_pedido?: TipoPedido | null;
  entrega_en?: "planta" | "agencia" | "cliente" | null;
  con_instalacion?: boolean | null;
  monto_pagado: number | null;
  /** Detracción o retención que el cliente paga a SUNAT y no a la empresa (0534): cuenta como pagado. */
  retenido_monto?: number | null;
  pago_confirmado_at: string | null;
  /** Quién de Finanzas confirmó y por qué medio (0150). */
  pago_confirmado_detalle?: string | null;
  pago_observado_at?: string | null;
  pago_observado_motivo?: string | null;
  /** Cuándo postventa le pidió a Finanzas confirmar el abono (0295). */
  pago_solicitado_at?: string | null;
  /** La sirena de Central a Finanzas (0298): último aviso, su motivo y cuántos lleva. */
  urgencia_finanzas_at?: string | null;
  urgencia_finanzas_motivo?: string | null;
  urgencia_finanzas_n?: number | null;
  pago_confirmado_captura?: string | null;
  /** La apertura de despacho: el documento con el que almacén despacha (0150). */
  apertura_despacho_at?: string | null;
  apertura_despacho_por?: string | null;
  recibe_doc?: string | null;
  recibe_telefono?: string | null;
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
   * La apertura de servicio: el formato que sale al equipo por correo (0175).
   * Son los datos que no vivían en ninguna parte y viajaban en la cabeza de
   * quien armaba el correo.
   */
  /** Hora del despacho programado (0269). */
  despacho_hora?: string | null;
  /** No lleva plano de preinstalación (repuesto, accesorio) y por qué (0259). */
  sin_plano?: boolean | null;
  sin_plano_motivo?: string | null;
  /** A domicilio o en agencia, y cuál (0259); o el cliente lo recoge en nuestras instalaciones (0434). */
  entrega_modo?: "domicilio" | "agencia" | "planta" | null;
  agencia_destino?: string | null;
  /** Entrega en agencia: dirección de la agencia donde lo deja el almacén (0345). */
  agencia_direccion?: string | null;
  /** Horario de atención de la agencia (0505; Lesly, 15-10). */
  agencia_horario?: string | null;
  apertura_tipo?: string | null;
  apertura_fecha?: string | null;
  apertura_hora?: string | null;
  tecnico_asignado?: string | null;
  transporte?: string | null;
  apertura_nota?: string | null;
  direccion_final?: string | null;
  /** La sede o dirección de la agencia en destino, al lado del destino final (0388, Rubí 03-10). */
  destino_observacion?: string | null;
  /** La NOTA en amarillo del destino final: null = la automática, "" = sin nota (0438, Rubí 12-10). */
  destino_nota?: string | null;
  /** Observaciones escritas por fila de la apertura: {"6": "…"} (0445, Rubí 12-10). */
  apertura_obs_filas?: Record<string, string> | null;
  /** La guía que se pide con la apertura y con quién coordina el técnico (0371, Lesly 02-10). */
  apertura_guia?: string | null;
  apertura_guia_detalle?: string | null;
  apertura_coordina_contabilidad?: string | null;
  apertura_coordina_logistica?: string | null;
  /** Empresa elegida para la apertura de un pedido sin cierre (0421). */
  apertura_empresa?: "EFAMEINSA" | "OPEN" | null;
  /** Fila 2 de la apertura: orden de compra, de servicio o ninguna, y su número (0508; buzón Rubí 16-10). */
  apertura_orden_tipo?: "compra" | "servicio" | "sin" | null;
  apertura_orden_numero?: string | null;
  /** Si los equipos van con accesorios, lo dice Central al pedir el código (0510; buzón Lesly 16-10). */
  accesorios_incluye?: boolean | null;
  accesorios_detalle?: string | null;
  /** «Ya lo mandé»: el correo de la apertura, marcado por separado al almacén y al cliente (0271). */
  apertura_enviada_almacen_at?: string | null;
  apertura_enviada_cliente_at?: string | null;
  /**
   * El pago, resuelto ANTES de tapar las cifras (ver `sinPrecios`).
   *
   * No viene de la base: lo calcula el servidor. Existe porque el estado del
   * pago se deducía de los montos, y a quien no puede verlos había que
   * seguir diciéndole si el pedido está cobrado — sin decirle cuánto.
   */
  pago_estado?: EstadoPago;
  /**
   * LA CONDICIÓN DE PAGO COMO DATO (0232). Qué % del total debe estar pagado
   * para despachar sin autorización, y a cuántos días va el saldo. Son
   * porcentajes y plazos, no cifras: postventa sí puede verlos.
   */
  pct_antes_despacho?: number | null;
  credito_dias?: number | null;
  condicion_definida_at?: string | null;
  condicion_nota?: string | null;
  /**
   * «Lo pagado cubre lo acordado para despachar», resuelto en el servidor
   * ANTES de tapar las cifras, igual que pago_estado. Es lo que decide si el
   * diálogo de la salida pide «quién autorizó»: si el servidor va a exigirlo,
   * la pantalla lo pregunta. Antes decía «completo» y el servidor rechazaba.
   */
  despacho_liberado?: boolean;
  /** Postventa terminó y le ordenó a Finanzas facturar y cobrar el saldo (0460, reunión 13-10). */
  orden_facturar_at?: string | null;
  orden_facturar_por?: string | null;
  orden_facturar_nota?: string | null;
  orden_facturar_atendida_at?: string | null;
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

/**
 * «No se le envió» (Rubí, 30-09): el equipo llevaba plano y no salió. Se
 * guarda en las mismas columnas que «No lleva plano» (0259), con el motivo
 * empezando por este prefijo, para no abrir otra migración por una marca.
 */
export const PREFIJO_PLANO_NO_ENVIADO = "No se le envió";

export function planoNoEnviado(s: Pick<ServicioPostventa, "sin_plano" | "sin_plano_motivo">): boolean {
  return s.sin_plano === true && (s.sin_plano_motivo ?? "").startsWith(PREFIJO_PLANO_NO_ENVIADO);
}

/** Lo que se guarda: el porqué y quién tenía a cargo el envío (Rubí, 30-09). */
export function textoPlanoNoEnviado(motivo: string, aCargo: string): string {
  return `${PREFIJO_PLANO_NO_ENVIADO}: ${motivo.trim()} · Lo tenía a cargo: ${aCargo.trim()}`;
}

/** El porqué sin el prefijo: «pedido anterior al circuito, ya se entregó». */
export function motivoPlanoNoEnviado(s: Pick<ServicioPostventa, "sin_plano_motivo">): string {
  return (s.sin_plano_motivo ?? "").slice(PREFIJO_PLANO_NO_ENVIADO.length).replace(/^[\s:·—-]+/, "").trim();
}

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
  /**
   * Hecho, pero con algo que hay que LEER antes de seguir. Reunión 15-10
   * (Carlos, Ariana, Santos; caso Wong Lu Vega): el pago parcial salía con el
   * check verde de «Finanzas confirmó» y postventa, revisando todo lo que
   * faltaba atender, lo leyó como pagado al 100 % y quiso despachar. Carlos:
   * «no debe salir como verde»; Ariana: «algo visual que dé alerta… amarillo»;
   * Carlos: «más que color, que sea algo que uno lee y diga no; ambas cosas».
   * Se pinta en ámbar, con el texto de qué falta.
   */
  alerta?: string;
  detalle?: string;
  /** Quién lo hizo o lo aprobó (0473): el id, y el nombre si quien llama pasó los nombres. */
  por?: string | null;
  quien?: string | null;
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
/**
 * LA PRUEBA QUE NADIE PIDIÓ (reunión 23-09, Hortifrut: dos pedidos para dos
 * sedes, a uno se le pidió probar y embalar y al otro no — «está en el aire»).
 * Probar y embalar no espera al pago, así que un pedido vivo con equipo que
 * todavía no salió y al que nadie le pidió la prueba es trabajo de postventa
 * hoy. Distinto de «falta la prueba»: esa incluye las que ya se pidieron y
 * esperan al almacén.
 */
export function pruebaSinPedir(s: ServicioPostventa): boolean {
  if (circuitoDe(s).esServicio) return false;
  if (s.despachado_at) return false;
  if (s.prueba_lista_at != null || marcadoEnExcel(s.prueba_embalaje)) return false;
  return s.prueba_solicitada_at == null;
}

function marcadoEnExcel(texto: string | null): boolean {
  if (!texto) return false;
  const t = texto.trim().toUpperCase();
  return t === "SI" || t === "SÍ" || t === "OK" || t === "LISTO" || t === "X";
}

export type EstadoLetras = "no_lleva" | "van_con_el_equipo" | "entregadas" | "firmadas";

export const ETIQUETA_LETRAS: Record<EstadoLetras, string> = {
  no_lleva: "No lleva letras",
  van_con_el_equipo: "Las letras van con el equipo",
  entregadas: "El cliente tiene las letras, falta que las firme",
  firmadas: "Letras firmadas",
};

/**
 * ¿Esta venta necesita el visto bueno de Finanzas para salir? (0469)
 *
 * Caso COFACO (14-10): «50 % adelanto + 50 % saldo en 3 letras», del Excel
 * con «abono: SI». El CRM lo leyó como pagado y el equipo salió sin que
 * Finanzas entregara las letras. Toda venta con saldo a crédito pasa por
 * Finanzas antes de salir. Misma regla que `pide_visto_bueno_finanzas` en la
 * base, que es la que de verdad frena (trigger).
 */
type DatosCredito = {
  forma_pago?: string | null;
  pct_antes_despacho?: number | null;
  origen?: string | null;
  letras_cantidad?: number | null;
  tipo_pedido?: TipoPedido | null;
  confirmacion_abono?: string | null;
  informe_cierre_id?: string | null;
  pago_confirmado_at?: string | null;
};

/**
 * 0473 suma dos casos que la 0469 no veía: el crédito escrito como plazo
 * («FACTURA A 30 DIAS») o anotado en el abono («credito»), y el pedido del
 * Excel sin un «SI» limpio ni confirmación en el CRM («Pendiente», vacío,
 * «SI PENDIENTE UNA COMISION»): ahí nadie sabe si se pagó.
 */
export function pideVistoBuenoFinanzas(s: DatosCredito): boolean {
  if (s.tipo_pedido === "revision" || s.tipo_pedido === "mantenimiento") return false;
  if (s.origen === "caso") return false;
  return (
    (s.pct_antes_despacho != null && Number(s.pct_antes_despacho) < 100) ||
    /(letra|cr[eé]dito|financ|a\s*\d+\s*d[ií]as)/i.test(s.forma_pago ?? "") ||
    /cr[eé]dito/i.test(s.confirmacion_abono ?? "") ||
    Number(s.letras_cantidad ?? 0) > 0 ||
    (s.informe_cierre_id == null && s.pago_confirmado_at == null && !marcadoEnExcel(s.confirmacion_abono ?? null))
  );
}

/** Falta el visto bueno y nadie autorizó la salida con código: el equipo no sale. */
export function faltaVistoBuenoFinanzas(
  s: DatosCredito & { finanzas_vb_at?: string | null; salida_autorizada_at?: string | null; despachado_at?: string | null },
): boolean {
  return pideVistoBuenoFinanzas(s) && !s.finanzas_vb_at && !s.salida_autorizada_at && !s.despachado_at;
}

/** Las letras salieron (con el equipo o ya las tiene el cliente) y todavía no vuelven firmadas. */
export function letrasPorFirmar(s: Pick<ServicioPostventa, "letras_estado">): boolean {
  return s.letras_estado === "van_con_el_equipo" || s.letras_estado === "entregadas";
}

/**
 * LAS LETRAS QUE VIAJAN CON EL EQUIPO (0470; Santos 14-10: «pueden salir con
 * venta a crédito pero tienen que llevar sus letras… tiene que avisar que ya
 * se entregó»). El equipo sale con ellas; falta que el almacén las tenga antes
 * de salir y que alguien confirme a quién se entregaron.
 */
export function letrasViajan(s: Pick<ServicioPostventa, "letras_estado" | "letras_recibidas_almacen_at" | "letras_entregadas_at">): boolean {
  return s.letras_estado === "van_con_el_equipo" || s.letras_recibidas_almacen_at != null || s.letras_entregadas_at != null;
}

/** El almacén todavía no tiene las letras y el equipo no salió: no se registra la salida. */
export function faltanLetrasEnAlmacen(
  s: Pick<ServicioPostventa, "letras_estado" | "letras_recibidas_almacen_at" | "salida_autorizada_at" | "despachado_at">,
): boolean {
  return s.letras_estado === "van_con_el_equipo" && !s.letras_recibidas_almacen_at && !s.salida_autorizada_at && !s.despachado_at;
}

export function saldoPendiente(s: ServicioPostventa): number {
  if (s.monto == null) return 0;
  return Math.max(0, Number(s.monto) - Number(s.monto_pagado ?? 0) - Number(s.retenido_monto ?? 0));
}

/**
 * El pedido no tiene nada que cobrar: nació de un caso (apertura desde la
 * ficha del cliente, 0441) — entrega de repuestos por garantía, mantenimiento
 * o puesta en marcha — y no lleva monto. Ahí no hay pago que Finanzas
 * confirme (Rubí, 12-10: «es un traslado por garantía y no hay cobro»).
 */
/**
 * ¿LLEVA ORDEN A FINANZAS PARA FACTURAR? (reunión 13-10 11:20, Carlos con
 * AGROCASAGRANDE). El 99 % paga antes y no la necesita. El resto —a crédito,
 * o con un adelanto y el saldo después del despacho o del servicio— termina
 * con postventa diciéndole a Finanzas «ya terminé, factura y cobra». Al
 * contado no aparece. No es retroactivo: lo que ya cerró sin la orden no la pide.
 */
export function llevaOrdenFacturar(s: ServicioPostventa): boolean {
  if (s.orden_facturar_at) return true;
  if (pedidoSinCobro(s)) return false;
  if (s.cerrado_at != null || s.completado) return false;
  if (s.pct_antes_despacho == null) return false;
  // Ya pagado completo: no queda nada que cobrar (AGROCASAGRANDE, venta a
  // crédito ya cancelada; su 2.ª visita es otro pedido de servicio).
  if (estadoPago(s) === "completo") return false;
  return Number(s.pct_antes_despacho) < 100;
}

export function pedidoSinCobro(s: Pick<ServicioPostventa, "origen" | "pago_confirmado_at">): boolean {
  return s.origen === "caso" && s.pago_confirmado_at == null;
}

/** Qué se dice en lugar de «Finanzas confirmó el pago» cuando no hay cobro. */
export function textoSinCobro(s: Pick<ServicioPostventa, "tipo_servicio"> & { apertura_tipo?: string | null }): string {
  return s.apertura_tipo === "entrega_garantia" || /garant/i.test(s.tipo_servicio ?? "")
    ? "Sin cobro: entrega por garantía"
    : "Sin cobro: servicio abierto desde un caso";
}

/**
 * ¿Lo pagado cubre lo acordado para despachar? (0232)
 *
 * La regla vieja comparaba con el TOTAL, y toda venta a crédito —que es la
 * normal de la casa: «30 % al contado y lo que falta a crédito, o a todo
 * crédito» (Carlos, 14-09)— pedía autorización en cada salida. Ahora se
 * compara con lo que la condición del informe exige antes del despacho:
 *   · 100 % (contado) → todo pagado;
 *   · 50 %            → la mitad;
 *   · 0 % (crédito)   → nada; el saldo es cuenta por cobrar, no un freno.
 * Sin condición cargada (pedidos viejos que no se pudieron leer) se exige
 * todo, como antes: no se inventa una condición.
 *
 * `saldoConocido` es la salvaguarda de siempre para las filas del Excel: el
 * monto pagado nunca se cargó y trabar por un saldo inventado sería peor.
 *
 * Es una función pura, sin base ni sesión, para poder probarla sola.
 */
export function evaluarPagoParaDespacho(
  s: Pick<ServicioPostventa, "monto" | "monto_pagado" | "pct_antes_despacho" | "informe_cierre_id" | "pago_confirmado_at"> & { retenido_monto?: number | null },
): { pct: number | null; requerido: number; pagado: number; saldoConocido: boolean; cubierto: boolean } {
  const monto = Number(s.monto ?? 0);
  // Lo retenido (detracción/retención, 0534) está «liquidado y finiquitado»
  // para el despacho: el cliente ya lo pagó, solo que a SUNAT.
  const pagado = Number(s.monto_pagado ?? 0) + Number(s.retenido_monto ?? 0);
  const pct = s.pct_antes_despacho == null ? null : Math.min(100, Math.max(0, Number(s.pct_antes_despacho)));
  const requerido = Number((pct == null ? monto : (monto * pct) / 100).toFixed(2));
  const saldoConocido = s.informe_cierre_id != null || s.pago_confirmado_at != null || pagado > 0;
  // Medio dólar de tolerancia: un adelanto del 50 % de 4.472,20 se abona
  // como 2.236 o 2.236,10 según quién redondee, y ninguno es «despachar sin
  // pagar».
  const cubierto = !saldoConocido || monto <= 0 || pagado + 0.5 >= requerido;
  return { pct, requerido, pagado, saldoConocido, cubierto };
}

/** «50 % antes del despacho · saldo a crédito a 30 días», o null si no hay condición cargada. */
export function textoCondicionPago(s: Pick<ServicioPostventa, "pct_antes_despacho" | "credito_dias">): string | null {
  if (s.pct_antes_despacho == null) return null;
  const pct = Number(s.pct_antes_despacho);
  if (pct >= 100) return "Contado: todo pagado antes del despacho";
  const dias = s.credito_dias == null ? "" : ` a ${s.credito_dias} días`;
  if (pct <= 0) return `Todo a crédito${dias}`;
  return `${pct % 1 === 0 ? pct : pct.toFixed(1)} % antes del despacho · saldo a crédito${dias}`;
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
  // Con cifras reales (pedido nacido en el CRM, o con abonos cargados) el
  // saldo manda: «Finanzas confirmó» con monto pagado 0 se leía «completo» y
  // por eso el 14-09 la salida del 495-26 no mostró el campo de autorización
  // que el servidor sí exigía. Sin cifras (Excel), la marca de confirmación
  // sigue valiendo como pagado, porque es lo único que hay.
  const conCifras = s.monto != null && (s.informe_cierre_id != null || Number(s.monto_pagado ?? 0) > 0);
  const pagado = conCifras
    ? saldoPendiente(s) === 0
    : // Sin monto no hay saldo que medir: el 0 de saldoPendiente no es «pagado»
      // (HANCO HUILLCA 06-10 salía «Pagado completo» debiendo el saldo).
      (s.monto != null && saldoPendiente(s) === 0) || s.pago_confirmado_at != null || marcadoEnExcel(s.confirmacion_abono);
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
  return { ...s, pago_estado: estadoPago(s), despacho_liberado: evaluarPagoParaDespacho(s).cubierto, monto: null, monto_pagado: null };
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
/** «embalaje» (0301, reunión 25-09): el servicio de embalaje o enjaulado; se recorre como un repuesto y se cierra con fotos. */
export type TipoPedido = "equipo" | "repuesto" | "accesorio" | "mantenimiento" | "revision" | "embalaje";

/** Una foto o un video que subió el almacén (0246). */
export interface FotoAlmacen {
  path: string;
  nombre: string;
  tipo: string;
  /** frente · lateral_izq · lateral_der · posterior · arriba · video · guia · maquina · protocolo */
  etiqueta: string;
  /** De qué máquina es la foto de la salida, cuando el pedido lleva varias (Lesly, 10-10). */
  maquina?: string | null;
  serie?: string | null;
}

/**
 * Desde cuándo se le piden al almacén las fotos de la carga (0246): la cuenta
 * del almacén trabaja con datos reales desde el 18-09 por la tarde. Lo que
 * salió antes no tiene quién lo fotografíe y no se marca como pendiente.
 */
export const FOTOS_DE_CARGA_DESDE = "2026-09-19";

/** Desde cuándo se registra que la guía y las fotos llegaron al cliente (0553, gerencia 20-10). */
export const GUIA_AL_CLIENTE_DESDE = "2026-10-20";

/** Salió (lo marcó postventa) pero el almacén no dejó las fotos de la carga. */
export function faltanFotosDeCarga(s: Pick<ServicioPostventa, "despachado_at" | "informe_cierre_id" | "salida_fotos"> & { tipo_pedido?: TipoPedido | null }): boolean {
  return (
    // En un servicio sale el técnico, no una máquina cargada (Lesly, 09-10).
    s.tipo_pedido !== "revision" &&
    s.tipo_pedido !== "mantenimiento" &&
    Boolean(s.despachado_at) &&
    Boolean(s.informe_cierre_id) &&
    (s.salida_fotos?.length ?? 0) === 0 &&
    new Date(s.despachado_at as string).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) >= FOTOS_DE_CARGA_DESDE
  );
}

/**
 * FALTA LA FOTO EN LA AGENCIA (gerencia 20-10, Beneficencia de Huancayo):
 * «faltan esas dos, planta y agencia… en el panorama debería salir». La de la
 * agencia no tenía regla: si el pedido va por agencia y ya salió, el almacén
 * la sube (guía + la máquina en la agencia) para el registro del despacho.
 */
export function faltanFotosDeAgencia(
  s: Pick<ServicioPostventa, "despachado_at" | "informe_cierre_id"> & {
    tipo_pedido?: TipoPedido | null;
    entrega_modo?: string | null;
    agencia_fotos?: unknown[] | null;
  },
): boolean {
  return (
    s.tipo_pedido !== "revision" &&
    s.tipo_pedido !== "mantenimiento" &&
    s.entrega_modo === "agencia" &&
    Boolean(s.despachado_at) &&
    Boolean(s.informe_cierre_id) &&
    (s.agencia_fotos?.length ?? 0) === 0 &&
    new Date(s.despachado_at as string).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) >= FOTOS_DE_CARGA_DESDE
  );
}

export const ETIQUETA_TIPO_PEDIDO: Record<TipoPedido, string> = {
  equipo: "Venta de equipo",
  repuesto: "Venta de repuesto",
  accesorio: "Venta de accesorio",
  mantenimiento: "Mantenimiento",
  revision: "Servicio de revisión",
  embalaje: "Servicio de embalaje",
};

/**
 * EL CIRCUITO DEPENDE DE LO QUE SE VENDIÓ (Carlos, 15-09; 0239).
 *
 * «Debería seleccionarse que es venta de repuesto o venta de equipo… repuesto
 * con entrega en planta o en agencia, con instalación o sin instalación.
 * Check, check y me despliega todo esto. Porque si no, siempre voy a tener
 * todo este proceso». Y para mantenimiento: «confirmación de Finanzas, y luego
 * programación y ejecución. El técnico va, ejecuta, sube el informe y cierra.
 * No hay probado y embalado, no hay plano de preinstalación».
 *
 * Las claves de los pasos son las mismas en los cuatro circuitos —las fechas
 * viven en las mismas columnas—; lo que cambia es qué pasos existen y cómo
 * se llaman. Un repuesto que se recoge en planta termina al entregarse; con
 * instalación, el técnico va y recién ahí se cierra.
 */
export function circuitoDe(s: ServicioPostventa): {
  tipo: TipoPedido;
  esEquipo: boolean;
  esRepuesto: boolean;
  /** Embalaje o enjaulado (0301): mismo recorrido que el repuesto, con sus propios nombres. */
  esEmbalaje: boolean;
  /** Coches y carros (0314): lo que no se conecta. Recorrido de repuesto sin instalación. */
  esAccesorio: boolean;
  esServicio: boolean;
  entregaEnPlanta: boolean;
  conInstalacion: boolean;
} {
  const tipo: TipoPedido = s.tipo_pedido ?? "equipo";
  // El embalaje se recorre como un repuesto sin instalación (Lesly y Ruby,
  // 25-09: «es lo mismo que un repuesto, solamente una foto»): listo y
  // embalado → despacho → cierre con las fotos de la salida. Ni plano, ni
  // preinstalación, ni informe.
  const esEmbalaje = tipo === "embalaje";
  // EL ACCESORIO (0314, Rubí 26-09 con el coche de Andinas): lo que no se
  // conecta a agua, gas ni energía. Se recorre como un repuesto sin
  // instalación: listo → entrega (en planta, por agencia o en el cliente) →
  // cierre. Sin plano, sin preinstalación, sin puesta en marcha.
  const esAccesorio = tipo === "accesorio";
  const esRepuesto = tipo === "repuesto" || esEmbalaje || esAccesorio;
  return {
    tipo,
    esEquipo: tipo === "equipo",
    esRepuesto,
    esEmbalaje,
    esAccesorio,
    esServicio: tipo === "mantenimiento" || tipo === "revision",
    entregaEnPlanta: (tipo === "repuesto" || esAccesorio) && s.entrega_en === "planta",
    conInstalacion: tipo === "repuesto" && s.con_instalacion === true,
  };
}

/**
 * QUIÉN HIZO CADA ETAPA (0473; Santos 14-10: «en cada etapa tiene que verse a
 * qué hora se hace, quién lo aprueba… para que visualmente podamos hacer
 * seguimiento»). El id sale del pedido; el nombre, del mapa que pasa la
 * pantalla (`nombresDelPedido`). Lo anterior a la 0473 en las etapas que solo
 * guardaban la hora queda sin nombre: no había dónde anotarlo.
 */
function porDelPaso(s: ServicioPostventa, clave: string): string | null {
  const x = s as unknown as Record<string, string | null | undefined>;
  const de: Record<string, (string | null | undefined)[]> = {
    pago: [x.pago_confirmado_por],
    vb_finanzas: [x.finanzas_vb_por, x.salida_autorizada_por],
    aprobado: [x.aprobado_por],
    prueba: [x.prueba_lista_por],
    plano: [x.plano_enviado_por],
    direccion: [x.direccion_verificada_por],
    apertura: [x.apertura_despacho_por],
    preinstalacion: [x.preinstalacion_ok_por],
    despacho: [x.despachado_por, x.agencia_por, x.despacho_autorizado_por],
    letras: [x.letras_entregadas_por],
    verificado: [x.despacho_verificado_por],
    guia_cliente: [x.guia_enviada_cliente_por],
    facturar: [x.orden_facturar_por],
    cerrado: [x.cerrado_por],
  };
  return (de[clave] ?? []).find((v) => typeof v === "string" && v.length > 0) ?? null;
}

/** Todos los ids de personas que aparecen en el pedido, para pedir sus nombres de una vez. */
export function idsDePersonasDelPedido(s: Partial<ServicioPostventa>): string[] {
  const x = s as unknown as Record<string, unknown>;
  return [...new Set(Object.entries(x).filter(([k, v]) => k.endsWith("_por") && typeof v === "string" && v.length > 0).map(([, v]) => v as string))];
}

export function bloquesPedido(s: ServicioPostventa, nombres?: Record<string, string>): BloquePedido[] {
  const bloques = bloquesPedidoSinNombres(s);
  const x = s as unknown as Record<string, string | null | undefined>;
  const nombre = (id: string | null | undefined) => (id && nombres?.[id]) || null;
  for (const b of bloques) {
    for (const p of b.pasos) {
      p.por = p.hecho ? porDelPaso(s, p.clave) : null;
      p.quien = nombre(p.por);
      // Dos aprobaciones que viven dentro de otro paso: la guía (Contabilidad) y la salida con código.
      if (p.clave === "apertura" && x.guia_confirmada_at && nombre(x.guia_confirmada_por)) {
        p.detalle = `${p.detalle ?? ""} · guía autorizada por ${nombre(x.guia_confirmada_por)}`.replace(/^ · /, "");
      }
      if (p.clave === "despacho" && x.salida_autorizada_at && nombre(x.salida_autorizada_por)) {
        p.detalle = `${p.detalle ?? ""} · salida con saldo autorizada por ${nombre(x.salida_autorizada_por)}`.replace(/^ · /, "");
      }
      if (p.clave === "letras" && x.letras_recibidas_almacen_por && nombre(x.letras_recibidas_almacen_por)) {
        p.detalle = `${p.detalle ?? ""} · las recogió del almacén ${nombre(x.letras_recibidas_almacen_por)}`.replace(/^ · /, "");
      }
    }
  }
  return bloques;
}

/**
 * CONTADO EN EL NÚMERO, SALDO EN EL TEXTO (reunión 15-10, caso Wong Lu Vega).
 *
 * El cierre decía «20 % ADELANTO // 80 % FINALES DE MES» y a la vez «100 %
 * antes del despacho». El 100 % es lo que mira postventa para despachar; con
 * el adelanto confirmado, el pedido se leyó como pagado. Devuelve true cuando
 * la forma de pago escrita describe un saldo posterior (o un adelanto que no
 * dice «antes del despacho») y el porcentaje exige el total: es el aviso que
 * ve el comercial al emitir. No bloquea: hay ventas de contado con adelanto.
 */
export function condicionContadoConSaldo(textoCondicion: string, pctAntesDespacho: number | null): boolean {
  if (pctAntesDespacho == null || pctAntesDespacho < 100) return false;
  const t = textoCondicion ?? "";
  return (
    /saldo|cuota|letra|financ|contra ?entrega|despu[eé]s|luego|fin(al)?(es)? de mes|semana|d[ií]as/i.test(t) ||
    (/adelant|a cuenta/i.test(t) && !/antes del despacho/i.test(t))
  );
}

/**
 * EL PAGO PARCIAL QUE NO CUBRE LO ACORDADO (reunión 15-10, 12:51).
 *
 * Finanzas confirmó un abono, pero lo pagado no llega a lo que la condición
 * de pago exige antes del despacho (el 100 % si es contado, o el adelanto
 * pactado). Es exactamente el caso en que el servidor va a negar la apertura:
 * acá se dice con palabras y en ámbar, para que nadie lo lea como «pagado».
 *
 * `corto` cabe en una tarjeta o una fila de lista; `largo` va en el paso del
 * pedido y en el anuncio de la cabecera. Sin cifras (postventa no ve montos,
 * `sinPrecios` las tapa) se dice lo mismo sin números: el estado del pago y
 * `despacho_liberado` ya vienen resueltos del servidor.
 *
 * No aplica cuando el adelanto acordado está cubierto (eso es lo pactado, no
 * un problema: 0232), cuando no hay cobro, ni cuando gerencia u operaciones ya
 * autorizaron la salida con su código.
 */
export function pagoParcialSinCubrir(s: ServicioPostventa): { corto: string; largo: string } | null {
  if (s.completado || s.cerrado_at || s.despachado_at) return null;
  if (pedidoSinCobro(s)) return null;
  const confirmado = s.pago_confirmado_at != null || marcadoEnExcel(s.confirmacion_abono);
  if (!confirmado) return null;
  if (estadoPago(s) !== "parcial") return null;
  const liberado = s.despacho_liberado ?? evaluarPagoParaDespacho(s).cubierto;
  if (liberado) return null;
  if (s.salida_autorizada_at || s.despacho_sin_cancelar_motivo) return null;

  const pct = s.pct_antes_despacho == null ? null : Number(s.pct_antes_despacho);
  const total = s.monto == null ? null : Number(s.monto);
  const pagado = Number(s.monto_pagado ?? 0);
  const regla =
    pct != null && pct > 0 && pct < 100
      ? `La condición es ${pct % 1 === 0 ? pct : pct.toFixed(1)} % antes del despacho y todavía no se llega.`
      : "La condición es contado: tiene que estar pagado todo antes de despachar.";
  const cierre = "No se despacha hasta que Finanzas confirme lo que falta, o gerencia u operaciones autoricen la salida con su código.";
  if (total != null && total > 0) {
    const pctPagado = Math.round((pagado / total) * 100);
    const saldo = saldoPendiente(s);
    const f = (n: number) => `${s.moneda} ${n.toLocaleString("es-PE")}`;
    return {
      corto: `Pagó el ${pctPagado} % (${f(pagado)}), faltan ${f(saldo)}`,
      largo: `Pagó ${f(pagado)} (${pctPagado} %) de ${f(total)}: faltan ${f(saldo)}. ${regla} ${cierre}`,
    };
  }
  return {
    corto: "Pagó solo un adelanto, falta el saldo",
    largo: `Pagó solo un adelanto: falta el saldo. ${regla} ${cierre}`,
  };
}

function bloquesPedidoSinNombres(s: ServicioPostventa): BloquePedido[] {
  const saldo = saldoPendiente(s);
  const provincia = esProvincia(s);
  const circuito = circuitoDe(s);

  // El estado del pago se le pregunta a `estadoPago`, nunca a los montos: si la
  // ficha viene con las cifras tapadas (`sinPrecios`) los montos ya no están y
  // mirarlos daría saldo cero, o sea «pagado», que es lo contrario del dato.
  // Cuando no se sabe, la pantalla dice que no se sabe.
  const estado = estadoPago(s);
  const pagado = estado === "completo";
  const pagoDesconocido = estado === "sin_registrar";

  // EL ORDEN LO DICTÓ CARLOS (01-09, mirando el control en vivo): «mi
  // indicador inicial es pago» → confirmación de Finanzas → aprobación →
  // probado y embalado CON FECHA Y HORA → plano en paralelo. Probar y embalar
  // NO espera al pago («tengo 5 pedidos, tengo que adelantarme»); lo que
  // espera es el despacho, que solo sale con la APERTURA.
  const pagoConfirmado = s.pago_confirmado_at != null || marcadoEnExcel(s.confirmacion_abono);
  const despachoAutorizadoConSaldo = s.despacho_sin_cancelar_motivo != null;
  // La condición de pago (0232): con el adelanto acordado cubierto, el pago
  // parcial no es un problema sino lo pactado, y la etiqueta lo dice así.
  const condicion = textoCondicionPago(s);
  const liberado = s.despacho_liberado ?? evaluarPagoParaDespacho(s).cubierto;
  const adelantoCubierto = !pagado && liberado && s.pct_antes_despacho != null && Number(s.pct_antes_despacho) < 100;
  const pideVB = pideVistoBuenoFinanzas(s);
  // El abono confirmado que no cubre lo acordado se lee en ámbar (15-10).
  const parcialSinCubrir = pagoParcialSinCubrir(s);
  // CRÉDITO SIN ADELANTO (Santos, 14-10, Beneficencia de Huancayo: todo a crédito,
  // 0 % antes del despacho). No hay abono que confirmar: el visto bueno de Finanzas
  // del crédito (0469) es su confirmación y destraba la apertura.
  const creditoSinAdelantoAprobado =
    pideVB && s.pct_antes_despacho != null && Number(s.pct_antes_despacho) === 0 && s.finanzas_vb_at != null && Number(s.monto_pagado ?? 0) === 0;
  const pruebaListaAntes = s.prueba_lista_at != null || marcadoEnExcel(s.prueba_embalaje);

  const preparacion: PasoPedido[] = [
    {
      clave: "pago",
      etiqueta: creditoSinAdelantoAprobado && !pagoConfirmado
        ? "Crédito sin adelanto: Finanzas dio el visto bueno"
        : pagoConfirmado
        ? pagado
          ? "Finanzas confirmó el pago"
          : adelantoCubierto
            ? `Finanzas confirmó el adelanto acordado (${Number(s.pct_antes_despacho)} %)`
            : parcialSinCubrir
              ? "Pago parcial: Finanzas confirmó solo un adelanto, falta el saldo"
              : "Finanzas confirmó un pago parcial"
        : pedidoSinCobro(s)
          ? textoSinCobro(s)
          : pagoDesconocido
          ? "Pago sin registrar en el sistema"
          : pagado
            ? "Cobrado del todo, falta la confirmación de Finanzas"
            : `Confirmación de Finanzas${s.monto ? ` · faltan ${s.moneda} ${saldo.toLocaleString("es-PE")}` : ""}`,
      responsable: "finanzas",
      hecho: pagoConfirmado || pedidoSinCobro(s) || creditoSinAdelantoAprobado,
      cuando: s.pago_confirmado_at ?? (creditoSinAdelantoAprobado ? (s.finanzas_vb_at ?? null) : null),
      detalle: creditoSinAdelantoAprobado && !pagoConfirmado
        ? "No hay abono antes del despacho: se cobra después, según la condición de pago"
        : pedidoSinCobro(s)
        ? "No pasa por Finanzas: no hay pago que confirmar"
        : pagoConfirmado
        ? [s.pago_confirmado_detalle, condicion ? `Condición: ${condicion}` : null].filter(Boolean).join(" · ") || undefined
        : pagoDesconocido
          ? "Viene del Excel: el monto pagado nunca se cargó"
          : "Finanzas confirma que el dinero está acreditado, no el voucher. Postventa no cobra.",
      // Finanzas observó el pago (0279): no encuentra el abono o no cuadra.
      // Se ve en el pedido hasta que confirme uno.
      // Revisión 23-09: la observación que llega DESPUÉS de un abono (la
      // comisión del saldo) también se ve; confirmar otro abono la limpia.
      ...(s.pago_observado_at && !pagoConfirmado ? { trabado: `Finanzas observó el pago: ${s.pago_observado_motivo ?? "sin detalle"}` } : {}),
      ...(s.pago_observado_at && pagoConfirmado ? { detalle: `Finanzas observó: ${s.pago_observado_motivo ?? "sin detalle"}` } : {}),
      ...(parcialSinCubrir ? { alerta: parcialSinCubrir.largo } : {}),
    },
    // VENTA A CRÉDITO: FINANZAS DA EL VISTO BUENO ANTES DE QUE SALGA (0469,
    // caso COFACO 14-10). Letras, adelanto y comisiones; la base frena la
    // apertura, la guía y la salida hasta que esté.
    ...(pideVB
      ? [
          {
            clave: "vb_finanzas",
            etiqueta: s.finanzas_vb_at
              ? "Finanzas dio el visto bueno para la salida"
              : s.salida_autorizada_at
                ? "Salida autorizada con código, sin visto bueno de Finanzas"
                : "Visto bueno de Finanzas para la salida (crédito o pago sin confirmar)",
            responsable: "finanzas" as ResponsablePaso,
            hecho: Boolean(s.finanzas_vb_at || s.salida_autorizada_at || s.despachado_at),
            cuando: s.finanzas_vb_at ?? s.salida_autorizada_at ?? null,
            detalle:
              [
                s.forma_pago ? `Forma de pago: ${s.forma_pago}` : null,
                s.letras_estado
                  ? `${ETIQUETA_LETRAS[s.letras_estado]}${s.letras_cantidad ? ` (${s.letras_cantidad})` : ""}`
                  : null,
                s.finanzas_vb_comision ? `Comisión descontada: ${s.finanzas_vb_comision}` : null,
                s.finanzas_vb_nota,
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
            trabado:
              faltaVistoBuenoFinanzas(s) && pruebaListaAntes
                ? "El equipo está listo pero no sale: Finanzas revisa el pago, las letras y las comisiones y da el visto bueno"
                : undefined,
          },
        ]
      : []),
    {
      clave: "aprobado",
      etiqueta: "Pedido aprobado por postventa",
      responsable: "postventa",
      // Las filas que vinieron del Excel nunca pasaron por el acuse y ya
      // estaban en curso: exigírselo las mostraría todas trabadas en el paso 1.
      hecho: s.aprobado_at != null || s.informe_cierre_id == null,
      cuando: s.aprobado_at,
      detalle: s.numero_pedido_erp ? `Pedido ${s.numero_pedido_erp}` : undefined,
    },
    ...(circuito.esServicio
      ? []
      : [
          {
            clave: "prueba",
            etiqueta: circuito.esEmbalaje
              ? "Embalado y listo para salir"
              : circuito.esAccesorio
                ? "Accesorio listo para entregar"
                : circuito.esRepuesto
                  ? "Repuesto listo y embalado"
                  : "Probado y embalado",
            responsable: "almacen" as ResponsablePaso,
            hecho: s.prueba_lista_at != null || marcadoEnExcel(s.prueba_embalaje),
            cuando: s.prueba_lista_at,
            detalle: s.protocolo_prueba_ref
              ? `Protocolo ${s.protocolo_prueba_ref}`
              : circuito.esEmbalaje
                ? "El almacén avisa que la máquina ya está embalada (jaula o caja)"
                : circuito.esAccesorio
                ? "El almacén avisa que el accesorio está listo para entregar"
                : circuito.esRepuesto
                ? "El almacén avisa que el repuesto está listo para entregar"
                : "Con fecha y hora: es lo que prueba que salió bien",
            trabado:
              s.prueba_lista_at == null && s.prueba_solicitada_at != null
                ? "Solicitado al almacén, sin respuesta todavía"
                : undefined,
          },
        ]),
    // El plano solo cuando el pedido lo lleva (0259, Carlos 21-09: un calderín
    // o un accesorio no tiene plano; el paso se salta y queda dicho por qué).
    // «No se le envió» (Rubí, 30-09): el equipo sí lleva plano, pero el
    // pedido es de antes del circuito y el plano nunca salió. El paso no se
    // esconde como en «No lleva plano»: queda a la vista, cerrado y dicho así.
    ...(circuito.esEquipo && (!s.sin_plano || planoNoEnviado(s))
      ? [
          planoNoEnviado(s)
            ? {
                clave: "plano",
                etiqueta: "Plano de preinstalación: no se le envió",
                responsable: "postventa" as ResponsablePaso,
                hecho: true,
                cuando: null,
                detalle: motivoPlanoNoEnviado(s) || undefined,
              }
            : {
                clave: "plano",
                etiqueta: "Plano de preinstalación enviado",
                responsable: "postventa" as ResponsablePaso,
                hecho: s.plano_enviado_at != null || marcadoEnExcel(s.planos_preinstalacion),
                cuando: s.plano_enviado_at,
                detalle: "Va en paralelo: cuanto antes salga, antes prepara el cliente agua, desagüe y energía",
              },
        ]
      : []),
  ];

  // LA APERTURA DE DESPACHO: el documento con el que almacén despacha sin
  // preguntar. Solo se emite con las cuatro condiciones cumplidas; el
  // servidor las vuelve a verificar al emitir.
  const pruebaLista = s.prueba_lista_at != null || marcadoEnExcel(s.prueba_embalaje);
  const planoEnviado = s.plano_enviado_at != null || marcadoEnExcel(s.planos_preinstalacion);
  const faltaParaApertura = [
    !(pagoConfirmado || pagoDesconocido || despachoAutorizadoConSaldo || creditoSinAdelantoAprobado) ? "la confirmación de Finanzas" : null,
    faltaVistoBuenoFinanzas(s) ? "el visto bueno de Finanzas (crédito o pago sin confirmar: pago, letras y comisiones)" : null,
    s.direccion_verificada_at == null ? (circuito.esServicio ? "dónde se hace el servicio, verificado" : "la dirección verificada") : null,
    !circuito.esServicio && !pruebaLista
      ? circuito.esEmbalaje
        ? "el embalaje listo"
        : circuito.esAccesorio
          ? "el accesorio listo"
          : circuito.esRepuesto
            ? "el repuesto listo y embalado"
            : "el equipo probado y embalado"
      : null,
    circuito.esEquipo && !s.sin_plano && !planoEnviado ? "el plano de preinstalación" : null,
    // LA PREINSTALACIÓN YA NO FRENA LA APERTURA. Carlos, 09-09: «preinstalación
    // confirmada, eso es parte de la puesta en marcha… la apertura de despacho
    // sí va en el despacho». Deja de ser un requisito para despachar y pasa al
    // bloque de la puesta en marcha, que es cuando de verdad se necesita. En
    // provincia se sigue avisando en el paso del despacho, como advertencia y
    // no como freno: mandar a provincia sin que el cliente tenga listos agua,
    // desagüe y energía es un viaje perdido.
  ].filter((x): x is string => x != null);
  const aperturaEmitida = s.apertura_despacho_at != null;

  // LA PREINSTALACIÓN, SEGÚN DÓNDE SE ENTREGA (reunión 25-09, Ruby y Lesly).
  // «Cuando es un despacho a provincia se le hace la llamada después del
  // despacho, pero cuando es en Lima la llamada se le hace antes, porque se
  // le va a realizar el despacho y la puesta en marcha». En provincia sigue en
  // el cierre (el cliente confirma con fotos cuando ya tiene el equipo); en
  // Lima pasa al bloque del despacho, ANTES de que salga. Mismas columnas.
  // No es retroactivo: lo que ya salió o ya cerró no pide una llamada que
  // nadie va a registrar.
  //
  // 01-10 (Rubí, con Bryan Ninamango): el rótulo decía «Preinstalación
  // confirmada por el cliente» también mientras faltaba, y se leía como cosa
  // hecha aunque el circulito estuviera vacío. Como «Entrega en planta» →
  // «Entregado en planta»: pendiente dice lo que falta, hecho dice que pasó.
  const preinstalacionHecha =
    s.preinstalacion_ok_at != null ||
    (!provincia && (s.despachado_at != null || s.cerrado_at != null || s.completado || s.puesta_en_marcha != null));
  const pasoPreinstalacion: PasoPedido = {
    clave: "preinstalacion",
    etiqueta: provincia
      ? preinstalacionHecha
        ? "Preinstalación confirmada por el cliente"
        : "Preinstalación: falta que el cliente la confirme"
      : preinstalacionHecha
        ? "Videollamada de preinstalación hecha"
        : "Videollamada de preinstalación: falta hacerla",
    responsable: (provincia ? "cliente" : "postventa") as ResponsablePaso,
    hecho: preinstalacionHecha,
    cuando: s.preinstalacion_ok_at,
    detalle:
      s.preinstalacion_nota ??
      (provincia
        ? "Foto de los puntos de agua, desagüe y energía"
        : "Antes del despacho: en Lima el despacho y la puesta en marcha van juntos, así que se verifica agua, desagüe y energía por videollamada"),
  };
  const preinstalacionAntes = circuito.esEquipo && !provincia;
  const preinstalacionDespues = circuito.esEquipo && provincia;

  const despacho: PasoPedido[] = circuito.entregaEnPlanta
    ? [
        // El cliente lo recoge en la planta: sin dirección, sin apertura, sin
        // camión. Se entrega y se cierra.
        {
          clave: "despacho",
          etiqueta: s.despachado_at ? "Entregado en planta" : "Entrega en planta",
          responsable: "postventa",
          hecho: s.despachado_at != null,
          cuando: s.despachado_at ?? (s.fecha_despacho ? `${s.fecha_despacho}T12:00:00` : null),
          detalle: s.recibe_nombre ? `Lo recogió ${s.recibe_nombre}` : "El cliente viene a recogerlo; se anota quién lo recibió",
          trabado:
            !pagado && !pagoDesconocido && s.despachado_at == null && !despachoAutorizadoConSaldo
              ? "No se entrega con saldo pendiente sin autorización"
              : undefined,
        },
      ]
    : [
    {
      clave: "direccion",
      etiqueta: circuito.esServicio
        ? "Dónde se hace el servicio y con quién, verificados con el cliente"
        : "Dirección y quién recibe, verificados con el cliente",
      responsable: "postventa",
      hecho: s.direccion_verificada_at != null,
      cuando: s.direccion_verificada_at,
      detalle: s.direccion_verificada_con
        ? `Confirmó ${s.direccion_verificada_con}`
        : "Se llama antes: 9 de cada 10 veces cambia la dirección, el teléfono o quien recibe",
    },
    {
      clave: "apertura",
      etiqueta: circuito.esServicio
        ? aperturaEmitida ? "Apertura de servicio emitida" : "Apertura de servicio"
        : aperturaEmitida ? "Apertura de despacho emitida" : "Apertura de despacho",
      responsable: "postventa",
      hecho: aperturaEmitida,
      cuando: s.apertura_despacho_at ?? null,
      // Postventa ve si Finanzas ya autorizó la guía (reunión 06-10 11:01:
      // «que me salga un check de que ya lo recibió contabilidad»).
      detalle: aperturaEmitida
        ? s.guia_confirmada_at
          ? `✓ Guía autorizada el ${new Date(s.guia_confirmada_at).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${
              textoComprobante(s.guia_comprobante_tipo, s.guia_comprobante_numero) ? ` · ${textoComprobante(s.guia_comprobante_tipo, s.guia_comprobante_numero)}` : ""
            }${textoMotivoGuia(s.guia_motivo, s.guia_motivo_detalle) ? ` · ${textoMotivoGuia(s.guia_motivo, s.guia_motivo_detalle)}` : ""}`
          : s.despachado_at
            ? circuito.esServicio
              ? "Con este documento el técnico sale con todo definido"
              : "Con este documento almacén despacha sin preguntar a nadie"
            : "Le llegó a Finanzas: falta que autorice la guía"
        : faltaParaApertura.length === 0
          ? "Todo cumplido: se puede emitir"
          : undefined,
      trabado:
        !aperturaEmitida && faltaParaApertura.length > 0
          ? `Para emitirla falta: ${faltaParaApertura.join(", ")}${
              // El plano se marca en otro bloque (preparación): sin decir
              // dónde, postventa creía que la apertura estaba rota (22-09).
              circuito.esEquipo && !s.sin_plano && !planoEnviado
                ? ". Márquelo arriba, en «Plano de preinstalación enviado»: «Marcar enviado», «No se le envió» o «No lleva plano»"
                : ""
            }`
          : undefined,
    },
    ...(preinstalacionAntes ? [pasoPreinstalacion] : []),
    {
      clave: "despacho",
      // «Una vez que ingresa la guía de remisión, allá en almacén le tienen que
      // decir: despacho concluido» (Carlos, 09-09). El nombre lo dice.
      etiqueta: circuito.esServicio
        ? s.despachado_at ? "Técnico en el cliente" : "Servicio programado"
        : s.despachado_at ? "Despacho concluido" : "Despacho programado",
      responsable: "postventa",
      hecho: s.despachado_at != null,
      cuando: s.despachado_at ?? (s.fecha_despacho ? `${s.fecha_despacho}T12:00:00` : null),
      detalle:
        [
          s.almacen_listo_at && !s.despachado_at ? "Almacén confirmó que está listo" : null,
          s.salida_fotos?.length ? `Salió del almacén con ${s.salida_fotos.length} fotos/video` : null,
          s.transportista,
          s.guia ? `Guía ${s.guia}` : null,
          s.agencia_at ? "entregado en agencia" : null,
        ]
          .filter(Boolean)
          .join(" · ") ||
        (s.despachado_at ? undefined : circuito.esServicio ? "Con día, hora y técnico asignado" : "Se concluye con la guía de remisión del almacén"),
      trabado:
        s.despachado_at == null && !aperturaEmitida && s.informe_cierre_id != null
          ? circuito.esServicio ? "Sin apertura de servicio no sale el técnico" : "Sin apertura de despacho no sale nada del almacén"
          : !pagado && !pagoDesconocido && s.despachado_at == null && !despachoAutorizadoConSaldo
            ? "No se despacha con saldo pendiente sin autorización"
            : circuito.esEquipo && provincia && s.despachado_at == null && s.preinstalacion_ok_at == null
              ? "Es provincia y el cliente todavía no confirmó la preinstalación: conviene tenerla antes de que salga el camión"
              : undefined,
    },
    // LAS LETRAS QUE VIAJAN CON EL EQUIPO (0470): se entregan y se avisa.
    ...(letrasViajan(s)
      ? [
          {
            clave: "letras",
            etiqueta:
              s.letras_estado === "van_con_el_equipo"
                ? `Letras de crédito${s.letras_cantidad ? ` (${s.letras_cantidad})` : ""}: falta confirmar que se entregaron al cliente`
                : `Letras de crédito entregadas al cliente${s.letras_cantidad ? ` (${s.letras_cantidad})` : ""}`,
            responsable: "almacen" as ResponsablePaso,
            hecho: s.letras_estado === "entregadas" || s.letras_estado === "firmadas",
            cuando: s.letras_entregadas_at ?? null,
            detalle:
              [
                s.letras_recibidas_almacen_at ? "El almacén las recibió de Finanzas" : null,
                s.letras_entregadas_a ? `Las recibió ${s.letras_entregadas_a}` : null,
                s.letras_estado === "firmadas" ? "Ya volvieron firmadas a Finanzas" : s.letras_estado === "entregadas" ? "Falta que vuelvan firmadas a Finanzas" : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
            trabado:
              s.letras_estado === "van_con_el_equipo" && s.despachado_at
                ? "El equipo salió con las letras: confirme a quién se entregaron. Sin eso no se da el doble check del despacho"
                : faltanLetrasEnAlmacen(s)
                  ? "El almacén tiene que recoger las letras en Finanzas antes de que salga"
                  : undefined,
          },
        ]
      : []),
    // EL DOBLE CHECK DE POSTVENTA (Carlos, 16-09): «almacén sube la
    // información, pero postventa da el doble check con verificar que se ha
    // hecho correcto el envío». Solo aparece cuando fue almacén quien registró
    // la salida; en los pedidos que despacha postventa a mano no hay a quién
    // verificar.
    ...((s.salida_fotos?.length ?? 0) > 0 || s.agencia_at
      ? [
          {
            clave: "verificado",
            etiqueta: "Despacho verificado por postventa",
            responsable: "postventa" as ResponsablePaso,
            hecho: s.despacho_verificado_at != null,
            cuando: s.despacho_verificado_at ?? null,
            detalle: s.despacho_verificado_at ? undefined : "Mire las fotos y la guía que subió almacén y confirme que el envío está bien",
          },
        ]
      : []),
    // LA GUÍA Y LAS FOTOS LLEGARON AL CLIENTE (gerencia 20-10): «nadie sabe
    // que tú has enviado el WhatsApp… con 30 clientes no hay forma de
    // controlarlo». Solo desde el 20-10: lo despachado antes no se reabre.
    ...(s.despachado_at && s.despachado_at >= GUIA_AL_CLIENTE_DESDE && !circuito.esServicio
      ? [
          {
            clave: "guia_cliente",
            etiqueta: "Guía y fotos enviadas al cliente",
            responsable: "postventa" as ResponsablePaso,
            hecho: (s as { guia_enviada_cliente_at?: string | null }).guia_enviada_cliente_at != null,
            cuando: (s as { guia_enviada_cliente_at?: string | null }).guia_enviada_cliente_at ?? null,
            detalle: (s as { guia_enviada_cliente_at?: string | null }).guia_enviada_cliente_at
              ? undefined
              : "Mándele al cliente la guía y las fotos del despacho, y márquelo con «Enviar guía y fotos al cliente»",
          },
        ]
      : []),
  ];

  const cierre: PasoPedido[] = [
    // En provincia la verificación la hace el técnico al llegar, así que acá
    // se le pide al cliente una prueba escrita (foto de agua, desagüe,
    // energía). Va en este bloque y no en Despacho desde el 09-09 (Carlos): lo
    // que el cliente confirma es lo que hace posible la puesta en marcha, no
    // lo que autoriza el camión.
    //
    // EN LIMA ES UNA VIDEOLLAMADA, NO UNA FOTO (Carlos, 22-09, ítem 6 de la
    // reunión): «si es en Lima, tenemos que hacer una videollamada
    // previamente para verificar que tenga todas las instalaciones» — el caso
    // que lo probó fue Titan, cerrado el 15 y siete días sin ese contacto.
    // Usa la MISMA columna que la de provincia (preinstalacion_ok_at/nota): no
    // hace falta una nueva, y las dos son la misma idea con un medio distinto.
    // No es retroactivo: un pedido de Lima que ya despachó la puesta en marcha
    // o que ya cerró antes de que este paso existiera no se reabre para pedir
    // un dato que nadie iba a registrar.
    ...(preinstalacionDespues ? [pasoPreinstalacion] : []),
    // El repuesto sin instalación no tiene puesta en marcha: se entrega y se
    // cierra. Con instalación, el técnico va. En mantenimiento y revisión,
    // este paso es la ejecución con su informe.
    ...(circuito.esRepuesto && !circuito.conInstalacion
      ? []
      : [
          {
            clave: "puesta",
            etiqueta: circuito.esRepuesto
              ? "Repuesto instalado"
              : circuito.esServicio
                ? circuito.tipo === "revision" ? "Revisión ejecutada, con informe" : "Mantenimiento ejecutado, con informe"
                : "Puesta en marcha",
            responsable: "postventa" as ResponsablePaso,
            hecho: s.puesta_en_marcha != null,
            cuando: s.puesta_en_marcha ? `${s.puesta_en_marcha}T12:00:00` : null,
            detalle: circuito.esEquipo ? (provincia ? "En provincia, normalmente por videollamada" : "In situ") : "El técnico sube el informe al terminar",
          },
        ]),
    ...(llevaOrdenFacturar(s)
      ? [
          {
            clave: "facturar",
            etiqueta: s.orden_facturar_at
              ? s.orden_facturar_atendida_at
                ? "Finanzas atendió la orden de facturar"
                : "Orden de facturar enviada a Finanzas"
              : "Orden a Finanzas para facturar y cobrar",
            responsable: "postventa" as ResponsablePaso,
            hecho: s.orden_facturar_at != null,
            cuando: s.orden_facturar_at ?? null,
            detalle: s.orden_facturar_at
              ? [s.orden_facturar_atendida_at ? null : "Esperando que Finanzas la atienda", s.orden_facturar_nota].filter(Boolean).join(" · ") || undefined
              : `${condicion ?? "A crédito"}: al terminar ${circuito.esServicio ? "el servicio" : "la entrega"} y enviar el informe, se le avisa a Finanzas que facture y cobre`,
          },
        ]
      : []),
    {
      clave: "cerrado",
      etiqueta: "Pedido cerrado",
      responsable: "postventa",
      hecho: s.cerrado_at != null || s.completado,
      cuando: s.cerrado_at,
      detalle: circuito.esEquipo ? "Al cerrar, el equipo entra al registro de máquinas con su garantía" : "Al cerrar, queda en el historial del cliente",
    },
  ];

  const titulos = circuito.esRepuesto
    ? ["Preparación", "Entrega", circuito.conInstalacion ? "Instalación y cierre" : "Cierre"]
    : circuito.esServicio
      ? ["Preparación", "Programación", "Ejecución y cierre"]
      : ["Preparación", "Despacho", "Puesta en marcha y cierre"];
  return [
    { numero: 1, titulo: titulos[0], pasos: preparacion, ...resumen(preparacion) },
    { numero: 2, titulo: titulos[1], pasos: despacho, ...resumen(despacho) },
    { numero: 3, titulo: titulos[2], pasos: cierre, ...resumen(cierre) },
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

/**
 * UN SOLO ESTILO DE ETIQUETA, TRADUCIDA DESDE EL CÓDIGO INTERNO.
 *
 * En el historial de un cliente convivían tres estilos para lo mismo:
 * «mantenimiento_preventivo» con guion bajo, «evaluacion» sin tilde y «ENTREGA
 * DE EQUIPO» en mayúsculas (informe de UX del 08-09). No es un problema de
 * gusto: el de mayúsculas viene del Excel histórico y el de guion bajo del
 * enum, así que el cliente lee dos veces el mismo servicio y parece que le
 * hicieron dos cosas distintas.
 *
 * Se resuelve al mostrar y no en la base: los importados son texto libre de
 * años de Excel y normalizarlos allá es reescribir historia. Acá se busca el
 * código —sin tildes, sin mayúsculas, con espacios o guiones bajos, da igual—
 * y si no está en la lista se devuelve en la misma forma que el resto, con la
 * primera letra en mayúscula, en vez de gritar.
 */
/**
 * Cuántas máquinas vendió el cierre (0253): la suma de cantidades del bloque
 * de venta. Es contra lo que se compara el parque para decir «faltan series».
 */
export function equiposVendidosDelCierre(items: unknown): number | null {
  const lista = Array.isArray(items) ? (items as { bloque?: string; cantidad?: number | string }[]) : null;
  if (!lista) return null;
  const venta = lista.filter((i) => !i.bloque || i.bloque === "venta");
  if (venta.length === 0) return null;
  return venta.reduce((t, i) => t + (Number(i.cantidad) || 0), 0) || null;
}

/** Los informes que escribe el almacén (0252), en el orden de la lista de Lesly. */
export const CLASES_INFORME_ALMACEN = [
  { clave: "puesta_en_marcha_ok", etiqueta: "Puesta en marcha · todo OK", de: "pedido", tipo: "puesta_en_marcha", modalidad: "in_situ" },
  { clave: "puesta_en_marcha_observaciones", etiqueta: "Puesta en marcha · con observaciones", de: "pedido", tipo: "puesta_en_marcha", modalidad: "in_situ" },
  { clave: "puesta_en_marcha_accesorios", etiqueta: "Puesta en marcha · faltan accesorios para instalar", de: "pedido", tipo: "puesta_en_marcha", modalidad: "in_situ" },
  { clave: "soporte_videollamada", etiqueta: "Soporte técnico por videollamada", de: "atencion", tipo: "tecnico", modalidad: "videollamada" },
  { clave: "mtto_recepcion", etiqueta: "Mtto en planta · 1. Recepción del equipo", de: "atencion", tipo: "revision", modalidad: "planta" },
  { clave: "mtto_prueba_revision", etiqueta: "Mtto en planta · 2. Prueba y revisión", de: "atencion", tipo: "revision", modalidad: "planta" },
  { clave: "mtto_ejecucion", etiqueta: "Mtto en planta · 3. Ejecución del mantenimiento", de: "atencion", tipo: "mantenimiento_preventivo", modalidad: "planta" },
] as const;
export type ClaseInformeAlmacen = (typeof CLASES_INFORME_ALMACEN)[number]["clave"];
export function etiquetaClaseAlmacen(clase: string | null | undefined): string | null {
  return CLASES_INFORME_ALMACEN.find((c) => c.clave === clase)?.etiqueta ?? null;
}

export function etiquetaTipoServicio(tipo: string | null | undefined): string {
  const crudo = String(tipo ?? "").trim();
  if (!crudo) return "Servicio";

  const clave = crudo
    .toLocaleLowerCase("es-PE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
  const conocido = TIPOS_SERVICIO.find((t) => t.valor === clave);
  if (conocido) return conocido.etiqueta;

  const enPalabras = crudo.replace(/_/g, " ").replace(/\s+/g, " ").toLocaleLowerCase("es-PE").trim();
  return enPalabras.charAt(0).toLocaleUpperCase("es-PE") + enPalabras.slice(1);
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

/**
 * El comprobante con que Finanzas autorizó la guía (0384), en una frase:
 * «Factura F001-1234», «Boleta B001-55», «Sin comprobante todavía».
 */
/**
 * El motivo de la guía lo define Contabilidad al autorizarla (0486, audio del
 * 14-10): «venta» cuando sale el equipo vendido, «traslado» en los servicios
 * (se devuelve o se recoge un equipo), «consignación» cuando sale por posible
 * venta. El almacén emite la guía con ese motivo.
 */
export const MOTIVOS_GUIA = [
  { valor: "venta", etiqueta: "Venta", ayuda: "sale el equipo vendido" },
  { valor: "traslado", etiqueta: "Traslado", ayuda: "servicio: se devuelve o se recoge un equipo" },
  { valor: "consignacion", etiqueta: "Consignación", ayuda: "sale por posible venta" },
  // Hay más motivos de guía (0487): se escribe cuál.
  { valor: "otro", etiqueta: "Otro", ayuda: "escriba cuál es el motivo" },
] as const;
export type MotivoGuia = (typeof MOTIVOS_GUIA)[number]["valor"];

/** «Guía por VENTA» (o por lo escrito, si es «otro»); vacío si todavía no lo definió Contabilidad. */
export function textoMotivoGuia(motivo: string | null | undefined, detalle?: string | null): string {
  if (motivo === "otro") return `Guía por ${(detalle?.trim() || "otro motivo").toUpperCase()}`;
  const m = MOTIVOS_GUIA.find((x) => x.valor === motivo);
  return m ? `Guía por ${m.etiqueta.toUpperCase()}` : "";
}

/** Lo que se sugiere al autorizar: con venta detrás, «venta»; si no (servicio), «traslado». Contabilidad decide. */
export function motivoGuiaSugerido(s: { informe_cierre_id?: string | null; tipo_pedido?: string | null }): MotivoGuia {
  return s.informe_cierre_id && s.tipo_pedido !== "servicio" ? "venta" : "traslado";
}

export function textoComprobante(tipo: string | null | undefined, numero: string | null | undefined): string {
  if (tipo === "factura") return `Factura ${numero ?? ""}`.trim();
  if (tipo === "boleta") return `Boleta ${numero ?? ""}`.trim();
  if (tipo === "sin_comprobante") return "Sin comprobante todavía";
  return "";
}

/**
 * Las máquinas del pedido de a una serie, como las ve el almacén (Lesly,
 * 10-10): la secadora de una torre va después de su lavadora. Rubí, 14-10:
 * «que se separe por serie, ya que se tiene que subir un informe por cada
 * equipo» — el informe de puesta en marcha se elige de esta lista.
 */
export function maquinasPorSerie(
  lista: { id: string; equipo_id: string | null; serie: string | null; descripcion: string; parte_de?: string | null; parte_nombre?: string | null }[],
): { equipoId: string | null; serie: string | null; descripcion: string }[] {
  return lista
    .filter((e) => !e.parte_de)
    .flatMap((e) => {
      const partes = lista.filter((p) => p.parte_de === e.id);
      const enTorre = partes.some((p) => /secadora/i.test(p.parte_nombre ?? ""));
      return [
        { equipoId: e.equipo_id, serie: e.serie, descripcion: `${enTorre ? "Lavadora · " : ""}${e.descripcion}` },
        ...partes.map((p) => ({ equipoId: p.equipo_id, serie: p.serie, descripcion: p.descripcion })),
      ];
    });
}
