import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EN QUÉ QUEDÓ CADA LEAD DEL REPORTE (Santos, 16-10, caso Vidawasi PRO-11124).
 * La sección «Leads recibidos de Central» decía «Llamada» y Ariana leía que
 * ella había llamado: era por dónde entró el cliente. Y el expediente lo
 * atendió y lo cerró Rubí, así que tampoco lo tenía en sus pendientes. Cada
 * fila dice ahora en qué quedó y quién lo atendió, si no fue la persona del
 * reporte. Llave de servicio: la ruta ya autorizó.
 */
export async function estadoDeLosLeads(
  admin: SupabaseClient,
  personaId: string,
  codigos: string[],
): Promise<Map<string, string>> {
  const salida = new Map<string, string>();
  const lista = codigos.filter(Boolean);
  if (!lista.length) return salida;

  const { data: leads } = await admin.from("leads").select("codigo, oportunidad_id").in("codigo", lista);
  const porOpp = new Map(((leads ?? []) as { codigo: string; oportunidad_id: string | null }[]).filter((l) => l.oportunidad_id).map((l) => [l.oportunidad_id as string, l.codigo]));
  const ids = [...porOpp.keys()];
  if (!ids.length) return salida;

  const [{ data: opps }, { data: acts }] = await Promise.all([
    admin.from("oportunidades").select("id, etapa").in("id", ids),
    admin.from("actividades").select("oportunidad_id, realizada_por, realizada_at").in("oportunidad_id", ids).order("realizada_at", { ascending: false }).limit(2000),
  ]);
  const gestiones = (acts ?? []) as { oportunidad_id: string; realizada_por: string | null }[];
  const autores = [...new Set(gestiones.map((a) => a.realizada_por).filter((x): x is string => !!x && x !== personaId))];
  const { data: perfiles } = autores.length ? await admin.from("perfiles").select("id, nombre").in("id", autores) : { data: [] };
  const nombre = new Map(((perfiles ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, (p.nombre ?? "otra persona").replace(/\s*\(.*\)\s*$/, "")]));

  for (const o of (opps ?? []) as { id: string; etapa: string }[]) {
    const codigo = porOpp.get(o.id)!;
    const deEsta = gestiones.filter((a) => a.oportunidad_id === o.id);
    const ultima = deEsta[0]?.realizada_por ?? null;
    const otros = [...new Set(deEsta.map((a) => a.realizada_por).filter((x): x is string => !!x && x !== personaId))].map((id) => nombre.get(id) ?? "otra persona");
    const suya = deEsta.some((a) => a.realizada_por === personaId);
    let texto: string;
    if (o.etapa === "rechazada") texto = ultima && ultima !== personaId ? `Lo atendió y cerró ${nombre.get(ultima) ?? "otra persona"}` : "Cerrado por usted";
    else if (o.etapa === "venta") texto = "Terminó en venta";
    else if (suya) texto = otros.length ? `Gestionado por usted y ${otros.join(", ")}` : "Gestionado por usted";
    else if (otros.length) texto = `Lo atendió ${otros.join(", ")}`;
    else texto = "Sin gestión todavía";
    salida.set(codigo, texto);
  }
  return salida;
}
