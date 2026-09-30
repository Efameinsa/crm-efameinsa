"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft, ChevronDown, History, PencilLine, Search, ShieldCheck } from "lucide-react";
import {
  buscarCuentasParaUnir,
  corregirSolicitudLead,
  firmaParaCorregirSolicitud,
  moverSolicitudAOtraFicha,
  previaMoverSolicitud,
  type CuentaParaUnir,
  type PreviaMoverSolicitud,
} from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { fechaConHora } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import type { CambioSolicitud } from "@/components/crm/linea-tiempo-cuenta";

/**
 * CORREGIR LO QUE SOLICITÓ EL CLIENTE, DESDE DONDE SE VE (0354).
 *
 * Rubí (PV1), 30-09, mirando la ficha de INVERSIONES CRISTO VIVE: «¿puedo
 * modificar la escritura? Esta solicitud es de otro cliente… debería haber un
 * lápiz al costado… y un historial de cambios para ver quién lo hizo y evitar
 * vicios». Hasta hoy solo Central podía corregir el texto, y solo desde su
 * bandeja.
 *
 * UN LÁPIZ, DOS PREGUNTAS. Lo primero que pide el diálogo es QUÉ está mal,
 * porque son dos arreglos distintos: si el texto quedó incompleto se corrige
 * el texto; si la solicitud es de otro cliente, reescribirla dejaría en la
 * ficha ajena un «Inicio» falso con su expediente abierto — se muda entera.
 *
 * El lápiz solo lo ve quien puede usarlo (quien la registró, Central y
 * gerencia): un botón que después contesta «no tiene permiso» enseña a no
 * tocar nada. Y la firma crece con lo que ya hay encima: libre al principio,
 * con motivo después, con código si ya hay cotización. Eso lo decide la base
 * y la pantalla solo lo pregunta.
 */

