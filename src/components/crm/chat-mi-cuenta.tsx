"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { marcarMensajesLeidos, responderMensajeMiCuenta } from "@/lib/acciones/portal";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export interface MensajeMiCuenta {
  id: string;
  autor: "cliente" | "empresa";
  autor_nombre: string;
  texto: string;
  created_at: string;
  leido_at: string | null;
  servicio_id: string | null;
  atencion_id: string | null;
}

/**
 * La conversación con el cliente y la caja para responder. Lo que el cliente
 * escribió y nadie había abierto se marca leído al mostrarse; la respuesta
 * sale con el nombre de quien la escribe y el cliente la ve en Mi cuenta.
 */
export function ChatMiCuenta({
  cuentaId,
  servicioId,
  atencionId,
  mensajes,
}: {
  cuentaId: string;
  servicioId: string | null;
  atencionId: string | null;
  mensajes: MensajeMiCuenta[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, startTransition] = useTransition();
  const sinLeer = mensajes.filter((m) => m.autor === "cliente" && !m.leido_at);
  // Los que estaban sin leer al abrir siguen resaltados mientras la pantalla está abierta.
  const [nuevos] = useState(() => new Set(sinLeer.map((m) => m.id)));
  const marcados = useRef(false);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (marcados.current || sinLeer.length === 0) return;
    marcados.current = true;
    void marcarMensajesLeidos(sinLeer.map((m) => m.id));
  }, [sinLeer]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes.length]);

  function responder() {
    const t = texto.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await responderMensajeMiCuenta({ cuentaId, texto: t, servicioId, atencionId });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      setTexto("");
      toast.success("Respuesta enviada. El cliente la ve en Mi cuenta.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-foreground">
          <MessageSquare className="size-3.5" /> Mensajes de Mi cuenta
        </h2>
        {nuevos.size > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {nuevos.size} {nuevos.size === 1 ? "nuevo" : "nuevos"}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Lo que el cliente escribe desde su perfil en efameinsa.com. Su respuesta le llega con su nombre.
      </p>

      {mensajes.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Todavía no hay mensajes. Si el cliente escribe desde Mi cuenta, aparece acá y le suena la campana al dueño de la ficha.
        </p>
      ) : (
        <div ref={lista} className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {mensajes.map((m) => (
            <div key={m.id} className={cn("flex", m.autor === "empresa" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                  m.autor === "empresa" ? "bg-primary/10 text-foreground" : "border border-border bg-background text-foreground",
                  nuevos.has(m.id) && "ring-2 ring-primary/40",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {m.autor === "empresa" ? m.autor_nombre : `${m.autor_nombre} (cliente)`} · {fechaHoraLima(m.created_at)}
                  {!servicioId && !atencionId && (m.servicio_id || m.atencion_id) ? ` · ${m.servicio_id ? "sobre un pedido" : "sobre un caso"}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Escriba su respuesta al cliente…"
          className="text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) responder();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">Ctrl + Enter para enviar</span>
          <Button size="sm" onClick={responder} disabled={enviando || !texto.trim()}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Responder
          </Button>
        </div>
      </div>
    </div>
  );
}
