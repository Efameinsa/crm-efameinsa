import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { conversacionesDe, conversacionPorId, mensajesDe, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { WhatsappListaConversaciones } from "@/components/crm/whatsapp-lista-conversaciones";
import { WhatsappHilo } from "@/components/crm/whatsapp-hilo";

export const dynamic = "force-dynamic";

export default async function WhatsappConversacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const perfil = await requerirPerfil();
  const { id } = await params;
  const sp = await searchParams;
  const filtro = (["sin_atender", "mias", "todas", "cerradas"].includes(sp.filtro ?? "") ? sp.filtro : "todas") as FiltroConversaciones;

  const supabase = await createClient();
  const [conversacion, mensajes, conversaciones, { data: comerciales }] = await Promise.all([
    conversacionPorId(id),
    mensajesDe(id),
    conversacionesDe(filtro),
    supabase.from("perfiles").select("id, nombre").eq("rol", "comercial").eq("activo", true).order("nombre"),
  ]);

  if (!conversacion) notFound();

  const esCentral = perfil.rol === "central" || perfil.rol === "gerencia" || perfil.rol === "admin";

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="w-full max-w-sm">
        <WhatsappListaConversaciones conversaciones={conversaciones} filtroActivo={filtro} idActivo={id} />
      </div>
      <WhatsappHilo
        key={conversacion.id}
        conversacion={conversacion}
        mensajesIniciales={mensajes}
        esCentral={esCentral}
        comerciales={comerciales ?? []}
      />
    </div>
  );
}
