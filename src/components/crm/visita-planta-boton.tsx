"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { buscarEmpresaParaVisita, registrarVisitaPlanta } from "@/lib/acciones/visitas-planta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * «Viene a la planta» (0238).
 *
 * Carlos, 15-09: «registramos la visita. Eso llega a la central: RUC, si es
 * empresa, nombre de la empresa, la persona con DNI y el motivo. La central
 * lo imprime y lo lleva al vigilante». Lo que pide vigilancia, nada más; la
 * empresa y el RUC vienen de la ficha y se corrigen si hace falta.
 */
export function VisitaPlantaBoton({
  cuentaId,
  oportunidadId = null,
  empresa,
  ruc,
  compacto = false,
}: {
  cuentaId: string | null;
  oportunidadId?: string | null;
  empresa: string;
  ruc: string | null;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [f, setF] = useState({ empresa, ruc: ruc ?? "", persona: "", dni: "", telefono: "", motivo: "", fecha: hoy, hora: "10:00" });
  const [showroom, setShowroom] = useState(false);
  const [prenderTv, setPrenderTv] = useState(false);
  const [infocorp, setInfocorp] = useState(false);
  const [cotizacion, setCotizacion] = useState("");
  // Capítulo 1 de Catherine: «¿Usted viene solo? ¿Viene con familiares, con
  // amigos, con socios? ¿Me puede brindar el número de DNI y nombre completo?»
  const [acompanantes, setAcompanantes] = useState<{ nombre: string; dni: string }[]>([]);
  const [equipoAVer, setEquipoAVer] = useState("");
  const [quitarFilm, setQuitarFilm] = useState(false);
  // La ficha elegida: la que viene de la pantalla o la que se busca acá.
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(cuentaId);
  const [sugerencias, setSugerencias] = useState<{ id: string; razon_social: string; num_doc: string | null }[]>([]);
  const [buscado, setBuscado] = useState(false);
  useEffect(() => {
    if (cuentaId || cuentaElegida || !abierto) return;
    const q = f.ruc.trim().length >= 8 ? f.ruc.trim() : f.empresa.trim();
    if (q.length < 3) {
      setSugerencias([]);
      setBuscado(false);
      return;
    }
    const t = setTimeout(async () => {
      setSugerencias(await buscarEmpresaParaVisita(q));
      setBuscado(true);
    }, 350);
    return () => clearTimeout(t);
  }, [f.empresa, f.ruc, cuentaId, cuentaElegida, abierto]);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });

  function enviar() {
    startTransition(async () => {
      const r = await registrarVisitaPlanta({ cuentaId: cuentaElegida, oportunidadId, ...f, showroom, prenderTv, infocorp, cotizacionRef: cotizacion, acompanantes, equipoAVer, quitarFilm });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        r.correoEnviado
          ? "Visita registrada. Central tiene el aviso y el correo salió a Central, Contabilidad, Logística, Almacén y gerencia."
          : "Visita registrada. Central ya tiene el aviso para imprimirlo a vigilancia.",
      );
      setAbierto(false);
      setF((x) => ({ ...x, persona: "", dni: "", telefono: "", motivo: "" }));
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          compacto ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              title="El cliente viene a la planta: Central lo imprime para vigilancia"
            >
              <Building2 className="size-3.5" />
              Viene a la planta
            </button>
          ) : (
            <Button variant="outline" size="sm">
              <Building2 className="size-3.5" />
              Viene a la planta
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Visita a la planta</DialogTitle>
          <DialogDescription>
            Lo que vigilancia necesita en la puerta. Central recibe el aviso y lo imprime; el correo con la tabla sale a
            Central, Contabilidad, Logística, Sistemas, Almacén y gerencia, como el de siempre.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Empresa</Label>
              <Input
                {...campo("empresa")}
                onChange={(e) => {
                  setF((x) => ({ ...x, empresa: e.target.value }));
                  if (!cuentaId) setCuentaElegida(null);
                }}
                placeholder={cuentaId ? undefined : "Escriba el nombre o el RUC y elija la ficha"}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">RUC</Label>
              <Input
                {...campo("ruc")}
                onChange={(e) => {
                  setF((x) => ({ ...x, ruc: e.target.value }));
                  if (!cuentaId) setCuentaElegida(null);
                }}
                inputMode="numeric"
              />
            </div>
          </div>
          {/* Reunión 23-09: la empresa sale de las fichas; si no está, va como cliente nuevo. */}
          {!cuentaId && !cuentaElegida && sugerencias.length > 0 && (
            <ul className="-mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background text-sm shadow-sm">
              {sugerencias.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
                    onClick={() => {
                      setCuentaElegida(c.id);
                      setF((x) => ({ ...x, empresa: c.razon_social, ruc: c.num_doc ?? x.ruc }));
                      setSugerencias([]);
                    }}
                  >
                    <span className="truncate">{c.razon_social}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{c.num_doc ?? "sin RUC"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!cuentaId && cuentaElegida && <p className="-mt-1 text-[11px] text-[#1E7F4F]">Enlazada a la ficha del cliente.</p>}
          {!cuentaId && !cuentaElegida && buscado && sugerencias.length === 0 && (
            <p className="-mt-1 text-[11px] text-muted-foreground">No hay ficha con ese nombre o RUC: se registra como cliente nuevo.</p>
          )}
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Quién viene <span className="text-destructive">*</span>
              </Label>
              <Input {...campo("persona")} placeholder="Nombre y apellido" autoFocus />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">DNI</Label>
              <Input {...campo("dni")} inputMode="numeric" />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Teléfono de contacto</Label>
            <Input {...campo("telefono")} inputMode="tel" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">¿Viene acompañado? Nombre y DNI de cada uno (vigilancia los pide)</Label>
            {acompanantes.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-1.5">
                <Input value={a.nombre} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre y apellido" />
                <Input value={a.dni} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, dni: e.target.value } : x)))} placeholder="DNI" inputMode="numeric" />
                <button type="button" onClick={() => setAcompanantes((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => setAcompanantes((xs) => [...xs, { nombre: "", dni: "" }])} className="justify-self-start text-xs font-medium text-primary hover:underline">
              + Acompañante
            </button>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">¿Viene a ver una máquina en especial?</Label>
              <Input value={equipoAVer} onChange={(e) => setEquipoAVer(e.target.value)} placeholder="ej. LG Titan Max 17 kg del showroom" />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={quitarFilm} onChange={(e) => setQuitarFilm(e.target.checked)} className="size-4" />
              Quitarle el film
            </label>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">
              Para qué viene <span className="text-destructive">*</span>
            </Label>
            <Input {...campo("motivo")} placeholder="ej. ver su máquina en mantenimiento y pagar el saldo" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">N° de cotización (si se deja vacío, va la última que se le envió)</Label>
            <Input value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} placeholder="ej. 741-26" />
          </div>
          <div className="grid gap-1 rounded-md border border-border p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que hay que preparar</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showroom} onChange={(e) => setShowroom(e.target.checked)} className="size-4" />
              Abrir lavandería (showroom)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prenderTv} onChange={(e) => setPrenderTv(e.target.checked)} className="size-4" />
              Prender TV
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={infocorp} onChange={(e) => setInfocorp(e.target.checked)} className="size-4" />
              Se solicita Infocorp (a Contabilidad)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Fecha <span className="text-destructive">*</span>
              </Label>
              <Input type="date" min={hoy} {...campo("fecha")} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Hora</Label>
              <Input type="time" {...campo("hora")} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || !f.persona.trim() || !f.motivo.trim() || !f.fecha}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Registrar la visita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
