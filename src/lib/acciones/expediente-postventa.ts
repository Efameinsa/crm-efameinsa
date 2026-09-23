"use server";
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
