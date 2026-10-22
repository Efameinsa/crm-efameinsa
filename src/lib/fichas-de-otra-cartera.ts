import type { createClient } from "@/lib/supabase/server";

/**
 * «CUENTA SIN NOMBRE» ERA UNA FICHA DE OTRA CARTERA (Santos 22-10, pantallazo
 * de Katerine con la Clínica Jesús del Norte).
 *
 * El expediente es del comercial y la ficha está en la cartera de otro (ventas
 * e históricos del Excel, derivaciones, reasignaciones). La RLS de cuentas le
 * esconde la ficha y el embed `cuentas(...)` vuelve null: la pantalla ponía
 * «Cuenta sin nombre» y nadie sabía por qué. La 0583 le devuelve al dueño del
 * expediente el nombre, el documento y de quién es la cartera; nada más.
 */
export type FichaDeOtraCartera = {
  cuentaId: string;
  razonSocial: string;
  nombreComercial: string | null;
  tipoDoc: string;
  numDoc: string | null;
  carteraCodigo: string | null;
  carteraNombre: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Por id de expediente. Solo pregunta por los que vinieron sin ficha. */
export async function cargarFichasDeOtraCartera(
  supabase: Supabase,
  oportunidadIds: string[],
): Promise<Map<string, FichaDeOtraCartera>> {
  const ids = [...new Set(oportunidadIds)].filter(Boolean);
  const mapa = new Map<string, FichaDeOtraCartera>();
  if (ids.length === 0) return mapa;
  const { data } = await supabase.rpc("fichas_de_otra_cartera", { p_oportunidades: ids });
  for (const f of (data ?? []) as {
    oportunidad_id: string;
    cuenta_id: string;
    razon_social: string;
    nombre_comercial: string | null;
    tipo_doc: string;
    num_doc: string | null;
    cartera_codigo: string | null;
    cartera_nombre: string | null;
  }[]) {
    mapa.set(f.oportunidad_id, {
      cuentaId: f.cuenta_id,
      razonSocial: f.razon_social,
      nombreComercial: f.nombre_comercial,
      tipoDoc: f.tipo_doc,
      numDoc: f.num_doc,
      carteraCodigo: f.cartera_codigo,
      carteraNombre: f.cartera_nombre,
    });
  }
  return mapa;
}

/** «Ariana Flores (C4)», o «sin cartera» si la ficha no es de nadie. */
export function carteraDe(f: FichaDeOtraCartera): string {
  if (!f.carteraNombre) return "sin cartera";
  return f.carteraCodigo ? `${f.carteraNombre} (${f.carteraCodigo})` : f.carteraNombre;
}

/** Para las listas: el nombre y, pegado, de quién es la ficha. */
export function nombreEnLista(f: FichaDeOtraCartera | undefined): string {
  if (!f) return "Cliente sin ficha";
  return f.carteraNombre
    ? `${f.razonSocial} · ficha en cartera de ${carteraDe(f)}`
    : `${f.razonSocial} · ficha sin cartera`;
}
