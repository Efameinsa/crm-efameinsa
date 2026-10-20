// SERVICIO INTERNO (20-10, Santos, caso LINO ESPIRITU): la apertura de servicio
// desde el caso dice si es EXTERNA —el técnico va al local del cliente, el
// circuito de siempre— o INTERNA —el equipo se atiende en nuestra planta—. La
// interna lleva los antecedentes que el técnico necesita antes de abrir la
// máquina: fecha de compra, guía, problemas anteriores, si se le vendió
// repuesto o mantenimiento (preventivo o correctivo), si se cambió algún
// repuesto, la garantía y qué hay que ejecutar. Se guarda en el pedido
// (servicios_postventa.apertura_antecedentes) y sale en la hoja de la apertura.

export type ModalidadApertura = "externa" | "interna";
export type SiNoVerificar = "si" | "no" | "por_verificar";
export type GarantiaInterna = "vigente" | "vencida" | "por_verificar";
export type MantenimientoInterno = "ninguno" | "preventivo" | "correctivo" | "ambos" | "por_verificar";

export type AntecedentesInterna = {
  fecha_compra: string | null;
  guia_remision: string | null;
  garantia: GarantiaInterna;
  problemas: SiNoVerificar;
  problemas_detalle: string | null;
  vendido_repuesto: SiNoVerificar;
  vendido_repuesto_detalle: string | null;
  mantenimiento: MantenimientoInterno;
  mantenimiento_detalle: string | null;
  repuesto_cambiado: SiNoVerificar;
  repuesto_cambiado_detalle: string | null;
  que_ejecutar: string;
};

export const ETIQUETA_SI_NO_VERIFICAR: Record<SiNoVerificar, string> = { si: "Sí", no: "No", por_verificar: "Por verificar" };
export const ETIQUETA_GARANTIA_INTERNA: Record<GarantiaInterna, string> = { vigente: "En garantía", vencida: "Sin garantía (vencida)", por_verificar: "Por verificar" };
export const ETIQUETA_MANTENIMIENTO_INTERNO: Record<MantenimientoInterno, string> = {
  ninguno: "No se le vendió mantenimiento",
  preventivo: "Mantenimiento preventivo",
  correctivo: "Mantenimiento correctivo",
  ambos: "Preventivo y correctivo",
  por_verificar: "Por verificar",
};

export const antecedentesInternaVacios = (): AntecedentesInterna => ({
  fecha_compra: null,
  guia_remision: null,
  garantia: "por_verificar",
  problemas: "por_verificar",
  problemas_detalle: null,
  vendido_repuesto: "por_verificar",
  vendido_repuesto_detalle: null,
  mantenimiento: "por_verificar",
  mantenimiento_detalle: null,
  repuesto_cambiado: "por_verificar",
  repuesto_cambiado_detalle: null,
  que_ejecutar: "",
});

const limpio = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** Lo que llega del formulario, ya validado y sin espacios de más. */
export function normalizarAntecedentesInterna(a: AntecedentesInterna): AntecedentesInterna | string {
  const sn = (v: unknown): SiNoVerificar => (v === "si" || v === "no" ? v : "por_verificar");
  const que = limpio(a.que_ejecutar);
  if (!que) return "Escriba para qué es: qué se necesita que se ejecute en planta";
  const fecha = limpio(a.fecha_compra);
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "La fecha de compra no es válida";
  return {
    fecha_compra: fecha,
    guia_remision: limpio(a.guia_remision)?.toUpperCase() ?? null,
    garantia: a.garantia === "vigente" || a.garantia === "vencida" ? a.garantia : "por_verificar",
    problemas: sn(a.problemas),
    problemas_detalle: limpio(a.problemas_detalle),
    vendido_repuesto: sn(a.vendido_repuesto),
    vendido_repuesto_detalle: limpio(a.vendido_repuesto_detalle),
    mantenimiento: (["ninguno", "preventivo", "correctivo", "ambos"] as const).includes(a.mantenimiento as never) ? a.mantenimiento : "por_verificar",
    mantenimiento_detalle: limpio(a.mantenimiento_detalle),
    repuesto_cambiado: sn(a.repuesto_cambiado),
    repuesto_cambiado_detalle: limpio(a.repuesto_cambiado_detalle),
    que_ejecutar: que,
  };
}

const fechaDMA = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "Sin dato");
const conDetalle = (valor: string, detalle: string | null) => (detalle ? `${valor} · ${detalle}` : valor);

/** Las filas de la hoja: [qué se pregunta, qué se respondió]. */
export function filasAntecedentesInterna(a: AntecedentesInterna): [string, string][] {
  return [
    ["Para qué es (qué se ejecuta)", a.que_ejecutar],
    ["Fecha de compra", fechaDMA(a.fecha_compra)],
    ["N.º de guía", a.guia_remision ?? "Sin dato"],
    ["Garantía", ETIQUETA_GARANTIA_INTERNA[a.garantia]],
    ["Problemas anteriores del equipo", conDetalle(ETIQUETA_SI_NO_VERIFICAR[a.problemas], a.problemas_detalle)],
    ["¿Se le vendió repuesto?", conDetalle(ETIQUETA_SI_NO_VERIFICAR[a.vendido_repuesto], a.vendido_repuesto_detalle)],
    ["¿Se le vendió mantenimiento?", conDetalle(ETIQUETA_MANTENIMIENTO_INTERNO[a.mantenimiento], a.mantenimiento_detalle)],
    ["¿Se cambió algún repuesto?", conDetalle(ETIQUETA_SI_NO_VERIFICAR[a.repuesto_cambiado], a.repuesto_cambiado_detalle)],
  ];
}

/**
 * Lo mismo, en el formato de «Antecedentes del equipo» (0560), para que la
 * ficha de la máquina quede al día sin volver a escribirlo. Proveedor y
 * factura no se preguntan aquí: se conservan los que ya tenía.
 */
export function aAntecedentesDelEquipo(a: AntecedentesInterna, previo: { proveedor?: string | null; factura_oc?: string | null } | null) {
  const repuestos: SiNoVerificar =
    a.vendido_repuesto === "si" || a.repuesto_cambiado === "si" ? "si" : a.vendido_repuesto === "no" && a.repuesto_cambiado === "no" ? "no" : "por_verificar";
  const repuestosDetalle = [
    a.vendido_repuesto_detalle ? `Vendido: ${a.vendido_repuesto_detalle}` : null,
    a.repuesto_cambiado_detalle ? `Cambiado: ${a.repuesto_cambiado_detalle}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mantenimiento: SiNoVerificar = a.mantenimiento === "ninguno" ? "no" : a.mantenimiento === "por_verificar" ? "por_verificar" : "si";
  const tipoMant = a.mantenimiento === "preventivo" ? "Preventivo" : a.mantenimiento === "correctivo" ? "Correctivo" : a.mantenimiento === "ambos" ? "Preventivo y correctivo" : null;
  return {
    fecha_compra: a.fecha_compra ?? "",
    proveedor: previo?.proveedor ?? "",
    guia_remision: a.guia_remision ?? "",
    factura_oc: previo?.factura_oc ?? "",
    garantia: a.garantia,
    mantenimiento,
    mantenimiento_detalle: [tipoMant, a.mantenimiento_detalle].filter(Boolean).join(" · "),
    repuestos,
    repuestos_detalle: repuestosDetalle,
    fallas: a.problemas,
    fallas_detalle: a.problemas_detalle ?? "",
  };
}
