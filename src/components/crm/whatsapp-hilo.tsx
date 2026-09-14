"use client";

// El hilo de mensajes de una conversación de WhatsApp (fase 2, 15-09-2026):
// burbujas, caja para escribir, semáforo de la ventana de 24 h, y las
// acciones de Central (derivar) y del que atiende (cerrar). Se actualiza
// solo cada 4 s mientras la pestaña está en la conversación — todavía no hay
// Supabase Realtime acá (queda para una siguiente vuelta); con esto ya se ve
// llegar un mensaje sin que alguien tenga que recargar la página.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, MessageCircleOff, RotateCcw, MessageCircle } from "lucide-react";
import {
  enviarMensajeChat,
  derivarConversacion,
  cerrarConversacion,
  reabrirConversacion,
  mensajesDe,
  type ConversacionDetalle,
  type MensajeWhatsapp,
} from "@/lib/acciones/whatsapp-chat";
import { ventanaAbierta } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const ETIQUETA_ESTADO_MENSAJE: Record<string, string> = {
  enviando: "Enviando…",
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  fallido: "No se pudo enviar",
  recibido: "",
};

export function WhatsappHilo({
  conversacion,
  mensajesIniciales,
  esCentral,
  comerciales,
}: {
  conversacion: ConversacionDetalle;
  mensajesIniciales: MensajeWhatsapp[];
  esCentral: boolean;
  comerciales: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  // `key={conversacion.id}` en el padre (WhatsappConversacionPage) remonta
  // este componente entero al cambiar de conversación — así el estado inicial
  // siempre arranca de `mensajesIniciales` sin necesitar un efecto que lo
  // sincronice a mano (eso dispara un render de más y React lo señala).
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [texto, setTexto] = useState("");
  const [enviando, startTransition] = useTransition();
  const [derivando, setDerivando] = useState(false);
  const fondoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      const frescos = await mensajesDe(conversacion.id);
      setMensajes(frescos);
    }, 4000);
    return () => clearInterval(intervalo);
  }, [conversacion.id]);

  useEffect(() => {
    fondoRef.current?.scrollTo({ top: fondoRef.current.scrollHeight });
  }, [mensajes.length]);

  const ventana = ventanaAbierta(conversacion.ultimo_mensaje_cliente_at);

  function enviar() {
    if (!texto.trim()) return;
    const textoAEnviar = texto;
    setTexto("");
    startTransition(async () => {
      const r = await enviarMensajeChat(conversacion.id, textoAEnviar);
      if (r.error) {
        toast.error(r.error);
        setTexto(textoAEnviar);
        return;
      }
      setMensajes(await mensajesDe(conversacion.id));
    });
  }

  function derivar(comercialId: string) {
    startTransition(async () => {
      const r = await derivarConversacion(conversacion.id, comercialId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Derivado");
        setDerivando(false);
        router.refresh();
      }
    });
  }

  function cerrar() {
    startTransition(async () => {
      const r = await cerrarConversacion(conversacion.id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function reabrir() {
    startTransition(async () => {
      const r = await reabrirConversacion(conversacion.id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{conversacion.nombre_wa || conversacion.telefono}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversacion.telefono}
            {conversacion.lead_codigo && ` · ${conversacion.lead_codigo}`}
            {conversacion.codigo_campania_wa && ` · código ${conversacion.codigo_campania_wa}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {esCentral && conversacion.estado !== "cerrada" && (
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setDerivando((v) => !v)}>
                Derivar
              </Button>
              {derivando && (
                <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
                  <Select<string> onValueChange={(v) => v && derivar(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elija un comercial" />
                    </SelectTrigger>
                    <SelectContent>
                      {comerciales.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {conversacion.estado === "cerrada" ? (
            <Button size="sm" variant="outline" onClick={reabrir} disabled={enviando}>
              <RotateCcw className="size-3.5" /> Reabrir
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={cerrar} disabled={enviando}>
              <MessageCircleOff className="size-3.5" /> Cerrar
            </Button>
          )}
        </div>
      </div>

      <div ref={fondoRef} className="flex-1 space-y-2 overflow-y-auto bg-secondary/20 p-4">
        {mensajes.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin mensajes todavía.</p>
        )}
        {mensajes.map((m) => (
          <div key={m.id} className={cn("flex", m.direccion === "saliente" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                m.direccion === "saliente" ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
              )}
            >
              {m.tipo !== "text" && m.tipo !== "button" ? (
                <p className="italic opacity-80">
                  <MessageCircle className="mr-1 inline size-3.5" />
                  {m.texto || `Archivo adjunto (${m.tipo}) — descarga automática pendiente de construir`}
                </p>
              ) : (
                <p className="whitespace-pre-wrap">{m.texto}</p>
              )}
              <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-70">
                {m.enviado_por_nombre && <span>{m.enviado_por_nombre} · </span>}
                <span>{fechaHoraLima(m.timestamp_meta ?? m.created_at)}</span>
                {m.direccion === "saliente" && ETIQUETA_ESTADO_MENSAJE[m.estado] && <span>· {ETIQUETA_ESTADO_MENSAJE[m.estado]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        {conversacion.estado === "cerrada" ? (
          <p className="text-center text-xs text-muted-foreground">Conversación cerrada. Reábrala para seguir escribiendo.</p>
        ) : !ventana ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-center text-xs text-amber-900">
            La ventana de 24 h se cerró: por ahora no se puede mandar texto libre (las plantillas aprobadas son fase 3).
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escriba un mensaje…"
              rows={1}
              className="max-h-32 flex-1 resize-none bg-card"
              disabled={enviando}
            />
            <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
