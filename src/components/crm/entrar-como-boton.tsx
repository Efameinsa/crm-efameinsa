"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { abrirAuditoria } from "@/lib/acciones/auditoria";

/**
 * «Entrar como»: pide el acceso y lo abre en una pestaña nueva, en la ranura
 * que el servidor eligió. La pestaña se abre ANTES de esperar la respuesta
 * —con un «abriendo…»— porque los navegadores bloquean las ventanas que se
 * abren después de un await como si fueran popups.
 */
export function EntrarComoBoton({ perfilId, nombre }: { perfilId: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        const ventana = window.open("", "_blank");
        if (ventana) ventana.document.write(`<p style="font-family:sans-serif;padding:24px">Abriendo la sesión de auditoría como ${nombre}…</p>`);
        iniciar(async () => {
          const r = await abrirAuditoria(perfilId);
          if (r.error || !r.url) {
            ventana?.close();
            toast.error(r.error ?? "No se pudo abrir");
            return;
          }
          if (ventana) ventana.location.href = r.url;
          else window.open(r.url, "_blank");
          toast.success(`Ranura ver${r.ranura}: ${r.nombre}`, { description: "Solo lectura. Queda registrado quién entró y cuándo." });
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
      Entrar como
    </button>
  );
}
