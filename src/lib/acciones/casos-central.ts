"use server";

// CASOS DE CENTRAL A LAS ÁREAS (0573, Santos 21-10). Cada paso pasa por su
// función de la base (valida quién y en qué estado) y después avisa al otro
// lado: el área recibe el caso nuevo —urgente con la misma sirena de
// «Urgencia a Finanzas»—, y Central recibe lo que el área hace con él.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar, type TipoNotificacion } from "@/lib/notificaciones";
import { ETIQUETA_AREA, type AdjuntoCaso, type AreaCaso } from "@/lib/casos-central";

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

interface Resumen {
  id: string;
  codigo: string;
  area: AreaCaso;
  motivo: string;
  urgente: boolean;
  vence_at: string | null;
  cliente: string;
  estado: string;
  creado_por: string;
  tomado_por: string | null;
  es_prueba: boolean;
  avisos_n: number;
  reabierto?: boolean;
  sin_respuesta?: boolean;
}

const urlArea = (r: Resumen) => `/${r.area}/casos?ver=${r.id}`;
const urlCentral = (r: Resumen) => `/central/casos?ver=${r.id}`;
const horaLima = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }) : "";

/** A toda el área (sin las cuentas espejo de la propuesta), separada por práctica como los demás avisos. */
async function notificarArea(area: AreaCaso, datos: { tipo: TipoNotificacion; titulo: string; cuerpo?: string; url: string; esPrueba: boolean }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfiles")
    .select("id")
    .eq("rol", area)
    .eq("activo", true)
    .eq("es_prueba", datos.esPrueba)
    .is("espejo_de", null);
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id as string, tipo: datos.tipo, titulo: datos.titulo, cuerpo: datos.cuerpo, url: datos.url })));
}

function revalidar(r: Resumen) {
  revalidatePath("/central/casos");
  revalidatePath(`/${r.area}/casos`);
}

function validarAdjuntos(adjuntos: AdjuntoCaso[], userId: string): string | null {
  if (adjuntos.length > 10) return "Máximo 10 archivos por caso.";
  if (adjuntos.some((a) => !a.path.startsWith(`casos-central/${userId}/`))) return "Uno de los archivos no es válido. Vuelva a adjuntarlo.";
  return null;
}

