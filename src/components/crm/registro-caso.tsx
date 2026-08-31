"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Cpu,
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  Truck,
  Send,
} from "lucide-react";
import {
  buscarSerie,
  buscarClientes,
  registrarCaso,
  type FichaSerie,
} from "@/lib/acciones/casos";
import { registrarAtencion } from "@/lib/acciones/atenciones";
import { fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * El registro guiado de un caso técnico: una pantalla, tres momentos.
 *
 * Sigue el orden en que Carlos narró la atención real —la lavadora que no lava,
 * el E5, el caño cerrado—: primero QUÉ EQUIPO, después QUÉ PASA, y recién al
 * final QUÉ HACEMOS. La serie va primero porque es lo que trae todo lo demás:
 * garantía, ciclos y último preventivo. Con eso, quien atiende sabe si esto se
 * cobra antes de terminar de escuchar el problema.
 *
 * El ⚠ de «último preventivo: NUNCA» es la venta cruzada que él describió sin
 * llamarla así: «verifico que nunca le hemos hecho el preventivo → le cotizo el
 * repuesto y también el preventivo». Por eso está en el panel y no escondido en
 * la ficha del equipo.
 */

/**
 * LOS CUATRO TIPOS DE ATENCIÓN (nota del ing. Carlos, 31-08). Antes eran tres
 * —garantía, repuesto, mantenimiento— y mezclaban dos preguntas distintas:
 * «qué pidió el cliente» con «quién paga». Garantía no es un tipo de pedido, es
 * una forma de cobrarlo. Ahora acá se elige SOLO qué pidió; si se cobra o no se
 * decide en el diagnóstico, cuando se sabe.
 *
 * Los dos primeros van por la pista técnica y los dos últimos por la comercial,
 * tal como él lo escribió: «atención de solicitud de repuesto/mtto, aquí se
 * aplica el proceso regular de clasificación y etapas de un gestor comercial».
 */
const TIPOS = [
  { valor: "problema_tecnico", etiqueta: "Problema técnico", icono: AlertTriangle, ayuda: "La máquina falla" },
  { valor: "puesta_en_marcha", etiqueta: "Puesta en marcha", icono: ShieldCheck, ayuda: "Instalación y arranque" },
  { valor: "solicitud_repuesto", etiqueta: "Repuesto", icono: Cpu, ayuda: "Pide una pieza" },
  { valor: "solicitud_mantenimiento", etiqueta: "Mantenimiento", icono: Truck, ayuda: "Preventivo o correctivo" },
] as const;

type Tipo = (typeof TIPOS)[number]["valor"];

/** El puente con el enum de tres valores que todavía usa el resto del CRM. */
const TIPO_VIEJO: Record<Tipo, "garantia" | "repuesto" | "mantenimiento"> = {
  problema_tecnico: "garantia",
  puesta_en_marcha: "garantia",
  solicitud_repuesto: "repuesto",
  solicitud_mantenimiento: "mantenimiento",
};

export function RegistroCaso() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const [serie, setSerie] = useState("");
  const [ficha, setFicha] = useState<FichaSerie | null>(null);
  const [buscada, setBuscada] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const [textoCliente, setTextoCliente] = useState("");
  const [clientes, setClientes] = useState<{ id: string; razonSocial: string; documento: string | null }[]>([]);
  const [cuenta, setCuenta] = useState<{ id: string; razonSocial: string } | null>(null);

  const [tipo, setTipo] = useState<Tipo>("problema_tecnico");
  const [problema, setProblema] = useState("");
  const [codigoError, setCodigoError] = useState("");


  const cuentaId = ficha?.cuentaId ?? cuenta?.id ?? null;

  function mirarSerie() {
    const s = serie.trim();
    if (s.length < 4) {
      toast.error("Escriba la serie completa: es lo que amarra el caso a la máquina");
      return;
    }
    setBuscando(true);
    startTransition(async () => {
      const r = await buscarSerie(s);
      setFicha(r);
      setBuscada(true);
      setBuscando(false);
      if (!r) toast.info("Esa serie todavía no está en el parque instalado. Elija el cliente y el caso se registra igual.");
    });
  }

  function mirarClientes() {
    startTransition(async () => setClientes(await buscarClientes(textoCliente)));
  }

  /**
   * El camino nuevo (0132): registrar NO crea la atención, crea el aviso en la
   * bandeja de Central. La atención nace cuando Central la devuelve al área.
   */
  function derivarACentral() {
    if (!cuentaId) {
      toast.error("Falta el cliente: Central no puede derivar un caso sin cliente");
      return;
    }
    startTransition(async () => {
      const r = await registrarAtencion({
        cuentaId,
        tipo,
        detalle: problema,
        equipoId: ficha?.equipoId ?? null,
        serie: ficha?.serie ?? serie.trim() ?? null,
        codigoError: codigoError || null,
      });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        r.repetido
          ? `Este cliente ya tenía un caso igual sin derivar (${r.codigo}). No se duplicó.`
          : `Registrado como ${r.codigo}. Está en la bandeja de Central para que lo derive.`,
        { duration: 7000 },
      );
      router.push("/postventa/atenciones");
    });
  }

  function resolverEnLaLlamada() {
    const desenlace = "telefono" as const;
    if (!cuentaId) {
      toast.error("Falta el cliente: sin cliente el caso no se puede archivar en ningún lado");
      return;
    }
    startTransition(async () => {
      const r = await registrarCaso({
        cuentaId,
        // El camino viejo sigue usando el enum de tres valores. Se traduce acá
        // en vez de migrarlo: lo usan la derivación de Central (0080, 0107) y
        // la ruta de mantenimiento, y cambiarlo hoy es apagar el CRM.
        tipo: TIPO_VIEJO[tipo],
        problema,
        codigoError: codigoError || null,
        equipoId: ficha?.equipoId ?? null,
        serieTexto: ficha?.serie ?? serie.trim() ?? null,
        desenlace,
        atencion: null,
      });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Caso resuelto y cerrado, con su informe de llamada.");
      router.push("/postventa/casos");
    });
  }


  return (
    <div className="space-y-5">
      {/* ── 1 · ¿QUÉ EQUIPO? ─────────────────────────────────────────────── */}
      <Paso numero={1} titulo="¿Qué equipo?">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <Cpu className="size-3.5 flex-none text-muted-foreground" />
            <input
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), mirarSerie())}
              placeholder="Número de serie, como lo lee el cliente en la placa"
              className="w-full min-w-[180px] bg-transparent font-mono text-sm uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="button"
            onClick={mirarSerie}
            disabled={pendiente}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {buscando ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Buscar la máquina
          </button>
        </div>

        {ficha && (
          <div className="mt-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="text-sm font-semibold text-foreground">
              {ficha.equipo} · {ficha.cliente}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <li>
                Garantía:{" "}
                <span className={cn("font-semibold", ficha.garantia.vigente ? "text-emerald-700" : "text-muted-foreground")}>
                  {ficha.garantia.etiqueta}
                </span>
              </li>
              <li>
                Último mantenimiento:{" "}
                {ficha.nuncaMantenido ? (
                  <span className="font-semibold text-amber-800">
                    <AlertTriangle className="mr-0.5 inline size-3" />
                    NUNCA — se le puede cotizar el preventivo junto con esto
                  </span>
                ) : (
                  <span className="font-semibold text-foreground">{fechaCalendario(ficha.ultimoMantenimiento)}</span>
                )}
              </li>
              {ficha.puestaEnMarcha && <li>Puesta en marcha: {fechaCalendario(ficha.puestaEnMarcha)}</li>}
              {ficha.ciclos != null && <li>Ciclos: {ficha.ciclos.toLocaleString("es-PE")}</li>}
              <li>
                {ficha.atencionesPrevias === 0
                  ? "Sin atenciones previas registradas"
                  : `${ficha.atencionesPrevias} atención(es) previa(s)`}
              </li>
            </ul>
          </div>
        )}

        {buscada && !ficha && (
          <div className="mt-2 space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3">
            <p className="text-xs text-amber-900">
              Esa serie no está en el parque instalado. El caso queda como <strong>equipo sin identificar</strong> —con
              la serie escrita, para poder fichar la máquina después— y hace falta decir de qué cliente es.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                <Search className="size-3.5 flex-none text-muted-foreground" />
                <input
                  value={textoCliente}
                  onChange={(e) => setTextoCliente(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), mirarClientes())}
                  placeholder="Razón social o RUC"
                  className="w-full min-w-[160px] bg-transparent text-sm outline-none"
                />
              </label>
              <button
                type="button"
                onClick={mirarClientes}
                disabled={pendiente}
                className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Buscar cliente
              </button>
            </div>
            {cuenta ? (
              <p className="text-xs font-semibold text-foreground">
                Cliente: {cuenta.razonSocial}{" "}
                <button type="button" onClick={() => setCuenta(null)} className="cursor-pointer text-primary underline">
                  cambiar
                </button>
              </p>
            ) : (
              clientes.length > 0 && (
                <div className="space-y-1">
                  {clientes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCuenta({ id: c.id, razonSocial: c.razonSocial })}
                      className="block w-full cursor-pointer rounded border border-border bg-background px-2 py-1 text-left text-xs hover:bg-accent"
                    >
                      {c.razonSocial}
                      {c.documento && <span className="ml-1 text-muted-foreground">· {c.documento}</span>}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </Paso>

      {/* ── 2 · ¿QUÉ PASA? ───────────────────────────────────────────────── */}
      <Paso numero={2} titulo="¿Qué pasa?">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TIPOS.map((t) => {
            const Icono = t.icono;
            return (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                title={t.ayuda}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  tipo === t.valor
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Icono className="size-3.5" />
                {t.etiqueta}
              </button>
            );
          })}
        </div>
        <textarea
          value={problema}
          onChange={(e) => setProblema(e.target.value)}
          rows={3}
          placeholder="Lo que dice el cliente, con sus palabras: «la máquina no lava», «me sale E5», «hace ruido al centrifugar»"
          className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <label className="mt-2 flex max-w-xs items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <span className="flex-none text-xs font-medium text-muted-foreground">Código de error</span>
          <input
            value={codigoError}
            onChange={(e) => setCodigoError(e.target.value)}
            placeholder="E5"
            className="w-full bg-transparent font-mono text-sm uppercase outline-none"
          />
        </label>
      </Paso>

      {/* ── 3 · ¿QUÉ HACEMOS? ────────────────────────────────────────────── */}
      {/*
        ACÁ CAMBIÓ LA REGLA, el 31-08, en la reunión con Lesly:

          «Cualquier caso que venga, que reciba posventa, tiene que ser derivado
           a Central. Lo que él va a registrar tiene que llegar a la Central para
           que la Central también le vuelva a enviar, si le corresponde atender
           la posventa o le corresponde atender a las comerciales.»

        Y sobre este formulario, textual: «mal asunto… voy a arreglar este
        formulario». Tenía tres salidas y dos se quedaban el caso: «programar la
        atención» y «cotizar» creaban la oportunidad a nombre de postventa sin
        pasar por el reparto. El reparto no es un trámite: es quien decide si el
        cliente que llama por un repuesto en realidad es una venta de equipos.

        Programar sigue existiendo —Lesly lo validó tal cual— pero DESPUÉS, en la
        ficha de la atención, cuando Central la devolvió. Cotizar, igual: desde
        la oportunidad que nace del reparto.
      */}
      <Paso numero={3} titulo="¿Qué hacemos?">
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Send className="size-4" /> Derivar a Central
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Va a la bandeja de Central con la sugerencia ya puesta. Central decide si lo atiende el área o un
              comercial, y cuando lo devuelve aparece en «Atenciones» para programarlo.
            </p>
            <button
              type="button"
              disabled={pendiente || !cuentaId || problema.trim().length < 10}
              onClick={() => derivarACentral()}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Registrar y derivar a Central
            </button>
          </div>
          <Desenlace
            icono={Phone}
            titulo="Resuelto en la misma llamada"
            ayuda="No hay nada que repartir: queda el registro y el caso se cierra acá."
            pendiente={pendiente}
            onClick={() => resolverEnLaLlamada()}
          />
        </div>
        {!cuentaId && (
          <p className="mt-2 text-xs text-amber-800">
            Primero identifique el equipo por su serie —o elija el cliente— y después se puede registrar.
          </p>
        )}
      </Paso>
    </div>
  );
}

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Desenlace({
  icono: Icono,
  titulo,
  ayuda,
  pendiente,
  onClick,
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  ayuda: string;
  pendiente: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Icono className="size-4" />}
        {titulo}
      </p>
      <p className="text-[11px] text-muted-foreground">{ayuda}</p>
    </button>
  );
}
