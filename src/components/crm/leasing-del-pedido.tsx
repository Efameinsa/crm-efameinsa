"use client";

// VENTA POR LEASING EN EL PEDIDO (0603; Santos 24-10, AQU ANQA con el BanBif).
// Tres papeles con un solo expediente: el banco financia y recibe la factura,
// el cliente final recibe el equipo y el despacho, y la guía de remisión sale
// por defecto al cliente final. Postventa (y Central) la cambian al banco en la
// apertura si el banco lo exige; el almacén y Finanzas solo la leen.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { elegirGuiaANombreDe } from "@/lib/acciones/postventa";
import { cn } from "@/lib/utils";

const sinRuc = (t: string | null | undefined) => (t ?? "").replace(/^\d{8,11}\s*-\s*/, "");

export function LeasingDelPedido({
  servicioId,
  facturaA,
  cliente,
  guiaANombreDe,
  editable,
}: {
  servicioId: string;
  facturaA: string | null;
  cliente: string | null;
  guiaANombreDe: "cliente" | "banco";
  /** Postventa o Central, y la guía todavía no se emitió. */
  editable: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const banco = sinRuc(facturaA) || "el banco";
  const final = sinRuc(cliente) || "el cliente final";

  function elegir(a: "cliente" | "banco") {
    if (a === guiaANombreDe || pendiente) return;
    iniciar(async () => {
      const r = await elegirGuiaANombreDe(servicioId, a);
      if (r.error) return void toast.error(r.error);
      toast.success(`La guía de remisión saldrá a nombre de ${a === "banco" ? banco : final}`);
      router.refresh();
    });
  }

  const opciones: { valor: "cliente" | "banco"; texto: string }[] = [
    { valor: "cliente", texto: `${final} (cliente final)` },
    { valor: "banco", texto: `${banco} (banco)` },
  ];

  return (
    <div className="rounded-lg border border-sky-600/30 bg-sky-500/5 px-3.5 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
        <Landmark className="size-3.5" /> Venta por leasing
      </p>
      <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted-foreground">Se factura a</dt>
        <dd className="font-medium text-foreground">{facturaA ?? "—"}</dd>
        <dt className="text-muted-foreground">Se entrega a</dt>
        <dd className="font-medium text-foreground">{cliente ?? "—"}</dd>
        <dt className="text-muted-foreground">Guía de remisión a</dt>
        <dd>
          {editable ? (
            <span className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="A nombre de quién sale la guía de remisión">
              {opciones.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={guiaANombreDe === o.valor}
                  disabled={pendiente}
                  onClick={() => elegir(o.valor)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 font-medium",
                    guiaANombreDe === o.valor ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {o.texto}
                </button>
              ))}
              {pendiente && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </span>
          ) : (
            <span className="font-semibold text-foreground">{guiaANombreDe === "banco" ? `${banco} (banco)` : `${final} (cliente final)`}</span>
          )}
        </dd>
      </dl>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        El banco paga y recibe la factura; el equipo, el despacho y la ficha son del cliente final.
        {editable ? " Por defecto la guía sale al cliente final; cámbiela solo si el banco lo exige." : ""}
      </p>
    </div>
  );
}
