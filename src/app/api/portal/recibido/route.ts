import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { identificarCliente, pedidoDelCliente } from "@/lib/portal/cliente";
import { avisarAlEquipo, sinDocumento } from "@/lib/portal/avisos";
import { tituloPedido } from "@/lib/portal/traductor";
import { leerPeticionPortal, noEncontrado, rechazo, soloPost, texto } from "@/lib/portal/peticion";

/**
 * «YA LO RECIBÍ» (contrato «Experiencia del cliente», 17-10; columnas de la 0527).
 *
 * Cuerpo: { email?, telefono?, pedido_id, nota?, foto?: { nombre, tipo, contenido_base64 } }.
 * Marca la recepción una sola vez (idempotente): si ya estaba, no cambia la
 * fecha ni vuelve a avisar; si trae otra foto, se suma. Avisa al comercial
 * dueño de la ficha y a postventa. Solo si el pedido es de ese cliente.
 */

export const dynamic = "force-dynamic";

const TIPOS_FOTO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAXIMO_FOTO = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const leida = await leerPeticionPortal(request);
  if ("respuesta" in leida) return leida.respuesta;
  const { cuerpo } = leida;

  const admin = createAdminClient();
  const cli = await identificarCliente(admin, { email: texto(cuerpo.email), telefono: texto(cuerpo.telefono) });
  if (!cli) return noEncontrado();
  const pedido = await pedidoDelCliente(admin, cli, texto(cuerpo.pedido_id) ?? "");
  if (!pedido) return noEncontrado();

  const nota = (texto(cuerpo.nota) ?? "").trim().slice(0, 1000) || null;

  // La foto, si viene: al bucket privado `adjuntos`, etapa «recibido».
  let foto: { path: string; nombre: string; tipo: string; etiqueta: "recibido" } | null = null;
  const crudaFoto = cuerpo.foto as { nombre?: unknown; tipo?: unknown; contenido_base64?: unknown } | null | undefined;
  if (crudaFoto && typeof crudaFoto === "object") {
    const tipo = String(crudaFoto.tipo ?? "").toLowerCase();
    const ext = TIPOS_FOTO[tipo];
    if (!ext) return rechazo(400, "La foto tiene que ser JPG, PNG, WEBP o HEIC");
    const base64 = String(crudaFoto.contenido_base64 ?? "").replace(/^data:[^,]*,/, "");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0) return rechazo(400, "La foto llegó vacía");
    if (bytes.length > MAXIMO_FOTO) return rechazo(413, "La foto pesa más de 8 MB");
    const nombre = String(crudaFoto.nombre ?? `recibido.${ext}`).replace(/[^\w.\- ]+/g, "_").slice(0, 80) || `recibido.${ext}`;
    const path = `portal/recibido/${pedido.id}/${Date.now()}.${ext}`;
    const { error } = await admin.storage.from("adjuntos").upload(path, bytes, { contentType: tipo === "image/jpg" ? "image/jpeg" : tipo, upsert: false });
    if (error) {
      console.error("[portal] recibido: subir foto", error.message);
      return rechazo(500, "No se pudo guardar la foto");
    }
    foto = { path, nombre, tipo, etiqueta: "recibido" };
  }

  const fotosPrevias = Array.isArray(pedido.recibido_cliente_fotos) ? (pedido.recibido_cliente_fotos as unknown[]) : [];
  const yaEstaba = pedido.recibido_cliente_at != null;
  const cambios: Record<string, unknown> = {};
  if (foto) cambios.recibido_cliente_fotos = [...fotosPrevias, foto];
  if (!yaEstaba) {
    cambios.recibido_cliente_at = new Date().toISOString();
    if (nota) cambios.recibido_cliente_nota = nota;
  }

  let recibidoAt = pedido.recibido_cliente_at;
  if (Object.keys(cambios).length > 0) {
    const { data, error } = await admin
      .from("servicios_postventa")
      .update(cambios)
      .eq("id", pedido.id)
      .select("recibido_cliente_at")
      .maybeSingle();
    if (error) {
      console.error("[portal] recibido: guardar", error.message);
      return rechazo(500, "No se pudo registrar la recepción");
    }
    recibidoAt = (data as { recibido_cliente_at: string | null } | null)?.recibido_cliente_at ?? recibidoAt;
  }

  if (!yaEstaba) {
    await avisarAlEquipo({
      cuentaId: pedido.cuenta_id,
      conPostventa: true,
      esPrueba: pedido.es_prueba,
      titulo: `${sinDocumento(pedido.cliente_texto)} confirmó que recibió su pedido`,
      cuerpo: [tituloPedido(pedido.equipo), nota ? `Dice: «${nota}»` : null, foto ? "Subió una foto" : null, "Lo marcó en Mi cuenta de efameinsa.com"]
        .filter(Boolean)
        .join(" · "),
      urlPostventa: `/postventa/pedidos/${pedido.id}`,
    });
  }

  return NextResponse.json({ ok: true, recibido_cliente_at: recibidoAt }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = soloPost;
export const PUT = soloPost;
export const PATCH = soloPost;
export const DELETE = soloPost;
