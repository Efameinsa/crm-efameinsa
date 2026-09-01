import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Las fichas de cliente que casan con lo que alguien escribió en un buscador.
 *
 * Pedido de la señorita de postventa el 01-09: buscó «20138427014» (la
 * Congregación de Religiosas Mercedarias Misioneras) en el parque instalado y
 * no salió nada. Los buscadores del área miraban solo el texto que traía cada
 * fila (`cliente_texto`, serie, modelo), nunca el RUC ni la razón social de la
 * ficha a la que la fila ya está enlazada. Esto devuelve los ids de las fichas
 * que casan, para sumar `cuenta_id.in.(…)` al `.or()` de cada lista.
 *
 * Un texto de 8 a 11 dígitos se toma como documento (DNI o RUC) y se busca
 * por prefijo, para que «2013842» también encuentre. Lo demás se busca en la
 * razón social y en el nombre comercial. Sin texto, no busca nada.
 */
export async function idsDeCuentasQueCasan(supabase: SupabaseClient, texto: string): Promise<string[]> {
  const t = texto.trim();
  if (t.length < 3) return [];
  const digitos = t.replace(/\D/g, "");
  const esDocumento = digitos.length >= 6 && digitos.length === t.replace(/[\s.-]/g, "").length;
  const consulta = supabase.from("cuentas").select("id").limit(200);
  const { data } = esDocumento
    ? await consulta.ilike("num_doc", `${digitos}%`)
    : await consulta.or(`razon_social.ilike.%${t}%,nombre_comercial.ilike.%${t}%`);
  return (data ?? []).map((c) => c.id as string);
}

/** El pedazo que se suma al `.or()` de PostgREST, o vacío si no hay fichas. */
export function condicionCuentaIn(ids: string[]): string {
  return ids.length ? `,cuenta_id.in.(${ids.join(",")})` : "";
}
