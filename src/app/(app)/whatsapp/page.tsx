import { MessageCircle } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { conversacionesDe, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { WhatsappListaConversaciones } from "@/components/crm/whatsapp-lista-conversaciones";

// Bandeja de WhatsApp, fase 2 (15-09-2026) — PENDIENTE DE APROBACIÓN DE
// GERENCIA PARA USAR EN PRODUCCIÓN. Plan completo en
// Downloads/plan-whatsapp-api-crm.md. Quién ve qué conversación lo decide
// RLS (0233): Central y gerencia ven todo, cada comercial ve lo suyo.
export const dynamic = "force-dynamic";

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const perfil = await requerirPerfil();
  const sp = await searchParams;
  const filtro = (["sin_atender", "mias", "todas", "cerradas"].includes(sp.filtro ?? "") ? sp.filtro : "sin_atender") as FiltroConversaciones;

  const conversaciones = await conversacionesDe(filtro);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="w-full max-w-sm">
        <WhatsappListaConversaciones conversaciones={conversaciones} filtroActivo={filtro} />
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
