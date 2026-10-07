"use server";

// BUZÓN DE SUGERENCIAS (0399, Santos 05-10). Todo el personal escribe qué
// falta, qué falla o qué mejorar, con capturas; admin lo lee y responde.
// Las capturas las sube el navegador al bucket 'adjuntos' (como las gestiones)
// y acá llegan solo sus metadatos.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";
import { avisarSugerenciaEnviadaEducanet, avisarSugerenciaImplementadaEducanet } from "@/lib/avisos-educanet";
import {
  ESTADOS_SUGERENCIA,
  TIPOS_SUGERENCIA,
  type AdjuntoSugerencia,
  type EstadoSugerencia,
  type Sugerencia,
  type TipoSugerencia,
} from "@/lib/sugerencias";

const MAX_ADJUNTOS = 10;

export async function enviarSugerencia(datos: {
  tipo: TipoSugerencia;
  titulo: string;
  detalle: string;
  pantalla: string | null;
  adjuntos: AdjuntoSugerencia[];
}): Promise<{ error: string | null }> {
  const titulo = datos.titulo.trim();
  if (titulo.length < 3) return { error: "Escriba un título corto (mínimo 3 letras)." };
  if (titulo.length > 140) return { error: "El título es muy largo: déjelo en una frase y el resto en el detalle." };
  if (!TIPOS_SUGERENCIA.some((t) => t.valor === datos.tipo)) return { error: "Tipo de sugerencia inválido." };
  if (datos.adjuntos.length > MAX_ADJUNTOS) return { error: `Máximo ${MAX_ADJUNTOS} capturas por sugerencia.` };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };
  // Las capturas tienen que ser de quien escribe (la carpeta lleva su id).
  if (datos.adjuntos.some((a) => !a.path.startsWith(`sugerencias/${user.id}/`))) {
    return { error: "Una de las capturas no es válida. Vuelva a adjuntarla." };
  }

  const { data: fila, error } = await supabase
    .from("sugerencias")
    .insert({
      autor_id: user.id,
      tipo: datos.tipo,
      titulo,
      detalle: datos.detalle.trim().slice(0, 5000),
      pantalla: datos.pantalla?.trim().slice(0, 300) || null,
      adjuntos: datos.adjuntos,
    })
    .select("id")
    .single();
  if (error || !fila) return { error: "No se pudo guardar la sugerencia. Intente de nuevo." };

  // PUNTOS EN CRECE: TODAS las sugerencias suman, sin límite (Santos, 07-10:
  // «no debería haber límites, todas las sugerencias suman»; antes solo las
  // tres primeras del día). Crece decide cuántos (3, o 1 si es una duda), no
  // repite el mismo evento y tampoco les aplica tope mensual.
  if (user.email) {
    await avisarSugerenciaEnviadaEducanet({ email: user.email, id: fila.id as string, tipo: datos.tipo, titulo });
  }

  const { data: perfil } = await supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle();
  await notificar({
    rol: "admin",
    tipo: "sugerencia",
    titulo: `💡 ${perfil?.nombre ?? "Alguien"} dejó una sugerencia`,
    cuerpo: titulo + (datos.adjuntos.length ? ` · ${datos.adjuntos.length} captura${datos.adjuntos.length === 1 ? "" : "s"}` : ""),
    url: `/observaciones?ver=${fila.id}`,
  });

  revalidatePath("/sugerencias");
  revalidatePath("/observaciones");
  return { error: null };
}

