"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * DESHACER, ARCHIVAR Y UNIR SIN LLAMAR A NADIE (0513, Santos 16-10): «el CRM
 * tiene que funcionar solo… prever los errores que pueden cometer los usuarios
 * y cómo otros usuarios con más capacidad pueden resolverlo».
 *
 * Las reglas viven en la base (quién puede, cuándo no se puede y por qué);
 * acá solo se llaman y se limpia el mensaje para mostrarlo tal cual.
 */

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

export async function deshacerClic(lote: number, motivo: string): Promise<{ error: string | null; resumen?: string }> {
  if (!Number.isSafeInteger(lote)) return { error: "Ese clic no existe" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deshacer_lote", { p_lote: lote, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/", "layout");
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

export async function archivarFicha(cuentaId: string, motivo: string): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archivar_ficha", { p_cuenta: cuentaId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/admin/fichas-sueltas");
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

export async function restaurarFicha(cuentaId: string): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurar_ficha", { p_cuenta: cuentaId });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/admin/fichas-sueltas");
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

export interface FichaParaUnir {
  id: string;
  razonSocial: string;
  documento: string | null;
  comercial: string | null;
}

export type UnionPropuesta =
  | { origen: FichaParaUnir; destino: FichaParaUnir; noSePuede?: undefined }
  | { noSePuede: string; origen?: undefined; destino?: undefined };

const CAMPOS_FICHA = "id, razon_social, tipo_doc, num_doc, perfiles!cuentas_comercial_id_fkey(nombre)";
type FilaFicha = { id: string; razon_social: string | null; tipo_doc: string | null; num_doc: string | null; perfiles: { nombre: string } | null };
const aFicha = (c: FilaFicha): FichaParaUnir => ({
  id: c.id,
  razonSocial: c.razon_social ?? "(sin razón social)",
  documento: c.num_doc?.trim() && c.tipo_doc !== "SIN_DOC" ? `${c.tipo_doc} ${c.num_doc}` : null,
  comercial: c.perfiles?.nombre ?? null,
});

/**
 * Cuando la serie de un caso ya está en OTRA ficha (0512), qué unión se puede
 * proponer desde el mismo aviso (Santos, 16-10: «debería tener la
 * funcionalidad para unir las fichas»). La que tiene RUC se queda; la que no
 * tiene se une a ella, que es lo que acepta «Unir fichas» (con RUC no se une
 * a ciegas). Si las dos tienen documento, no se propone: puede ser otra empresa.
 */
export async function unionPorSerie(serie: string, atencionId: string): Promise<UnionPropuesta> {
  const s = serie.trim();
  if (!s) return { noSePuede: "Falta la serie." };
  const supabase = await createClient();
  const [{ data: eq }, { data: at }] = await Promise.all([
    supabase.from("equipos_instalados").select(`cuentas!equipos_instalados_cuenta_id_fkey(${CAMPOS_FICHA})`).ilike("serie", s).limit(1).maybeSingle(),
    supabase.from("atenciones").select(`cuentas!atenciones_cuenta_id_fkey(${CAMPOS_FICHA})`).eq("id", atencionId).maybeSingle(),
  ]);
  const otra = (eq?.cuentas ?? null) as unknown as FilaFicha | null;
  const esta = (at?.cuentas ?? null) as unknown as FilaFicha | null;
  if (!otra || !esta) return { noSePuede: "No alcanzo a ver una de las dos fichas: pídalo por el buzón del CRM." };
  const a = aFicha(esta);
  const b = aFicha(otra);
  if (!a.documento) return { origen: a, destino: b };
  if (!b.documento) return { origen: b, destino: a };
  return {
    noSePuede: `Las dos fichas tienen documento propio (${a.documento} y ${b.documento}): pueden ser empresas distintas o sedes. Eso lo revisa operaciones; avise por el buzón del CRM.`,
  };
}
