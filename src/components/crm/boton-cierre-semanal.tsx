"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck, FileDown, Loader2 } from "lucide-react";
import { guardarDeclaracionSemana, leerDeclaracionSemana } from "@/lib/acciones/cierre-semanal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * El cierre de la semana: primero se declara, después sale el documento.
 *
 * Hasta el 05-09 este botón abría el PDF de una: lo proyectado contra lo
 * vendido. Carlos pidió el 02-09 —y lo volvió a pedir el 05-09— que antes se
 * respondan dos preguntas, y que sean obligatorias:
 *
 *   «Que tenga un campo obligatorio para que redactes cuál es tu plan para la
 *    siguiente semana. No me hables de que vas a llamar a 10 clientes el
 *    lunes, porque ya está mapeado, está el calendario semanal. No me hables
 *    de cuánto vas a vender, porque también ya sale automático. Háblame de
 *    QUÉ ES LO QUE VAS A HACER TÚ PARA MEJORAR EN TUS VENTAS.»
 *
 *   «Y la pregunta del millón: ¿qué necesitas? ¿Una computadora? ¿Está lenta?
 *    Ok, tu computadora. ¿Qué necesitas? Necesito capacitación. ¿En qué?»
 *
 * EL PDF SE ABRE CON UN SEGUNDO CLIC, a propósito. El navegador bloquea las
 * pestañas que no nacen de un gesto directo, y acá entre medio hay un guardado
 * que espera al servidor. Así que se guarda, y recién entonces aparece el
 * enlace al documento: dos clics, ninguno bloqueado.
 */
export function BotonCierreSemanal({
  semana,
  comercialId,
  etiqueta = "Cierre de la semana",
  compacto = false,
}: {
  /** Lunes de la semana (YYYY-MM-DD). Sin esto, el servidor toma la actual. */
  semana?: string;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [compromiso, setCompromiso] = useState("");
  const [necesidades, setNecesidades] = useState("");
  const [sinNecesidades, setSinNecesidades] = useState(false);
  const [listo, setListo] = useState(false);
  const [guardando, empezar] = useTransition();

  // LA HORA DEL CIERRE. Carlos, 02-09: «sábado, solamente para sábado, cierre
  // semanal (…) 11.55 aparece cierre semanal: ejecutar su cierre semanal».
  //
  // A esa hora el botón deja de ser un botón más y se planta: granate, en
  // grande y con el texto que él dictó. El resto de la semana sigue existiendo
  // discreto, porque gerencia revisa cierres de semanas pasadas y nadie debe
  // quedarse sin poder abrir el suyo — pero la llamada a la acción aparece
  // cuando él dijo.
  const [esLaHora, setEsLaHora] = useState(false);
  useEffect(() => {
    // En el servidor no se sabe la hora del usuario y pintar una cosa distinta
    // rompería la hidratación: se decide en el navegador, después de montar.
    function revisar() {
      const lima = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      const sabado = lima.getDay() === 6;
      const minutos = lima.getHours() * 60 + lima.getMinutes();
      setEsLaHora(sabado && minutos >= 11 * 60 + 55);
    }
    revisar();
    const t = setInterval(revisar, 30_000);
    return () => clearInterval(t);
  }, []);

  // Gerencia mirando el cierre de otro no declara nada: solo lee el documento.
  const ajeno = Boolean(comercialId);
  const enlacePdf = `/api/reportes/semanal${(() => {
    const p = new URLSearchParams();
    if (semana) p.set("semana", semana);
    if (comercialId) p.set("comercial", comercialId);
    const s = p.toString();
    return s ? `?${s}` : "";
  })()}`;

  async function abrir() {
    if (ajeno) {
      window.open(enlacePdf, "_blank", "noopener");
      return;
    }
    setAbierto(true);
    setCargando(true);
    try {
      const previa = await leerDeclaracionSemana(semana ?? lunesDeHoy());
      if (previa) {
        setCompromiso(previa.compromiso);
        setNecesidades(previa.necesidades);
        setSinNecesidades(previa.sinNecesidades);
        setListo(true); // ya declaró: puede bajar el documento cuando quiera
      }
    } finally {
      setCargando(false);
    }
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarDeclaracionSemana({
        lunes: semana ?? lunesDeHoy(),
        compromiso,
        necesidades,
        sinNecesidades,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setListo(true);
      toast.success("Cierre declarado. Ya puede bajar el documento.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg font-semibold transition-colors",
          esLaHora && !ajeno
            ? "animate-pulse border-2 border-primary bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 hover:animate-none"
            : cn(
                "border border-border bg-background text-foreground hover:bg-accent",
                compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              ),
        )}
        title="Cerrar la semana: en qué se compromete, qué necesita, y el documento con lo proyectado contra lo vendido"
      >
        <CalendarCheck className={esLaHora && !ajeno ? "size-4" : compacto ? "size-3" : "size-3.5"} />{" "}
        {esLaHora && !ajeno ? "Ejecutar su cierre semanal" : etiqueta}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar la semana</DialogTitle>
            <DialogDescription>
              Los números ya salen solos. Lo que falta son dos respuestas suyas, y con eso gerencia trabaja el lunes.
            </DialogDescription>
          </DialogHeader>

          {cargando ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Buscando si ya la declaró…
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="compromiso" className="mb-1 block text-sm font-semibold text-foreground">
                  ¿Qué va a hacer usted para mejorar sus ventas?
                </label>
                <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
                  No hace falta que escriba a cuántos va a llamar ni cuánto va a vender: eso ya sale de su agenda y de
                  sus potenciales. Escriba lo que va a hacer distinto.
                </p>
                <textarea
                  id="compromiso"
                  rows={3}
                  value={compromiso}
                  onChange={(e) => setCompromiso(e.target.value)}
                  placeholder="ej. Voy a retomar los seis clientes de Arequipa que cotizaron y no respondieron, con visita en vez de llamada."
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div>
                <label htmlFor="necesidades" className="mb-1 block text-sm font-semibold text-foreground">
                  ¿Qué necesita para lograrlo?
                </label>
                <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
                  Equipo, capacitación, material, una ficha técnica, un precio. Es lo que gerencia resuelve el lunes.
                </p>
                <textarea
                  id="necesidades"
                  rows={2}
                  value={necesidades}
                  disabled={sinNecesidades}
                  onChange={(e) => setNecesidades(e.target.value)}
                  placeholder="ej. Capacitación en la secadora a gas; la laptop está lenta para el cotizador."
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                />
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={sinNecesidades}
                    onChange={(e) => {
                      setSinNecesidades(e.target.checked);
                      if (e.target.checked) setNecesidades("");
                    }}
                    className="size-3.5 accent-[var(--primary)]"
                  />
                  Esta semana no necesito nada
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                >
                  {guardando ? "Guardando…" : listo ? "Guardar los cambios" : "Declarar el cierre"}
                </button>
                {listo && (
                  <a
                    href={enlacePdf}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
                  >
                    <FileDown className="size-3.5" /> Bajar el documento
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** El lunes de la semana en curso, en hora de Lima. */
function lunesDeHoy(): string {
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const dia = hoy.getDay(); // 0 domingo
  hoy.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}