/** Los clics y el Enter del diálogo no deben llegar a la fila de la tabla, que navega. */
function Aislado({ children }: { children: React.ReactNode }) {
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

/**
 * «editado · quién · cuándo · ver N cambios». Siempre a la vista cuando hubo
 * cambios: que se note es lo que evita los vicios.
 */
export function MarcaEditado({ cambios }: { cambios: CambioSolicitud[] }) {
  const [abierto, setAbierto] = useState(false);
  if (cambios.length === 0) return null;
  const ultimo = cambios[0];
  const mudada = cambios.find((c) => c.tipo === "ficha");

  return (
    <Aislado>
      <div className="mt-1 text-xs">
        {mudada && (
          <p className="mb-0.5 text-muted-foreground">
            <ArrowRightLeft className="mr-1 inline size-3 align-[-2px]" />
            Llegó desde la ficha de <b className="font-medium text-foreground">{mudada.antes ?? "otro cliente"}</b>, donde
            se había registrado por error.
          </p>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex items-center gap-1 rounded text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <History className="size-3" />
          <span>
            {ultimo.tipo === "ficha" ? "mudada" : "editado"} · {ultimo.quien ?? "—"} · {fechaConHora(ultimo.at)}
          </span>
          <span className="font-medium text-foreground">
            · {abierto ? "ocultar" : `ver ${cambios.length === 1 ? "el cambio" : `${cambios.length} cambios`}`}
          </span>
          <ChevronDown className={cn("size-3 transition-transform", abierto && "rotate-180")} />
        </button>

        {abierto && (
          <ol className="mt-1.5 space-y-2 border-l-2 border-border pl-3">
            {cambios.map((c, i) => (
              <li key={i} className="space-y-0.5">
                <p className="text-muted-foreground">
                  <b className="font-medium text-foreground">{c.quien ?? "—"}</b> · {fechaConHora(c.at)}
                  {c.conCodigo && (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                      <ShieldCheck className="size-3" /> con código
                    </span>
                  )}
                </p>
                {c.tipo === "ficha" ? (
                  <p className="text-foreground">
                    La mudó de <b>{c.antes ?? "otra ficha"}</b> a <b>{c.despues ?? "esta ficha"}</b>.
                  </p>
                ) : (
                  <>
                    {c.antes && (
                      <p className="whitespace-pre-wrap text-muted-foreground line-through decoration-muted-foreground/60">
                        {c.antes}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-foreground">{c.despues}</p>
                  </>
                )}
                {c.motivo && <p className="italic text-muted-foreground">Motivo: {c.motivo}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Aislado>
  );
}

type Paso = "elegir" | "texto" | "ficha";

export function CorregirSolicitudBoton({
  leadId,
  codigo,
  mensaje,
  fichaActual,
  cuentaActualId,
  sugerenciaFicha,
}: {
  leadId: string;
  codigo: string | null;
  mensaje: string | null;
  /** La ficha donde está hoy: el diálogo dice que esa no pierde nada. */
  fichaActual: string | null;
  cuentaActualId: string | null;
  sugerenciaFicha?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>("elegir");
  const [enviando, startTransition] = useTransition();

  // Corregir el texto
  const [texto, setTexto] = useState(mensaje ?? "");
  const [firma, setFirma] = useState<"libre" | "motivo" | "codigo" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");

  // Mudar a otra ficha
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CuentaParaUnir[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegida, setElegida] = useState<CuentaParaUnir | null>(null);
  const [previa, setPrevia] = useState<PreviaMoverSolicitud | null>(null);

  function reiniciar() {
    setPaso("elegir");
    setTexto(mensaje ?? "");
    setFirma(null);
    setMotivo("");
    setPin("");
    setQ("");
    setResultados([]);
    setElegida(null);
    setPrevia(null);
  }

  useEffect(() => {
    if (!abierto) return;
    // La firma se pregunta al abrir: depende del reloj y de lo que tenga el expediente.
    firmaParaCorregirSolicitud(leadId).then(setFirma);
  }, [abierto, leadId]);

  useEffect(() => {
    if (paso !== "ficha") return;
    const texto = q.trim();
    if (texto.length < 3) return;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarCuentasParaUnir(texto)
        .then((r) => setResultados(r.filter((c) => c.id !== cuentaActualId)))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, paso, cuentaActualId]);

  function elegir(c: CuentaParaUnir | null) {
    setElegida(c);
    setPrevia(null);
    setPin("");
    if (c) previaMoverSolicitud(leadId, c.id).then(setPrevia);
  }
  // Con menos de 3 letras no se muestra nada de la búsqueda anterior.
  const lista = q.trim().length >= 3 ? resultados : [];

  const textoCambio = texto.trim().length >= 5 && texto.trim() !== (mensaje ?? "").trim();
  const pideMotivoTexto = firma === "motivo" || firma === "codigo";
  const listoTexto =
    textoCambio &&
    firma !== null &&
    (!pideMotivoTexto || motivo.trim().length >= 5) &&
    (firma !== "codigo" || pin.replace(/\D/g, "").length === 4);

  const listoFicha =
    Boolean(elegida && previa && !previa.bloqueo) &&
    motivo.trim().length >= 10 &&
    (!previa?.pide_codigo || pin.replace(/\D/g, "").length === 4);

  function guardarTexto() {
    if (!listoTexto) return;
    startTransition(async () => {
      const r = await corregirSolicitudLead(leadId, texto, [], { motivo, pin });
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        setPin("");
        return;
      }
      toast.success("Corregido. Queda en el historial con su nombre.");
      setAbierto(false);
      reiniciar();
      router.refresh();
    });
  }

  function mudar() {
    if (!listoFicha || !elegida) return;
    startTransition(async () => {
      const r = await moverSolicitudAOtraFicha(leadId, elegida.id, motivo, pin);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        setPin("");
        return;
      }
      const res = r.resultado;
      toast.success(
        `${codigo ?? "La solicitud"} pasó a ${res?.destino ?? elegida.razonSocial}` +
          (res?.sumada_a_expediente_abierto ? ", dentro del expediente que ya estaba abierto." : ", con su expediente."),
        {
          duration: 10000,
          action: res?.expediente
            ? { label: "Ver", onClick: () => router.push(`/comercial/oportunidades/${res.expediente}`) }
            : undefined,
        },
      );
      setAbierto(false);
      reiniciar();
      router.refresh();
    });
  }

  return (
    <Aislado>
      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v);
          if (!v) reiniciar();
        }}
      >
        <DialogTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              className="-my-1 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Corregir lo que pidió el cliente"
              title="Corregir lo que pidió el cliente"
            >
              <PencilLine className="size-4" />
            </Button>
          }
        />
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {paso === "ficha" ? "¿De qué cliente es?" : "Corregir lo que pidió el cliente"}
            </DialogTitle>
            <DialogDescription>
              {codigo ? `${codigo} · ` : ""}Cada cambio queda en el historial con su nombre y la hora.
            </DialogDescription>
          </DialogHeader>

          {paso === "elegir" && (
            <div className="grid gap-2">
              <p className="text-sm font-medium text-foreground">¿Qué está mal?</p>
              <button
                type="button"
                onClick={() => setPaso("texto")}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PencilLine className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">El texto</span>
                  <span className="block text-xs text-muted-foreground">
                    Faltó un dato, se escribió mal o el cliente agregó algo.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaso("ficha");
                  if (sugerenciaFicha) setQ(sugerenciaFicha);
                }}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowRightLeft className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">Es de otro cliente</span>
                  <span className="block text-xs text-muted-foreground">
                    Se registró en la ficha equivocada{fichaActual ? ` (${fichaActual})` : ""}. Se muda a la correcta;
                    antes de confirmar le dice qué se lleva.
                  </span>
                </span>
              </button>
            </div>
          )}

          {paso === "texto" && (
            <div className="space-y-3">
              {mensaje && (
                <div className="rounded-md border border-dashed border-border bg-secondary/40 p-2.5">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dice ahora</p>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">{mensaje}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cs-texto">Qué solicita el cliente</Label>
                <Textarea id="cs-texto" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
              </div>

              {firma === null && <p className="text-xs text-muted-foreground">Revisando qué pide la corrección…</p>}
              {pideMotivoTexto && (
                <div className="space-y-1.5">
                  <Label htmlFor="cs-motivo">Por qué lo corrige</Label>
                  <Input
                    id="cs-motivo"
                    placeholder="ej.: me faltó anotar que son dos tarjetas"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Ya pasó un rato desde que se registró: el motivo queda en el historial y se le avisa a quien lo
                    atiende.
                  </p>
                </div>
              )}
              {firma === "codigo" && (
                <BloqueCodigo
                  pin={pin}
                  setPin={setPin}
                  razon="El expediente ya tiene cotización o venta: cambiar lo que pidió el cliente lo autoriza gerencia u operaciones."
                />
              )}
            </div>
          )}

          {paso === "ficha" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-buscar">Buscar el cliente correcto</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cs-buscar"
                    className="pl-8"
                    placeholder="Nombre, RUC, correo o dominio (vidawasiperu.org)"
                    value={q}
                    autoFocus
                    onChange={(e) => {
                      setQ(e.target.value);
                      elegir(null);
                    }}
                  />
                </div>
              </div>

              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {buscando && lista.length === 0 && <p className="px-1 text-xs text-muted-foreground">Buscando…</p>}
                {!buscando && q.trim().length >= 3 && lista.length === 0 && (
                  <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
                    Ninguna ficha dice «{q.trim()}». Pruebe con el RUC o el correo; si no la encuentra, pídaselo a
                    Central.
                  </p>
                )}
                {lista.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegir(c)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      elegida?.id === c.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="text-sm font-semibold leading-snug text-foreground">{c.razonSocial}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {c.numDoc ? `${c.numDoc} · ` : ""}
                      {c.codigoComercial || c.comercialNombre
                        ? `cartera de ${c.codigoComercial ? `${c.codigoComercial} · ` : ""}${c.comercialNombre ?? "—"}`
                        : "sin comercial asignado"}
                      {c.detalle ? ` · ${c.detalle}` : ""}
                    </span>
                  </button>
                ))}
              </div>

              {/* QUÉ VA A PASAR, dicho antes de apretar. */}
              {elegida && !previa && <p className="text-xs text-muted-foreground">Revisando qué se mueve…</p>}
              {elegida && previa?.bloqueo && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
                  {previa.bloqueo}
                </p>
              )}
              {elegida && previa && !previa.bloqueo && (
                <ul className="list-disc space-y-0.5 rounded-md border border-sky-300 bg-sky-50 py-2 pl-6 pr-2.5 text-xs leading-snug text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                  <li>
                    {codigo ?? "La solicitud"} pasa a <b>{elegida.razonSocial}</b>.
                  </li>
                  {previa.tiene_expediente && (
                    <li>
                      {previa.suma_a_expediente_abierto
                        ? `Se suma al expediente que ${previa.atendera ?? "su responsable"} ya tiene abierto con ese cliente.`
                        : `Su expediente se va con ella; lo atiende ${previa.atendera ?? "el mismo responsable"}.`}
                      {previa.atiende_ahora && previa.atendera !== previa.atiende_ahora
                        ? ` Deja de estar a cargo de ${previa.atiende_ahora}.`
                        : ""}
                    </li>
                  )}
                  {fichaActual && (
                    <li>
                      <b>{fichaActual}</b> no pierde nada suyo: sus contactos y su historia se quedan.
                    </li>
                  )}
                </ul>
              )}

              {elegida && previa && !previa.bloqueo && (
                <div className="space-y-1.5">
                  <Label htmlFor="cs-motivo-ficha">Cómo supo que es de este cliente</Label>
                  <Textarea
                    id="cs-motivo-ficha"
                    rows={2}
                    placeholder="ej.: el RUC y el correo son de Vidawasi; el teléfono lo anoté mal"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Queda anotado en las dos fichas.</p>
                </div>
              )}
              {elegida && previa?.pide_codigo && !previa.bloqueo && (
                <BloqueCodigo
                  pin={pin}
                  setPin={setPin}
                  razon={
                    previa.gestiones > 0
                      ? `Ya tiene ${previa.gestiones === 1 ? "una gestión" : `${previa.gestiones} gestiones`}: mudarla lo autoriza gerencia u operaciones.`
                      : "Cambia quién lleva el expediente: lo autoriza gerencia u operaciones."
                  }
                />
              )}
            </div>
          )}

          {paso !== "elegir" && (
            <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => reiniciar()} disabled={enviando}>
                <ArrowLeft className="size-4" /> Volver
              </Button>
              {paso === "texto" ? (
                <Button onClick={guardarTexto} disabled={!listoTexto || enviando}>
                  {enviando ? "Guardando…" : "Guardar corrección"}
                </Button>
              ) : (
                <Button onClick={mudar} disabled={!listoFicha || enviando}>
                  {enviando ? "Mudando…" : elegida ? "Mudar a esta ficha" : "Elija la ficha"}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Aislado>
  );
}

function BloqueCodigo({ pin, setPin, razon }: { pin: string; setPin: (v: string) => void; razon: string }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <Label htmlFor="cs-pin" className="text-sm">
        Código del supervisor
      </Label>
      <p className="text-[11px] leading-snug text-muted-foreground">{razon}</p>
      <CampoCodigo id="cs-pin" valor={pin} onChange={setPin} tono="amber" enmascarar />
    </div>
  );
}
