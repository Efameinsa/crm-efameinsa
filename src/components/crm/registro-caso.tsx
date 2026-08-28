"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Cpu,
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  Truck,
  FileText,
  Copy,
} from "lucide-react";
import {
  buscarSerie,
  buscarClientes,
  registrarCaso,
  textoDerivacion,
  type FichaSerie,
} from "@/lib/acciones/casos";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { SelectorHora } from "@/components/crm/selector-hora";
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

const TIPOS = [
  { valor: "garantia", etiqueta: "Garantía", icono: ShieldCheck, ayuda: "El equipo está en garantía y falla" },
  { valor: "repuesto", etiqueta: "Repuesto", icono: Cpu, ayuda: "Pide una pieza" },
  { valor: "mantenimiento", etiqueta: "Mantenimiento", icono: Truck, ayuda: "Preventivo o correctivo" },
] as const;

type Tipo = (typeof TIPOS)[number]["valor"];

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

  const [tipo, setTipo] = useState<Tipo>("garantia");
  const [problema, setProblema] = useState("");
  const [codigoError, setCodigoError] = useState("");

  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cuentaId = ficha?.cuentaId ?? cuenta?.id ?? null;
  const cliente = ficha?.cliente ?? cuenta?.razonSocial ?? null;

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

  function registrar(desenlace: "telefono" | "derivar" | "cotizar") {
    if (!cuentaId) {
      toast.error("Falta el cliente: sin cliente el caso no se puede archivar en ningún lado");
      return;
    }
    startTransition(async () => {
      const r = await registrarCaso({
        cuentaId,
        tipo,
        problema,
        codigoError: codigoError || null,
        equipoId: ficha?.equipoId ?? null,
        serieTexto: ficha?.serie ?? serie.trim() ?? null,
        desenlace,
        atencion: desenlace === "derivar" ? { fecha, hora: hora || null, tecnico: tecnico || null } : null,
      });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      if (desenlace === "cotizar") {
        toast.success("Caso registrado. Abriendo el cotizador…");
        router.push(`/comercial/oportunidades/${r.id}/cotizar`);
        return;
      }
      if (desenlace === "derivar") {
        setMensaje(
          await textoDerivacion({
            cliente: cliente ?? "Cliente",
            serie: ficha?.serie ?? serie.trim() ?? null,
            equipo: ficha?.equipo ?? null,
            problema,
            codigoError: codigoError || null,
            fecha,
            hora: hora || null,
          }),
        );
        toast.success("Atención programada. Ya está en el calendario del área.");
        return;
      }
      toast.success("Caso resuelto y cerrado, con su informe de llamada.");
      router.push("/postventa/casos");
    });
  }

  // Cuando la derivación ya se registró, la pantalla se convierte en el mensaje
  // para mandar: hoy el circuito real con el almacén es WhatsApp (D8: no se
  // inventa la orden de almacén hasta saber qué trae el ERP).
  if (mensaje) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="size-4" /> Atención programada para el {fechaCalendario(fecha)}
          {hora && ` a las ${hora}`}. Ya aparece en el calendario.
        </p>
        <p className="text-xs text-muted-foreground">
          Falta avisarle al almacén o al técnico. Este es el mensaje, con todo lo que se olvida a mano:
        </p>
        <pre className="max-w-prose whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
          {mensaje}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(mensaje).then(
                () => toast.success("Copiado. Péguelo en el WhatsApp del almacén."),
                () => toast.error("No se pudo copiar; selecciónelo a mano"),
              );
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Copy className="size-3.5" /> Copiar el mensaje
          </button>
          <button
            type="button"
            onClick={() => router.push("/postventa/casos")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Ir a los casos
          </button>
        </div>
      </div>
    );
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
      <Paso numero={3} titulo="¿Qué hacemos?">
        <div className="grid gap-2 lg:grid-cols-3">
          <Desenlace
            icono={Phone}
            titulo="Resuelto por teléfono"
            ayuda="Queda el informe de llamada y el caso se cierra."
            pendiente={pendiente}
            onClick={() => registrar("telefono")}
          />
          <div className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Truck className="size-4" /> Derivar a técnico
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Programa la atención y la deja en el calendario, con el mensaje listo para el almacén.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <SelectorFecha valor={fecha || null} onCambiar={(f) => setFecha(f ?? "")} etiquetaVacia="Elegir el día" />
              <SelectorHora valor={hora || null} onCambiar={(h) => setHora(h ?? "")} />
            </div>
            <input
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              placeholder="Técnico (opcional)"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none"
            />
            <button
              type="button"
              disabled={pendiente || !fecha}
              onClick={() => registrar("derivar")}
              className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
              Programar la atención
            </button>
          </div>
          <Desenlace
            icono={FileText}
            titulo="Cotizar repuesto o mantenimiento"
            ayuda="Abre el cotizador con el cliente cargado, con el correlativo de siempre."
            pendiente={pendiente}
            onClick={() => registrar("cotizar")}
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
