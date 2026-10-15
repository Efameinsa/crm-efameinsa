"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { buscarEmpresaParaVisita, equiposDeLaFichaParaVisita, registrarVisitaPlanta, type EquipoDeLaFicha } from "@/lib/acciones/visitas-planta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorDocVisita, guardarDocVisita, type TipoDocVisita } from "@/lib/visitas-planta-columnas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type MaquinaAPreparar = { maquina: string; caracteristicas: string; moverAPrueba: boolean; quitarFilm: boolean };

/** DNI o C.E. con un toque (Rubí, buzón 15-10): vigilancia pide el documento que traiga. */
export function TipoDocBotones({ tipo, onChange }: { tipo: TipoDocVisita; onChange: (t: TipoDocVisita) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded border border-border text-[10px] font-semibold">
      {(["dni", "ce"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={tipo === t}
          title={t === "dni" ? "Documento Nacional de Identidad" : "Carné de extranjería"}
          className={tipo === t ? "bg-primary px-1.5 py-px text-primary-foreground" : "px-1.5 py-px text-muted-foreground hover:bg-accent"}
        >
          {t === "dni" ? "DNI" : "C.E."}
        </button>
      ))}
    </span>
  );
}

const textoEquipo = (e: EquipoDeLaFicha) => `${e.modelo}${e.serie ? ` · serie ${e.serie}` : ""}`;

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
  cabecera = false,
}: {
  cuentaId: string | null;
  oportunidadId?: string | null;
  empresa: string;
  ruc: string | null;
  compacto?: boolean;
  /** En la cabecera: solo el ícono en laptops, para no partirla en dos filas. */
  cabecera?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [f, setF] = useState({ empresa, ruc: ruc ?? "", persona: "", dni: "", telefono: "", motivo: "", fecha: hoy, hora: "10:00" });
  const [showroom, setShowroom] = useState(false);
  // Brenda, 07-10: la lavandería también se abre para una videollamada con un cliente de provincia.
  const [videollamada, setVideollamada] = useState(false);
  const [prenderTv, setPrenderTv] = useState(false);
  const [infocorp, setInfocorp] = useState(false);
  const [cotizacion, setCotizacion] = useState("");
  // Capítulo 1 de Catherine: «¿Usted viene solo? ¿Viene con familiares, con
  // amigos, con socios? ¿Me puede brindar el número de DNI y nombre completo?»
  const [acompanantes, setAcompanantes] = useState<{ nombre: string; dni: string; tipo: TipoDocVisita }[]>([]);
  const [tipoDoc, setTipoDoc] = useState<TipoDocVisita>("dni");
  // Preparación de máquinas para visita de clientes (0422; Brenda, 09-10): qué
  // máquinas llevar al área de prueba o a cuáles quitarles el film. Almacén
  // necesita más que el modelo para quitar el film: voltaje, fase, capacidad… (Lesly, 07-10).
  const [maquinas, setMaquinas] = useState<MaquinaAPreparar[]>([]);
  const cambiarMaquina = (i: number, cambio: Partial<MaquinaAPreparar>) => setMaquinas((xs) => xs.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  // La ficha elegida: la que viene de la pantalla o la que se busca acá.
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(cuentaId);
  const [sugerencias, setSugerencias] = useState<{ id: string; razon_social: string; num_doc: string | null }[]>([]);
  const [buscado, setBuscado] = useState(false);
  // Los equipos de la ficha que recoge en planta (0467; Rubí, 13-10).
  const [equiposFicha, setEquiposFicha] = useState<EquipoDeLaFicha[] | null>(null);
  const [recoge, setRecoge] = useState<string[]>([]);
  // El transporte que llega a la planta (0468; Rubí, 13-10): RUC, marca, placa, MTC, chofer y brevete.
  const transporteVacio = { ruc: "", marca: "", placa: "", mtc: "", chofer: "", brevete: "" };
  const [conTransporte, setConTransporte] = useState(false);
  const [transporte, setTransporte] = useState(transporteVacio);
  const campoTransporte = (k: keyof typeof transporteVacio) => ({ value: transporte[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTransporte((x) => ({ ...x, [k]: e.target.value })) });
  useEffect(() => {
    setRecoge([]);
    if (!abierto || !cuentaElegida) {
      setEquiposFicha(null);
      return;
    }
    let vigente = true;
    equiposDeLaFichaParaVisita(cuentaElegida).then((r) => vigente && setEquiposFicha(r));
    return () => {
      vigente = false;
    };
  }, [abierto, cuentaElegida]);
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
    const lista = maquinas.filter((m) => m.maquina.trim());
    if (maquinas.some((m) => !m.maquina.trim() && (m.quitarFilm || m.caracteristicas.trim()))) {
      toast.error("Escriba qué máquina es en cada fila de «Preparación de máquinas», o quite la fila.");
      return;
    }
    if (lista.some((m) => !m.moverAPrueba && !m.quitarFilm)) {
      toast.error("En cada máquina marque qué hay que hacer: llevarla al área de prueba, quitarle el film o las dos.");
      return;
    }
    if (lista.some((m) => m.quitarFilm && !m.caracteristicas.trim())) {
      toast.error("Para quitarle el film escriba las características de la máquina (voltaje, fase, capacidad…): almacén las necesita.");
      return;
    }
    const errorDoc = errorDocVisita(f.dni, tipoDoc);
    if (errorDoc) {
      toast.error(`${videollamada ? "Documento" : "Documento de quien viene"}: ${errorDoc}`);
      return;
    }
    const errorAcomp = videollamada ? null : acompanantes.map((a) => a.nombre.trim() && errorDocVisita(a.dni, a.tipo) && `${a.nombre.trim()}: ${errorDocVisita(a.dni, a.tipo)}`).find(Boolean);
    if (errorAcomp) {
      toast.error(`Acompañante ${errorAcomp}`);
      return;
    }
    if (conTransporte && !videollamada && !transporte.placa.trim()) {
      toast.error("Escriba la placa del vehículo: vigilancia la pide en la puerta. Si no viene vehículo, desmarque «Llega con vehículo».");
      return;
    }
    const resumen = lista
      .map((m) => `${m.maquina.trim()}${m.caracteristicas.trim() ? ` — ${m.caracteristicas.trim()}` : ""} (${[m.moverAPrueba && "al área de prueba", m.quitarFilm && "quitar el film"].filter(Boolean).join(" y ")})`)
      .join("; ");
    startTransition(async () => {
      const r = await registrarVisitaPlanta({ cuentaId: cuentaElegida, oportunidadId, ...f, dni: guardarDocVisita(f.dni, tipoDoc), showroom: showroom || videollamada, prenderTv, infocorp, cotizacionRef: cotizacion, videollamada,
        acompanantes: videollamada ? [] : acompanantes.map((a) => ({ nombre: a.nombre, dni: guardarDocVisita(a.dni, a.tipo) })), maquinas: lista, equiposRecoge: videollamada ? [] : recoge,
        transporte: conTransporte && !videollamada ? transporte : null });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        videollamada
          ? "Videollamada registrada. Almacén ya sabe que hay que abrir la lavandería" + (r.correoEnviado ? " y el correo salió a Central, Contabilidad, Logística, Almacén y gerencia." : ".")
          : r.correoEnviado
          ? "Visita registrada. Central tiene el aviso y el correo salió a Central, Contabilidad, Logística, Almacén y gerencia."
          : "Visita registrada. Central ya tiene el aviso para imprimirlo a vigilancia.",
        // Se repite lo marcado, para que quien registra vea que el film quedó pedido (Katerine y Lesly, 07-10).
        { description: resumen ? `Almacén prepara: ${resumen}.` : undefined },
      );
      setAbierto(false);
      setF((x) => ({ ...x, persona: "", dni: "", telefono: "", motivo: "" }));
      setTipoDoc("dni");
      // Que la próxima visita no herede la máquina ni el film de ésta.
      setMaquinas([]);
      setAcompanantes([]);
      setRecoge([]);
      setConTransporte(false);
      setTransporte(transporteVacio);
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
              title="El cliente viene a la planta (Central lo imprime para vigilancia) o hay una videollamada y hay que abrir la lavandería"
            >
              <Building2 className="size-3.5" />
              Visita o videollamada
            </button>
          ) : (
            <Button variant="outline" size="sm" title="El cliente viene a la planta (Central lo imprime para vigilancia) o hay una videollamada y hay que abrir la lavandería">
              <Building2 className="size-3.5" />
              {cabecera ? <span className="max-2xl:hidden">Visita o videollamada</span> : "Visita o videollamada"}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{videollamada ? "Videollamada: abrir la lavandería" : "Visita a la planta"}</DialogTitle>
          <DialogDescription>
            {videollamada ? "Nadie entra a la planta: Almacén recibe el aviso para abrir la lavandería a la hora de la videollamada. El correo sale a Central, Contabilidad, Logística, Sistemas, Almacén y gerencia." : <>Lo que vigilancia necesita en la puerta. Central recibe el aviso y lo imprime; el correo con la tabla sale a
            Central, Contabilidad, Logística, Sistemas, Almacén y gerencia, como el de siempre.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm">
            <input type="checkbox" checked={videollamada} onChange={(e) => setVideollamada(e.target.checked)} className="size-4" />
            Es una videollamada (el cliente no viene a la planta)
          </label>
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
          {/* Los equipos del cliente para solo marcar (0467; Rubí, buzón 15-10): cuál recoge y cuál preparar para la visita. */}
          {cuentaElegida && !equiposFicha && <p className="-mt-1 text-[11px] text-muted-foreground">Buscando los equipos de este cliente…</p>}
          {cuentaElegida && equiposFicha && (
            <div className="grid gap-1.5 rounded-md border border-border p-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipos de este cliente</p>
                <p className="text-[11px] text-muted-foreground">
                  {videollamada
                    ? "Marque cuál hay que preparar para mostrarlo en la videollamada."
                    : "Marque cuál se lleva (va con su serie en el aviso, el correo y la hoja de vigilancia) y cuál hay que preparar para la visita."}
                </p>
              </div>
              {equiposFicha.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Esta ficha no tiene equipos registrados con serie: escríbalo en «Para qué viene» o en «Preparación de máquinas».</p>
              ) : (
                equiposFicha.map((e) => {
                  const texto = textoEquipo(e);
                  const preparado = maquinas.some((m) => m.maquina.trim() === texto);
                  return (
                    <div key={e.id} className="grid gap-0.5 rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-sm">
                        {e.modelo}
                        {e.serie && <span className="ml-1 font-mono text-[11px] text-muted-foreground">· serie {e.serie}</span>}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {!videollamada && (
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={recoge.includes(e.id)}
                              onChange={(ev) => setRecoge((xs) => (ev.target.checked ? [...xs, e.id] : xs.filter((x) => x !== e.id)))}
                              className="size-4"
                            />
                            Lo recoge
                          </label>
                        )}
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={preparado}
                            onChange={(ev) =>
                              setMaquinas((xs) =>
                                ev.target.checked
                                  ? [...xs, { maquina: texto, caracteristicas: "", moverAPrueba: true, quitarFilm: false }]
                                  : xs.filter((m) => m.maquina.trim() !== texto),
                              )
                            }
                            className="size-4"
                          />
                          Prepararlo para la visita
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <div className="grid grid-cols-[1fr_9.5rem] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                {videollamada ? "Con quién es la videollamada" : "Quién viene"} <span className="text-destructive">*</span>
              </Label>
              <Input {...campo("persona")} placeholder="Nombre y apellido" autoFocus />
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-1">
                <Label className="text-xs">{tipoDoc === "ce" ? "C.E." : "DNI"}</Label>
                <TipoDocBotones tipo={tipoDoc} onChange={setTipoDoc} />
              </div>
              <Input {...campo("dni")} inputMode={tipoDoc === "ce" ? "text" : "numeric"} placeholder={tipoDoc === "ce" ? "N.º de carné" : "8 dígitos"} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Teléfono de contacto</Label>
            <Input {...campo("telefono")} inputMode="tel" />
          </div>
          {!videollamada && (<>
          <div className="grid gap-1">
            <Label className="text-xs">¿Viene acompañado? Nombre y DNI o C.E. de cada uno (vigilancia los pide)</Label>
            {acompanantes.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_7rem_auto] items-center gap-1.5">
                <Input value={a.nombre} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre y apellido" />
                <TipoDocBotones tipo={a.tipo} onChange={(t) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, tipo: t } : x)))} />
                <Input value={a.dni} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, dni: e.target.value } : x)))} placeholder={a.tipo === "ce" ? "C.E." : "DNI"} inputMode={a.tipo === "ce" ? "text" : "numeric"} />
                <button type="button" onClick={() => setAcompanantes((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => setAcompanantes((xs) => [...xs, { nombre: "", dni: "", tipo: "dni" }])} className="justify-self-start text-xs font-medium text-primary hover:underline">
              + Acompañante
            </button>
          </div>
          </>)}
          <div className="grid gap-2 rounded-md border border-border p-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preparación de máquinas para visita de clientes</p>
              <p className="text-[11px] text-muted-foreground">Qué equipos tiene que preparar almacén para la exhibición: llevarlos al área de prueba o quitarles el film.{equiposFicha?.length ? " Los del cliente que marcó arriba ya están aquí." : ""}</p>
            </div>
            {maquinas.map((m, i) => (
              <div key={i} className="grid gap-1.5 rounded-md bg-muted/40 p-2">
                <div className="grid grid-cols-[1fr_auto] items-center gap-1.5">
                  <Input value={m.maquina} onChange={(e) => cambiarMaquina(i, { maquina: e.target.value })} placeholder="Máquina, ej. LG Titan Max 17 kg" />
                  <button type="button" onClick={() => setMaquinas((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">
                    Quitar
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={m.moverAPrueba} onChange={(e) => cambiarMaquina(i, { moverAPrueba: e.target.checked })} className="size-4" />
                    Llevar al área de prueba
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={m.quitarFilm} onChange={(e) => cambiarMaquina(i, { quitarFilm: e.target.checked })} className="size-4" />
                    Quitarle el film
                  </label>
                </div>
                {m.quitarFilm && (
                  <Input value={m.caracteristicas} onChange={(e) => cambiarMaquina(i, { caracteristicas: e.target.value })} placeholder="Características * ej. 220 V trifásica, 17 kg, gas / eléctrica, color" />
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMaquinas((xs) => [...xs, { maquina: "", caracteristicas: "", moverAPrueba: true, quitarFilm: false }])}
              className="justify-self-start text-xs font-medium text-primary hover:underline"
            >
              + Máquina a preparar
            </button>
          </div>
          {!videollamada && (
            <div className="grid gap-1.5 rounded-md border border-border p-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conTransporte} onChange={(e) => setConTransporte(e.target.checked)} className="size-4" />
                Llega con vehículo (camión, furgón, auto)
              </label>
              {conTransporte && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="grid gap-1">
                    <Label className="text-xs">Placa <span className="text-destructive">*</span></Label>
                    <Input {...campoTransporte("placa")} placeholder="ej. ABC-123" className="uppercase" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Marca</Label>
                    <Input {...campoTransporte("marca")} placeholder="ej. Hyundai" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">RUC del transporte</Label>
                    <Input {...campoTransporte("ruc")} inputMode="numeric" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">MTC</Label>
                    <Input {...campoTransporte("mtc")} placeholder="Registro o certificado MTC" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Chofer</Label>
                    <Input {...campoTransporte("chofer")} placeholder="Nombre y apellido" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Brevete</Label>
                    <Input {...campoTransporte("brevete")} placeholder="N.º de licencia" className="uppercase" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">
              {videollamada ? "Para qué es" : "Para qué viene"} <span className="text-destructive">*</span>
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
              <input type="checkbox" checked={showroom || videollamada} disabled={videollamada} onChange={(e) => setShowroom(e.target.checked)} className="size-4" />
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
            {videollamada ? "Pedir la lavandería" : "Registrar la visita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
