import { MessageCircle } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { conversacionesDe, comercialesActivos, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { tipificacionesActuales } from "@/lib/acciones/whatsapp-campanas";
import { WhatsappListaConversaciones } from "@/components/crm/whatsapp-lista-conversaciones";

// Bandeja de WhatsApp, fase 2 (15-09-2026) — PENDIENTE DE APROBACIÓN DE
// GERENCIA PARA USAR EN PRODUCCIÓN. Plan completo en
// Downloads/plan-whatsapp-api-crm.md. Quién ve qué conversación lo decide
// RLS (0233): Central y gerencia ven todo, cada comercial ve lo suyo.
export const dynamic = "force-dynamic";

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; comercial?: string }>;
}) {
  const perfil = await requerirPerfil();
  const sp = await searchParams;
  const filtro = (["sin_atender", "mias", "todas", "cerradas"].includes(sp.filtro ?? "") ? sp.filtro : "sin_atender") as FiltroConversaciones;
  // Elegir "ver los chats de…" es cosa de quien deriva y supervisa, no de un
  // comercial normal (Santos, 15-09: pidió una vista por comercial antes de
  // ver la mezcla de "Todas").
  const esCentral = perfil.rol === "central" || perfil.rol === "gerencia" || perfil.rol === "admin";

  const [conversaciones, comerciales] = await Promise.all([
    conversacionesDe(filtro, esCentral ? sp.comercial : undefined),
    esCentral ? comercialesActivos() : Promise.resolve([]),
  ]);

  const tipificados = await tipificacionesActuales(conversaciones.map((c) => c.lead_id).filter((x): x is string => Boolean(x)));

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] overflow-hidden rounded-lg border border-border bg-card md:h-[calc(100dvh-8.5rem)]">
      <div className="w-full md:max-w-sm">
        <WhatsappListaConversaciones
          conversaciones={conversaciones}
          filtroActivo={filtro}
          comerciales={comerciales}
          comercialActivo={sp.comercial}
          leadsTipificados={tipificados.map((t) => t.lead_id)}
        />
      </div>
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground md:flex">
        <MessageCircle className="size-10 opacity-20" />
        <p>Elija una conversación de la lista para verla acá.</p>
        {perfil.rol === "central" && conversaciones.length === 0 && filtro === "sin_atender" && (
          <p className="max-w-xs text-xs">
            Todavía no llegó ningún WhatsApp por la API. Mientras se aprueba la verificación de Meta, los WhatsApp de campaña
            se siguen registrando con «Registrar contacto» → canal WhatsApp.
          </p>
        )}
      </div>
    </div>
  );
}
