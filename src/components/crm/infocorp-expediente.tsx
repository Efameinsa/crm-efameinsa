"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSearch, FileText } from "lucide-react";
import { pedirInfocorp } from "@/lib/acciones/infocorp";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fechaHoraLima } from "@/lib/fechas";

export interface SolicitudInfocorp {
  id: string;
  ruc: string | null;
  razon_social: string;
  nota: string | null;
  created_at: string;
  atendido_at: string | null;
  resultado: string | null;
  archivo_nombre: string | null;
  url: string | null;
  quien: string | null;
}

/**
 * Pedir el Infocorp del cliente desde el expediente (0447; Brenda, buzón
 * 12-10). Antes era un correo a Central con el RUC y la razón social; ahora
 * salen de la ficha, a Central le suena la campana y la respuesta —el reporte
 * que sube Central— vuelve acá y a la campana de quien lo pidió.
 */
export function InfocorpExpediente({
  cuentaId,
  oportunidadId,
  ruc,
  razonSocial,
  solicitudes,
}: {
  cuentaId: string;
  oportunidadId: string;
  ruc: string | null;
  razonSocial: string;
  solicitudes: SolicitudInfocorp[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [pendiente, iniciar] = useTransition();
  const hayPendiente = solicitudes.some((s) => !s.atendido_at);

  function pedir() {
    iniciar(async () => {
      const r = await pedirInfocorp({ cuentaId, oportunidadId, ruc, razonSocial, nota });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.yaPedido ? "Ya estaba pedido: Central lo tiene en su lista." : "Pedido a Central. Le avisamos cuando suba el reporte.");
      setAbierto(false);
      setNota("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {solicitudes.length > 0 && (
        <ul className="space-y-2">
          {solicitudes.map((s) => (
            <li key={s.id} className="rounded-md border border-border p-2.5 text-xs">
              <p className="font-medium text-foreground">
                {s.atendido_at ? "Listo" : "Pedido a Central · esperando el reporte"}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · pedido {fechaHoraLima(s.created_at)}
                  {s.quien ? ` por ${s.quien}` : ""}
                </span>
              </p>
              {s.nota && <p className="mt-1 whitespace-pre-line text-muted-foreground">{s.nota}</p>}
              {s.atendido_at && (
                <div className="mt-1.5 space-y-1">
                  {s.resultado && <p className="whitespace-pre-line text-foreground">{s.resultado}</p>}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <FileText className="size-3.5" />
                      {s.archivo_nombre ?? "Ver el reporte"}
                    </a>
                  )}
                  <p className="text-muted-foreground">Respondido {fechaHoraLima(s.atendido_at)}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            Se le pide a Central el Infocorp de <b className="text-foreground">{razonSocial}</b>
            {ruc ? <> · RUC <b className="text-foreground">{ruc}</b></> : <> (la ficha no tiene RUC: escríbalo en la nota)</>}.
          </p>
          <div className="space-y-1">
            <Label htmlFor="nota-infocorp" className="text-xs">
              Nota para Central (opcional)
            </Label>
            <Textarea id="nota-infocorp" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: es para evaluar el crédito del 50 %" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={pedir} disabled={pendiente}>
              {pendiente ? "Pidiendo…" : "Pedir a Central"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAbierto(true)} disabled={hayPendiente}>
          <FileSearch className="size-4" />
          {hayPendiente ? "Ya está pedido" : solicitudes.length ? "Pedir otro Infocorp" : "Pedir Infocorp"}
        </Button>
      )}
      {solicitudes.length === 0 && !abierto && (
        <p className="text-xs text-muted-foreground">Central lo saca y lo sube aquí; le llega el aviso a su campana.</p>
      )}
    </div>
  );
}