async function usuario() {
  await requerirPerfil();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** Central abre el caso: le llega a toda el área. */
export async function crearCasoCentral(datos: {
  area: AreaCaso;
  motivo: string;
  mensaje: string;
  urgente: boolean;
  vence: string | null;
  cuentaId: string | null;
  servicioId: string | null;
  adjuntos: AdjuntoCaso[];
}): Promise<{ error: string | null; codigo?: string }> {
  const { supabase, userId } = await usuario();
  if (!userId) return { error: "Su sesión venció: vuelva a entrar." };
  const malAdjunto = validarAdjuntos(datos.adjuntos, userId);
  if (malAdjunto) return { error: malAdjunto };

  const { data, error } = await supabase.rpc("crear_caso_central", {
    p_area: datos.area,
    p_motivo: datos.motivo,
    p_mensaje: datos.mensaje,
    p_urgente: datos.urgente,
    p_vence: datos.vence,
    p_cuenta: datos.cuentaId,
    p_servicio: datos.servicioId,
    p_adjuntos: datos.adjuntos,
  });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;

  const resumen = datos.mensaje.trim().replace(/\s+/g, " ").slice(0, 220);
  await notificarArea(r.area, {
    tipo: r.urgente ? "caso_central_urgente" : "caso_central",
    titulo: `${r.motivo} · ${r.cliente}`,
    cuerpo: `${r.codigo}. ${resumen}${r.urgente ? ` Vence ${horaLima(r.vence_at)}.` : ""}`,
    url: urlArea(r),
    esPrueba: r.es_prueba,
  });

  revalidar(r);
  if (datos.servicioId) revalidatePath("/central/pedidos");
  return { error: null, codigo: r.codigo };
}

export async function tomarCasoCentral(casoId: string): Promise<{ error: string | null }> {
  const { supabase } = await usuario();
  const { data, error } = await supabase.rpc("tomar_caso_central", { p_caso: casoId });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  const { data: yo } = await supabase.from("perfiles").select("nombre").eq("id", r.tomado_por ?? "").maybeSingle();
  await notificar({
    userId: r.creado_por,
    tipo: "caso_central_respuesta",
    titulo: `${ETIQUETA_AREA[r.area]} tomó tu caso · ${r.codigo}`,
    cuerpo: `${r.motivo} · ${r.cliente}${yo?.nombre ? `. Lo tiene ${yo.nombre}.` : ""}`,
    url: urlCentral(r),
  });
  revalidar(r);
  return { error: null };
}

export async function pedirDatoCasoCentral(casoId: string, texto: string): Promise<{ error: string | null }> {
  const { supabase } = await usuario();
  const { data, error } = await supabase.rpc("pedir_dato_caso_central", { p_caso: casoId, p_texto: texto });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  await notificar({
    userId: r.creado_por,
    tipo: "caso_central_respuesta",
    titulo: `${ETIQUETA_AREA[r.area]} te pide un dato · ${r.codigo}`,
    cuerpo: `«${texto.trim().slice(0, 220)}»`,
    url: urlCentral(r),
  });
  revalidar(r);
  return { error: null };
}

export async function responderCasoCentral(casoId: string, texto: string, adjuntos: AdjuntoCaso[]): Promise<{ error: string | null }> {
  const { supabase, userId } = await usuario();
  if (!userId) return { error: "Su sesión venció: vuelva a entrar." };
  const malAdjunto = validarAdjuntos(adjuntos, userId);
  if (malAdjunto) return { error: malAdjunto };
  const { data, error } = await supabase.rpc("responder_caso_central", { p_caso: casoId, p_texto: texto, p_adjuntos: adjuntos });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  await notificar({
    userId: r.creado_por,
    tipo: "caso_central_respuesta",
    titulo: `${ETIQUETA_AREA[r.area]} respondió · ${r.codigo}`,
    cuerpo: `${r.motivo} · ${r.cliente}: ${texto.trim().slice(0, 220)}`,
    url: urlCentral(r),
  });
  revalidar(r);
  return { error: null };
}

/** Central contesta el dato que le pidieron, o dice que el caso respondido no quedó resuelto. */
export async function contestarCasoCentral(casoId: string, texto: string, adjuntos: AdjuntoCaso[]): Promise<{ error: string | null }> {
  const { supabase, userId } = await usuario();
  if (!userId) return { error: "Su sesión venció: vuelva a entrar." };
  const malAdjunto = validarAdjuntos(adjuntos, userId);
  if (malAdjunto) return { error: malAdjunto };
  const { data, error } = await supabase.rpc("contestar_caso_central", { p_caso: casoId, p_texto: texto, p_adjuntos: adjuntos });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  const aviso = {
    tipo: (r.reabierto ? "caso_central_urgente" : "caso_central") as TipoNotificacion,
    titulo: r.reabierto ? `Central dice que no quedó resuelto · ${r.codigo}` : `Central contestó · ${r.codigo}`,
    cuerpo: `${r.motivo} · ${r.cliente}: ${texto.trim().slice(0, 220)}`,
    url: urlArea(r),
  };
  // Le llega a quien lo tenía; si nadie lo había tomado, a toda el área.
  if (r.tomado_por) await notificar({ userId: r.tomado_por, ...aviso });
  else await notificarArea(r.area, { ...aviso, esPrueba: r.es_prueba });
  revalidar(r);
  return { error: null };
}

export async function cerrarCasoCentral(casoId: string, texto: string): Promise<{ error: string | null }> {
  const { supabase } = await usuario();
  const { data, error } = await supabase.rpc("cerrar_caso_central", { p_caso: casoId, p_texto: texto.trim() || null });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  // Cerrar un caso respondido es el final normal: no hace falta avisar.
  // Cerrarlo sin respuesta sí: el área podría estar trabajando en él.
  if (r.sin_respuesta) {
    const aviso = { tipo: "caso_central" as TipoNotificacion, titulo: `Central cerró el caso · ${r.codigo}`, cuerpo: `${r.motivo} · ${r.cliente}: ${texto.trim().slice(0, 220)}`, url: urlArea(r) };
    if (r.tomado_por) await notificar({ userId: r.tomado_por, ...aviso });
    else await notificarArea(r.area, { ...aviso, esPrueba: r.es_prueba });
  }
  revalidar(r);
  return { error: null };
}

/** «Volver a avisar»: la sirena otra vez. Del tercer aviso en adelante, gerencia también se entera. */
export async function insistirCasoCentral(casoId: string): Promise<{ error: string | null; avisos?: number }> {
  const { supabase } = await usuario();
  const { data, error } = await supabase.rpc("insistir_caso_central", { p_caso: casoId });
  if (error) return { error: limpiar(error.message) };
  const r = data as Resumen;
  const aviso = {
    tipo: "caso_central_urgente" as TipoNotificacion,
    titulo: `Central insiste · ${r.motivo} · ${r.cliente}`,
    cuerpo: `${r.codigo}: es el aviso n.º ${r.avisos_n}.`,
    url: urlArea(r),
  };
  if (r.tomado_por) await notificar({ userId: r.tomado_por, ...aviso });
  else await notificarArea(r.area, { ...aviso, esPrueba: r.es_prueba });
  if (r.avisos_n >= 3 && !r.es_prueba) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${r.cliente} sigue esperando a ${ETIQUETA_AREA[r.area]}`,
      cuerpo: `${r.codigo} · ${r.motivo}: Central ya avisó ${r.avisos_n} veces.`,
      url: urlCentral(r),
    });
  }
  revalidar(r);
  return { error: null, avisos: r.avisos_n };
}
