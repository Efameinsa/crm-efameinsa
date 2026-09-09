"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, CircleCheckBig, CircleSlash } from "lucide-react";
import { cambiarEtapa } from "@/lib/acciones/oportunidades";
import { Button } from "@/components/ui/button";
import { fechaLimaCorta } from "@/lib/fechas";

/**
 * ESTA CONSULTA YA SE RESOLVIÓ EN LA FICHA DE AL LADO.
 *
 * Ariana, por Santos (09-09, con YOPLAC OCHOA LISSETH): «se repiten ahí, ya lo
 * había puesto sin interés y no procede». El Excel trajo dos fichas de la
 * misma clienta con dos días de diferencia; ella cerró una el 28-08 con una
 * llamada real —«no corta la llamada, se le llamó 2 veces»— y la gemela
 * seguía pidiéndole «Llamar al cliente», vencida hacía 18 días, en rojo, en
 * Mi día. Con ECOLAV SORELA es peor: se le VENDIÓ el 03-09 y la ficha repetida
 * la mandaba a llamar igual.
 *
 * La salida ya existía —archivar, desde el 08-09, que no cuenta como perdida y
 * se puede retomar— pero vivía dentro del desplegable de Etapa, que hay que
 * abrir y bajar. Nadie le decía que correspondía usarla. Esto lo dice, con la
 * fecha y el motivo de al lado para que pueda comprobarlo, y con el botón acá
 * mismo. NO archiva solo: puede ser otra consulta del mismo cliente, y eso solo
 * lo sabe quien lo atendió.
 */
export function AvisoGemelaCerrada({
  oportunidadId,
  gemelaId,
  etapaGemela,
  cerradaAt,
  motivo,
}: {
  oportunidadId: string;
  gemelaId: string;
  etapaGemela: string;
  cerradaAt: string;
  motivo?: string | null;
}) {
  const router = useRouter();
  const [archivando, startTransition] = useTransition();
  const esVenta = etapaGemela === "venta";

  function archivar() {
    startTransition(async () => {
      const r = await cambiarEtapa({ oportunidadId, etapa: "historico", motivoRechazoId: null });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Archivada. Sale de sus pendientes y no cuenta como perdida; puede retomarla desde la cartera.");
      router.refresh();
    });
  }

  const Icono = esVenta ? CircleCheckBig : CircleSlash;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex gap-3">
        <Icono className="mt-0.5 size-5 flex-none text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {esVenta
              ? `A este cliente ya se le vendió — el ${fechaLimaCorta(cerradaAt)}, en otra ficha suya`
              : `A este cliente ya lo cerró el ${fechaLimaCorta(cerradaAt)}, en otra ficha suya${motivo ? ` (${motivo})` : ""}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {esVenta
              ? "Y acá no pasó nada después de esa venta. Si esta ficha es la misma consulta, seguirle pidiendo llamadas es trabajo repetido sobre un cliente que ya compró."
              : "Y acá no pasó nada después de ese cierre. Si esta ficha es la misma consulta, lo que ya decidió allá vale también para esta."}{" "}
            Archivarla la saca de sus pendientes, <b className="text-foreground">no cuenta como perdida</b> y puede
            retomarla desde la cartera cuando quiera. Si es otra consulta distinta del mismo cliente, déjela y siga.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={archivar} disabled={archivando}>
              <Archive className="size-3.5" />
              {archivando ? "Archivando…" : "Archivar esta ficha"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              render={<Link href={`/comercial/oportunidades/${gemelaId}`}>Ver esa otra ficha</Link>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
