import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// El expediente del cierre de venta: la orden de compra, el voucher, la
// cotización firmada, el correo donde se acordó algo. Hasta hoy eso viajaba
// impreso o por WhatsApp y no quedaba en ningún lado (migración 0099).
//
// Vive aparte de src/lib/acciones/informes.ts porque un módulo "use server"
// solo puede exportar funciones asíncronas: la lista de tipos y el esquema
// tienen que estar fuera, y además los necesita el navegador para subir.

/**
 * Las categorías que nombró el ing. Carlos el 27-08 («cotización, orden de
 * compra, voucher, acuerdos»). Se guarda la categoría y no solo el archivo
 * porque Central busca UNA cosa concreta: cuando pregunta «¿ya pagaron?»
 * quiere el voucher, no una lista de siete PDFs con nombres de WhatsApp.
 */
export const TIPOS_ADJUNTO = [
  ["voucher", "Voucher / pago"],
  ["orden_compra", "Orden de compra"],
  ["cotizacion", "Cotización"],
  ["acuerdo", "Acuerdo o correo"],
  ["otro", "Otro"],
] as const;

export type TipoAdjunto = (typeof TIPOS_ADJUNTO)[number][0];

export function etiquetaTipo(tipo: string): string {
  return TIPOS_ADJUNTO.find(([v]) => v === tipo)?.[1] ?? "Otro";
}

/** Tope por informe. Un expediente de venta tiene 3 o 4 papeles, no 30. */
export const MAX_ADJUNTOS = 12;
/** Igual que el bucket (migración 0029). Se avisa en el navegador antes de subir. */
export const MAX_BYTES = 10 * 1024 * 1024;

export const TIPOS_MIME_ACEPTADOS = ".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp";

/** Lo que manda el navegador tras subir el archivo al bucket. */
export const esquemaAdjuntoNuevo = z.object({
  tipo: z.enum(TIPOS_ADJUNTO.map(([v]) => v) as [TipoAdjunto, ...TipoAdjunto[]]),
  path: z.string().startsWith("cierres/").max(300),
  nombre: z.string().trim().min(1).max(200),
  tipo_mime: z.string().max(120),
  tamano: z.number().int().nonnegative().max(MAX_BYTES),
});

export type AdjuntoNuevo = z.infer<typeof esquemaAdjuntoNuevo>;

/** Como queda guardado en informes_cierre.adjuntos. */
export interface AdjuntoCierre extends AdjuntoNuevo {
  subido_por: string | null;
  subido_at: string;
}

export interface AdjuntoCierreFirmado {
  tipo: TipoAdjunto;
  etiqueta: string;
  path: string;
  nombre: string;
  /** URL firmada de Storage (bucket privado 'adjuntos'), vence en 1 h. */
  url: string;
  esImagen: boolean;
  subidoAt: string;
}

/**
 * Firma en una sola llamada batch los adjuntos de un lote de informes: la cola
 * de Central son 200 filas y una llamada por archivo la volvería inusable.
 * Un informe sin adjuntos simplemente no aparece en el mapa.
 */
export async function firmarAdjuntosDeCierres(
  supabase: SupabaseClient,
  informes: { id: string; adjuntos?: AdjuntoCierre[] | null }[],
): Promise<Map<string, AdjuntoCierreFirmado[]>> {
  const rutas = informes.flatMap((i) => (i.adjuntos ?? []).map((a) => a.path));
  const porInforme = new Map<string, AdjuntoCierreFirmado[]>();
  if (rutas.length === 0) return porInforme;

  const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
  const urlPorRuta = new Map<string, string>();
  for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);

  for (const inf of informes) {
    const lista = (inf.adjuntos ?? [])
      .map((a) => {
        const url = urlPorRuta.get(a.path);
        return url
          ? {
              tipo: a.tipo,
              etiqueta: etiquetaTipo(a.tipo),
              path: a.path,
              nombre: a.nombre,
              url,
              esImagen: (a.tipo_mime ?? "").startsWith("image/"),
              subidoAt: a.subido_at,
            }
          : null;
      })
      .filter(Boolean) as AdjuntoCierreFirmado[];
    if (lista.length) porInforme.set(inf.id, lista);
  }
  return porInforme;
}
