"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, MessageCircle, Check, Receipt, Wrench, UserRound, Copy } from "lucide-react";
import { derivarAviso } from "@/lib/acciones/avisos";
import { TELEFONO_FINANZAS } from "@/lib/tesoreria";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * La tercera salida de Central, ahora con tres destinos que se combinan.
 *
 * El ing. Carlos, 04-09 (10:48): «en cualquier registro que haga la central,
 * la central debe tener esas tres alternativas. Puede elegir una o las tres».
 * El caso que lo motivó: el cliente termina de pagar el saldo. Finanzas tiene
 * que confirmar el ingreso, postventa tiene que saber que ya puede despachar, y
 * el comercial necesita que quede en el historial de su cliente.
 *
 * Antes esto se pedía por el ERP y el aviso se perdía. «Eso del ERP no es
 * necesario, hacerlo simplemente en el CRM.»
 *
 * NO CUENTA COMO GESTIÓN COMERCIAL. El aviso entra al historial del cliente
 * como nota, no como llamada: no infla los indicadores de nadie, que es la
 * misma razón por la que nació la derivación a Finanzas (0133).
 */
const DESTINOS = [
  {
    clave: "finanzas" as const,
    etiqueta: "Finanzas",
    icono: Receipt,
    ayuda: "Pagos, facturas y cobranzas. Se abre el WhatsApp de Tesorería con el mensaje escrito.",
  },
  {
    clave: "postventa" as const,
    etiqueta: "Postventa",
    icono: Wrench,
    ayuda: "Queda anotado en el pedido en curso del cliente, que es donde postventa decide si despacha.",
  },
  {
    clave: "comercial" as const,
    etiqueta: "El comercial del cliente",
    icono: UserRound,
    ayuda: "Queda en el historial de su cliente, para que lo vea cuando lo trabaje.",
  },
];

export function DerivarAvisoBoton({
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
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({ finanzas: false, postventa: false, comercial: false });
  const [enlaceWhatsApp, setEnlaceWhatsApp] = useState<string | null>(null);
  const [textoWhatsApp, setTextoWhatsApp] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [resumen, setResumen] = useState<{ hecho: string[]; falta: string[] } | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const ninguno = !elegidos.finanzas && !elegidos.postventa && !elegidos.comercial;

  function cerrar() {
    setAbierto(false);
    setDetalle("");
    setElegidos({ finanzas: false, postventa: false, comercial: false });
    setEnlaceWhatsApp(null);
    setTextoWhatsApp(null);
    setCopiado(false);
    setResumen(null);
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
        <Send className="size-3.5" /> Avisar a…
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{resumen ? "Aviso registrado" : "Avisar a otra área"}</DialogTitle>
            <DialogDescription>
              {resumen
                ? "Ya quedó guardado donde correspondía."
                : "Para lo que no es una venta nueva: un pago que entró, una factura, un despacho. Puede elegir uno o los tres."}
            </DialogDescription>
          </DialogHeader>

          {!resumen ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-secondary/40 p-2.5 text-sm">
                <b className="text-foreground">{cliente}</b>
                {documento && <span className="ml-2 font-mono text-xs text-muted-foreground">{documento}</span>}
              </div>

              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-xs font-medium text-foreground">¿A quién le avisamos?</legend>
                {DESTINOS.map((d) => {
                  const Icono = d.icono;
                  const activo = elegidos[d.clave];
                  return (
                    <label
                      key={d.clave}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
                        activo ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        onChange={(e) => setElegidos((v) => ({ ...v, [d.clave]: e.target.checked }))}
                        className="mt-0.5 size-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <Icono className="size-3.5" /> {d.etiqueta}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{d.ayuda}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div>
                <label htmlFor="detalle-aviso" className="mb-1 block text-xs font-medium text-foreground">
                  ¿Qué avisó el cliente?
                </label>
                <textarea
                  id="detalle-aviso"
                  rows={3}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="ej. Terminó de pagar el saldo de la lavadora; manda el voucher por WhatsApp"
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Es lo único que van a leer las áreas. Escríbalo como se lo diría por teléfono.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {resumen.hecho.length > 0 && (
                <ul className="space-y-1 text-sm text-[#1E7F4F]">
                  {resumen.hecho.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" /> {h}
                    </li>
                  ))}
                </ul>
              )}
              {resumen.falta.length > 0 && (
                <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-800">
                  {resumen.falta.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              )}
              {enlaceWhatsApp && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Falta avisarle a Tesorería, al {TELEFONO_FINANZAS}. El mensaje ya está escrito.
                  </p>
                  {/* EL MENSAJE, A LA VISTA. Central reportó el 04-09 que el
                      texto «aparecía con un número y se borró al toque»: usa
                      WhatsApp Web en Chrome, y cuando la pestaña no arrastra el
                      texto no queda nada que enviar. Ahora el mensaje se ve
                      acá, se copia de un clic y hay dos formas de abrirlo. */}
                  <textarea
                    readOnly
                    rows={5}
                    value={textoWhatsApp ?? ""}
                    className="w-full rounded-md border border-input bg-secondary/40 p-2.5 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(textoWhatsApp ?? "");
                        setCopiado(true);
                        toast.success("Mensaje copiado. Péguelo en WhatsApp.");
                      } catch {
                        toast.error("No se pudo copiar. Selecciónelo y cópielo a mano.");
                      }
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
                  >
                    <Copy className="size-4" /> {copiado ? "Copiado" : "Copiar el mensaje"}
                  </button>
                  <a
                    href={enlaceWhatsApp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1E7F4F] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110"
                  >
                    <MessageCircle className="size-4" /> Abrir WhatsApp Web
                  </a>
                  <a
                    href={`https://wa.me/${enlaceWhatsApp.split("/")[3]?.split("?")[0] ?? ""}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    o abrir el chat en la aplicación, sin el texto
                  </a>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {!resumen ? (
              <>
                <Button variant="outline" size="sm" onClick={cerrar} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={enviando || ninguno || detalle.trim().length < 10}
                  onClick={() =>
                    empezar(async () => {
                      const r = await derivarAviso({
                        leadId,
                        finanzas: elegidos.finanzas,
                        postventa: elegidos.postventa,
                        comercial: elegidos.comercial,
                        detalle,
                      });
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Aviso registrado.");
                      setResumen({ hecho: r.hecho ?? [], falta: r.falta ?? [] });
                      setEnlaceWhatsApp(r.enlace ?? null);
                      setTextoWhatsApp(r.texto ?? null);
                    })
                  }
                >
                  {enviando ? "Avisando…" : ninguno ? "Elija un destino" : "Avisar"}
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
