import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import {
  conversacionesDe,
  conversacionPorId,
  mensajesDe,
  comercialesActivos,
  catalogoWhatsappConectado,
  type FiltroConversaciones,
} from "@/lib/acciones/whatsapp-chat";
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
  // demora bastante». El catálogo de equipos y los stickers (URL firmadas
  // una por una) ya no se cargan al abrir el chat: los trae el propio
  // panel la primera vez que alguien lo abre.
  const [conversacion, mensajes, conversaciones, comerciales, catalogoConectado] = await Promise.all([
    conversacionPorId(id),
    mensajesDe(id),
    conversacionesDe(filtro, esCentral ? sp.comercial : undefined),
    comercialesActivos(),
    catalogoWhatsappConectado(),
  ]);

  if (!conversacion) notFound();

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
        catalogoConectado={catalogoConectado}
      />
    </div>
  );
}
