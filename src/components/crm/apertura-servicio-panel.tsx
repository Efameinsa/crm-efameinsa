"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Save, Mail } from "lucide-react";
import { guardarAperturaServicio } from "@/lib/acciones/postventa";
import { TIPOS_APERTURA, type TipoApertura } from "@/lib/apertura-servicio";
import { cn } from "@/lib/utils";

/**
 * Lo que hay que coordinar antes de que salga la apertura de servicio, y el
 * correo ya escrito.
 *
 * NO SE IMPRIME. Es la mesa de trabajo de postventa: acá se elige cuál de los
 * tres formatos es, se pone la hora y el día, quién va y cómo se mueve. La
 * hoja de arriba se rehace sola con lo que se guarde.
 *
 * El correo se copia, no se manda: el CRM no tiene SMTP y las alertas por
 * correo están apagadas por orden de gerencia. Es lo mismo que hace Central
 * con el WhatsApp de Tesorería — el sistema escribe el mensaje, la persona lo
 * pega y lo envía, y así ve lo que sale con su nombre.
 */
export function AperturaServicioPanel({
  servicioId,
  inicial,
  asunto,
  cuerpo,
  faltantes,
}: {
  servicioId: string;
  inicial: {
    tipo: TipoApertura;
    fecha: string | null;
    hora: string | null;
    tecnico: string | null;
    transporte: string | null;
    nota: string | null;
    direccionFinal: string | null;
  };
  asunto: string;
  cuerpo: string;
  faltantes: string[];
}) {
  const [v, setV] = useState(inicial);
  const [copiado, setCopiado] = useState<"asunto" | "cuerpo" | null>(null);
  const [guardando, empezar] = useTransition();
  const router = useRouter();

  const cambiar = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  async function copiar(que: "asunto" | "cuerpo") {
    try {
      await navigator.clipboard.writeText(que === "asunto" ? asunto : cuerpo);
      setCopiado(que);
      toast.success(que === "asunto" ? "Asunto copiado." : "Correo copiado. Péguelo en Outlook o Gmail.");
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      toast.error("No se pudo copiar. Selecciónelo y cópielo a mano.");
    }
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarAperturaServicio(servicioId, {
        tipo: v.tipo,
        fecha: v.fecha,
        hora: v.hora,
        tecnico: v.tecnico,
        transporte: v.transporte,
        nota: v.nota,
        direccionFinal: v.direccionFinal,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Guardado. La hoja de arriba ya quedó con estos datos.");
      router.refresh();
    });
  }

  return (
    <div className="no-imprimir space-y-4">
      {/* ── Qué falta para que el correo salga completo ── */}
      {faltantes.length > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Falta llenar:</b> {faltantes.join(", ")}. El correo se puede copiar igual — lo que falte aparece
          como «—», no se inventa.
        </p>
      ) : (
        <p className="rounded-md border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 px-3 py-2 text-xs font-medium text-[#1E7F4F]">
          La apertura está completa.
        </p>
      )}

      {/* ── La mesa de trabajo ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Datos que se coordinan</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Todo lo demás —cliente, RUC, dirección, quién recibe, el equipo con su serie— sale solo de lo que ya
          está en el sistema.
        </p>

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-foreground">¿Qué se va a hacer?</legend>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {TIPOS_APERTURA.map((t) => (
              <label
                key={t.clave}
                className={cn(
                  "cursor-pointer rounded-md border p-2.5 transition-colors",
                  v.tipo === t.clave ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="tipo-apertura"
                  className="sr-only"
                  checked={v.tipo === t.clave}
                  onChange={() => setV((x) => ({ ...x, tipo: t.clave }))}
                />
                <span className="block text-[11px] font-bold uppercase tracking-wide text-foreground">{t.titulo}</span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{t.ayuda}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Día del servicio">
            <input type="date" value={v.fecha ?? ""} onChange={cambiar("fecha")} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Hora">
            <input type="time" value={v.hora?.slice(0, 5) ?? ""} onChange={cambiar("hora")} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Personal asignado (técnico)" ayuda="En una entrega por agencia no va nadie: se puede dejar vacío.">
            <input
              value={v.tecnico ?? ""}
              onChange={cambiar("tecnico")}
              placeholder="ej. Cristian Dolorier"
              className={ENTRADA}
            />
          </Campo>
          <Campo etiqueta="Medio de transporte del técnico">
            <input
              value={v.transporte ?? ""}
              onChange={cambiar("transporte")}
              placeholder="ej. TRANSPORTE CONTRATADO"
              className={ENTRADA}
              list="transportes-usados"
            />
            <datalist id="transportes-usados">
              <option value="TRANSPORTE CONTRATADO" />
              <option value="TRANSPORTE CONTRATADO POR EL CLIENTE" />
              <option value="MOVILIDAD PROPIA" />
            </datalist>
          </Campo>
          <Campo
            etiqueta="Nota de la apertura"
            ayuda="Lo que va entre paréntesis: las guías que se solicitan."
            ancho
          >
            <input
              value={v.nota ?? ""}
              onChange={cambiar("nota")}
              placeholder="ej. se solicita 01 guía para la entrega del equipo"
              className={ENTRADA}
            />
          </Campo>
          <Campo
            etiqueta="Dirección final"
            ayuda="Solo si la entrega es en nuestras instalaciones y el equipo sigue viaje después."
            ancho
          >
            <input
              value={v.direccionFinal ?? ""}
              onChange={cambiar("direccionFinal")}
              placeholder="ej. LOTE 14 TOMA DE BAUTISTA, GROCIO PRADO – CHINCHA – ICA"
              className={ENTRADA}
            />
          </Campo>
        </div>

        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-70"
        >
          <Save className="size-3.5" /> {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* ── El correo, listo ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mail className="size-4" /> El correo, ya escrito
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          El CRM no envía correos: los deja escritos. Cópielo, péguelo y revíselo antes de enviar.
        </p>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Asunto</label>
        <div className="mt-1 flex gap-2">
          <input readOnly value={asunto} className={cn(ENTRADA, "font-medium")} />
          <button type="button" onClick={() => copiar("asunto")} className={BOTON_COPIAR}>
            {copiado === "asunto" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mensaje</label>
        <textarea
          readOnly
          value={cuerpo}
          rows={14}
          className="mt-1 w-full rounded-md border border-input bg-background p-2.5 font-mono text-[11.5px] leading-relaxed outline-none"
        />
        <button
          type="button"
          onClick={() => copiar("cuerpo")}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
        >
          <Copy className="size-3.5" /> {copiado === "cuerpo" ? "Copiado" : "Copiar el correo"}
        </button>
      </div>
    </div>
  );
}

const ENTRADA =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground";
const BOTON_COPIAR =
  "inline-flex shrink-0 items-center rounded-md border border-border px-3 text-foreground hover:bg-accent";

function Campo({
  etiqueta,
  ayuda,
  ancho,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-foreground">{etiqueta}</label>
      {children}
      {ayuda && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
