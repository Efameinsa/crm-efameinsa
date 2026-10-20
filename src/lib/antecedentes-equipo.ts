import type { SupabaseClient } from "@supabase/supabase-js";

// ANTECEDENTES DEL EQUIPO (0560, buzón Brenda PV2 20-10): lo que el técnico
// pregunta antes de ir a planta y que no se escribía en ningún lado, sobre
// todo en equipos que no vendimos: de dónde y cuándo se compró, la garantía,
// si ya tuvo mantenimiento, repuestos o fallas, y los papeles.

export type SiNo = "si" | "no" | "por_verificar";
export type EstadoGarantiaAntecedente = "vigente" | "vencida" | "por_verificar";

export type ClaseDocumento = "guia_factura_oc" | "acta" | "informe_mantenimiento" | "orden_servicio" | "foto" | "otro";

export const ETIQUETA_CLASE_DOCUMENTO: Record<ClaseDocumento, string> = {
  guia_factura_oc: "Guía, factura u orden de compra",
  acta: "Acta de instalación o entrega",
  informe_mantenimiento: "Informe de mantenimiento anterior",
  orden_servicio: "Orden de servicio o comprobante de repuestos",
  foto: "Foto del equipo o de una intervención",
  otro: "Otro documento",
};

export const ETIQUETA_SI_NO: Record<SiNo, string> = { si: "Sí", no: "No", por_verificar: "Por verificar / sin información" };
export const ETIQUETA_GARANTIA: Record<EstadoGarantiaAntecedente, string> = {
  vigente: "Vigente",
  vencida: "Vencida",
  por_verificar: "Por verificar",
};

export type DocumentoAntecedente = {
  path: string;
  nombre: string;
  tipo: string;
  clase: ClaseDocumento;
  subido_at?: string;
  url?: string | null;
};

export type AntecedentesEquipo = {
  fecha_compra: string | null;
  proveedor: string | null;
  guia_remision: string | null;
  factura_oc: string | null;
  garantia: EstadoGarantiaAntecedente | null;
  mantenimiento: SiNo | null;
  mantenimiento_detalle: string | null;
  repuestos: SiNo | null;
  repuestos_detalle: string | null;
  fallas: SiNo | null;
  fallas_detalle: string | null;
  documentos: DocumentoAntecedente[];
  actualizado_at: string | null;
  actualizado_por_nombre: string | null;
};

/** Los antecedentes guardados de un equipo, con los documentos ya firmados por 1 h. */
export async function cargarAntecedentesEquipo(supabase: SupabaseClient, equipoId: string): Promise<AntecedentesEquipo | null> {
  const { data } = await supabase
    .from("equipo_antecedentes")
    .select("*, perfiles:actualizado_por(nombre)")
    .eq("equipo_id", equipoId)
    .maybeSingle();
  if (!data) return null;
  const documentos = ((data.documentos ?? []) as DocumentoAntecedente[]).filter((d) => d?.path);
  if (documentos.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(documentos.map((d) => d.path), 3600);
    for (const d of documentos) d.url = firmadas?.find((f) => f.path === d.path)?.signedUrl ?? null;
  }
  return {
    fecha_compra: data.fecha_compra,
    proveedor: data.proveedor,
    guia_remision: data.guia_remision,
    factura_oc: data.factura_oc,
    garantia: data.garantia,
    mantenimiento: data.mantenimiento,
    mantenimiento_detalle: data.mantenimiento_detalle,
    repuestos: data.repuestos,
    repuestos_detalle: data.repuestos_detalle,
    fallas: data.fallas,
    fallas_detalle: data.fallas_detalle,
    documentos,
    actualizado_at: data.actualizado_at,
    actualizado_por_nombre: (data.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
  };
}
