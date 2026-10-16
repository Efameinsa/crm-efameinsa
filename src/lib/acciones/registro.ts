"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";

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
  // Las dos con RUC: lo decide gerencia o administración (0514, Choquehuanca 06-10).
  const yo = await requerirPerfil();
  if (yo.rol === "gerencia" || yo.rol === "admin") return { origen: a, destino: b };
  return {
    noSePuede: `Las dos fichas tienen documento propio (${a.documento} y ${b.documento}): pueden ser empresas distintas o sedes. Unirlas lo decide gerencia: avise por el buzón del CRM.`,
  };
}

export async function devolverABandeja(leadId: string, motivo: string): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devolver_a_bandeja", { p_lead: leadId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central", "layout");
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

export async function moverGestiones(desde: string, hacia: string, motivo: string): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mover_gestiones", { p_desde: desde, p_hacia: hacia, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/comercial", "layout");
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

export interface ExpedienteDestino {
  id: string;
  cliente: string;
  documento: string | null;
  comercial: string | null;
  etapa: string;
  creado: string;
  gestiones: number;
  mismaFicha: boolean;
}

/**
 * Los expedientes a los que se pueden mover gestiones: primero los otros del
 * mismo cliente; si se escribe algo, los de las fichas que coinciden por
 * nombre, RUC o código PRO.
 */
export async function buscarExpedientesDestino(oportunidadId: string, texto: string): Promise<ExpedienteDestino[]> {
  // Operaciones no ve todas las fichas por permisos de lectura; la búsqueda
  // es solo para quien puede mover (la base vuelve a comprobarlo al mover).
  const yo = await requerirPerfil();
  if (!["central", "admin", "gerencia", "operaciones"].includes(yo.rol)) return [];
  const supabase = createAdminClient();
  const { data: actual } = await supabase.from("oportunidades").select("cuenta_id").eq("id", oportunidadId).maybeSingle();
  const q = texto.trim().replace(/[%,()]/g, " ");
  let cuentas: string[] = actual?.cuenta_id ? [actual.cuenta_id] : [];
  if (q.length >= 3) {
    const [{ data: porNombre }, { data: porLead }] = await Promise.all([
      supabase.from("cuentas").select("id").is("fusionada_en", null).or(`razon_social.ilike.%${q}%,num_doc.eq.${q.replace(/\D/g, "") || "0"}`).limit(15),
      supabase.from("leads").select("cuenta_id").ilike("codigo", `%${q}%`).limit(5),
    ]);
    cuentas = [...new Set([...cuentas, ...(porNombre ?? []).map((c) => c.id), ...(porLead ?? []).map((l) => l.cuenta_id).filter((x): x is string => Boolean(x))])];
  }
  if (cuentas.length === 0) return [];
  const { data } = await supabase
    .from("oportunidades")
    .select("id, etapa, created_at, cuenta_id, cuentas(razon_social, tipo_doc, num_doc), perfiles!oportunidades_comercial_id_fkey(nombre), actividades(count)")
    .in("cuenta_id", cuentas)
    .neq("id", oportunidadId)
    .order("updated_at", { ascending: false })
    .limit(25);
  return (data ?? []).map((o) => {
    const c = o.cuentas as unknown as { razon_social: string | null; tipo_doc: string | null; num_doc: string | null } | null;
    const p = o.perfiles as unknown as { nombre: string } | null;
    const a = o.actividades as unknown as { count: number }[] | null;
    return {
      id: o.id,
      cliente: c?.razon_social ?? "(sin nombre)",
      documento: c?.num_doc && c.tipo_doc !== "SIN_DOC" ? `${c.tipo_doc} ${c.num_doc}` : null,
      comercial: p?.nombre ?? null,
      etapa: o.etapa,
      creado: o.created_at,
      gestiones: a?.[0]?.count ?? 0,
      mismaFicha: o.cuenta_id === actual?.cuenta_id,
    };
  });
}
