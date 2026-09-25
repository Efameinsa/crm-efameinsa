"use client";

// ¿CAMBIÓ ALGO? Reprogramar, corregir el tipo o anular la apertura (0311).
//
// Rubí, 25-09, dos veces en la misma tarde: una apertura con el tipo mal
// elegido («puse videollamada de puesta en marcha y era de preinstalación») y
// otra que había que pasar al lunes («mañana habrá despacho»). La fecha y el
// tipo quedaban fijos al enviar, y anular estaba al fondo de la página:
// terminaba pidiendo por WhatsApp que se cambie «internamente». Ahora las
// tres cosas están arriba, al lado de la fecha, con atajos para lo más común.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2, Repeat, XCircle } from "lucide-react";
import { anularApertura, corregirTipoApertura, reprogramarApertura } from "@/lib/acciones/aperturas-llamada";
import type { TipoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Panel = "reprogramar" | "tipo" | "anular" | null;

const MOTIVOS_REPROGRAMAR = ["Hay despacho ese día", "El cliente pidió otra fecha", "El técnico no está disponible"];
const MOTIVOS_ANULAR = ["Hay despacho ese día; se programará de nuevo", "Se pidió dos veces", "El cliente ya no la necesita"];
const HORAS = [
  { valor: "09:00", etiqueta: "9:00 a. m." },
  { valor: "11:00", etiqueta: "11:00 a. m." },
  { valor: "15:00", etiqueta: "3:00 p. m." },
  { valor: "16:00", etiqueta: "4:00 p. m." },
];

/** «2026-09-28» y «15:00» de un instante, en hora de Lima. */
function partesLima(iso: string): { fecha: string; hora: string } {
  const t = new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Lima" });
  return { fecha: t.slice(0, 10), hora: t.slice(11, 16) };
}
/** Hoy + n días, en Lima, como «2026-09-28». */
function diaLima(masDias: number): string {
  const hoy = new Date(`${new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" }).slice(0, 10)}T12:00:00-05:00`);
  hoy.setUTCDate(hoy.getUTCDate() + masDias);
  return hoy.toISOString().slice(0, 10);
}
/** Días hasta el próximo lunes (si hoy es lunes, el de la semana que viene). */
function hastaElLunes(): number {
  const dow = new Date(`${diaLima(0)}T12:00:00-05:00`).getUTCDay();
  return (8 - dow) % 7 || 7;
}
function textoFecha(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora || "00:00"}:00-05:00`).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Chip({ activo, onClick, children }: { activo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        activo
          ? "cursor-pointer rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
          : "cursor-pointer rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-accent"
      }
    >
      {children}
    </button>
  );
}

export function CambiosApertura({
  id,
  tipo,
  programadaPara,
  hayInforme,
  tomada,
  tipos,
}: {
  id: string;
  tipo: TipoApertura;
  programadaPara: string;
  /** El almacén ya subió su informe: la llamada ya se hizo y no se reprograma. */
  hayInforme: boolean;
  /** El almacén ya la tomó: se le avisa de cualquier cambio. */
  tomada: boolean;
  tipos: { valor: TipoApertura; etiqueta: string }[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const actual = partesLima(programadaPara);
  const [fecha, setFecha] = useState(actual.fecha);
  const [hora, setHora] = useState(actual.hora);
  const [nuevoTipo, setNuevoTipo] = useState<TipoApertura>(tipo);
  const [motivo, setMotivo] = useState("");

  function abrir(p: Panel) {
    setPanel(panel === p ? null : p);
    setMotivo("");
  }
  function hecho(mensaje: string) {
    toast.success(mensaje);
    setPanel(null);
    router.refresh();
  }
  function reprogramar() {
    startTransition(async () => {
      const r = await reprogramarApertura(id, new Date(`${fecha}T${hora}:00-05:00`).toISOString(), motivo);
      if (r.error) return void toast.error(r.error);
      hecho(tomada ? "Reprogramada. El almacén ya recibió el aviso con la fecha nueva" : "Reprogramada");
    });
  }
  function corregirTipo() {
    startTransition(async () => {
      const r = await corregirTipoApertura(id, nuevoTipo, motivo);
      if (r.error) return void toast.error(r.error);
      hecho(hayInforme ? "Tipo corregido, también en el informe" : "Tipo corregido");
    });
  }
  function anular() {
    startTransition(async () => {
      const r = await anularApertura(id, motivo);
      if (r.error) return void toast.error(r.error);
      hecho("Apertura anulada; el almacén ya no la ve pendiente");
    });
  }

  const lunes = hastaElLunes();
  const atajosDia = [{ etiqueta: "Mañana", valor: diaLima(1) }, ...(lunes > 1 ? [{ etiqueta: "El lunes", valor: diaLima(lunes) }] : [])];
  const cambioFecha = fecha !== actual.fecha || hora !== actual.hora;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">¿Cambió algo?</span>
        <Button size="sm" variant={panel === "reprogramar" ? "default" : "outline"} onClick={() => abrir("reprogramar")}>
          <CalendarClock className="size-3.5" /> Reprogramar
        </Button>
        <Button size="sm" variant={panel === "tipo" ? "default" : "outline"} onClick={() => abrir("tipo")}>
          <Repeat className="size-3.5" /> Cambiar el tipo
        </Button>
        <Button
          size="sm"
          variant={panel === "anular" ? "destructive" : "ghost"}
          className={panel === "anular" ? undefined : "text-muted-foreground"}
          onClick={() => abrir("anular")}
        >
          <XCircle className="size-3.5" /> Anular
        </Button>
      </div>

      {panel === "reprogramar" &&
        (hayInforme ? (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            El almacén ya subió su informe: esta llamada ya se hizo. Si hace falta otra, envíe una apertura nueva desde el pedido o la ficha del cliente.
          </p>
        ) : (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Nuevo día</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {atajosDia.map((d) => (
                    <Chip key={d.etiqueta} activo={fecha === d.valor} onClick={() => setFecha(d.valor)}>
                      {d.etiqueta}
                    </Chip>
                  ))}
                  <Input type="date" className="h-8 w-auto text-xs" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Hora</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {HORAS.map((h) => (
                    <Chip key={h.valor} activo={hora === h.valor} onClick={() => setHora(h.valor)}>
                      {h.etiqueta}
                    </Chip>
                  ))}
                  <Input type="time" className="h-8 w-auto text-xs" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">Por qué (opcional; lo lee el almacén)</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {MOTIVOS_REPROGRAMAR.map((m) => (
                  <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Input className="h-8 max-w-md text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="U otro motivo…" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={reprogramar} disabled={pendiente || !fecha || !hora || !cambioFecha}>
                {pendiente && <Loader2 className="size-4 animate-spin" />}
                Pasar al {textoFecha(fecha, hora)}
              </Button>
              {tomada && <span className="text-[11px] text-muted-foreground">El almacén ya la tomó: le llega el aviso con la fecha nueva.</span>}
            </div>
          </div>
        ))}

      {panel === "tipo" && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {tipos.map((t) => (
              <Chip key={t.valor} activo={nuevoTipo === t.valor} onClick={() => setNuevoTipo(t.valor)}>
                {t.etiqueta}
                {t.valor === tipo ? " (la actual)" : ""}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {hayInforme
              ? "Se corrigen la orden y el informe que salió de ella, con el mismo número. Si queda como preinstalación, el pedido la da por hecha."
              : "La orden sale con el tipo nuevo y el almacén recibe el aviso."}
          </p>
          <Input
            className="h-8 max-w-md text-xs"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué (opcional): se eligió mal al enviarla…"
          />
          <Button size="sm" onClick={corregirTipo} disabled={pendiente || nuevoTipo === tipo}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Cambiar a «{tipos.find((t) => t.valor === nuevoTipo)?.etiqueta}»
          </Button>
        </div>
      )}

      {panel === "anular" && (
        <div className="mt-3 space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-foreground">
            Anular la saca de la cola del almacén y queda escrita con su motivo. Si solo cambia el día, mejor <b>Reprogramar</b>.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {MOTIVOS_ANULAR.map((m) => (
              <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>
                {m}
              </Chip>
            ))}
          </div>
          <Input className="h-8 max-w-md text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="U otro motivo…" />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={pendiente || !motivo.trim()} onClick={anular}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Anular la apertura
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              No, dejarla
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
