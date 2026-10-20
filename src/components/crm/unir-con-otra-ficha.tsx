"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Link2, Loader2, Search } from "lucide-react";
import { buscarFichasParaUnir, type FichaParaUnir } from "@/lib/acciones/cuentas";
import { DialogoUnirFichas, type FichaEnUnion } from "@/components/crm/dialogo-unir-fichas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * «UNIR CON OTRA FICHA» (0558, Katerine 20-10).
 *
 * Dennis Gallardo escribió por WhatsApp y el CRM le abrió una ficha nueva
 * aunque ya era contacto de LAVANDERIAS GLUP, ficha de la misma Katerine.
 * Ella lo vio al toque, pero no tenía cómo unirlas: «¿Es el mismo cliente?»
 * solo sale cuando el CRM adivina la pareja y «Fichas repetidas» solo junta
 * fichas que se llaman igual. Santos: «supongo que aparecería un buscador y
 * podría unir las fichas y preguntar quién es el que aparecería como principal».
 *
 * Dos pasos: buscar la otra ficha (nombre, RUC, celular o contacto) y elegir
 * cuál se queda. Después abre el mismo diálogo de unir de siempre: motivo y,
 * si alguna ficha no es suya, el código de operaciones.
 */
export function UnirConOtraFicha({
  cuenta,
  supervisores = [],
  variante = "boton",
  className,
}: {
  cuenta: FichaEnUnion & { expedientes?: number };
  supervisores?: { id: string; nombre: string; rol?: string }[];
  variante?: "boton" | "enlace";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [fichas, setFichas] = useState<FichaParaUnir[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otra, setOtra] = useState<FichaParaUnir | null>(null);
  const [seQueda, setSeQueda] = useState<"esta" | "otra">("otra");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!abierto) {
      setTexto("");
      setFichas(null);
      setError(null);
      setOtra(null);
      setConfirmando(false);
    }
  }, [abierto]);

  // Busca mientras se escribe, con una pausa corta para no disparar por letra.
  useEffect(() => {
    if (!abierto || otra) return;
    const t = texto.trim();
    if (t.length < 3) {
      setFichas(null);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const timer = setTimeout(async () => {
      const r = await buscarFichasParaUnir(cuenta.id, t);
      if (!vivo) return;
      setBuscando(false);
      setError(r.error);
      setFichas(r.fichas);
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [abierto, texto, otra, cuenta.id]);

  function elegir(f: FichaParaUnir) {
    setOtra(f);
    // Se queda la que tiene RUC o DNI; si las dos o ninguna, la que más movimiento tiene.
    const estaTieneDoc = Boolean(cuenta.documento);
    const otraTieneDoc = Boolean(f.documento);
    if (otraTieneDoc && !estaTieneDoc) setSeQueda("otra");
    else if (estaTieneDoc && !otraTieneDoc) setSeQueda("esta");
    else setSeQueda((cuenta.expedientes ?? 0) > f.expedientes ? "esta" : "otra");
  }

  const esta: FichaEnUnion = { id: cuenta.id, razonSocial: cuenta.razonSocial, documento: cuenta.documento ?? null, comercial: cuenta.comercial ?? null };
  const otraComoFicha: FichaEnUnion | null = otra ? { id: otra.id, razonSocial: otra.razonSocial, documento: otra.documento, comercial: otra.comercial } : null;
  const origen = seQueda === "otra" ? esta : otraComoFicha;
  const destino = seQueda === "otra" ? otraComoFicha : esta;
  const lasDosConDoc = Boolean(cuenta.documento) && Boolean(otra?.documento);

  const Tarjeta = ({ f, elegida, onClick, extra }: { f: FichaEnUnion; elegida: boolean; onClick: () => void; extra?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-0 flex-1 rounded-lg border p-2.5 text-left transition-colors",
        elegida ? "border-[#1E7F4F] bg-[#1E7F4F]/5" : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {elegida && <Check className="size-3 text-[#1E7F4F]" />}
        {elegida ? "Se queda como principal" : "Se une a la otra"}
      </p>
      <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{f.razonSocial}</p>
      <p className="text-[11px] text-muted-foreground">
        {f.documento ?? "Sin RUC ni DNI"}
        {f.comercial ? ` · cartera de ${f.comercial}` : ""}
        {extra ? ` · ${extra}` : ""}
      </p>
    </button>
  );

  return (
    <>
      {variante === "enlace" ? (
        <button type="button" onClick={() => setAbierto(true)} className={cn("inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline", className)}>
          <Link2 className="size-3.5" /> Unir con otra ficha
        </button>
      ) : (
        <Button type="button" size="sm" variant="outline" className={cn("h-7 gap-1.5 px-2 text-xs", className)} onClick={() => setAbierto(true)}>
          <Link2 className="size-3.5" /> Unir con otra ficha
        </Button>
      )}

      <Dialog open={abierto && !confirmando} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Unir con otra ficha</DialogTitle>
            <DialogDescription>
              {otra
                ? "Elija cuál de las dos se queda como principal. Todo lo de la otra (expedientes, contactos, casos, máquinas y pedidos) pasa a esa."
                : `¿Este cliente ya tiene otra ficha? Búsquela por nombre, RUC o DNI, celular o nombre de un contacto.`}
            </DialogDescription>
          </DialogHeader>

          {!otra ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus placeholder="Nombre, RUC, celular o contacto" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
                {buscando && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {fichas && fichas.length === 0 && !buscando && (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No hay otra ficha con «{texto.trim()}». Pruebe con parte del nombre, el RUC o el celular del contacto.
                </p>
              )}
              {fichas && fichas.length > 0 && (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {fichas.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => elegir(f)}
                        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{f.razonSocial}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {f.documento ?? "sin RUC ni DNI"} · {f.comercial ?? "sin cartera"} · {f.expedientes} exp. · {f.contactos} contacto{f.contactos === 1 ? "" : "s"} · coincide por {f.motivo}
                          </span>
                        </span>
                        <span className="text-[11px] font-medium text-primary">Elegir</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                Esta ficha: <span className="font-medium text-foreground">{cuenta.razonSocial}</span> ({cuenta.documento ?? "sin RUC ni DNI"}).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Tarjeta f={esta} elegida={seQueda === "esta"} onClick={() => setSeQueda("esta")} extra={cuenta.expedientes !== undefined ? `${cuenta.expedientes} exp.` : undefined} />
                <Tarjeta f={otraComoFicha!} elegida={seQueda === "otra"} onClick={() => setSeQueda("otra")} extra={`${otra.expedientes} exp. · ${otra.contactos} contacto${otra.contactos === 1 ? "" : "s"}`} />
              </div>
              {lasDosConDoc ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-900">
                  Las dos fichas tienen RUC o DNI propio. Unirlas lo decide gerencia o administración: pueden ser dos empresas distintas o
                  sedes. Si el cliente compra con otra razón social, va como empresa del grupo, no se une.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Se propone que quede la que tiene RUC o DNI (es con la que se cotiza y factura). Puede cambiarlo tocando la otra tarjeta.
                  {otra.sinCodigo ? " Las dos fichas son de su cartera: no hace falta el código." : " Como una de las dos no es de su cartera, se pide el código de operaciones."}
                </p>
              )}
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOtra(null)}>
                  Buscar otra
                </Button>
                <Button type="button" size="sm" onClick={() => setConfirmando(true)}>
                  Continuar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmando && origen && destino && (
        <DialogoUnirFichas
          abierto
          onOpenChange={(v) => {
            if (!v) setConfirmando(false);
          }}
          origen={origen}
          destino={destino}
          supervisores={supervisores}
          sinCodigoPorque={otra?.sinCodigo ? "Las dos fichas son de su cartera: no se mueve el cliente de nadie." : null}
          alUnir={() => {
            setAbierto(false);
            // Si la ficha que se mira es la que se unió, ya no se abre: se va a la que queda.
            if (origen.id === cuenta.id) {
              const base = pathname?.startsWith("/comercial/cartera/") ? "/comercial/cartera/" : "/nuevo/cliente/";
              router.push(`${base}${destino.id}`);
            }
          }}
        />
      )}
    </>
  );
}
