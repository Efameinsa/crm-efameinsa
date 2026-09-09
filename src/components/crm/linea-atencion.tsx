"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  Copy,
  ShieldCheck,
  ShieldOff,
  Wrench,
  CalendarClock,
  Inbox,
  ScanLine,
  Stethoscope,
  ClipboardCheck,
  PackageCheck,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import {
  PASOS_VISIBLES,
  ETIQUETA_ETAPA,
  AYUDA_ETAPA,
  ETIQUETA_CLASIFICACION,
  COLOR_CLASIFICACION,
  SE_COBRA,
  pasoDe,
  siguienteEtapa,
  type Atencion,
  type ClasificacionAtencion,
  type EtapaAtencion,
} from "@/lib/atenciones";
import { FicharMaquina } from "@/components/crm/fichar-maquina";
import {
  avanzarAtencion,
  avisarVentaDeLaAtencion,
  cerrarAtencion,
  diagnosticar,
  programarAtencion,
  registrarPruebas,
  registrarTrabajo,
  seguirSinIdentificarEquipo,
  verificarGarantia,
} from "@/lib/acciones/atenciones";
import { textoDerivacion } from "@/lib/acciones/casos";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { SelectorHora } from "@/components/crm/selector-hora";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaLima } from "@/lib/fechas";

/**
 * La atención, de punta a punta, en una sola pantalla.
 *
 * LA IDEA DE DISEÑO. El ingeniero dictó nueve etapas y su primera reacción al
 * ver una lista larga de pasos, en otra pantalla, fue «uf, son bastantes
 * etapas». Así que las nueve están, porque son las suyas, pero NO como nueve
 * formularios: se ven como una tira arriba —dónde estoy, cuánto falta— y abajo
 * hay UNA sola caja, la del paso que toca ahora. Nunca hay dos cosas que
 * decidir al mismo tiempo.
 *
 * Lo que ya pasó queda arriba en gris con su fecha; lo que falta, apagado. Es
 * el mismo criterio del pedido de postventa: la pregunta no es «en qué estado
 * está» sino «qué tengo que hacer yo ahora».
 */
/** Una frase por estado, sin ambigüedad. Los calcula la base (0187). */
const ETIQUETA_PREVENTIVO: Record<string, string> = {
  nunca: "NUNCA hizo preventivo — recomendárselo",
  vencido: "Preventivo VENCIDO — hay algo que ofrecerle",
  al_dia: "Preventivo al día",
  sin_plan: "Sin próximo preventivo agendado",
};

/**
 * Qué dibujo lleva cada casilla. Santos, 09-09: «pon imágenes con animación y
 * abajo el concepto». El ícono se reconoce de un vistazo —una bandeja, una
 * lupa de diagnóstico, una llave— y el nombre queda debajo para el que recién
 * aprende el circuito.
 */
const DIBUJO: Record<(typeof PASOS_VISIBLES)[number]["icono"], LucideIcon> = {
  inbox: Inbox,
  serie: ScanLine,
  diagnostico: Stethoscope,
  agenda: CalendarClock,
  trabajo: Wrench,
  firma: ClipboardCheck,
  cierre: PackageCheck,
  seguimiento: PhoneCall,
};

