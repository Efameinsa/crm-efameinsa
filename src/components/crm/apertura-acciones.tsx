"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Paperclip, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { asignarTecnicoApertura, revisarApertura, tomarApertura } from "@/lib/acciones/aperturas-llamada";
import type { EstadoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListaTecnicos, ID_LISTA_TECNICOS } from "@/components/crm/lista-tecnicos";

/**
 * El check del almacén: «ya la estoy gestionando». El técnico ya lo puso
 * postventa (0297); el informe va en InformeSoporteApertura.
 */
export function AccionesAlmacenApertura({ id, tecnico }: { id: string; tecnico: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);

  function tomar() {
    setProblema(null);
    startTransition(async () => {
      const r = await tomarApertura(id);
      if (r.error) return void setProblema(r.error);
      toast.success("Tomada: postventa ya recibió el aviso");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-sm text-foreground">
        Técnico a cargo: <b>{tecnico ?? "sin asignar (escríbalo arriba o en el informe)"}</b>
      </p>
      <Button onClick={tomar} disabled={pendiente}>
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        La tomo: ya la estoy gestionando
      </Button>
      {problema && <p role="alert" className="w-full rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">{problema}</p>}
    </div>
  );
}

/** Postventa pone o cambia el técnico (0297; Santos, 24-09); el almacén también antes del informe (0387, Lesly 03-10). */
export function TecnicoApertura({ id, tecnico }: { id: string; tecnico: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [editando, setEditando] = useState(!tecnico);
  const [valor, setValor] = useState(tecnico ?? "");
  const [problema, setProblema] = useState<string | null>(null);
  if (!editando) {
    return (
      <span>
        {tecnico}{" "}
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setEditando(true)}>
          cambiar
        </button>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
    <span className="flex items-center gap-1.5">
      <Input className="h-8 max-w-56 text-sm" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Nombre del técnico" list={ID_LISTA_TECNICOS} />
      <ListaTecnicos />
      <Button
        size="sm"
        className="h-8"
        disabled={pendiente || !valor.trim()}
        porQue={!valor.trim() ? "Escriba el nombre del técnico." : null}
        onClick={() => {
          setProblema(null);
          startTransition(async () => {
            const r = await asignarTecnicoApertura(id, valor);
            if (r.error) return void setProblema(r.error);
            toast.success("Técnico asignado");
            setEditando(false);
            router.refresh();
          });
        }}
      >
        Guardar
      </Button>
    </span>
    {problema && <span role="alert" className="block rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">{problema}</span>}
    </span>
  );
}

/**
 * Lo que hace postventa: la versión para el cliente (versión 2). Anular,
 * reprogramar y cambiar el tipo viven arriba, en CambiosApertura (0311).
 */
export function AccionesPostventaApertura({
  id,
  estado,
  borrador,
  hayInforme,
}: {
  id: string;
  estado: EstadoApertura;
  borrador: string;
  hayInforme: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [texto, setTexto] = useState(borrador);
  // Reunión 02-10: «que suban la constancia de que ya se le envió al cliente».
  const [constancia, setConstancia] = useState<File | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  function revisar(enviada: boolean) {
    setProblema(null);
    startTransition(async () => {
      let ruta: string | null = null;
      if (enviada) {
        if (!constancia) return void setProblema("Adjunte la constancia del envío: el correo o la captura del WhatsApp al cliente.");
        if (constancia.size > 10 * 1024 * 1024) return void setProblema("La constancia pasa de 10 MB: adjunte una más liviana.");
        ruta = `aperturas/${id}/constancia-${crypto.randomUUID()}-${constancia.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
        const { error } = await createClient().storage.from("adjuntos").upload(ruta, constancia, { contentType: constancia.type || "application/octet-stream" });
        if (error) return void setProblema(`No se pudo subir la constancia: ${error.message}. Vuelva a intentarlo.`);
      }
      const r = await revisarApertura(id, texto, enviada, ruta);
      if (r.error) return void setProblema(r.error);
      toast.success(enviada ? "Listo: queda como enviada al cliente" : "Revisión guardada: ya se puede imprimir para el cliente");
      router.refresh();
    });
  }
  return (
    <div className="space-y-3">
      {hayInforme && estado !== "anulada" && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">Versión para el cliente</p>
          <p className="text-xs text-muted-foreground">
            Parte del informe del almacén. Corrija lo que no deba leer el cliente; esto es lo que sale en la hoja para imprimir o guardar en PDF.
          </p>
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => revisar(false)} disabled={pendiente || !texto.trim()} porQue={!texto.trim() ? "Escriba la versión para el cliente." : null}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Guardar la revisión
            </Button>
            {estado !== "enviada_cliente" && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                <Paperclip className="size-3.5" />
                {constancia ? constancia.name : "Constancia del envío (correo o captura)"}
                <input type="file" accept="image/*,application/pdf,.eml,.msg" className="hidden" onChange={(e) => setConstancia(e.target.files?.[0] ?? null)} />
              </label>
            )}
            {estado !== "enviada_cliente" && (
              <Button
                onClick={() => revisar(true)}
                disabled={pendiente || !texto.trim() || !constancia}
                porQue={
                  !texto.trim() || !constancia
                    ? `Falta: ${[!texto.trim() && "el texto para el cliente", !constancia && "adjuntar la constancia del envío"].filter(Boolean).join(" · ")}.`
                    : null
                }
              >
                <Send className="size-4" /> Guardar y marcar enviada al cliente
              </Button>
            )}
          </div>
          {problema && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">{problema}</p>}
        </div>
      )}
    </div>
  );
}
