import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Las versiones anteriores de las cotizaciones corregidas, con su sustento.
 *
 * Gerencia, 23-09: «cada vez que haya una corrección tiene que estar
 * debidamente sustentada pero se tiene que dejar claro cuál es la cotización
 * final». El sustento ya se guardaba (0123): `cotizacion_versiones` tiene el
 * documento archivado entero y `correcciones_cotizacion` quién corrigió, quién
 * autorizó y por qué. Faltaba juntarlos donde se mira la cotización.
 *
 * Cómo se emparejan: la corrección que produjo la versión N+1 es la que
 * archivó la N. `resumen.version` lo dice desde la 0123; si faltara, vale el
 * orden en que se guardaron.
 *
 * RLS decide qué se ve: el comercial dueño ve sus versiones, y la corrección
 * la ve quien la pidió, quien la autorizó y el backoffice. Si el expediente
 * cambió de manos, el nuevo dueño ve la versión y su fecha pero no el motivo:
 * se dice «sin acceso al motivo» en vez de inventarlo.
 */
export interface VersionAnterior {
  version: number;
  /** Cuándo dejó de ser la vigente. */
  reemplazadaAt: string;
  /** La versión que la reemplazó. */
  reemplazadaPor: number;
  total: number;
  moneda: string;
  corrigio: string | null;
  autorizo: string | null;
  motivo: string | null;
}

export async function versionesAnteriores(
  supabase: SupabaseClient,
  cotizacionIds: string[],
): Promise<Map<string, VersionAnterior[]>> {
  const salida = new Map<string, VersionAnterior[]>();
  if (cotizacionIds.length === 0) return salida;

  const [{ data: versiones }, { data: correcciones }] = await Promise.all([
    supabase
      .from("cotizacion_versiones")
      .select("cotizacion_id, version, total, moneda, archivada_at")
      .in("cotizacion_id", cotizacionIds)
      .order("version"),
    supabase
      .from("correcciones_cotizacion")
      .select(
        `cotizacion_id, motivo, guardada_at, resumen,
         solicitante:perfiles!correcciones_cotizacion_solicitante_id_fkey(nombre),
         autorizador:perfiles!correcciones_cotizacion_autorizo_fkey(nombre)`,
      )
      .in("cotizacion_id", cotizacionIds)
      .not("guardada_at", "is", null)
      .order("guardada_at"),
  ]);

  // La corrección que produjo cada versión, por cotización.
  const produjo = new Map<string, { motivo: string; corrigio: string | null; autorizo: string | null }>();
  const ordinal = new Map<string, number>();
  for (const k of correcciones ?? []) {
    const n = (ordinal.get(k.cotizacion_id) ?? 1) + 1;
    ordinal.set(k.cotizacion_id, n);
    const v = Number((k.resumen as { version?: number } | null)?.version ?? n);
    const nombre = (x: unknown) => (x as { nombre: string } | null)?.nombre ?? null;
    produjo.set(`${k.cotizacion_id}:${v}`, {
      motivo: k.motivo as string,
      corrigio: nombre(k.solicitante),
      autorizo: nombre(k.autorizador),
    });
  }

  for (const v of versiones ?? []) {
    const n = Number(v.version);
    const sustento = produjo.get(`${v.cotizacion_id}:${n + 1}`);
    const lista = salida.get(v.cotizacion_id) ?? [];
    lista.push({
      version: n,
      reemplazadaAt: v.archivada_at as string,
      reemplazadaPor: n + 1,
      total: Number(v.total),
      moneda: v.moneda as string,
      corrigio: sustento?.corrigio ?? null,
      autorizo: sustento?.autorizo ?? null,
      motivo: sustento?.motivo ?? null,
    });
    salida.set(v.cotizacion_id, lista);
  }
  return salida;
}
