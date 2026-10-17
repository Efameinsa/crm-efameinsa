"use server";

// PEDIDOS AL CATÁLOGO (0523, Santos 17-10): «crea un buzón para pedir
// productos o que Lesly actualice y que le llegue a Lesly». El pedido llega a
// la campana de operaciones y la respuesta vuelve a la campana de quien pidió.
// Las capturas las sube el navegador al bucket 'adjuntos', como el buzón.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";
import {
  TIPOS_PEDIDO_CATALOGO,
  type AdjuntoPedidoCatalogo,
  type EstadoPedidoCatalogo,
  type PedidoCatalogo,
  type TipoPedidoCatalogo,
} from "@/lib/pedidos-catalogo";

const MAX_ADJUNTOS = 10;

/** A quién le llega: Lesly (rol operaciones) y quien tenga el permiso de operaciones. */
async function avisarAOperaciones(titulo: string, cuerpo: string, url: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("perfiles").select("id").eq("activo", true).or("rol.eq.operaciones,es_operaciones.eq.true");
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id as string, tipo: "catalogo", titulo, cuerpo, url })));
}

export async function enviarPedidoCatalogo(datos: {
  tipo: TipoPedidoCatalogo;
  titulo: string;
  detalle: string;
  producto: string | null;
  paraCliente: string | null;
  adjuntos: AdjuntoPedidoCatalogo[];
}): Promise<{ error: string | null }> {
  const titulo = datos.titulo.trim();
  if (titulo.length < 3) return { error: "Escriba en una frase qué necesita (mínimo 3 letras)." };
  if (titulo.length > 140) return { error: "El título es muy largo: déjelo en una frase y el resto en el detalle." };
  if (!TIPOS_PEDIDO_CATALOGO.some((t) => t.valor === datos.tipo)) return { error: "Elija qué necesita." };
  if (datos.adjuntos.length > MAX_ADJUNTOS) return { error: `Máximo ${MAX_ADJUNTOS} imágenes por pedido.` };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };
  if (datos.adjuntos.some((a) => !a.path.startsWith(`catalogo-pedidos/${user.id}/`))) {
    return { error: "Una de las imágenes no es válida. Vuelva a adjuntarla." };
  }

  const { data: fila, error } = await supabase
    .from("pedidos_catalogo")
    .insert({
      autor_id: user.id,
      tipo: datos.tipo,
      titulo,
      detalle: datos.detalle.trim().slice(0, 5000),
      producto: datos.producto?.trim().slice(0, 200) || null,
      para_cliente: datos.paraCliente?.trim().slice(0, 200) || null,
      adjuntos: datos.adjuntos,
    })
    .select("id")
    .single();
  if (error || !fila) return { error: "No se pudo enviar el pedido. Intente de nuevo." };

  const { data: perfil } = await supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle();
  const tipo = TIPOS_PEDIDO_CATALOGO.find((t) => t.valor === datos.tipo)!;
  await avisarAOperaciones(
    `${tipo.emoji} ${perfil?.nombre ?? "Alguien"} pide al catálogo: ${tipo.etiqueta.toLowerCase()}`,
    titulo + (datos.paraCliente?.trim() ? ` · para ${datos.paraCliente.trim()}` : ""),
    `/pedidos-catalogo?ver=${fila.id}`,
  );

  revalidatePath("/pedidos-catalogo");
  return { error: null };
}

/** Cada uno ve los suyos; operaciones, gerencia y administración, todos (lo decide RLS). */
export async function listarPedidosCatalogo(): Promise<PedidoCatalogo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos_catalogo")
    .select(
      "id, autor_id, tipo, producto, para_cliente, titulo, detalle, adjuntos, estado, respuesta, respondida_at, created_at, sugerencia_id, autor:perfiles!pedidos_catalogo_autor_id_fkey(nombre, codigo_comercial), respondio:perfiles!pedidos_catalogo_respondida_por_fkey(nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  const filas = data ?? [];

  const rutas = filas.flatMap((f) => ((f.adjuntos as AdjuntoPedidoCatalogo[]) ?? []).map((a) => a.path));
  const url = new Map<string, string>();
  if (rutas.length) {
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
      tipo: f.tipo as TipoPedidoCatalogo,
      producto: f.producto as string | null,
      para_cliente: f.para_cliente as string | null,
      titulo: f.titulo as string,
      detalle: f.detalle as string,
      adjuntos: ((f.adjuntos as AdjuntoPedidoCatalogo[]) ?? []).map((a) => ({ ...a, url: url.get(a.path) ?? null })),
      estado: f.estado as EstadoPedidoCatalogo,
      respuesta: f.respuesta as string | null,
      respondida_por_nombre: respondio?.nombre ?? null,
      respondida_at: f.respondida_at as string | null,
      created_at: f.created_at as string,
      desde_buzon: Boolean(f.sugerencia_id),
    };
  });
}

export async function responderPedidoCatalogo(
  id: string,
  estado: Exclude<EstadoPedidoCatalogo, "nuevo">,
  respuesta: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: autor, error } = await supabase.rpc("responder_pedido_catalogo", { p_pedido: id, p_estado: estado, p_respuesta: respuesta });
  if (error) return { error: error.message };

  const { data: pedido } = await supabase.from("pedidos_catalogo").select("titulo").eq("id", id).maybeSingle();
  const titulo =
    estado === "hecho"
      ? "✅ Lesly atendió su pedido al catálogo"
      : estado === "no_procede"
        ? "Lesly respondió su pedido al catálogo"
        : "Lesly está viendo su pedido al catálogo";
  await notificar({
    userId: autor as string,
    tipo: "catalogo",
    titulo,
    cuerpo: (pedido?.titulo ?? "") + (respuesta.trim() ? ` · ${respuesta.trim().slice(0, 200)}` : ""),
    url: `/pedidos-catalogo?ver=${id}`,
  });

  revalidatePath("/pedidos-catalogo");
  return { error: null };
}

/** Cuántos esperan respuesta: el número junto al botón de operaciones. */
export async function contarPedidosCatalogoAbiertos(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pedidos_catalogo")
    .select("id", { count: "exact", head: true })
    .in("estado", ["nuevo", "en_proceso"]);
  return count ?? 0;
}
