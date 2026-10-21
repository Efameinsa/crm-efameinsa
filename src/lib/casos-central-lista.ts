// La lectura de los casos de Central (0573). Aparte de casos-central.ts
// porque usa el cliente del servidor y ese archivo lo importan los botones
// del navegador.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { codigoCaso, type AdjuntoCaso, type AreaCaso, type CasoCentral, type EstadoCaso, type TipoPaso } from "@/lib/casos-central";

const SELECT =
  "id, numero, area, motivo, mensaje, urgente, vence_at, cuenta_id, servicio_id, cliente_texto, adjuntos, estado, creado_por, tomado_por, tomado_at, respuesta, respondido_at, avisos_n, created_at, updated_at, " +
  "creador:perfiles!casos_central_creado_por_fkey(nombre), tomo:perfiles!casos_central_tomado_por_fkey(nombre), respondio:perfiles!casos_central_respondido_por_fkey(nombre), " +
  "servicio:servicios_postventa(numero_pedido_erp), " +
  "pasos:casos_central_pasos(id, tipo, texto, adjuntos, created_at, autor:perfiles(nombre))";

/**
 * Los casos que ve quien mira (lo decide la RLS: Central todos, cada área los
 * suyos). `area` filtra para la bandeja de un área; los cerrados de más de
 * 15 días no se traen.
 */
export async function listarCasosCentral(filtro: { area?: AreaCaso; servicioId?: string } = {}): Promise<CasoCentral[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 15 * 86_400_000).toISOString();
  let q = supabase.from("casos_central").select(SELECT).or(`estado.neq.cerrado,cerrado_at.gte.${desde}`).order("created_at", { ascending: false }).limit(300);
  if (filtro.area) q = q.eq("area", filtro.area);
  if (filtro.servicioId) q = q.eq("servicio_id", filtro.servicioId);
  const { data } = await q;
  const filas = (data ?? []) as unknown as Record<string, unknown>[];

  // Los archivos se firman con la llave del servidor: la fila ya pasó la RLS.
  const rutas = filas.flatMap((f) => [
    ...((f.adjuntos as AdjuntoCaso[]) ?? []).map((a) => a.path),
    ...((f.pasos as { adjuntos: AdjuntoCaso[] }[]) ?? []).flatMap((p) => (p.adjuntos ?? []).map((a) => a.path)),
  ]);
  const url = new Map<string, string>();
  if (rutas.length) {
    const admin = createAdminClient();
    const unicas = [...new Set(rutas)];
    for (let i = 0; i < unicas.length; i += 100) {
      const { data: firmadas } = await admin.storage.from("adjuntos").createSignedUrls(unicas.slice(i, i + 100), 3600);
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) url.set(f.path, f.signedUrl);
    }
  }
  const conUrl = (lista: AdjuntoCaso[] | null | undefined) => (lista ?? []).map((a) => ({ ...a, url: url.get(a.path) ?? null }));
  const ahora = Date.now();

  return filas.map((f) => {
    const nombre = (x: unknown) => (x as { nombre: string } | null)?.nombre ?? null;
    const estado = f.estado as EstadoCaso;
    const vence = f.vence_at as string | null;
    const pasos = ((f.pasos as Record<string, unknown>[]) ?? [])
      .map((p) => ({
        id: p.id as string,
        tipo: p.tipo as TipoPaso,
        texto: p.texto as string | null,
        autor: nombre(p.autor),
        created_at: p.created_at as string,
        adjuntos: conUrl(p.adjuntos as AdjuntoCaso[]),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      id: f.id as string,
      codigo: codigoCaso(f.numero as number),
      area: f.area as AreaCaso,
      motivo: f.motivo as string,
      mensaje: f.mensaje as string,
      urgente: Boolean(f.urgente),
      vence_at: vence,
      // Vencido = pasó el plazo y nadie lo tomó; tomado a tiempo ya tiene dueño.
      vencido: estado === "nuevo" && Boolean(vence) && new Date(vence!).getTime() < ahora,
      cuenta_id: f.cuenta_id as string | null,
      servicio_id: f.servicio_id as string | null,
      numero_pedido: (f.servicio as { numero_pedido_erp: string | null } | null)?.numero_pedido_erp ?? null,
      cliente: (f.cliente_texto as string | null) ?? "Sin cliente",
      estado,
      creado_por: f.creado_por as string,
      creado_por_nombre: nombre(f.creador) ?? "Central",
      tomado_por: f.tomado_por as string | null,
      tomado_por_nombre: nombre(f.tomo),
      tomado_at: f.tomado_at as string | null,
      respuesta: f.respuesta as string | null,
      respondido_por_nombre: nombre(f.respondio),
      respondido_at: f.respondido_at as string | null,
      respondido_semana: Boolean(f.respondido_at) && new Date(f.respondido_at as string).getTime() > ahora - 7 * 86_400_000,
      avisos_n: (f.avisos_n as number) ?? 1,
      created_at: f.created_at as string,
      updated_at: f.updated_at as string,
      adjuntos: conUrl(f.adjuntos as AdjuntoCaso[]),
      pasos,
    };
  });
}
