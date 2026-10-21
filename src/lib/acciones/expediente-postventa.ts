"use server";
import { casosAbiertosDeCuenta, type CasoParaGestion } from "@/lib/acciones/casos-de-la-gestion";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";

// «Es un caso» y «Lo atiende mi compañera» (0284, reunión 23-09). Las reglas
// viven en la base; acá se avisa a quien recibe.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

export async function catalogarExpediente(oportunidadId: string, tipo: string, motivo: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalogar_expediente_postventa", { p_oportunidad: oportunidadId, p_tipo: tipo, p_motivo: motivo });
  if (error) return { error: limpiar(error.message), etiqueta: null as string | null };
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  revalidatePath("/postventa");
  revalidatePath("/postventa/atenciones");
  return { error: null as string | null, etiqueta: data as string };
}

export async function pasarACompanera(oportunidadId: string, companeraId: string, motivo: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pasar_expediente_a_companera", { p_oportunidad: oportunidadId, p_a: companeraId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message), quien: null as string | null };
  const { data: o } = await supabase.from("oportunidades").select("cuentas(razon_social)").eq("id", oportunidadId).maybeSingle();
  const cliente = ((o?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "").replace(/^\d{8,11}\s*-\s*/, "");
  await notificar({
    userId: companeraId,
    tipo: "lead_asignado",
    titulo: `Te pasaron un expediente · ${cliente}`,
    cuerpo: `${perfil.nombre}: ${motivo.trim()}`,
    url: `/comercial/oportunidades/${oportunidadId}`,
  });
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  revalidatePath("/postventa");
  return { error: null as string | null, quien: data as string };
}

/**
 * «ME QUEDO CON ESTA CARPETA» (0530, Santos 17-10). La carpeta de postventa es
 * del cliente; la lleva quien la está empujando. Es el mismo pase de la 0284,
 * hacia quien aprieta el botón, y a la que la tenía le llega el aviso.
 */
export async function quedarmeConLaCarpeta(oportunidadId: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("oportunidades")
    .select("comercial_id, cuentas(razon_social)")
    .eq("id", oportunidadId)
    .maybeSingle();
  const { error } = await supabase.rpc("pasar_expediente_a_companera", {
    p_oportunidad: oportunidadId,
    p_a: perfil.id,
    p_motivo: "Me quedo con esta carpeta",
  });
  if (error) return { error: limpiar(error.message) };
  const antes = o?.comercial_id as string | null;
  if (antes && antes !== perfil.id) {
    const cliente = ((o?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "").replace(/^\d{8,11}\s*-\s*/, "");
    await notificar({
      userId: antes,
      tipo: "otro",
      titulo: `${perfil.nombre} se quedó con la carpeta · ${cliente}`,
      cuerpo: "Usted la sigue viendo en «Del área» y en Atenciones; sus casos siguen a su nombre.",
      url: `/comercial/oportunidades/${oportunidadId}`,
    });
  }
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  revalidatePath("/postventa");
  return { error: null as string | null };
}

/**
 * UNIR EXPEDIENTES (0530). Antes era SQL a mano (Choquehuanca 15-10 y 17-10).
 * La base decide quién puede y qué se mueve; acá solo se refresca.
 */
export async function unirExpedientes(desdeId: string, haciaId: string, motivo: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unir_expedientes", { p_desde: desdeId, p_hacia: haciaId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message), mensaje: null as string | null };
  revalidatePath(`/comercial/oportunidades/${haciaId}`);
  revalidatePath(`/comercial/oportunidades/${desdeId}`);
  revalidatePath("/postventa");
  return { error: null as string | null, mensaje: data as string };
}

export interface ResumenCarpeta {
  oportunidadId: string;
  lleva: string;
  casos: { titulo: string; responsable: string }[];
  cotizacionesVivas: number;
}

/**
 * Lo que Central ve antes de derivar a postventa (0530): si el cliente ya
 * tiene carpeta, quién la lleva y qué casos tiene abiertos. Así se deriva
 * sabiendo que el pedido entra ahí y no abre otro expediente.
 */
export async function carpetaDelCliente(cuentaId: string): Promise<ResumenCarpeta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(cuentaId)) return null;
  await requerirPerfil();
  const supabase = await createClient();
  const { data: id } = await supabase.rpc("carpeta_postventa", { p_cuenta: cuentaId });
  if (!id) return null;
  const [{ data: o }, { data: casos }, { count }] = await Promise.all([
    supabase.from("oportunidades").select("perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)").eq("id", id as string).maybeSingle(),
    supabase
      .from("atenciones")
      .select("tipo, tipo_detalle, asignado:asignado_a(nombre, codigo_comercial)")
      .eq("oportunidad_id", id as string)
      .is("cerrado_at", null),
    supabase
      .from("cotizaciones")
      .select("id", { count: "exact", head: true })
      .eq("oportunidad_id", id as string)
      .is("anulada_at", null)
      .in("estado", ["borrador", "enviada"]),
  ]);
  const { tituloDelTipo } = await import("@/lib/atenciones");
  type P = { nombre: string; codigo_comercial: string | null } | null;
  const nom = (p: P) => (p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "sin asignar");
  return {
    oportunidadId: id as string,
    lleva: nom(o?.perfiles as unknown as P),
    casos: (casos ?? []).map((c) => ({ titulo: tituloDelTipo(c.tipo, c.tipo_detalle), responsable: nom(c.asignado as unknown as P) })),
    cotizacionesVivas: count ?? 0,
  };
}

/**
 * LOS CASOS ABIERTOS QUE CENTRAL VE AL DERIVAR (gerencia 20-10, Lino Espíritu:
 * «la central tendría que filtrar… ¿de qué caso habla?»). Con su código, su
 * máquina y si están en otra ficha del mismo cliente. Central elige a cuál se
 * suma la llamada o dice que es otro problema (0567).
 */
export async function casosAbiertosParaDerivar(cuentaId: string): Promise<CasoParaGestion[]> {
  if (!/^[0-9a-f-]{36}$/i.test(cuentaId)) return [];
  await requerirPerfil();
  const supabase = await createClient();
  const { data: visible } = await supabase.from("cuentas").select("id").eq("id", cuentaId).maybeSingle();
  if (!visible) return [];
  return casosAbiertosDeCuenta(cuentaId);
}

/** «Hoy cubro a…» (0530): la compañera falta; sus avisos me llegan en copia. */
export async function cubrirA(ausenteId: string, hasta: string | null) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cubrir_a", { p_ausente: ausenteId, p_hasta: hasta || null });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/postventa");
  return { error: null as string | null };
}

export async function terminarCobertura(id: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("terminar_cobertura", { p_id: id });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/postventa");
  return { error: null as string | null };
}