export function LineaAtencion({
  atencion,
  garantia,
  cliente,
  hayMaquinas = false,
  puedeCotizar = false,
  tecnicos = [],
}: {
  atencion: Atencion;
  /** Si esta persona puede cotizar la pista del caso. Lo decide la página:
   *  la cotización la hace quien tiene la cuenta (cfd867e, 07-09). */
  puedeCotizar?: boolean;
  /** Para armar la orden del almacén. */
  cliente: string;
  /** Si el cliente tiene máquinas para elegir en el panel de la derecha. Sin
   *  esto el Paso 1 mandaba a elegir de una lista vacía (0181). */
  hayMaquinas?: boolean;
  /** Los técnicos que ya firmaron informes o visitas: se sugieren al agendar
   *  para que la misma persona no quede escrita de tres formas distintas. */
  tecnicos?: string[];
  /** Lo que sabe el parque instalado del equipo, si está identificado. */
  garantia: {
    en_garantia: boolean;
    garantia_hasta: string | null;
    hizo_preventivo: boolean;
    ultimo_mantenimiento: string | null;
    /** Lo calcula la base (0187): nunca | vencido | al_dia | sin_plan. */
    preventivo_estado?: string | null;
    proximo_mantenimiento?: string | null;
    serie: string | null;
  } | null;
}) {
  const a = atencion;
  const router = useRouter();
  const [enviando, empezar] = useTransition();
  const paso = pasoDe(a.etapa);
  const sigue = siguienteEtapa(a.etapa);

  /**
   * Hasta dónde llega el riel verde, de 0 a 1. Se mide en CASILLAS de la tira
   * —no en etapas de la base— porque «Pruebas y conformidad» son dos etapas en
   * una sola casilla: contarlas por separado dejaría el riel corto justo en el
   * tramo final, que es donde más se mira.
   */
  const casillasHechas = PASOS_VISIBLES.filter((p) => pasoDe(p.clave) <= paso).length;
  const avanceDeLaPista =
    PASOS_VISIBLES.length > 1 ? Math.max(0, casillasHechas - 1) / (PASOS_VISIBLES.length - 1) : 0;
  // La tira es NAVEGABLE (Santos, 01-09: «ponlo como tabs… ni se puede
  // retroceder a un estadio anterior»): tocar una etapa hecha muestra su acta
  // —qué se registró y cuándo—, y una futura, qué se hará ahí. Retroceder es
  // REVISAR, nunca deshacer: cada sello tiene fecha y autor. null = la actual.
  const [vista, setVista] = useState<string | null>(null);
  const etapaVista = vista ?? a.etapa;

  const correr = (fn: () => Promise<{ error: string | null }>, exito: string) =>
    empezar(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(exito);
      router.refresh();
    });

  const sellos: Record<string, string | null> = {
    solicitud: a.solicitado_at,
    registro: a.registrado_at,
    diagnostico: a.diagnosticado_at,
    planificacion: a.programada_at,
    atencion: a.atendido_at,
    pruebas: a.pruebas_at,
    conformidad: a.conformidad_at,
    cierre: a.cerrado_at,
    seguimiento: a.seguimiento_at,
  };

  return (
    <div className="space-y-4">
      {/* ── La tira de los pasos que existen de verdad ────────────────── */}
      {/* «Parece muy plano» (Santos, 09-09). El riel que se llena hasta donde
          llegó el caso deja ver el avance sin leer una sola fecha; los pasos
          entran escalonados, y solo el que toca hacer sigue respirando. Los
          estilos y el porqué de lo sutil están en globals.css. */}
      {/* El contenedor lleva aire propio: la medalla que respira pinta su halo
          FUERA del círculo, y sin este relleno el `overflow` se lo comía —era
          el «círculo que palpita y no se ve completo» (Santos, 09-09). */}
      <div className="overflow-x-auto px-1 pb-1 pt-2">
        <ol
          className="pista-atencion flex min-w-[48rem] items-start gap-1"
          style={{ "--avance": avanceDeLaPista } as CSSProperties}
        >
          {PASOS_VISIBLES.map((p, turno) => {
            const e = p.clave;
            const i = pasoDe(e);
            // LA BARRA Y EL PANEL IBAN DESFASADOS. `a.etapa` es la última
            // etapa HECHA —su sello ya tiene fecha—, así que marcarla como
            // «actual» hacía que la barra dijera «Registro» mientras el panel
            // pedía «Paso 2 · Diagnóstico». Las dos decían verdad y se
            // contradecían en pantalla (informe de UX del 08-09).
            //
            // Ahora la etapa alcanzada se pinta como hecha y el pulso va sobre
            // la que el panel está pidiendo. Con el caso cerrado no pulsa
            // ninguna: no hay nada que pedir.
            const hecha = i <= paso;
            // Un paso que cubre dos etapas late si el panel está pidiendo
            // cualquiera de las dos, y muestra el sello de la última que se
            // haya cumplido: la firma del cliente es la fecha que importa.
            const actual = !a.cerrado_at && sigue !== null && p.cubre.includes(sigue);
            const sello = p.cubre.map((c) => sellos[c]).filter(Boolean).pop() ?? null;
            const seleccionada = p.cubre.includes(etapaVista as EtapaAtencion);
            const Dibujo = DIBUJO[p.icono];
            return (
              <li
                key={e}
                className="paso-atencion flex-1"
                style={{ "--turno": turno } as CSSProperties}
              >
                {/* Cada etapa es una PESTAÑA: el dibujo arriba, el nombre y la
                    fecha debajo. La que toca hacer respira con un halo que
                    sale del propio círculo —no un puntito en la esquina, que
                    se cortaba— y la que se está mirando lleva el anillo. */}
                <button
                  type="button"
                  onClick={() => setVista(e === a.etapa ? null : e)}
                  title={p.cubre.map((c) => AYUDA_ETAPA[c]).join(" ")}
                  className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-md px-1 pb-1 text-center transition-colors hover:bg-accent/50"
                >
                  <span data-actual={actual} className="halo-atencion relative flex flex-none rounded-full">
                    <span
                      data-actual={actual}
                      className={cn(
                        // El fondo va OPACO a propósito. Con el verde
                        // translúcido el riel se veía POR DENTRO del círculo y
                        // parecía que la línea entraba hasta el dibujo (Santos,
                        // 09-09); ahora el tinte va encima, en su propia capa,
                        // y la línea solo se ve de centro a centro.
                        "medalla-atencion relative flex size-11 flex-none items-center justify-center overflow-hidden rounded-full border-2 bg-background",
                        actual && "border-primary text-primary",
                        hecha && "border-[#1E7F4F] text-[#1E7F4F]",
                        !actual && !hecha && "border-dashed border-border text-muted-foreground/45",
                        seleccionada && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                      )}
                    >
                      {hecha && <span className="absolute inset-0 bg-[#1E7F4F]/10" aria-hidden />}
                      <Dibujo className="relative size-5" strokeWidth={2} aria-hidden />
                    </span>
                    {/* La palomita va FUERA del círculo: el círculo recorta lo
                        que lleva dentro para tapar el riel. */}
                    {hecha && (
                      <span className="absolute -bottom-0.5 -right-0.5 z-10 flex size-4 items-center justify-center rounded-full border-2 border-background bg-[#1E7F4F] text-white">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    )}
                  </span>
                  {/* Dos renglones reservados aunque el nombre entre en uno:
                      así las fechas de las ocho casillas quedan a la misma
                      altura y la tira se lee como una fila, no como escalera. */}
                  <span
                    className={cn(
                      "flex min-h-7 items-start justify-center text-[11px] font-bold leading-tight",
                      actual && "text-primary",
                      hecha && "text-[#1E7F4F]",
                      !actual && !hecha && "text-muted-foreground/60",
                    )}
                  >
                    {p.etiqueta}
                  </span>
                  <span className="text-[10px] tabular-nums leading-none text-muted-foreground">
                    {sello ? new Date(sello).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" }) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Lo que el parque instalado ya sabe ────────────────────────── */}
      {garantia && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2.5 text-xs">
          <span className="font-mono font-semibold text-foreground">{garantia.serie}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              garantia.en_garantia ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
            )}
          >
            {garantia.en_garantia ? <ShieldCheck className="size-3" /> : <ShieldOff className="size-3" />}
            {/* «Fuera de garantía», igual que en Equipos instalados: eran dos
                etiquetas para el mismo estado en dos pantallas (UX, 08-09). Y
                la fecha en formato de Lima, no en el crudo de la base. */}
            {garantia.en_garantia ? "En garantía" : "Fuera de garantía"}
            {garantia.garantia_hasta && ` · hasta ${fechaLima(garantia.garantia_hasta)}`}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              garantia.preventivo_estado === "al_dia"
                ? "bg-primary/10 text-primary"
                : "bg-amber-500/10 text-amber-700",
            )}
          >
            <Wrench className="size-3" />
            {/* DECÍA «AL DÍA» LO QUE NO LO ESTABA. El dato que se miraba,
                `hizo_preventivo`, significa «alguna vez le hicieron uno»: una
                máquina atendida en 2024 salía «Preventivo al día · 2024-09-06».
                Justo al revés de lo que el área necesita ver, porque un
                preventivo vencido es una venta que hay que ofrecer. El estado
                lo calcula ahora la base (0187): de 314 máquinas, 132 están
                vencidas y solo 18 al día. */}
            {ETIQUETA_PREVENTIVO[String(garantia.preventivo_estado ?? "nunca")] ?? "Preventivo — sin datos"}
            {garantia.preventivo_estado === "vencido" && garantia.proximo_mantenimiento
              ? ` · vencía el ${fechaLima(garantia.proximo_mantenimiento)}`
              : garantia.preventivo_estado === "al_dia" && garantia.proximo_mantenimiento
                ? ` · próximo ${fechaLima(garantia.proximo_mantenimiento)}`
                : garantia.preventivo_estado === "sin_plan" && garantia.ultimo_mantenimiento
                  ? ` · el último fue el ${fechaLima(garantia.ultimo_mantenimiento)}`
                  : ""}
          </span>
          {a.clasificacion && (
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", COLOR_CLASIFICACION[a.clasificacion])}>
              {ETIQUETA_CLASIFICACION[a.clasificacion]} · {SE_COBRA[a.clasificacion] ? "se cobra" : "no se cobra"}
            </span>
          )}
        </div>
      )}

      {/* LO AGENDADO, A LA VISTA. Se programaba la visita —día, hora y
          técnico— y el panel pasaba a «Siguiente paso · Atención» sin decir
          para cuándo ni con quién: había que volver a la etapa Planificación
          para recordarlo (informe de UX del 08-09). Va fuera de la franja de
          la máquina porque una visita se agenda aunque nadie haya identificado
          todavía el equipo. */}
      {a.programada_at && !a.cerrado_at && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">
            <CalendarClock className="size-3" />
            Agendado el {fechaLima(a.programada_at)}
            {!/T00:00/.test(String(a.programada_at)) && ` · ${new Date(a.programada_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}`}
            {a.tecnico && ` · ${a.tecnico}`}
          </span>
          <button
            type="button"
            onClick={() => setVista("planificacion")}
            className="font-medium text-primary hover:underline"
          >
            Reprogramar
          </button>
        </div>
      )}

      {/* ── La caja: la etapa seleccionada, o el paso que toca ────────── */}
      {etapaVista !== a.etapa ? (
        <ActaEtapa
          etapa={etapaVista}
          atencion={a}
          hecha={pasoDe(etapaVista as Atencion["etapa"]) < paso}
          sello={sellos[etapaVista] ?? null}
          onVolver={() => setVista(null)}
        />
      ) : a.etapa === "solicitud" ? (
        <Caja titulo="Esperando a Central">
          <p className="text-sm text-muted-foreground">
            Está registrada y derivada. Central decide si la atiende el área o un comercial; cuando la
            devuelva, aparece acá para tomarla.
          </p>
        </Caja>
      ) : a.etapa === "registro" ? (
        <PasoRegistro atencion={a} garantia={garantia} hayMaquinas={hayMaquinas} enviando={enviando} correr={correr} />
      ) : a.etapa === "diagnostico" ? (
        <PasoPlanificar
          atencion={a}
          cliente={cliente}
          serie={garantia?.serie ?? null}
          tecnicos={tecnicos}
          enviando={enviando}
          correr={correr}
        />
      ) : a.etapa === "atencion" ? (
        <PasoTrabajo atencion={a} puedeCotizar={puedeCotizar} enviando={enviando} correr={correr} />
      ) : a.etapa === "pruebas" ? (
        <PasoPruebas atencion={a} enviando={enviando} correr={correr} />
      ) : a.etapa === "conformidad" ? (
        <PasoCerrar atencion={a} enviando={enviando} correr={correr} />
      ) : a.etapa === "cierre" || a.etapa === "seguimiento" ? (
        <Caja titulo={a.etapa === "cierre" ? "Cerrada" : "En seguimiento"}>
          <p className="text-sm text-foreground">{a.motivo_cierre ?? "Sin nota de cierre."}</p>
          {a.etapa === "cierre" && sigue && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={enviando}
              onClick={() => correr(() => avanzarAtencion({ atencionId: a.id, hasta: "seguimiento" }), "Pasó a seguimiento.")}
            >
              Pasar a seguimiento
            </Button>
          )}
        </Caja>
      ) : (
        sigue && (
          <PasoSimple
            atencion={a}
            siguiente={sigue}
            enviando={enviando}
            correr={correr}
          />
        )
      )}

      {/* CERRAR SIN RECORRER LAS NUEVE ETAPAS (0181). Hasta hoy el cierre solo
          se ofrecía al final del circuito, y lo que se atendió por teléfono, o
          no procedía, o se resolvió fuera del sistema, no tenía dónde
          terminar: quedaba «pendiente por atender» para siempre. Es la queja
          textual de postventa el 07-09 —«por más que ya ha sido atendido»— y
          la razón de que hubiera 18 atenciones vivas y ninguna cerrada.

          Va abajo y en gris a propósito: el camino normal sigue siendo el
          circuito; esto es la salida para lo que ya terminó en la realidad. */}
      {etapaVista === a.etapa && a.etapa !== "cierre" && a.etapa !== "seguimiento" && a.etapa !== "conformidad" && (
        <CerrarAntesDeTiempo atencion={a} enviando={enviando} correr={correr} />
      )}
    </div>
  );
}

