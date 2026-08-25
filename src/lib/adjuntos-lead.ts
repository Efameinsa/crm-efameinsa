import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjuntoLead } from "@/lib/validaciones/lead";

export interface AdjuntoLeadFirmado {
  nombre: string;
  /** URL firmada de Storage (bucket privado 'adjuntos'), vence en 1 h. */
  url: string;
  esImagen: boolean;
}

/**
 * Firma en una sola llamada batch los adjuntos de un lote de leads (bandeja
 * de Central) o de uno solo (ficha del comercial). Devuelve las URLs por id
 * de lead; un lead sin adjuntos simplemente no aparece en el mapa.
 */
export async function firmarAdjuntosDeLeads(
  supabase: SupabaseClient,
  leads: { id: string; adjuntos?: AdjuntoLead[] | null }[],
): Promise<Map<string, AdjuntoLeadFirmado[]>> {
  const rutas = leads.flatMap((l) => (l.adjuntos ?? []).map((a) => a.path));
  const porLead = new Map<string, AdjuntoLeadFirmado[]>();
  if (rutas.length === 0) return porLead;

  const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
  const urlPorRuta = new Map<string, string>();
  for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);

  for (const l of leads) {
    const lista = (l.adjuntos ?? [])
      .map((a) => {
        const url = urlPorRuta.get(a.path);
        return url ? { nombre: a.nombre, url, esImagen: a.tipo.startsWith("image/") } : null;
      })
      .filter(Boolean) as AdjuntoLeadFirmado[];
    if (lista.length) porLead.set(l.id, lista);
  }
  return porLead;
}
