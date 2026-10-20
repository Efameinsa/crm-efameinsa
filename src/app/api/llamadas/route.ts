import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarGestionRegistradaEducanet } from "@/lib/avisos-educanet";
import { duracionLegible, normalizarNumero } from "@/lib/llamadas";
import { acceso, LlamadaSchema, raizLlamadas } from "@/lib/llamadas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * REGISTRAR UNA LLAMADA (Santos, 19-10-2026).
 *
 * El botón «Llamar» de la app Android —y, sin audio, el de la PWA— anota acá la
 * llamada cuando termina: número, hora, duración y si ya sabe qué pasó con el
 * audio. De acá sale: la fila de `llamadas`, la ficha a la que pertenece el
 * número y la gestión «llamada» en el expediente.
 *
 * IDEMPOTENTE: el uuid lo genera el celular. Si la respuesta se pierde y
 * reintenta, no hay una segunda llamada, ni una segunda gestión, ni puntos de
 * más en Crece. Responde `subir_audio: true` cuando falta que mande el archivo
 * (PUT /api/llamadas/{id}/audio).
 *
 * Sin sesión: la llave es el token del celular (`Authorization: Bearer …`), por
 * eso el proxy deja pasar esta ruta (src/proxy.ts).
 */

const sinCache = { "cache-control": "no-store" };

function responder(cuerpo: Record<string, unknown>, estado = 200) {
  return NextResponse.json(cuerpo, { status: estado, headers: sinCache });
}

export async function POST(request: Request) {
  try {
    const a = await acceso(request);
    if (!a.ok) return responder({ error: a.estado === 429 ? "demasiadas_peticiones" : "no_autenticado" }, a.estado);
    const { userId, dispositivoId } = a.quien;

    const cuerpo = LlamadaSchema.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return responder({ error: "datos", detalle: cuerpo.error.issues[0]?.message ?? "datos no válidos" }, 400);
    const l = cuerpo.data;

    const numero = normalizarNumero(l.numero);
    if (!numero) return responder({ error: "numero", detalle: "No parece un teléfono." }, 400);

    const admin = createAdminClient();

    // ¿Ya la anotamos? (el celular reintentó). De otra persona no se dice nada.
    const { data: previa } = await admin.from("llamadas").select("id, user_id, estado_audio").eq("id", l.id).maybeSingle();
    if (previa) {
      if (previa.user_id !== userId) return responder({ error: "no_autenticado" }, 401);
      return responder({ ok: true, id: l.id, estado_audio: previa.estado_audio, subir_audio: previa.estado_audio === "pendiente", repetida: true });
    }

    // A qué ficha pertenece el número (la de la cartera de quien llama gana).
    let cuentaId = l.cuenta_id ?? null;
    let contactoId = l.contacto_id ?? null;
    let oportunidadId: string | null = null;
    const { data: resuelto } = await admin.rpc("llamada_resolver_numero", { p_numero: numero, p_user: userId });
    const fila = (resuelto as { cuenta_id: string; contacto_id: string; oportunidad_id: string | null }[] | null)?.[0];
    if (!cuentaId && fila) {
      cuentaId = fila.cuenta_id;
      contactoId = contactoId ?? fila.contacto_id;
      oportunidadId = fila.oportunidad_id;
    } else if (cuentaId) {
      // Se llamó desde una ficha concreta: esa manda, y se busca SU expediente abierto.
      const { data: cuenta } = await admin.from("cuentas").select("id").eq("id", cuentaId).maybeSingle();
      if (!cuenta) cuentaId = null;
      else if (fila && fila.cuenta_id === cuentaId) oportunidadId = fila.oportunidad_id;
      else {
        const { data: op } = await admin
          .from("oportunidades")
          .select("id")
          .eq("cuenta_id", cuentaId)
          .eq("comercial_id", userId)
          .not("etapa", "in", "(rechazada,venta,historico)")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        oportunidadId = op?.id ?? null;
      }
    }

    const contestada = l.duracion_s > 0;
    // Sin guardado en esta copia (nube), o sin llamada contestada, o desde el navegador: no hay audio que esperar.
    let estadoAudio: string = l.estado_audio ?? "pendiente";
    if (l.origen === "pwa") estadoAudio = "sin_audio_pwa";
    else if (!contestada) estadoAudio = "no_disponible";
    else if (!raizLlamadas()) estadoAudio = "no_disponible";

    const { error: errorInsert } = await admin.from("llamadas").insert({
      id: l.id,
      user_id: userId,
      cuenta_id: cuentaId,
      contacto_id: contactoId,
      oportunidad_id: oportunidadId,
      numero,
      direccion: "saliente",
      origen: l.origen,
      iniciada_at: l.iniciada_at,
      duracion_s: l.duracion_s,
      contestada,
      estado_audio: estadoAudio,
      estado_ia: "no_aplica",
      dispositivo_id: dispositivoId,
    });
    if (errorInsert) {
      // Dos reintentos a la vez: el segundo choca con la clave y es la misma llamada.
      if (errorInsert.code === "23505") return responder({ ok: true, id: l.id, estado_audio: estadoAudio, subir_audio: estadoAudio === "pendiente", repetida: true });
      console.error("llamadas: no se guardó:", errorInsert.message);
      return responder({ error: "servidor" }, 500);
    }

    // La gestión en el expediente, una sola vez: este punto solo se alcanza con la primera inserción.
    if (oportunidadId) {
      const nota = contestada ? `Llamada de ${duracionLegible(l.duracion_s)} (contestó)` : "Llamó y no contestó";
      const { data: actividad, error: errorActividad } = await admin
        .from("actividades")
        .insert({ oportunidad_id: oportunidadId, tipo: "llamada", nota, realizada_por: userId, realizada_at: l.iniciada_at })
        .select("id")
        .single();
      if (errorActividad) console.error("llamadas: no se anotó la gestión:", errorActividad.message);
      else {
        await admin.from("llamadas").update({ actividad_id: actividad.id }).eq("id", l.id);
        // Crece da el punto de «llamada» solo si alguien contestó: una llamada que nadie atendió no suma.
        if (contestada) await avisarCrece(userId, cuentaId, nota);
      }
    }

    return responder({ ok: true, id: l.id, estado_audio: estadoAudio, subir_audio: estadoAudio === "pendiente", cuenta_id: cuentaId });
  } catch (e) {
    console.error("llamadas:", e instanceof Error ? e.message : e);
    return responder({ error: "servidor" }, 500);
  }
}

/** Mejor esfuerzo: que Crece no conteste nunca tumba el registro de la llamada. */
async function avisarCrece(userId: string, cuentaId: string | null, nota: string) {
  try {
    const admin = createAdminClient();
    const [{ data: perfil }, { data: cuenta }] = await Promise.all([
      admin.from("perfiles").select("email_contacto").eq("id", userId).maybeSingle(),
      cuentaId ? admin.from("cuentas").select("razon_social, nombre_comercial").eq("id", cuentaId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!perfil?.email_contacto) return;
    await avisarGestionRegistradaEducanet({
      email: perfil.email_contacto,
      tipoGestion: "llamada",
      cliente: cuenta?.nombre_comercial || cuenta?.razon_social,
      nota,
    });
  } catch (e) {
    console.error("llamadas: aviso a Crece:", e instanceof Error ? e.message : e);
  }
}
