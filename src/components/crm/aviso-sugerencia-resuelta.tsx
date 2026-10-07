"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { marcarSolucionesVistas } from "@/lib/acciones/sugerencias";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface SugerenciaResuelta {
  id: string;
  titulo: string;
  respuesta: string | null;
  respondida_at: string | null;
}

/**
 * «YA SE SOLUCIONÓ LO QUE REPORTÓ» (0409, Santos 06-10). Quien dejó algo en el
 * buzón y el administrador lo marcó «Hecha» lo ve al entrar, con su título y
 * la respuesta, hasta que pulsa «Entendido». La campana sigue avisando igual;
 * esto es para que no se pierda entre los demás avisos.
 */
export function AvisoSugerenciaResuelta({ sugerencias }: { sugerencias: SugerenciaResuelta[] }) {
  const [abierto, setAbierto] = useState(true);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (!sugerencias.length) return null;

  const entendido = () =>
    iniciar(async () => {
      const r = await marcarSolucionesVistas(sugerencias.map((s) => s.id));
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });

  const una = sugerencias.length === 1;
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && entendido()}>
      <DialogContent className="sm:max-w-[460px]">
        <div className="flex items-center gap-2 text-[#1E7F4F]">
          <CheckCircle2 className="size-6 shrink-0" />
          <DialogTitle className="text-base font-bold text-foreground">
            {una ? "Ya se solucionó lo que reportó" : `Ya se solucionaron ${sugerencias.length} cosas que reportó`}
          </DialogTitle>
        </div>
        <DialogDescription className="text-sm text-muted-foreground">
          Gracias por avisar. Esto ya está resuelto en el CRM:
        </DialogDescription>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {sugerencias.map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">«{s.titulo}»</p>
              {s.respuesta && <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">{s.respuesta}</p>}
              <Link href={`/sugerencias?ver=${s.id}`} onClick={entendido} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                Ver el detalle
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button onClick={entendido} disabled={pendiente}>
            {pendiente ? "Guardando…" : "Entendido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
