"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { solicitarConfirmacionPago } from "@/lib/acciones/finanzas";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * «SOLICITAR CONFIRMACIÓN DEL PAGO» (0295; Carlos, 23-09 17:48). Postventa ya
 * no registra lo que Finanzas le contestó por correo: le pide con un clic, a
 * Finanzas le llega el aviso con el pedido, y su respuesta (confirmado,
 * parcial u observado) vuelve sola a postventa. Se puede volver a pedir.
 */
export function PedirConfirmacionPago({ servicioId, solicitadoAt, otra = false }: { servicioId: string; solicitadoAt: string | null; otra?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function pedir() {
    startTransition(async () => {
      const r = await solicitarConfirmacionPago(servicioId);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success("Pedido a Finanzas: le llegó el aviso. Su respuesta le llega a usted.");
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {solicitadoAt && <span className="text-[11px] text-muted-foreground">Pedida a Finanzas el {fechaHoraLima(solicitadoAt)} · esperando</span>}
      <button
        type="button"
        onClick={pedir}
        disabled={pendiente}
        className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        {solicitadoAt ? "Volver a pedir" : otra ? "Pedir confirmación del saldo" : "Solicitar confirmación a Finanzas"}
      </button>
    </span>
  );
}
