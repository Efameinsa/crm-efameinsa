"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, MessageCircle, Check } from "lucide-react";
import { derivarAFinanzas } from "@/lib/acciones/finanzas";
import { TELEFONO_FINANZAS } from "@/lib/tesoreria";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * La tercera salida de Central: ni derivar a un comercial, ni descartar.
 *
 * El ing. Carlos, 31-08: un comercial registró que el cliente pedía su factura.
 * «Eso no suma como netamente el tema comercial (…) ¿rechaza?, ¿hacia dónde
 * va?». Descartarlo hace desaparecer el pedido y el cliente vuelve a llamar;
 * dejarlo como gestión comercial infla las cifras de quien no vendió nada.
 *
 * POR QUÉ EL WHATSAPP SE ABRE Y NO SE MANDA SOLO. Para enviar un WhatsApp sin
 * intervención hace falta la API oficial de Meta, que cobra por conversación y
 * exige una cuenta de empresa verificada; las pasarelas no oficiales terminan
 * con el número bloqueado. Así que el CRM hace lo que sí puede hacer bien: deja
 * el mensaje escrito, con el cliente, el documento y qué pidió, y Central solo
 * presiona enviar. Un clic más, cero costo, y el número de la empresa a salvo.
 *
 * La derivación queda registrada ANTES de abrir WhatsApp: si Central se
 * distrae y no envía el mensaje, el pedido igual salió del circuito comercial y
 * se ve en «Derivados a otras áreas». Lo que no puede pasar es que quede a
 * medias en la cola.
 */
export function DerivarFinanzasBoton({
  leadId,
  cliente,
  documento,
  mensajeOriginal,
}: {
  leadId: string;
  cliente: string;
  documento?: string | null;
  mensajeOriginal?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState("");
  const [enlaceWhatsApp, setEnlaceWhatsApp] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setDetalle("");
    setEnlaceWhatsApp(null);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setDetalle(mensajeOriginal?.slice(0, 180) ?? "");
          setAbierto(true);
        }}
      >
        <Receipt className="size-3.5" /> A Finanzas
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{enlaceWhatsApp ? "Derivado a Finanzas" : "Derivar a Finanzas"}</DialogTitle>
            <DialogDescription>
              {enlaceWhatsApp
                ? "Ya salió del circuito comercial. Falta avisarle a Tesorería."
                : "Para lo que no es venta: facturas, cobranzas, pagos. No cuenta como gestión comercial."}
            </DialogDescription>
          </DialogHeader>

          {!enlaceWhatsApp ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-secondary/40 p-2.5 text-sm">
                <b className="text-foreground">{cliente}</b>
                {documento && <span className="ml-2 font-mono text-xs text-muted-foreground">{documento}</span>}
              </div>
              <div>
                <label htmlFor="detalle-finanzas" className="mb-1 block text-xs font-medium text-foreground">
                  ¿Qué pidió el cliente?
                </label>
                <textarea
                  id="detalle-finanzas"
                  rows={3}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="ej. Pide que le reenvíen la factura de la lavadora comprada en julio"
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Es lo que va a leer Tesorería en su WhatsApp. Escríbalo como se lo diría por teléfono.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-[#1E7F4F]">
                <Check className="size-4" /> Registrado y fuera de las cifras comerciales.
              </p>
              <p className="text-xs text-muted-foreground">
                Ahora el mensaje para Tesorería, ya escrito. Se abre WhatsApp con el texto puesto y usted solo
                presiona enviar.
              </p>
              <a
                href={enlaceWhatsApp}
                target="_blank"
                rel="noreferrer"
                onClick={() => setTimeout(cerrar, 400)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1E7F4F] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110"
              >
                <MessageCircle className="size-4" /> Abrir WhatsApp para {TELEFONO_FINANZAS}
              </a>
            </div>
          )}

          <DialogFooter>
            {!enlaceWhatsApp ? (
              <>
                <Button variant="outline" size="sm" onClick={cerrar} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={enviando || detalle.trim().length < 10}
                  onClick={() =>
                    empezar(async () => {
                      const r = await derivarAFinanzas({ leadId, detalle });
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Derivado a Finanzas.");
                      setEnlaceWhatsApp(r.enlace!);
                    })
                  }
                >
                  {enviando ? "Derivando…" : "Derivar a Finanzas"}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={cerrar}>
                Listo, cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