/** Lo que ve cada uno: las suyas; admin y gerencia, todas (lo decide RLS). Con las capturas firmadas por 1 h. */
export async function listarSugerencias(): Promise<Sugerencia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sugerencias")
    .select(
      "id, autor_id, tipo, pantalla, titulo, detalle, adjuntos, estado, respuesta, respondida_at, created_at, autor:perfiles!sugerencias_autor_id_fkey(nombre, codigo_comercial), respondio:perfiles!sugerencias_respondida_por_fkey(nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  const filas = data ?? [];

  const rutas = filas.flatMap((f) => ((f.adjuntos as AdjuntoSugerencia[]) ?? []).map((a) => a.path));
  const url = new Map<string, string>();
  if (rutas.length) {
    // Firmadas con la clave de servicio: la política del bucket ya deja leer
    // a todo perfil activo, y la fila misma ya pasó por RLS.
    const admin = createAdminClient();
    for (let i = 0; i < rutas.length; i += 100) {
      const { data: firmadas } = await admin.storage.from("adjuntos").createSignedUrls(rutas.slice(i, i + 100), 3600);
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) url.set(f.path, f.signedUrl);
    }
  }

  return filas.map((f) => {
    const autor = f.autor as unknown as { nombre: string; codigo_comercial: string | null } | null;
    const respondio = f.respondio as unknown as { nombre: string } | null;
    return {
      id: f.id as string,
      autor_id: f.autor_id as string,
      autor_nombre: autor?.nombre ?? "—",
      autor_codigo: autor?.codigo_comercial ?? null,
      tipo: f.tipo as TipoSugerencia,
      pantalla: f.pantalla as string | null,
      titulo: f.titulo as string,
      detalle: f.detalle as string,
      adjuntos: ((f.adjuntos as AdjuntoSugerencia[]) ?? []).map((a) => ({ ...a, url: url.get(a.path) ?? null })),
      estado: f.estado as EstadoSugerencia,
      respuesta: f.respuesta as string | null,
      respondida_por_nombre: respondio?.nombre ?? null,
      respondida_at: f.respondida_at as string | null,
      created_at: f.created_at as string,
    };
  });
}

/** Admin: cambia el estado y, si escribe algo, responde. Avisa a quien la dejó. */
export async function atenderSugerencia(datos: {
  id: string;
  estado: EstadoSugerencia;
  respuesta: string;
}): Promise<{ error: string | null }> {
  if (!ESTADOS_SUGERENCIA.some((e) => e.valor === datos.estado)) return { error: "Estado inválido." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };

  const respuesta = datos.respuesta.trim();
  const { data: filas, error } = await supabase
    .from("sugerencias")
    .update({
      estado: datos.estado,
      respuesta: respuesta || null,
      respondida_por: respuesta ? user.id : null,
      respondida_at: respuesta ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", datos.id)
    .select("autor_id, titulo");
  if (error) return { error: "No se pudo guardar." };
  if (!filas?.length) return { error: "Solo el administrador puede atender las sugerencias." };

  // Implementada: puntos extra en Crece para quien la propuso (el id fijo del
  // evento hace que marcarla «Hecha» dos veces no sume dos veces).
  if (datos.estado === "hecha") {
    const { data: autor } = await createAdminClient().auth.admin.getUserById(filas[0].autor_id as string);
    if (autor?.user?.email) {
      await avisarSugerenciaImplementadaEducanet({ email: autor.user.email, id: datos.id, titulo: filas[0].titulo as string });
    }
  }

  const etiqueta = ESTADOS_SUGERENCIA.find((e) => e.valor === datos.estado)!.etiqueta;
  if (filas[0].autor_id !== user.id) {
    await notificar({
      userId: filas[0].autor_id as string,
      tipo: "sugerencia",
      // «Hecha» se dice como lo que es para quien reportó: ya está resuelto (Santos, 06-10).
      titulo: datos.estado === "hecha" ? "✅ Ya se solucionó lo que reportó" : `Su sugerencia: ${etiqueta.toLowerCase()}`,
      cuerpo: respuesta ? `«${filas[0].titulo}» · ${respuesta.slice(0, 140)}` : `«${filas[0].titulo}»`,
      url: `/sugerencias?ver=${datos.id}`,
    });
  }
  revalidatePath("/sugerencias");
  revalidatePath("/observaciones");
  return { error: null };
}

/**
 * «YA SE SOLUCIONÓ LO QUE REPORTÓ» (0409, Santos 06-10): el autor da por visto
 * el aviso de sus sugerencias marcadas «Hecha». También deja leídas en la
 * campana las notificaciones de esas mismas sugerencias.
 */
export async function marcarSolucionesVistas(ids: string[]): Promise<{ error: string | null }> {
  if (!ids.length) return { error: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };
  for (const id of ids.slice(0, 20)) {
    const { error } = await supabase.rpc("marcar_solucion_vista", { p_id: id });
    if (error) return { error: "No se pudo guardar." };
  }
  await supabase
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("tipo", "sugerencia")
    .in("url", ids.map((id) => `/sugerencias?ver=${id}`))
    .is("leida_at", null);
  revalidatePath("/sugerencias");
  return { error: null };
}
