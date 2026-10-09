import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { claveServicio } from "./config";
import { db } from "./db";
import type { Persona } from "./tipos";

// Dos accesos, como en Tasking:
//  - Admin del CRM (su sesión de siempre): graba, ve actas, equipo y WhatsApp.
//  - Trabajador: entra con el enlace personal que le llega por WhatsApp (/t/<token>)
//    y solo ve y marca SUS compromisos, sin cuenta ni contraseña.
const COOKIE_PERSONA = "tk_persona";
const DURACION_S = 60 * 60 * 24 * 60; // 60 días

function secreto() {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "").update("tasking:sesion").digest();
}

function firmar(valor: string) {
  return `${valor}.${createHmac("sha256", secreto()).update(valor).digest("base64url")}`;
}

function verificar(firmado: string | undefined) {
  if (!firmado) return null;
  const i = firmado.lastIndexOf(".");
  if (i < 0) return null;
  const valor = firmado.slice(0, i);
  const esperado = Buffer.from(firmar(valor));
  const recibido = Buffer.from(firmado);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;
  return valor;
}

/** El admin del CRM con sesión abierta. */
export async function esAdmin() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("perfiles").select("rol, activo").eq("id", user.id).maybeSingle();
    return data?.rol === "admin" && data.activo !== false;
  } catch {
    return false;
  }
}

export async function recordarPersona(token: string) {
  (await cookies()).set(COOKIE_PERSONA, firmar(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_S,
  });
}

export async function personaActual(): Promise<Persona | null> {
  const token = verificar((await cookies()).get(COOKIE_PERSONA)?.value);
  if (!token) return null;
  const { data } = await db().from("personas").select("*").eq("token", token).eq("activo", true).maybeSingle();
  return (data as Persona) ?? null;
}

/** Quién está mirando: el admin, un trabajador con su enlace o nadie. */
export async function sesion() {
  const [admin, persona] = await Promise.all([esAdmin(), personaActual().catch(() => null)]);
  return { admin, persona };
}

/** Para las rutas que llaman el programa de WhatsApp y el temporizador de la VM. */
export function claveServicioCorrecta(req: Request) {
  const esperado = claveServicio();
  const recibido =
    req.headers.get("x-tasking-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return esperado.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// LLAVE DE GRABACIÓN (09-10). Una reunión puede durar 2 o 3 horas y la sesión del
// CRM renueva su token cada hora: si una renovación falla a mitad de la reunión, el
// texto y el audio se rechazarían. La grabadora recibe al crear la reunión una
// llave propia (firmada con su id) y la manda en cada envío; vale solo para ESA reunión.
export function llaveGrabacion(reunionId: string) {
  return createHmac("sha256", secreto()).update(`grabacion:${reunionId}`).digest("base64url");
}

/** El admin con sesión, o la grabadora de esa misma reunión con su llave. */
export async function puedeGrabar(req: Request, reunionId: string) {
  const recibida = req.headers.get("x-tasking-grabacion") ?? "";
  const esperada = llaveGrabacion(reunionId);
  if (recibida.length === esperada.length && timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))) return true;
  return esAdmin();
}
