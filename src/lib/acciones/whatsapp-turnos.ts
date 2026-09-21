"use server";

// Los WhatsApp de campaña van al vendedor de turno (0262, Santos 21-09):
// «un día específico de la semana solamente le va a llegar a C5… otro a
// otro comercial». Acá gerencia decide quién recibe cada día, y ve el
// registro de lo que llegó: asignado al turno, o retenido para Central
// porque el número ya era de un cliente de otro comercial.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DIAS_SEMANA, type ResultadoAsignacionAutomatica } from "@/lib/whatsapp-turnos-constantes";

export interface TurnoWhatsapp {
  dia_semana: number;
  comercial_id: string | null;
  comercial_nombre: string | null;
  comercial_codigo: string | null;
}

export async function listarTurnosWhatsapp(): Promise<TurnoWhatsapp[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("wa_turnos").select("dia_semana, comercial_id, perfiles!wa_turnos_comercial_id_fkey(nombre, codigo_comercial)");
  const porDia = new Map<number, TurnoWhatsapp>();
  for (const f of data ?? []) {
    const p = f.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    porDia.set(f.dia_semana as number, {
      dia_semana: f.dia_semana as number,
      comercial_id: (f.comercial_id as string | null) ?? null,
      comercial_nombre: p?.nombre ?? null,
      comercial_codigo: p?.codigo_comercial ?? null,
    });
  }
  return DIAS_SEMANA.map((_, dia) => porDia.get(dia) ?? { dia_semana: dia, comercial_id: null, comercial_nombre: null, comercial_codigo: null });
}

/** Comerciales que pueden recibir turno: activos, reales (no de práctica), sin las cuentas de almacén ni postventa. */
export async function comercialesParaTurno(): Promise<{ id: string; nombre: string; codigo: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, es_almacen, es_postventa")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial");
  return (data ?? [])
    .filter((p) => !p.es_almacen && !p.es_postventa)
    .map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo_comercial }));
}

export async function guardarTurnoWhatsapp(diaSemana: number, comercialId: string | null): Promise<{ error: string | null }> {
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return { error: "Día inválido" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data, error } = await supabase
    .from("wa_turnos")
    .upsert({ dia_semana: diaSemana, comercial_id: comercialId, updated_at: new Date().toISOString(), updated_by: user.id })
    .select("dia_semana");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solo gerencia puede cambiar los turnos" };

  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

export interface AsignacionAutomatica {
  id: number;
  created_at: string;
  telefono: string | null;
  resultado: ResultadoAsignacionAutomatica;
  detalle: string | null;
  lead_codigo: string | null;
  lead_nombre: string | null;
  lead_estado: string | null;
  codigo_campania_wa: string | null;
  conversacion_id: string | null;
  comercial_turno_nombre: string | null;
  comercial_turno_codigo: string | null;
  dueno_nombre: string | null;
  dueno_codigo: string | null;
}

/** El registro de lo que llegó por los anuncios en un período (los más nuevos primero). */
export async function listarAsignacionesAutomaticas(desde: string, hasta: string): Promise<AsignacionAutomatica[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_asignaciones_automaticas")
    .select(
      "id, created_at, telefono, resultado, detalle, conversacion_id, leads(codigo, nombre_contacto, estado, codigo_campania_wa), turno:perfiles!wa_asignaciones_automaticas_comercial_turno_fkey(nombre, codigo_comercial), dueno:perfiles!wa_asignaciones_automaticas_dueno_cartera_fkey(nombre, codigo_comercial)",
    )
    .gte("created_at", `${desde}T00:00:00-05:00`)
    .lte("created_at", `${hasta}T23:59:59-05:00`)
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((f) => {
    const lead = f.leads as unknown as { codigo: string; nombre_contacto: string; estado: string; codigo_campania_wa: string | null } | null;
    const turno = f.turno as unknown as { nombre: string; codigo_comercial: string | null } | null;
    const dueno = f.dueno as unknown as { nombre: string; codigo_comercial: string | null } | null;
    return {
      id: f.id as number,
      created_at: f.created_at as string,
      telefono: (f.telefono as string | null) ?? null,
      resultado: f.resultado as AsignacionAutomatica["resultado"],
      detalle: (f.detalle as string | null) ?? null,
      lead_codigo: lead?.codigo ?? null,
      lead_nombre: lead?.nombre_contacto ?? null,
      lead_estado: lead?.estado ?? null,
      codigo_campania_wa: lead?.codigo_campania_wa ?? null,
      conversacion_id: (f.conversacion_id as string | null) ?? null,
      comercial_turno_nombre: turno?.nombre ?? null,
      comercial_turno_codigo: turno?.codigo_comercial ?? null,
      dueno_nombre: dueno?.nombre ?? null,
      dueno_codigo: dueno?.codigo_comercial ?? null,
    };
  });
}
