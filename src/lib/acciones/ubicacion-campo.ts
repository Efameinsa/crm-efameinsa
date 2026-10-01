"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Anota una lectura de ubicación del piloto de trabajo de campo (0363; Ing.
 * Carlos, 01-10-2026: «hacer que lo más preciso sea posible … menos de 10
 * metros»). La manda el navegador al ingresar, cada 10 min y al volver a la
 * pestaña.
 *
 * Nunca lanza ni redirige: la llama un temporizador, y un tropiezo acá no
 * puede sacar a nadie del CRM ni mostrarle un error en medio de una
 * cotización. Si la persona no está marcada para el piloto, la base rechaza la
 * fila (RLS) y no pasa nada más.
 */
const esquema = z.object({
  origen: z.enum(["ingreso", "periodica", "manual"]),
  estado: z.enum(["ok", "denegado", "no_disponible", "tiempo_agotado", "no_soportado"]),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  precision: z.number().min(0).max(10_000_000).nullable(),
  detalle: z.string().max(300).nullable(),
});

export type LecturaUbicacion = z.infer<typeof esquema>;

export async function registrarUbicacionCampo(lectura: LecturaUbicacion): Promise<{ ok: boolean }> {
  try {
    const datos = esquema.safeParse(lectura);
    if (!datos.success) return { ok: false };
    const d = datos.data;
    const conCoordenadas = d.estado === "ok" && d.lat != null && d.lon != null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    // La IP y el equipo, como en `accesos` (auth.ts): sirven para cruzar con
    // «Accesos y equipos» cuando la ubicación no llega.
    const encabezados = await headers();
    const ip =
      encabezados.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      encabezados.get("x-real-ip") ??
      null;

    const { error } = await supabase.from("ubicaciones_campo").insert({
      user_id: user.id,
      origen: d.origen,
      estado: conCoordenadas ? "ok" : d.estado === "ok" ? "no_disponible" : d.estado,
      lat: conCoordenadas ? d.lat : null,
      lon: conCoordenadas ? d.lon : null,
      precision_m: conCoordenadas ? d.precision : null,
      detalle: d.detalle,
      ip,
      user_agent: encabezados.get("user-agent"),
    });
    if (error) {
      console.error("registrarUbicacionCampo:", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("registrarUbicacionCampo:", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}
