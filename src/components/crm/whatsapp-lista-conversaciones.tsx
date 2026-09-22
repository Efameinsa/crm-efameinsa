"use client";

// Lista de conversaciones de la bandeja de WhatsApp (fase 2, 15-09-2026).
// Cuatro pestañas: Sin atender (lo que nadie tomó), Mías (lo que tengo
// asignado), Todas (Central y gerencia) y Cerradas — mismo criterio de
// filtros que otras bandejas del CRM.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { etiquetaDeContactoWa } from "@/lib/contacto-whatsapp";
import { cn } from "@/lib/utils";
import { fechaHoraLima } from "@/lib/fechas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConversacionWhatsapp, FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { horasDeVentana } from "@/lib/whatsapp";

const TODOS_LOS_COMERCIALES = "__todos";

const PESTANAS: { valor: FiltroConversaciones; etiqueta: string }[] = [
  { valor: "sin_atender", etiqueta: "Sin atender" },
  { valor: "mias", etiqueta: "Mías" },
  { valor: "todas", etiqueta: "Todas" },
  { valor: "cerradas", etiqueta: "Cerradas" },
];

// La ventana es de 72 h cuando el cliente vino de un anuncio y de 24 en el
// resto (22-09): el semáforo tiene que contar sobre la que de verdad corre.
function ventanaSemaforo(ultimoMensajeClienteAt: string | null, deAnuncio: boolean): { color: string; titulo: string } {
  if (!ultimoMensajeClienteAt) return { color: "bg-muted-foreground/30", titulo: "Sin mensajes del cliente todavía" };
  const tope = horasDeVentana(deAnuncio);
  const horas = (Date.now() - new Date(ultimoMensajeClienteAt).getTime()) / 3_600_000;
  if (horas < tope - 4) return { color: "bg-[#1E7F4F]", titulo: `Ventana de ${tope} h abierta` };
  if (horas < tope) return { color: "bg-amber-500", titulo: `La ventana de ${tope} h está por cerrarse` };
  return { color: "bg-red-500", titulo: `Ventana de ${tope} h cerrada: llame al cliente o escríbale desde su WhatsApp` };
}

export function WhatsappListaConversaciones({
  conversaciones,
  filtroActivo,
  idActivo,
  comerciales,
  comercialActivo,
  leadsTipificados = [],
}: {
  conversaciones: ConversacionWhatsapp[];
  filtroActivo: FiltroConversaciones;
  idActivo?: string;
  /** Solo Central/gerencia/admin la reciben — un comercial normal no necesita elegir entre comerciales. */
  comerciales?: { id: string; nombre: string }[];
  comercialActivo?: string;
  /** Los leads que YA tienen resultado marcado (22-09): el resto se ve «sin marcar». */
  leadsTipificados?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  // MARCAR ANTES DE QUE TERMINE EL DÍA (Carlos, 22-09): «antes del final del
  // día tiene que haber clasificado, porque si no, al día siguiente ya no
  // tiene sentido; la atención es en el día». Acá se ve cuántas faltan.
  const yaMarcados = new Set(leadsTipificados);
  const sinMarcar = conversaciones.filter((c) => c.lead_id && !yaMarcados.has(c.lead_id)).length;

  function cambiarFiltro(valor: FiltroConversaciones) {
    const sp = new URLSearchParams(params.toString());
    sp.set("filtro", valor);
    router.push(`/whatsapp?${sp.toString()}`);
  }

  function cambiarComercial(valor: string) {
    const sp = new URLSearchParams(params.toString());
    if (valor === TODOS_LOS_COMERCIALES) sp.delete("comercial");
    else sp.set("comercial", valor);
    router.push(`/whatsapp?${sp.toString()}`);
  }

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex gap-1 border-b border-border p-2">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => cambiarFiltro(p.valor)}
            className={cn(
              "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              filtroActivo === p.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {comerciales && comerciales.length > 0 && (
        <div className="border-b border-border p-2">
          <Select<string> value={comercialActivo ?? TODOS_LOS_COMERCIALES} onValueChange={(v) => v && cambiarComercial(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Ver los chats de…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_COMERCIALES}>Todos los comerciales</SelectItem>
              {comerciales.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {sinMarcar > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900">
          {sinMarcar} sin marcar. El resultado se marca el mismo día: después ya no mide nada.
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        {conversaciones.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-8 opacity-30" />
            <p>Nada por acá todavía.</p>
          </div>
        ) : (
          conversaciones.map((c) => {
            const semaforo = ventanaSemaforo(c.ultimo_mensaje_cliente_at, c.de_anuncio);
            return (
              <Link
                key={c.id}
                href={`/whatsapp/${c.id}?filtro=${filtroActivo}${comercialActivo ? `&comercial=${comercialActivo}` : ""}`}
                className={cn(
                  "flex items-start gap-2.5 border-b border-border/60 px-3 py-3 transition-colors hover:bg-secondary/50",
                  idActivo === c.id && "bg-secondary",
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", semaforo.color)} title={semaforo.titulo} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{c.nombre_wa || etiquetaDeContactoWa(c)}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fechaHoraLima(c.ultimo_mensaje_at)}</span>
                  </div>
                  {c.codigo_campania_wa && (
                    <span className="mb-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary">
                      {c.codigo_campania_wa}
                    </span>
                  )}
                  {c.lead_id && !yaMarcados.has(c.lead_id) && (
                    <span className="mb-0.5 ml-1 inline-block rounded-full bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-800">
                      sin marcar
                    </span>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{c.ultimo_texto ?? "—"}</p>
                  {c.asignado_a_nombre && <p className="truncate text-[10px] text-muted-foreground/70">Con {c.asignado_a_nombre}</p>}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
