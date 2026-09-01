"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Copy, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
import {
  ETAPAS_ATENCION,
  ETIQUETA_ETAPA,
  AYUDA_ETAPA,
  ETIQUETA_CLASIFICACION,
  COLOR_CLASIFICACION,
  SE_COBRA,
  pasoDe,
  siguienteEtapa,
  type Atencion,
  type ClasificacionAtencion,
} from "@/lib/atenciones";
import {
  avanzarAtencion,
  cerrarAtencion,
  diagnosticar,
  programarAtencion,
  verificarGarantia,
} from "@/lib/acciones/atenciones";
import { textoDerivacion } from "@/lib/acciones/casos";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { SelectorHora } from "@/components/crm/selector-hora";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
export function LineaAtencion({
  atencion,
  garantia,
  cliente,
}: {
  atencion: Atencion;
  /** Para armar la orden del almacén. */
  cliente: string;
  /** Lo que sabe el parque instalado del equipo, si está identificado. */
  garantia: {
    en_garantia: boolean;
    garantia_hasta: string | null;
    hizo_preventivo: boolean;
    ultimo_mantenimiento: string | null;
    serie: string | null;
  } | null;
}) {
  const a = atencion;
  const router = useRouter();
  const [enviando, empezar] = useTransition();
  const paso = pasoDe(a.etapa);
  const sigue = siguienteEtapa(a.etapa);

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
      {/* ── La tira de las nueve etapas ───────────────────────────────── */}
      <div className="overflow-x-auto">
        <ol className="flex min-w-[54rem] items-stretch gap-1">
          {ETAPAS_ATENCION.map((e, i) => {
            const hecha = i < paso;
            const actual = i === paso;
            const sello = sellos[e];
            return (
              <li key={e} className="flex-1">
                <div
                  title={AYUDA_ETAPA[e]}
                  className={cn(
                    "h-full rounded-md border px-2 py-1.5 text-center transition-colors",
                    actual && "border-primary bg-primary/10",
                    hecha && "border-[#1E7F4F]/30 bg-[#1E7F4F]/5",
                    !actual && !hecha && "border-dashed border-border",
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center justify-center gap-1 text-[11px] font-bold leading-tight",
                      actual && "text-primary",
                      hecha && "text-[#1E7F4F]",
                      !actual && !hecha && "text-muted-foreground/60",
                    )}
                  >
                    {hecha && <Check className="size-3 flex-none" />}
                    {ETIQUETA_ETAPA[e]}
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {sello ? new Date(sello).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" }) : "—"}
                  </p>
                </div>
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
            {garantia.en_garantia ? "En garantía" : "Sin garantía"}
            {garantia.garantia_hasta && ` · hasta ${garantia.garantia_hasta}`}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              garantia.hizo_preventivo ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700",
            )}
          >
            <Wrench className="size-3" />
            {garantia.hizo_preventivo
              ? `Preventivo al día · ${garantia.ultimo_mantenimiento ?? ""}`
              : "NUNCA hizo preventivo — recomendárselo"}
          </span>
          {a.clasificacion && (
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", COLOR_CLASIFICACION[a.clasificacion])}>
              {ETIQUETA_CLASIFICACION[a.clasificacion]} · {SE_COBRA[a.clasificacion] ? "se cobra" : "no se cobra"}
            </span>
          )}
        </div>
      )}

      {/* ── La caja del paso que toca ─────────────────────────────────── */}
      {a.etapa === "solicitud" ? (
        <Caja titulo="Esperando a Central">
          <p className="text-sm text-muted-foreground">
            Está registrada y derivada. Central decide si la atiende el área o un comercial; cuando la
            devuelva, aparece acá para tomarla.
          </p>
        </Caja>
      ) : a.etapa === "registro" ? (
        <PasoRegistro atencion={a} garantia={garantia} enviando={enviando} correr={correr} />
      ) : a.etapa === "diagnostico" ? (
        <PasoPlanificar atencion={a} cliente={cliente} serie={garantia?.serie ?? null} enviando={enviando} correr={correr} />
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
    </div>
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

/** Registro: verificar la garantía y diagnosticar. Los dos condicionales. */
function PasoRegistro({
  atencion: a,
  garantia,
  enviando,
  correr,
}: {
  atencion: Atencion;
  garantia: { en_garantia: boolean; hizo_preventivo: boolean } | null;
  enviando: boolean;
  correr: (fn: () => Promise<{ error: string | null }>, exito: string) => void;
}) {
  const [clasificacion, setClasificacion] = useState<ClasificacionAtencion | "">(
    garantia?.en_garantia ? "garantia" : "",
  );
  const [detalle, setDetalle] = useState("");

  if (a.en_garantia === null) {
    // Sin máquina vinculada, el botón de verificar solo podía fallar («primero
    // identifique el equipo»). Santos lo marcó el 01-09: el clic que vincula
    // la máquina —el panel de la derecha— YA verifica la garantía, así que acá
    // no va un botón redundante sino la seña de dónde está el clic.
    if (!a.equipo_id) {
      return (
        <Caja titulo="Paso 1 · Verificar la garantía">
          <p className="text-sm text-muted-foreground">
            La garantía se verifica sobre la máquina. Elíjala en{" "}
            <b className="text-foreground">«¿De qué máquina habla el cliente?»</b> (a la derecha, contrastando con
            la foto de la placa): ese clic la vincula y deja la garantía verificada al instante.
          </p>
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
  enviando,
  correr,
}: {
  atencion: Atencion;
  cliente: string;
  serie: string | null;
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
        <input
          value={tecnico}
          onChange={(e) => setTecnico(e.target.value)}
          placeholder="Qué técnico va"
          className="h-9 min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
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
        <Button
          size="sm"
          disabled={enviando || motivo.trim().length < 10}
          onClick={() => correr(() => cerrarAtencion({ atencionId: a.id, resultado, motivo }), "Atención cerrada.")}
        >
          Cerrar la atención
        </Button>
      </div>
    </Caja>
  );
}
