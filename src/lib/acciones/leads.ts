"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { notificar } from "@/lib/notificaciones";
import { esquemaCaptura } from "@/lib/validaciones/lead";
import { CANAL_LABEL } from "@/lib/canal-contacto";

export interface ResultadoDuplicado {
  cuenta: { id: string; razon_social: string; comercial_nombre: string | null } | null;
  leadPendiente: { id: string; codigo: string | null; recibido_at: string } | null;
}

// R2: se llama mientras Central escribe teléfono/documento, para avisar antes
// de registrar si ya existe el cliente (y de quién es la cartera) o si ya hay
// un contacto pendiente muy parecido sin procesar todavía.
export async function buscarDuplicado(datos: {
  telefono?: string;
  numDoc?: string;
}): Promise<ResultadoDuplicado> {
  const telefonoNorm = normalizarTelefono(datos.telefono);
  const numDoc = datos.numDoc?.replace(/\D/g, "") || null;

  if (!telefonoNorm && !numDoc) {
    return { cuenta: null, leadPendiente: null };
  }

  const supabase = await createClient();

  let cuentaId: string | null = null;
  let cuenta: ResultadoDuplicado["cuenta"] = null;

  if (numDoc) {
    const { data } = await supabase
      .from("cuentas")
      .select("id, razon_social, perfiles(nombre)")
      .eq("num_doc", numDoc)
      .neq("tipo_doc", "SIN_DOC")
      .maybeSingle();
    if (data) {
      cuentaId = data.id;
      cuenta = {
        id: data.id,
        razon_social: data.razon_social,
        comercial_nombre: (data.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
      };
    }
  }

  if (!cuenta && telefonoNorm) {
    const { data } = await supabase
      .from("contactos")
      .select("cuenta_id, cuentas(id, razon_social, comercial_id, perfiles(nombre))")
      .eq("telefono_normalizado", telefonoNorm)
      .limit(1)
      .maybeSingle();
    const c = data?.cuentas as unknown as
      | { id: string; razon_social: string; perfiles: { nombre: string } | null }
      | null;
    if (c) {
      cuentaId = c.id;
      cuenta = { id: c.id, razon_social: c.razon_social, comercial_nombre: c.perfiles?.nombre ?? null };
    }
  }

  let leadPendiente: ResultadoDuplicado["leadPendiente"] = null;
  if (!cuentaId) {
    // Solo importa avisar de un lead pendiente si no es ya un cliente conocido
    // (ese caso lo resuelve la sugerencia de cartera, no un aviso de duplicado).
    let query = supabase
      .from("leads")
      .select("id, codigo, recibido_at")
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: false })
      .limit(1);

    if (numDoc && telefonoNorm) {
      query = query.or(`num_doc.eq.${numDoc},telefono_normalizado.eq.${telefonoNorm}`);
    } else if (numDoc) {
      query = query.eq("num_doc", numDoc);
    } else if (telefonoNorm) {
      query = query.eq("telefono_normalizado", telefonoNorm);
    }

    const { data } = await query.maybeSingle();
    if (data) leadPendiente = data;
  }

  return { cuenta, leadPendiente };
}

export async function registrarContacto(
  formData: FormData,
): Promise<{ error: string | null; codigo?: string }> {
  const datos = esquemaCaptura.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }
  const d = datos.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  // R1: si no es comercial, el triaje termina aquí mismo.
  const esComercial = d.area_destino === "comercial";

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      canal: d.canal,
      area_destino: d.area_destino,
      estado: esComercial ? "pendiente_triaje" : "derivado_area",
      nombre_contacto: d.nombre_contacto,
      telefono: d.telefono || null,
      num_doc: d.num_doc ? d.num_doc.replace(/\D/g, "") : null,
      razon_social: d.razon_social || null,
      email: d.email || null,
      mensaje: d.mensaje || null,
      recibido_por: user.id,
    })
    .select("codigo")
    .single();

  if (error) return { error: error.message };

  if (esComercial) {
    const canalLegible = CANAL_LABEL[d.canal] ?? d.canal;
    const cuerpo = d.razon_social
      ? `${d.nombre_contacto} · ${canalLegible} · ${d.razon_social}`
      : `${d.nombre_contacto} · ${canalLegible}`;
    await notificar({
      rol: "gerencia",
      tipo: "lead_registrado",
      titulo: "Nuevo contacto en Central",
      cuerpo,
      url: "/gerencia",
    });
  }

  revalidatePath("/central");
  return { error: null, codigo: lead.codigo ?? undefined };
}

export async function asignarLead(
  leadId: string,
  comercialId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: oportunidadId, error } = await supabase.rpc("asignar_lead", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
  });
  if (error) return { error: error.message };

  const { data: oportunidad } = await supabase
    .from("oportunidades")
    .select("cuentas(razon_social)")
    .eq("id", oportunidadId)
    .maybeSingle();
  const razonSocial =
    (oportunidad?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Nuevo contacto";

  await notificar({
    userId: comercialId,
    tipo: "lead_asignado",
    titulo: "Nuevo contacto asignado",
    cuerpo: razonSocial,
    url: `/comercial/oportunidades/${oportunidadId}`,
  });

  revalidatePath("/central");
  return { error: null };
}

export async function descartarLead(leadId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ estado: "descartado" })
    .eq("id", leadId)
    .eq("estado", "pendiente_triaje");
  if (error) return { error: error.message };

  revalidatePath("/central");
  return { error: null };
}

export async function marcarDuplicado(
  leadId: string,
  duplicadoDeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ estado: "duplicado", duplicado_de: duplicadoDeId })
    .eq("id", leadId)
    .eq("estado", "pendiente_triaje");
  if (error) return { error: error.message };

  revalidatePath("/central");
  return { error: null };
}
