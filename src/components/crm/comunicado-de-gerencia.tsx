"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, Megaphone, CheckCircle2 } from "lucide-react";
import { acusarComunicado } from "@/lib/acciones/comunicados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface Lamina {
  titulo: string;
  texto: string;
  imagen?: string | null;
}

export interface ComunicadoPendiente {
  id: string;
  clave: string;
  titulo: string;
  laminas: Lamina[];
  enlace: string | null;
  enlace_texto: string | null;
  disposicion: string | null;
  disposicion_boton: string | null;
  leido_at: string | null;
}

/**
 * EL COMUNICADO DE GERENCIA, AL ENTRAR (Carlos, 14-09; 0232): «ni bien entra,
 * un pop-up que pase las 4 láminas y un link, y una disposición de gerencia».
 *
 * Se abre solo, pasa las láminas de a una, y termina en el enlace y la
 * disposición. Tres salidas: «Ya lo cumplí» (no vuelve a salir), «Lo veo
 * luego» (vuelve mañana) y cerrar sin más (queda como leído; si hay
 * disposición, vuelve mañana igual). Gerencia ve quién leyó y quién cumplió.
 */
export function ComunicadoDeGerencia({ comunicado }: { comunicado: ComunicadoPendiente }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);
  const [i, setI] = useState(0);
  const [enviando, startTransition] = useTransition();
  const laminas = comunicado.laminas.length > 0 ? comunicado.laminas : [{ titulo: comunicado.titulo, texto: "" }];
  const ultima = i >= laminas.length - 1;
  const l = laminas[Math.min(i, laminas.length - 1)];

  function acusar(accion: "leido" | "cumplido" | "luego") {
    startTransition(async () => {
      const r = await acusarComunicado(comunicado.id, accion);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setAbierto(false);
      if (accion === "cumplido") toast.success("Gracias: queda registrado.");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) acusar("leido");
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" /> Comunicado de gerencia
          </DialogTitle>
          <DialogDescription>
            {comunicado.titulo} · lámina {Math.min(i + 1, laminas.length)} de {laminas.length}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          {l.imagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.imagen} alt={l.titulo} className="mb-3 w-full rounded-md" />
          )}
          <p className="text-base font-bold text-foreground">{l.titulo}</p>
          {l.texto && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{l.texto}</p>}
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {laminas.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Lámina ${k + 1}`}
              onClick={() => setI(k)}
              className={cn("size-2 rounded-full transition-colors", k === i ? "bg-primary" : "bg-border hover:bg-muted-foreground/50")}
            />
          ))}
        </div>

        {ultima && comunicado.disposicion && (
          <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
            {comunicado.disposicion}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            {!ultima && (
              <Button size="sm" onClick={() => setI(i + 1)}>
                Siguiente <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
          {ultima && (
            <div className="flex flex-wrap gap-1.5">
              {comunicado.enlace && (
                <Button size="sm" variant="outline" onClick={() => window.open(comunicado.enlace!, "_blank", "noopener")}>
                  <ExternalLink className="size-3.5" /> {comunicado.enlace_texto ?? "Abrir el enlace"}
                </Button>
              )}
              {comunicado.disposicion ? (
                <>
                  <Button size="sm" variant="ghost" disabled={enviando} onClick={() => acusar("luego")}>
                    Lo veo luego
                  </Button>
                  <Button size="sm" disabled={enviando} onClick={() => acusar("cumplido")}>
                    <CheckCircle2 className="size-3.5" /> {comunicado.disposicion_boton ?? "Ya lo cumplí"}
                  </Button>
                </>
              ) : (
                <Button size="sm" disabled={enviando} onClick={() => acusar("leido")}>
                  Entendido
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
