import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { conversacionesDe, conversacionPorId, mensajesDe, comercialesActivos, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { tipificacionesActuales } from "@/lib/acciones/whatsapp-campanas";
import { WhatsappListaConversaciones } from "@/components/crm/whatsapp-lista-conversaciones";
import { WhatsappHilo } from "@/components/crm/whatsapp-hilo";

export const dynamic = "force-dynamic";

export default async function WhatsappConversacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string; comercial?: string }>;
}) {
  const perfil = await requerirPerfil();
  const { id } = await params;
  const sp = await searchParams;
  const filtro = (["sin_atender", "mias", "todas", "cerradas"].includes(sp.filtro ?? "") ? sp.filtro : "todas") as FiltroConversaciones;
  const esCentral = perfil.rol === "central" || perfil.rol === "gerencia" || perfil.rol === "admin";

  // Santos, 21-09: «quiero que cargue más rápido… la opción de productos se
  // demora bastante». El botón «Mandar equipo» se quitó del chat; los
  // stickers (URL firmadas una por una) los trae el panel al abrirse.
  const [conversacion, mensajes, conversaciones, comerciales] = await Promise.all([
    conversacionPorId(id),
    mensajesDe(id),
    conversacionesDe(filtro, esCentral ? sp.comercial : undefined),
    comercialesActivos(),
  ]);

  if (!conversacion) notFound();
  const tipificacionActual = conversacion.lead_id ? ((await tipificacionesActuales([conversacion.lead_id]))[0] ?? null) : null;

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="w-full max-w-sm">
        <WhatsappListaConversaciones
          conversaciones={conversaciones}
          filtroActivo={filtro}
          idActivo={id}
          comerciales={esCentral ? comerciales : undefined}
          comercialActivo={sp.comercial}
        />
      </div>
      <WhatsappHilo
        key={conversacion.id}
        conversacion={conversacion}
        mensajesIniciales={mensajes}
        esCentral={esCentral}
        comerciales={comerciales}
        tipificacionActual={tipificacionActual}
      />
    </div>
  );
}
