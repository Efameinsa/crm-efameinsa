"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { anularApertura, asignarTecnicoApertura, revisarApertura, tomarApertura } from "@/lib/acciones/aperturas-llamada";
import type { EstadoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * El check del almacén: «ya la estoy gestionando». El técnico ya lo puso
 * postventa (0297); el informe va en InformeSoporteApertura.
 */
export function AccionesAlmacenApertura({ id, tecnico }: { id: string; tecnico: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function tomar() {
    startTransition(async () => {
      const r = await tomarApertura(id);
      if (r.error) return void toast.error(r.error);
      toast.success("Tomada: postventa ya recibió el aviso");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-sm text-foreground">
        Técnico asignado por postventa: <b>{tecnico ?? "todavía no lo asigna"}</b>
      </p>
      <Button onClick={tomar} disabled={pendiente}>
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        La tomo: ya la estoy gestionando
      </Button>
    </div>
  );
}

/** Postventa pone o cambia el técnico (0297; Santos, 24-09). */
export function TecnicoApertura({ id, tecnico }: { id: string; tecnico: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [editando, setEditando] = useState(!tecnico);
  const [valor, setValor] = useState(tecnico ?? "");
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
    <span className="flex items-center gap-1.5">
      <Input className="h-8 max-w-56 text-sm" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Nombre del técnico" />
      <Button
        size="sm"
        className="h-8"
        disabled={pendiente || !valor.trim()}
        onClick={() =>
          startTransition(async () => {
            const r = await asignarTecnicoApertura(id, valor);
            if (r.error) return void toast.error(r.error);
            toast.success("Técnico asignado");
            setEditando(false);
            router.refresh();
          })
        }
      >
        Guardar
      </Button>
    </span>
  );
}

/** Lo que hace postventa: la versión para el cliente (versión 2) y anular. */
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
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  function revisar(enviada: boolean) {
    startTransition(async () => {
      const r = await revisarApertura(id, texto, enviada);
      if (r.error) return void toast.error(r.error);
      toast.success(enviada ? "Listo: queda como enviada al cliente" : "Revisión guardada: ya se puede imprimir para el cliente");
      router.refresh();
    });
  }
  function anular() {
    startTransition(async () => {
      const r = await anularApertura(id, motivo);
      if (r.error) return void toast.error(r.error);
      toast.success("Apertura anulada; el almacén ya no la ve pendiente");
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
            <Button variant="outline" onClick={() => revisar(false)} disabled={pendiente || !texto.trim()}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Guardar la revisión
            </Button>
            {estado !== "enviada_cliente" && (
              <Button onClick={() => revisar(true)} disabled={pendiente || !texto.trim()}>
                <Send className="size-4" /> Guardar y marcar enviada al cliente
              </Button>
            )}
          </div>
        </div>
      )}
      {estado !== "anulada" && estado !== "enviada_cliente" && (
        <div className="text-xs">
          {!anulando ? (
            <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAnulando(true)}>
              Anular esta apertura
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 max-w-sm text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula (el cliente reprogramó, se pidió dos veces…)" />
              <Button size="sm" variant="destructive" disabled={pendiente || !motivo.trim()} onClick={anular}>
                Anular
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAnulando(false)}>
                No
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
