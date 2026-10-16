"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoveRight, Search } from "lucide-react";
import { buscarExpedientesDestino, moverGestiones, type ExpedienteDestino } from "@/lib/acciones/registro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ETAPA: Record<string, string> = {
  asignada: "asignado",
  cotizada: "cotizado",
  seguimiento: "en seguimiento",
  potencial: "potencial",
  filtrada: "filtrado",
  venta: "venta",
  rechazada: "rechazado",
  derivada: "derivado",
  historico: "histórico",
};

/**
 * «MOVER GESTIONES A OTRO EXPEDIENTE» (0514). Del buzón: la gestión anotada en
 * el cliente equivocado (Gabriela 12-10), dos expedientes del mismo cliente
 * (Caravedo 09-10), la derivación ya gestionada que había que devolver
 * (PRO-11084). Todo se hacía a mano en la base. Lo usan Central, operaciones,
 * gerencia y administración.
 */
export function MoverGestionesBoton({ oportunidadId, cliente }: { oportunidadId: string; cliente: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<ExpedienteDestino[] | null>(null);
  const [destino, setDestino] = useState<ExpedienteDestino | null>(null);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [buscando, startBuscar] = useTransition();
  const [enviando, startTransition] = useTransition();

  function buscar(q: string) {
    startBuscar(async () => setOpciones(await buscarExpedientesDestino(oportunidadId, q)));
  }
  useEffect(() => {
    if (abierto) buscar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const falta = !destino
    ? "Elija el expediente al que pasan las gestiones."
    : motivo.trim().length < 10
      ? "Escriba por qué se mueven (mínimo una frase): lo lee el comercial."
      : null;

  function mover() {
    if (falta || !destino) return;
    setProblema(null);
    startTransition(async () => {
      const r = await moverGestiones(oportunidadId, destino.id, motivo);
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(r.resumen ?? "Gestiones movidas", { duration: 8000 });
      setAbierto(false);
      router.push(`/comercial/oportunidades/${destino.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTexto("");
          setDestino(null);
          setMotivo("");
          setProblema(null);
          setAbierto(true);
        }}
        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <MoveRight className="size-3.5" /> Mover las gestiones a otro expediente
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mover las gestiones de {cliente}</DialogTitle>
            <DialogDescription>
              Las gestiones, los contactos y las visitas de este expediente pasan al que elija (del mismo cliente o de otra ficha). Si
              este queda vacío, pasa a histórico sin próxima acción. Las cotizaciones y los cierres no se mueven a otra ficha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`buscar-exp-${oportunidadId}`}>¿A qué expediente?</Label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                buscar(texto);
              }}
            >
              <input
                id={`buscar-exp-${oportunidadId}`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Nombre del cliente, RUC o código PRO"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <Button type="submit" size="sm" variant="outline" className="h-9 gap-1.5" disabled={buscando || (texto.trim().length > 0 && texto.trim().length < 3)} porQue={texto.trim().length > 0 && texto.trim().length < 3 ? "Al menos 3 letras." : null}>
                <Search className="size-3.5" /> Buscar
              </Button>
            </form>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
              {opciones === null || buscando ? (
                <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
              ) : opciones.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  {texto.trim()
                    ? "Ningún expediente de una ficha con ese nombre, RUC o código. Pruebe con otra parte del nombre."
                    : "Este cliente no tiene otros expedientes. Busque la ficha correcta por nombre, RUC o código PRO."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {opciones.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setDestino(o)}
                        className={cn("w-full cursor-pointer px-3 py-2 text-left hover:bg-accent", destino?.id === o.id && "bg-primary/10")}
                      >
                        <span className="block text-sm font-medium text-foreground">
                          {o.cliente}
                          {o.mismaFicha && <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">· mismo cliente</span>}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {o.documento ?? "Sin RUC"} · {o.comercial ?? "sin comercial"} · {ETAPA[o.etapa] ?? o.etapa} · {o.gestiones} gestión
                          {o.gestiones === 1 ? "" : "es"} · desde el {new Date(o.creado).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`motivo-mover-${oportunidadId}`}>Por qué se mueven</Label>
            <Textarea
              id={`motivo-mover-${oportunidadId}`}
              rows={2}
              placeholder="ej.: la llamada se anotó en el cliente equivocado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {problema && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
              {problema}
            </p>
          )}
          <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
            {falta && <p className="text-[11px] text-muted-foreground">{falta}</p>}
            <Button onClick={mover} disabled={Boolean(falta) || enviando}>
              {enviando ? "Moviendo…" : destino ? `Mover a ${destino.cliente}` : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
