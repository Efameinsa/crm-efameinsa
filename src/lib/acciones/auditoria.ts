"use server";

import { headers } from "next/headers";
import { requerirRol } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostDeRanura, RANURAS } from "@/lib/auditoria";

/**
 * «Entrar como»: gerencia abre una pestaña ya logueada como otra cuenta,
 * en una ranura (ver1…ver5) de solo lectura, y queda registrado (0160).
 *
 * Es la ÚNICA acción, junto con crear y borrar usuarios, que usa el
 * service_role: generar un acceso de un solo uso para otra cuenta no se
 * puede de otra forma. Se hace después de comprobar con requerirRol quién
 * lo pide, y cada apertura queda en `auditorias_sesion` con quién y cuándo.
 *
 * El enlace que devuelve NO es el magic link de Supabase tal cual: es nuestra
 * ruta /auditoria/entrar en la dirección de la ranura, con el token de un solo
 * uso. Así la sesión nace en ESA dirección y no toca la de gerencia.
 */
export async function abrirAuditoria(
  perfilId: string,
): Promise<{ error: string | null; url?: string; ranura?: number; nombre?: string }> {
  const yo = await requerirRol(["gerencia", "admin"]);
  if (!/^[0-9a-f-]{36}$/i.test(perfilId)) return { error: "Cuenta inválida" };
  if (perfilId === yo.id) return { error: "Para verse a usted mismo no hace falta auditoría" };

  const admin = createAdminClient();
  const { data: perfil } = await admin.from("perfiles").select("id, nombre, rol, activo").eq("id", perfilId).maybeSingle();
  if (!perfil) return { error: "Esa cuenta no existe" };
  if (!perfil.activo) return { error: `${perfil.nombre} está desactivado: no se puede entrar como una cuenta inactiva` };

  const { data: usuario } = await admin.auth.admin.getUserById(perfilId);
  const email = usuario?.user?.email;
  if (!email) return { error: "Esa cuenta no tiene correo de acceso" };

  // La ranura: la que más tiempo lleva sin usarse. Si las cinco están en uso,
  // se reemplaza la más vieja (la pestaña vieja pasa a ser esta persona).
  const { data: ultimas } = await admin
    .from("auditorias_sesion")
    .select("ranura, abierta_at")
    .order("abierta_at", { ascending: false })
    .limit(50);
  const ultimoUso = new Map<number, string>();
  for (const u of ultimas ?? []) if (!ultimoUso.has(u.ranura as number)) ultimoUso.set(u.ranura as number, u.abierta_at as string);
  let ranura = 1;
  let masVieja: string | null = "9999";
  for (let r = 1; r <= RANURAS; r++) {
    const uso = ultimoUso.get(r) ?? null;
    if (uso === null) {
      ranura = r;
      break;
    }
    if (masVieja === null || uso < masVieja) {
      masVieja = uso;
      ranura = r;
    }
  }

  const hostActual = (await headers()).get("host") ?? "crm.efameinsa.com";
  const destino = hostDeRanura(ranura, hostActual);

  const { data: link, error: errorLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = link?.properties?.hashed_token;
  if (errorLink || !token) return { error: errorLink?.message ?? "No se pudo generar el acceso" };

  const { data: auditoria, error: errorAud } = await admin
    .from("auditorias_sesion")
    .insert({ auditor_id: yo.id, auditado_id: perfilId, ranura, host: destino })
    .select("id")
    .single();
  if (errorAud) return { error: errorAud.message };

  const url = `${destino}/auditoria/entrar?t=${encodeURIComponent(token)}&a=${auditoria.id}`;
  return { error: null, url, ranura, nombre: perfil.nombre };
}