/**
 * Cerrar una atención en cualquier punto del circuito (0181).
 *
 * Detrás de un clic para que no compita con el paso que toca, pero siempre
 * alcanzable: una llamada que se resolvió hablando no tiene por qué pasar por
 * planificación, atención, pruebas y conformidad para poder darse por
 * terminada.
 */
function CerrarAntesDeTiempo({
  atencion: a,
  enviando,
  correr,
}: {
  atencion: Atencion;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<"resuelto" | "no_procede" | "derivado">("resuelto");
  const [motivo, setMotivo] = useState("");
  // Por qué se cierra sin facturar. Solo cuenta si el caso se cobra y no hay
  // cotización; el servidor decide si hace falta (0189).
  const [noFacturado, setNoFacturado] = useState("");
  const OPCIONES = { resuelto: "Resuelto", no_procede: "No procede", derivado: "Derivado" } as const;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Esta atención ya terminó — cerrarla acá
      </button>
    );
  }

  return (
    <Caja titulo="Cerrar la atención">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Para lo que se resolvió por teléfono, no procedía, o se atendió fuera del sistema. Queda cerrada con la
          fecha de hoy y lo que escriba acá.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(OPCIONES) as (keyof typeof OPCIONES)[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResultado(r)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                resultado === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {OPCIONES[r]}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="En qué quedó. Es lo que se va a leer cuando el cliente vuelva a llamar."
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        {/* El mismo candado del otro formulario de cierre: un caso que se cobra
            no se cierra en silencio (0189). */}
        {a.clasificacion && SE_COBRA[a.clasificacion] && (
          <div className="rounded-md border border-amber-400/50 bg-amber-500/5 p-2.5">
            <p className="text-xs font-semibold text-amber-800">Este caso se cobra</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Si ya lo cotizó, cierre sin más. Si se cierra sin facturar, diga por qué.
            </p>
            <textarea
              rows={2}
              value={noFacturado}
              onChange={(e) => setNoFacturado(e.target.value)}
              placeholder="Por qué no se factura"
              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={enviando || motivo.trim().length < 10}
            onClick={() =>
              correr(() => cerrarAtencion({ atencionId: a.id, resultado, motivo, noFacturado }), "Atención cerrada.")
            }
          >
            Cerrar la atención
          </Button>
          <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </Caja>
  );
}

function Caja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * El ACTA de una etapa que no es la actual: qué quedó registrado (si ya pasó)
 * o qué se hará ahí (si todavía no llega). Solo lectura — el trabajo vive en
 * el paso actual, y lo hecho no se deshace: tiene fecha y autor.
 */
function ActaEtapa({
  etapa,
  atencion: a,
  hecha,
  sello,
  onVolver,
}: {
  etapa: string;
  atencion: Atencion;
  hecha: boolean;
  sello: string | null;
  onVolver: () => void;
}) {
  const etiqueta = ETIQUETA_ETAPA[etapa as keyof typeof ETIQUETA_ETAPA] ?? etapa;

  // Lo que cada etapa dejó escrito, cuando lo dejó.
  const lineas: { titulo: string; valor: string }[] = [];
  if (hecha) {
    if (sello) {
      lineas.push({
        titulo: "Cuándo",
        valor: new Date(sello).toLocaleString("es-PE", {
          timeZone: "America/Lima",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
    if (etapa === "registro" && a.en_garantia !== null) {
      lineas.push({ titulo: "Garantía", valor: a.en_garantia ? "En garantía" : "Sin garantía" });
    }
    // La garantía que no se pudo verificar también es un dato del acta: sin
    // esto, la etapa se leía como si nadie la hubiera mirado (0181).
    if (etapa === "registro" && a.en_garantia === null && a.garantia_omitida_at) {
      lineas.push({
        titulo: "Garantía",
        valor: `Sin verificar — no se identificó la máquina${a.garantia_omitida_motivo ? `: ${a.garantia_omitida_motivo}` : ""}`,
      });
    }
    if (etapa === "diagnostico" && a.clasificacion) {
      lineas.push({
        titulo: "Clasificación",
        valor: `${ETIQUETA_CLASIFICACION[a.clasificacion]} · ${SE_COBRA[a.clasificacion] ? "se cobra" : "no se cobra"}`,
      });
    }
    if (etapa === "planificacion" && a.tecnico) lineas.push({ titulo: "Técnico", valor: a.tecnico });
    // Lo que la visita dejó escrito (0182): antes estas dos etapas eran un
    // sello con fecha y nada más.
    if (etapa === "atencion") {
      if (a.trabajo_realizado) lineas.push({ titulo: "Qué se hizo", valor: a.trabajo_realizado });
      if (a.repuestos_usados) lineas.push({ titulo: "Repuestos", valor: a.repuestos_usados });
      if (a.ciclos != null) lineas.push({ titulo: "Ciclos", valor: a.ciclos.toLocaleString("es-PE") });
    }
    if (etapa === "pruebas") {
      if (a.pruebas_detalle) lineas.push({ titulo: "Qué se probó", valor: a.pruebas_detalle });
      if (a.pruebas_conforme != null) {
        lineas.push({ titulo: "Resultado", valor: a.pruebas_conforme ? "Operativa" : "Quedó pendiente" });
      }
    }
    if (etapa === "conformidad" && a.conformidad_nombre) {
      lineas.push({ titulo: "Dio conformidad", valor: a.conformidad_nombre });
    }
    if (etapa === "cierre") {
      if (a.resultado) lineas.push({ titulo: "Resultado", valor: a.resultado });
      if (a.motivo_cierre) lineas.push({ titulo: "En qué quedó", valor: a.motivo_cierre });
    }
  }

  return (
    <Caja titulo={hecha ? `Acta · ${etiqueta}` : `Todavía no llega acá · ${etiqueta}`}>
      {hecha ? (
        lineas.length > 0 ? (
          <dl className="space-y-1.5">
            {lineas.map((l) => (
              <div key={l.titulo} className="flex gap-2 text-sm">
                <dt className="w-28 flex-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {l.titulo}
                </dt>
                <dd className="min-w-0 text-foreground">{l.valor}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Esta etapa se marcó sin datos adicionales.</p>
        )
      ) : (
        <p className="max-w-prose text-sm text-muted-foreground">
          {AYUDA_ETAPA[etapa as keyof typeof AYUDA_ETAPA] ?? "Se habilita al completar los pasos anteriores."}{" "}
          Se habilita cuando la atención llegue a este punto.
        </p>
      )}
      <Button size="sm" variant="outline" className="mt-3" onClick={onVolver}>
        Volver al paso actual
      </Button>
    </Caja>
  );
}

/** Registro: verificar la garantía y diagnosticar. Los dos condicionales. */
function PasoRegistro({
  atencion: a,
  garantia,
  hayMaquinas,
  enviando,
  correr,
}: {
  atencion: Atencion;
  garantia: { en_garantia: boolean; hizo_preventivo: boolean } | null;
  hayMaquinas: boolean;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [clasificacion, setClasificacion] = useState<ClasificacionAtencion | "">(
    garantia?.en_garantia ? "garantia" : "",
  );
  const [detalle, setDetalle] = useState("");

  if (a.en_garantia === null && !a.garantia_omitida_at) {
    // Sin máquina vinculada, el botón de verificar solo podía fallar («primero
    // identifique el equipo»). Santos lo marcó el 01-09: el clic que vincula
    // la máquina —el panel de la derecha— YA verifica la garantía, así que acá
    // no va un botón redundante sino la seña de dónde está el clic.
    if (!a.equipo_id) {
      // …salvo que no haya ninguna máquina que elegir. Ese caso no se había
      // previsto y dejaba la pantalla SIN NINGÚN BOTÓN: ni verificar, ni
      // seguir, ni cerrar. Lesly lo reportó el 07-09 —«esta parte no permite
      // registrar nada»— con 16 atenciones detenidas, la más vieja de 7 días.
      // Las dos salidas de acá abajo son las que faltaban.
      if (!hayMaquinas) {
        return (
          <Caja titulo="Paso 1 · Verificar la garantía">
            <p className="mb-3 text-sm text-muted-foreground">
              Este cliente no tiene ninguna máquina registrada, así que no hay nada que elegir a la derecha.
              Fíchela acá con lo que diga el cliente por teléfono —la serie se completa después— o siga sin
              identificarla si por ahora no hay forma de saberlo.
            </p>
            <FicharMaquina atencionId={a.id} />
            <div className="mt-4 border-t border-border pt-3">
              <SeguirSinIdentificar atencionId={a.id} enviando={enviando} correr={correr} />
            </div>
          </Caja>
        );
      }
      return (
        <Caja titulo="Paso 1 · Verificar la garantía">
          <p className="mb-3 text-sm text-muted-foreground">
            La garantía se verifica sobre la máquina. Elíjala en{" "}
            <b className="text-foreground">«¿De qué máquina habla el cliente?»</b> (a la derecha, contrastando con
            la foto de la placa): ese clic la vincula y deja la garantía verificada al instante.
          </p>
          <SeguirSinIdentificar atencionId={a.id} enviando={enviando} correr={correr} />
        </Caja>
      );
    }
    return (
      <Caja titulo="Paso 1 · Verificar la garantía">
        <p className="mb-3 text-sm text-muted-foreground">
          Lo primero que se verifica, antes de terminar de escuchar el problema: si está en garantía y si el
          cliente viene haciendo su mantenimiento preventivo. Sale del parque instalado, no hay que preguntarlo.
        </p>
        <Button size="sm" disabled={enviando} onClick={() => correr(() => verificarGarantia(a.id), "Garantía verificada.")}>
          Verificar la garantía de este equipo
        </Button>
      </Caja>
    );
  }

  return (
    <Caja titulo="Paso 2 · Diagnóstico: qué le pasa y quién paga">
      <div className="space-y-3">
        {/* Si se siguió sin identificar la máquina, se dice acá: clasificar
            «garantía» a ciegas es justo lo que no se puede hacer (0181). */}
        {a.garantia_omitida_at && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800">
            <b>La garantía quedó sin verificar</b> porque no se identificó la máquina
            {a.garantia_omitida_motivo ? <>: «{a.garantia_omitida_motivo}»</> : "."} Antes de decir quién paga,
            conviene volver a pedirle al cliente la foto de la placa.
          </p>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">Clasificación</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ETIQUETA_CLASIFICACION) as ClasificacionAtencion[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClasificacion(c)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  clasificacion === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {ETIQUETA_CLASIFICACION[c]}
                <span className="ml-1 font-normal opacity-70">{SE_COBRA[c] ? "· se cobra" : "· no se cobra"}</span>
              </button>
            ))}
          </div>
          {garantia?.en_garantia && clasificacion !== "garantia" && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Ojo: el equipo está en garantía y está por clasificarlo como cobrable.
            </p>
          )}
        </div>
        <textarea
          rows={2}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Qué encontró: «la bomba de desagüe está trabada», «falta cambiar la válvula de entrada»"
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          size="sm"
          disabled={enviando || !clasificacion || detalle.trim().length < 5}
          onClick={() =>
            correr(
              () => diagnosticar({ atencionId: a.id, clasificacion: clasificacion as ClasificacionAtencion, detalle }),
              "Diagnóstico guardado.",
            )
          }
        >
          Guardar el diagnóstico <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </Caja>
  );
}

/** Planificación: día, hora y técnico. La vista que Lesly validó sin cambios. */
function PasoPlanificar({
  atencion: a,
  cliente,
  serie,
  tecnicos,
  enviando,
  correr,
}: {
  atencion: Atencion;
  cliente: string;
  serie: string | null;
  tecnicos: string[];
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [tecnico, setTecnico] = useState(a.tecnico ?? "");
  const [orden, setOrden] = useState<string | null>(null);

  return (
    <Caja titulo="Paso 3 · Planificación: cuándo y con quién">
      <p className="mb-3 text-sm text-muted-foreground">
        Esto entra al calendario del área y arma la orden para el almacén.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SelectorFecha valor={fecha || null} onCambiar={(f) => setFecha(f ?? "")} etiquetaVacia="Elegir el día" />
        <SelectorHora valor={hora || null} onCambiar={(h) => setHora(h ?? "")} />
        {/* SUGERENCIA, NO LISTA CERRADA. El CRM ya sabe quiénes son —firman
            los informes— y escribirlos a mano cada vez es cómo «Marco Aliaga»
            termina siendo tres personas distintas en los reportes. Pero el
            área contrata terceros para una visita puntual, así que se puede
            escribir un nombre nuevo y desde la próxima vez ya aparece solo. */}
        <input
          value={tecnico}
          onChange={(e) => setTecnico(e.target.value)}
          list={tecnicos.length > 0 ? "tecnicos-conocidos" : undefined}
          placeholder={tecnicos.length > 0 ? "Qué técnico va (escriba o elija)" : "Qué técnico va"}
          className="h-9 min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        {tecnicos.length > 0 && (
          <datalist id="tecnicos-conocidos">
            {tecnicos.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
        <Button
          size="sm"
          disabled={enviando || !fecha || !tecnico.trim()}
          onClick={() => {
            correr(
              () => programarAtencion({ atencionId: a.id, fecha, hora: hora || null, tecnico }),
              "Atención programada.",
            );
            // LA ORDEN PARA EL ALMACÉN, que Lesly describió el 31-08: «le estás
            // mandando una orden que vamos a derivar al técnico tal, en tal
            // hora». Hoy ese aviso viaja por WhatsApp y se escribe a mano, con
            // lo que eso se olvida. Se arma acá y se copia de un clic; el día
            // que almacén tenga su módulo, esto deja de ser texto.
            textoDerivacion({
              cliente,
              serie,
              equipo: a.equipo_texto,
              problema: a.detalle ?? "",
              codigoError: null,
              fecha,
              hora: hora || null,
            }).then(setOrden);
          }}
        >
          Programar
        </Button>
      </div>

      {orden && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-secondary/40 p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            La orden para el almacén
          </p>
          <pre className="max-w-prose whitespace-pre-wrap text-xs leading-relaxed text-foreground">{orden}</pre>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(orden).then(
                () => toast.success("Copiado. Péguelo en el WhatsApp del almacén."),
                () => toast.error("No se pudo copiar; selecciónelo a mano"),
              )
            }
          >
            <Copy className="size-3.5" /> Copiar la orden
          </Button>
        </div>
      )}
    </Caja>
  );
}

/** Los pasos que solo se marcan: atención, pruebas, conformidad. */
function PasoSimple({
  atencion: a,
  siguiente,
  enviando,
  correr,
}: {
  atencion: Atencion;
  siguiente: string;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [doc, setDoc] = useState("");
  const esConformidad = siguiente === "conformidad";
  return (
    <Caja titulo={`Siguiente paso · ${ETIQUETA_ETAPA[siguiente as keyof typeof ETIQUETA_ETAPA]}`}>
      <p className="mb-3 text-sm text-muted-foreground">
        {AYUDA_ETAPA[siguiente as keyof typeof AYUDA_ETAPA]}
      </p>
      {esConformidad && (
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Quién firma la conformidad"
            className="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            placeholder="DNI (opcional)"
            className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      )}
      <Button
        size="sm"
        disabled={enviando || (esConformidad && !nombre.trim())}
        onClick={() =>
          correr(
            () =>
              avanzarAtencion({
                atencionId: a.id,
                hasta: siguiente as Parameters<typeof avanzarAtencion>[0]["hasta"],
                conformidadNombre: esConformidad ? nombre : null,
                conformidadDoc: esConformidad ? doc : null,
              }),
            "Listo.",
          )
        }
      >
        Marcar «{ETIQUETA_ETAPA[siguiente as keyof typeof ETIQUETA_ETAPA]}» <ChevronRight className="size-3.5" />
      </Button>
    </Caja>
  );
}

/**
 * Etapa «atención»: qué hizo el técnico en el cliente (0182).
 *
 * Hasta hoy esta etapa era un botón: se marcaba «atendida» y no quedaba
 * escrito nada. Lo que el manual pide anotar en ese momento —el trabajo, el
 * repuesto usado y la lectura de ciclos— vivía en el WhatsApp del técnico.
 *
 * LOS CICLOS son «el kilometraje de la máquina» (Carlos, 27-08): un ciclo ≈
 * una hora de uso. Se piden acá porque es cuando el técnico está delante del
 * contador; pedirlos después es pedirlos de memoria. Al guardarlos suben solos
 * a la ficha de la máquina, que es donde se comparan con la lectura anterior.
 */
function PasoTrabajo({
  atencion: a,
  puedeCotizar,
  enviando,
  correr,
}: {
  atencion: Atencion;
  puedeCotizar?: boolean;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [trabajo, setTrabajo] = useState("");
  const [repuestos, setRepuestos] = useState("");
  const [ciclos, setCiclos] = useState("");

  return (
    <Caja titulo="Paso · Qué se hizo en el cliente">
      <div className="space-y-3">
        <textarea
          rows={3}
          value={trabajo}
          onChange={(e) => setTrabajo(e.target.value)}
          placeholder="«Se cambió la resistencia y se reguló el termostato; quedó calentando a 180°»"
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-foreground">
              Repuestos usados <span className="font-normal text-muted-foreground">— si hubo</span>
            </span>
            <input
              value={repuestos}
              onChange={(e) => setRepuestos(e.target.value)}
              placeholder="«Resistencia 3 kW, 1 unidad»"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-foreground">
              Ciclos <span className="font-normal text-muted-foreground">— lo que marca el contador</span>
            </span>
            <input
              type="number"
              min={0}
              value={ciclos}
              onChange={(e) => setCiclos(e.target.value)}
              placeholder="Ej.: 4820"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          La lectura de ciclos queda en la ficha de la máquina: es lo que después dice si un equipo de dos años se
          usó como uno de cinco.
        </p>
        <Button
          size="sm"
          disabled={enviando || trabajo.trim().length < 10}
          onClick={() =>
            correr(
              () =>
                registrarTrabajo({
                  atencionId: a.id,
                  trabajo,
                  repuestos: repuestos || null,
                  ciclos: ciclos.trim() === "" ? null : Number(ciclos),
                }),
              "Trabajo registrado. Ahora las pruebas.",
            )
          }
        >
          Guardar y pasar a pruebas <ChevronRight className="size-3.5" />
        </Button>
        <div className="border-t border-border pt-3">
          <AvisarQueHayVenta
            atencionId={a.id}
            oportunidadId={a.oportunidad_id}
            puedeCotizar={puedeCotizar}
            enviando={enviando}
            correr={correr}
          />
        </div>
      </div>
    </Caja>
  );
}

/**
 * Etapa «pruebas»: cómo respondió la máquina (0182).
 *
 * El desenlace decide de verdad: conforme sigue con la firma del cliente, no
 * conforme vuelve a planificación para programar otra visita. Antes las dos
 * cosas eran el mismo botón «marcar pruebas», y una máquina que quedó mal
 * avanzaba igual hasta pedirle al cliente que firmara su conformidad.
 */
function PasoPruebas({
  atencion: a,
  enviando,
  correr,
}: {
  atencion: Atencion;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [detalle, setDetalle] = useState("");
  const [conforme, setConforme] = useState(true);
  const [nombre, setNombre] = useState("");
  const [doc, setDoc] = useState("");

  return (
    <Caja titulo="Paso · Las pruebas">
      <div className="space-y-3">
        <textarea
          rows={2}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="«Ciclo completo de lavado y centrifugado, sin fugas ni ruido; temperatura estable»"
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap gap-1.5">
          {[
            { v: true, t: "La máquina quedó operativa" },
            { v: false, t: "Quedó pendiente — hay que volver" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => setConforme(o.v)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                conforme === o.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {o.t}
            </button>
          ))}
        </div>

        {conforme ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Quién firma la conformidad"
              className="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
            <input
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              placeholder="DNI (opcional)"
              className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
          </div>
        ) : (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800">
            La atención vuelve a <b>planificación</b> para programar otra visita. No se le pide al cliente que firme
            la conformidad de algo que no quedó bien.
          </p>
        )}

        <Button
          size="sm"
          disabled={enviando || detalle.trim().length < 10 || (conforme && !nombre.trim())}
          onClick={() =>
            correr(
              () =>
                registrarPruebas({
                  atencionId: a.id,
                  detalle,
                  conforme,
                  conformidadNombre: conforme ? nombre : null,
                  conformidadDoc: conforme ? doc : null,
                }),
              conforme ? "Pruebas conformes." : "Queda para volver: vuelve a planificación.",
            )
          }
        >
          {conforme ? "Guardar la conformidad" : "Guardar y reprogramar"} <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </Caja>
  );
}

/**
 * «Acá hay algo para vender» (0182 conecta lo que ya existía).
 *
 * La acción estaba escrita desde la 0131 —«el técnico le indica que hay un
 * repuesto por vender e inmediatamente me aparece a mí como postventa que hay
 * algo por vender»— pero nunca tuvo un botón, así que nadie podía usarla.
 *
 * No crea la oportunidad: avisa a Central, que es quien reparte (regla de
 * Lesly, 31-08). Lo que cambia respecto de un aviso suelto es que llega con el
 * equipo y lo que vio el técnico ya escritos.
 */
function AvisarQueHayVenta({
  atencionId,
  oportunidadId,
  puedeCotizar,
  enviando,
  correr,
}: {
  atencionId: string;
  /** Para cotizarlo acá mismo en vez de mandarlo a la cola de Central. */
  oportunidadId?: string | null;
  puedeCotizar?: boolean;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"solicitud_repuesto" | "solicitud_mantenimiento">("solicitud_repuesto");
  const [detalle, setDetalle] = useState("");

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* DOS SALIDAS, NO UNA. Antes lo único que se ofrecía era avisar a
            Central, y el informe de UX del 08-09 lo marcó: postventa está
            atendiendo al cliente y YA SABE qué máquina es, así que mandarlo a
            la cola de Central agrega un rebote donde debería haber una
            cotización. Un repuesto o un servicio se cotizan acá mismo; solo
            una máquina nueva justifica el rebote, porque esa la vende el
            comercial dueño de la cuenta. */}
        {puedeCotizar && oportunidadId && (
          <a
            href={`/comercial/oportunidades/${oportunidadId}/cotizar?caso=${atencionId}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Cotizarlo ahora
          </a>
        )}
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="cursor-pointer text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {puedeCotizar && oportunidadId
            ? "Es una máquina nueva — avisar a Central"
            : "El técnico vio algo para vender — avisar a Central"}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          { v: "solicitud_repuesto" as const, t: "Un repuesto" },
          { v: "solicitud_mantenimiento" as const, t: "Un mantenimiento" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setTipo(o.v)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              tipo === o.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o.t}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        placeholder="Qué vio y qué haría falta: «la bomba está al límite, conviene cambiarla antes de que pare la lavandería»"
        className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={enviando || detalle.trim().length < 10}
          onClick={() =>
            correr(
              () => avisarVentaDeLaAtencion({ atencionId, tipo, detalle }),
              "Avisado a Central: hay algo para vender.",
            )
          }
        >
          Avisar a Central
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Seguir sin identificar la máquina (0181).
 *
 * La segunda salida del Paso 1. No pone «sin garantía» —eso sería inventar un
 * dato que después nadie puede desmentir— sino que deja escrito que NO se sabe
 * y por qué. Cuando aparezca la placa, la máquina se ficha y la atención sigue
 * su curso con el dato bueno.
 *
 * Va detrás de un clic, no a la vista: la salida correcta sigue siendo
 * identificar la máquina, y esto es la excepción.
 */
function SeguirSinIdentificar({
  atencionId,
  enviando,
  correr,
}: {
  atencionId: string;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        No se puede identificar la máquina ahora — seguir igual
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        La atención sigue y queda escrito que la garantía no se verificó. Diga por qué, en una línea.
      </p>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="«El cliente no encuentra la placa», «lo compró por un tercero»"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={enviando || motivo.trim().length < 5}
          onClick={() =>
            correr(() => seguirSinIdentificarEquipo({ atencionId, motivo }), "Se sigue sin identificar la máquina.")
          }
        >
          Seguir sin identificarla <ChevronRight className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** El cierre: el estatus que el ingeniero dijo que faltaba. */
function PasoCerrar({
  atencion: a,
  enviando,
  correr,
}: {
  atencion: Atencion;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [resultado, setResultado] = useState<"resuelto" | "no_procede" | "derivado">("resuelto");
  const [motivo, setMotivo] = useState("");
  // Por qué se cierra sin facturar. Solo cuenta si el caso se cobra y no hay
  // cotización; el servidor decide si hace falta (0189).
  const [noFacturado, setNoFacturado] = useState("");
  const OPCIONES = {
    resuelto: "Resuelto",
    no_procede: "No procede",
    derivado: "Derivado",
  } as const;
  return (
    <Caja titulo="Paso final · Cerrar la atención">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(OPCIONES) as (keyof typeof OPCIONES)[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResultado(r)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                resultado === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {OPCIONES[r]}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="En qué quedó. Es lo que se va a leer cuando el cliente vuelva a llamar."
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        {/* ESTE CASO SE COBRA. El informe de UX del 08-09 recorrió las nueve
            etapas de un caso «se cobra» y lo cerró con la conformidad firmada
            sin que el sistema pidiera nunca una cotización: el área hace el
            trabajo, el cliente firma, y la venta se pierde sin que nadie se
            entere. El campo aparece cuando corresponde; el servidor exige la
            respuesta solo si además no hay ninguna cotización (0189). */}
        {a.clasificacion && SE_COBRA[a.clasificacion] && (
          <div className="rounded-md border border-amber-400/50 bg-amber-500/5 p-2.5">
            <p className="text-xs font-semibold text-amber-800">Este caso se cobra</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Si ya lo cotizó, cierre sin más. Si se cierra sin facturar, diga por qué: «lo cubrió la garantía»,
              «cortesía autorizada por gerencia», «el cliente desistió».
            </p>
            <textarea
              rows={2}
              value={noFacturado}
              onChange={(e) => setNoFacturado(e.target.value)}
              placeholder="Por qué no se factura"
              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <Button
          size="sm"
          disabled={enviando || motivo.trim().length < 10}
          onClick={() =>
            correr(() => cerrarAtencion({ atencionId: a.id, resultado, motivo, noFacturado }), "Atención cerrada.")
          }
        >
          Cerrar la atención
        </Button>
      </div>
    </Caja>
  );
}
