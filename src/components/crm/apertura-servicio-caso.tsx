"use client";

import { hoyLima } from "@/lib/periodo";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { abrirAperturaDesdeCaso, buscarRepuestosParaGarantia, equiposParaAperturaDeCaso, type EquipoParaApertura } from "@/lib/acciones/postventa";
import { formatoDelCaso, GUIAS_APERTURA } from "@/lib/apertura-servicio";
import { CambiarTipoAtencion } from "@/components/crm/cambiar-tipo-atencion";
import { tituloDelTipo } from "@/lib/atenciones";
import { ListaTecnicos, ID_LISTA_TECNICOS } from "@/components/crm/lista-tecnicos";
import {
  antecedentesInternaVacios,
  ETIQUETA_GARANTIA_INTERNA,
  ETIQUETA_MANTENIMIENTO_INTERNO,
  ETIQUETA_SERVICIO_EN_PLANTA,
  ETIQUETA_SI_NO_VERIFICAR,
  type AntecedentesInterna,
  type GarantiaInterna,
  type MantenimientoInterno,
  type ModalidadApertura,
  type ServicioEnPlanta,
  type SiNoVerificar,
} from "@/lib/apertura-interna";

/**
 * APERTURA DE SERVICIO DESDE UN CASO (0407). Reunión de gerencia 06-10 11:01:
 * un servicio que no viene de un pedido —la garantía de Jaén, un técnico que
 * tiene que viajar— necesita su apertura con el formato de siempre. «Derivar
 * llamada» es la orden al almacén para una videollamada; esto es la apertura
 * de servicio: va a Finanzas (autoriza la guía) y al almacén (la emite).
 *
 * También desde la cabecera de la ficha del cliente (buzón, Rubí 07-10: «no
 * solo es para despacho, también para una visita al local del cliente»): ahí
 * llega con `casos` —los abiertos del cliente sin apertura— y se elige de cuál
 * sale.
 */
/** Garantía y revisión van aparte (buzón, Rubí 07-10: «son diferentes servicios», 0418). */
type TipoServicioApertura = "garantia" | "revision" | "mantenimiento";

/** Formatos de la apertura desde un caso. «Repuestos por garantía»: buzón Rubí 12-10 (0441). */
type FormatoCaso = "mantenimiento" | "puesta_marcha" | "entrega_garantia" | "servicio_tecnico" | "revision_garantia" | "capacitacion";
type Repuesto = { cantidad: string; descripcion: string; sku: string | null };

export type CasoParaApertura = {
  id: string;
  etiqueta: string;
  enGarantia: boolean;
  tecnico: string | null;
  /** El tipo del caso (reunión 13-10): de ahí sale el encabezado de la apertura. */
  tipo?: string | null;
  tipoDetalle?: string | null;
};

export function AperturaServicioCaso({
  atencionId: atencionFija,
  enGarantia: garantiaFija,
  direccionSugerida,
  tecnicoSugerido,
  casos,
  tipoCaso: tipoFijo,
  tipoDetalle: detalleFijo,
  abrirInterna = false,
  etiqueta = "Apertura de servicio",
}: {
  atencionId?: string;
  enGarantia?: boolean;
  direccionSugerida?: string | null;
  tecnicoSugerido?: string | null;
  casos?: CasoParaApertura[];
  tipoCaso?: string | null;
  tipoDetalle?: string | null;
  /** Llega desde «El equipo viene a planta» (20-10): se abre sola y en «Interna». */
  abrirInterna?: boolean;
  etiqueta?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [atencionId, setAtencionId] = useState(atencionFija ?? casos?.[0]?.id ?? "");
  const enGarantia = garantiaFija ?? casos?.find((c) => c.id === atencionId)?.enGarantia ?? false;
  const tecnicoDelCaso = tecnicoSugerido ?? casos?.find((c) => c.id === atencionId)?.tecnico;
  const tipoCaso = tipoFijo ?? casos?.find((c) => c.id === atencionId)?.tipo ?? null;
  const detalleCaso = detalleFijo ?? casos?.find((c) => c.id === atencionId)?.tipoDetalle ?? null;
  const [pendiente, startTransition] = useTransition();
  const [tipoPedido, setTipoPedido] = useState<TipoServicioApertura>(enGarantia ? "garantia" : "mantenimiento");
  const [formato, setFormato] = useState<FormatoCaso>(formatoDelCaso(tipoCaso));
  // EL ENCABEZADO SALE DEL TIPO DEL CASO (reunión 13-10): al abrir, al cambiar de
  // caso o al corregir el tipo, la apertura propone el formato que le toca.
  useEffect(() => {
    if (!abierto) return;
    const f = formatoDelCaso(tipoCaso);
    setFormato(f);
    if (f === "revision_garantia") setTipoPedido("garantia");
    else if (f === "mantenimiento") setTipoPedido(enGarantia ? "garantia" : "mantenimiento");
    else setTipoPedido(enGarantia ? "garantia" : "revision");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, atencionId, tipoCaso]);
  const esGarantia = formato === "entrega_garantia";
  // INTERNA O EXTERNA (0566; Santos 20-10): externa = el técnico va al local del cliente, el
  // circuito de siempre; interna = el equipo se atiende en nuestra planta, con sus antecedentes.
  const [modalidad, setModalidad] = useState<ModalidadApertura>(abrirInterna ? "interna" : "externa");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se abre una sola vez al llegar con ?apertura=interna
    if (abrirInterna) setAbierto(true);
  }, [abrirInterna]);
  const [ant, setAnt] = useState<AntecedentesInterna>(antecedentesInternaVacios());
  const antVacios = (a: AntecedentesInterna) => !a.que_ejecutar && !a.fecha_compra && !a.guia_remision && !a.servicio;
  const interna = !esGarantia && modalidad === "interna";
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [busca, setBusca] = useState("");
  const [hallados, setHallados] = useState<{ sku: string | null; descripcion: string }[] | null>(null);
  const [buscando, startBusqueda] = useTransition();
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [tecnico, setTecnico] = useState(tecnicoDelCaso ?? "");
  const [transporte, setTransporte] = useState("");
  const [direccion, setDireccion] = useState(direccionSugerida ?? "");
  const [confirmo, setConfirmo] = useState("");
  const [recibe, setRecibe] = useState("");
  const [recibeTelefono, setRecibeTelefono] = useState("");
  const [destino, setDestino] = useState<"lima" | "provincia" | "">("");
  const [guia, setGuia] = useState("");
  const [guiaDetalle, setGuiaDetalle] = useState("");
  const [nota, setNota] = useState("");
  const [empresa, setEmpresa] = useState<"EFAMEINSA" | "OPEN">("EFAMEINSA");
  // LAS FILAS DE LA HOJA, COMO EN UN PEDIDO (buzón Rubí 12-10: «que se añada los items de la
  // imagen»): primer destino (agencia), observación del destino final, DNI de quien recibe y con
  // quién se coordina contabilidad y logística. Antes salían «—» o por defecto.
  const [entregaModo, setEntregaModo] = useState<"domicilio" | "agencia" | "planta">("domicilio");
  const [agencia, setAgencia] = useState("");
  const [agenciaDireccion, setAgenciaDireccion] = useState("");
  // El horario de atención de la agencia (0505; Lesly, 15-10).
  const [agenciaHorario, setAgenciaHorario] = useState("");
  const [destinoObservacion, setDestinoObservacion] = useState("");
  const [recibeDoc, setRecibeDoc] = useState("");
  const [coordinaContabilidad, setCoordinaContabilidad] = useState("");
  const [coordinaLogistica, setCoordinaLogistica] = useState("");
  // LOS EQUIPOS DEL CLIENTE (0453, Santos 13-10: «debe permitir jalar los
  // equipos del cliente»). Se cargan al abrir y al cambiar de caso; el del caso
  // sale marcado y se marcan los demás que atiende el técnico.
  const [equiposCliente, setEquiposCliente] = useState<EquipoParaApertura[] | null>(null);
  const [equiposElegidos, setEquiposElegidos] = useState<string[]>([]);
  useEffect(() => {
    if (!abierto || !atencionId) return;
    let vivo = true;
    equiposParaAperturaDeCaso(atencionId).then((r) => {
      if (!vivo) return;
      setEquiposCliente(r.equipos);
      const elegidos = r.delCaso && r.equipos.some((e) => e.id === r.delCaso) ? [r.delCaso] : r.equipos.length === 1 ? [r.equipos[0].id] : [];
      setEquiposElegidos(elegidos);
    });
    return () => {
      vivo = false;
    };
  }, [abierto, atencionId]);
  const alternarEquipo = (id: string) => setEquiposElegidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  // Al pasar a interna se propone lo que ya se sabe del equipo: su ficha (fecha de venta, guía,
  // garantía) y sus «Antecedentes del equipo» (0560) si ya los registraron.
  const elegirModalidad = (m: ModalidadApertura) => {
    setModalidad(m);
    if (m !== "interna" || !antVacios(ant)) return;
    proponerAntecedentes(equiposCliente?.find((e) => e.id === equiposElegidos[0]) ?? null);
  };
  const proponerAntecedentes = (eq: EquipoParaApertura | null) => {
    const a = eq?.antecedentes ?? null;
    const sn = (v: string | null | undefined): SiNoVerificar => (v === "si" || v === "no" ? v : "por_verificar");
    const hoy = hoyLima(); // en Lima: después de las 19:00 el UTC ya es mañana
    const garantia: GarantiaInterna =
      a?.garantia === "vigente" || a?.garantia === "vencida"
        ? a.garantia
        : eq?.garantiaHasta
          ? eq.garantiaHasta >= hoy
            ? "vigente"
            : "vencida"
          : enGarantia
            ? "vigente"
            : "por_verificar";
    setAnt({
      ...antecedentesInternaVacios(),
      fecha_compra: a?.fecha_compra ?? eq?.fechaVenta ?? null,
      fecha_puesta_marcha: eq?.fechaPuestaMarcha ?? null,
      fecha_primer_mantenimiento: eq?.fechaPrimerMantenimiento ?? null,
      fecha_mantenimiento_correctivo: eq?.fechaMantenimientoCorrectivo ?? null,
      guia_remision: a?.guia_remision ?? eq?.guia ?? null,
      garantia,
      problemas: sn(a?.fallas),
      problemas_detalle: a?.fallas_detalle ?? null,
      vendido_repuesto: sn(a?.repuestos),
      vendido_repuesto_detalle: a?.repuestos_detalle ?? null,
      mantenimiento: a?.mantenimiento === "no" ? "ninguno" : "por_verificar",
      mantenimiento_detalle: a?.mantenimiento_detalle ?? null,
    });
  };

  // Si se llegó ya en «Interno» (?apertura=interna: visita sin solución), los equipos no
  // estaban cargados cuando se eligió la modalidad: se propone recién cuando llegan.
  useEffect(() => {
    if (!equiposCliente || modalidad !== "interna" || !antVacios(ant)) return;
    proponerAntecedentes(equiposCliente.find((e) => e.id === equiposElegidos[0]) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llegan los equipos
  }, [equiposCliente]);

  const repuestosListos = repuestos.filter((x) => x.descripcion.trim());
  const falta = [
    !atencionId && "el caso",
    !esGarantia && (equiposCliente?.length ?? 0) > 0 && equiposElegidos.length === 0 && "los equipos que atiende",
    esGarantia && repuestosListos.length === 0 && "los repuestos",
    !fecha && "el día",
    !esGarantia && !tecnico.trim() && "el técnico",
    esGarantia && entregaModo === "agencia" && !agencia.trim() && "la agencia",
    esGarantia && entregaModo === "agencia" && !agenciaDireccion.trim() && "la dirección de la agencia",
    esGarantia && entregaModo === "agencia" && !agenciaHorario.trim() && "el horario de atención de la agencia",
    interna && !ant.servicio && "qué servicio se le hace en planta",
    interna && !ant.que_ejecutar.trim() && "el problema (por qué viene a planta)",
    !interna && !direccion.trim() && (esGarantia ? "adónde se entregan" : "dónde se hace"),
    !confirmo.trim() && "con quién lo confirmó",
    !interna && !destino && "Lima o provincia",
  ].filter(Boolean) as string[];

  const emitir = () =>
    startTransition(async () => {
      const r = await abrirAperturaDesdeCaso(atencionId, {
        tipoPedido,
        formato,
        fecha,
        hora,
        tecnico,
        transporte: interna ? "" : transporte,
        // En planta no hay traslado: la hoja dice dónde se atiende.
        direccion: interna ? "EN NUESTRA PLANTA (servicio interno)" : direccion,
        confirmo,
        recibe: interna ? "" : recibe,
        recibeTelefono: interna ? "" : recibeTelefono,
        destino: interna ? "lima" : (destino as "lima" | "provincia"),
        modalidad: esGarantia ? undefined : modalidad,
        antecedentes: interna ? ant : undefined,
        guia: guia || null,
        guiaDetalle,
        nota,
        empresa,
        recibeDoc,
        coordinaContabilidad,
        coordinaLogistica,
        destinoObservacion,
        ...(esGarantia ? { entregaModo, agencia, agenciaDireccion, agenciaHorario } : {}),
        equipos: esGarantia ? undefined : equiposElegidos,
        repuestos: esGarantia
          ? repuestosListos.map((x) => ({ cantidad: Math.max(1, Number(x.cantidad) || 1), descripcion: x.descripcion, sku: x.sku }))
          : undefined,
      });
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(esGarantia ? "Apertura de repuestos por garantía emitida: le llegó a Contabilidad y al almacén" : "Apertura emitida: le llegó a Finanzas y al almacén");
      setAbierto(false);
      if (r.servicioId) router.push(`/postventa/pedidos/${r.servicioId}`);
      else router.refresh();
    });

  const elegirFormato = (f: FormatoCaso) => {
    setFormato(f);
    // Por garantía: el servicio es «Garantía» y la guía, la de repuestos.
    if (f === "revision_garantia") setTipoPedido("garantia");
    if (f === "entrega_garantia") {
      setTipoPedido("garantia");
      if (!guia) setGuia("repuestos");
      if (repuestos.length === 0) setRepuestos([{ cantidad: "1", descripcion: "", sku: null }]);
    }
  };
  const buscar = () =>
    startBusqueda(async () => {
      setHallados(await buscarRepuestosParaGarantia(busca));
    });
  const agregar = (x: { sku: string | null; descripcion: string }) => {
    setRepuestos((l) => [...l.filter((y) => y.descripcion.trim()), { cantidad: "1", descripcion: x.descripcion, sku: x.sku }]);
    setHallados(null);
    setBusca("");
  };
  const cambiar = (i: number, cambio: Partial<Repuesto>) => setRepuestos((l) => l.map((y, j) => (j === i ? { ...y, ...cambio } : y)));

  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            title="El técnico va al local del cliente: apertura con su guía, como la de un pedido"
          >
            <ClipboardList className="size-3.5" />
            {etiqueta}
          </button>
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apertura de servicio</DialogTitle>
          <DialogDescription>
            Para un servicio que no viene de un pedido (una garantía, una revisión en el local del cliente). Le llega a Finanzas para autorizar la guía y al almacén para emitirla.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {casos && (
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Caso del que sale la apertura <span className="text-destructive">*</span></Label>
              <select
                className={select}
                value={atencionId}
                onChange={(e) => {
                  const c = casos.find((x) => x.id === e.target.value);
                  setAtencionId(e.target.value);
                  setTipoPedido(c?.enGarantia ? "garantia" : "mantenimiento");
                  if (!tecnico.trim() && c?.tecnico) setTecnico(c.tecnico);
                }}
              >
                {casos.map((c) => (
                  <option key={c.id} value={c.id}>{c.etiqueta}</option>
                ))}
              </select>
            </div>
          )}
          {/* EL TIPO DEL CASO, CORREGIBLE ACÁ MISMO (reunión 13-10, Agrocasagrande: salía
              «puesta en marcha» y no se podía cambiar). */}
          {tipoCaso && atencionId && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Tipo de caso:</span>
              <b className="text-foreground">{tituloDelTipo(tipoCaso, detalleCaso)}</b>
              <CambiarTipoAtencion atencionId={atencionId} tipo={tipoCaso} detalle={detalleCaso} rotulo="Corregir el tipo" />
            </div>
          )}
          {/* Rubí, 09-10: «la opción de escoger con qué empresa realizar la apertura». Sin cierre no
              hay serie de la que tomarla (0421). */}
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Empresa con la que sale la apertura</Label>
            <select className={select} value={empresa} onChange={(e) => setEmpresa(e.target.value as "EFAMEINSA" | "OPEN")}>
              <option value="EFAMEINSA">CORPORACIÓN EFAMEINSA S.A.</option>
              <option value="OPEN">OPEN INVESTMENTS S.A.C.</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Servicio</Label>
            <select className={select} value={tipoPedido} disabled={esGarantia} onChange={(e) => setTipoPedido(e.target.value as TipoServicioApertura)}>
              <option value="garantia">Garantía</option>
              <option value="revision">Revisión</option>
              <option value="mantenimiento">Mantenimiento</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Formato de la apertura</Label>
            <select className={select} value={formato} onChange={(e) => elegirFormato(e.target.value as FormatoCaso)}>
              <option value="servicio_tecnico">Servicio técnico</option>
              <option value="revision_garantia">Revisión por garantía</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="puesta_marcha">Puesta en marcha</option>
              <option value="capacitacion">Refuerzo de capacitación</option>
              <option value="entrega_garantia">Entrega de repuestos por garantía</option>
            </select>
          </div>
          {!esGarantia && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">Dónde se hace el servicio <span className="text-destructive">*</span></Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["externa", "Externo", "El técnico va al local del cliente (el circuito de siempre)."],
                    ["interna", "Interno", "El equipo se atiende en nuestra planta: lleva sus antecedentes."],
                  ] as const
                ).map(([m, titulo, ayuda]) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs ${modalidad === m ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}
                  >
                    <input type="radio" name="modalidad-apertura" className="mt-0.5 accent-primary" checked={modalidad === m} onChange={() => elegirModalidad(m)} />
                    <span>
                      <b className="text-foreground">{titulo}</b>
                      <span className="block text-muted-foreground">{ayuda}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!esGarantia && equiposCliente && equiposCliente.length > 0 && (
            <div className="grid gap-1.5 rounded-md border border-border p-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  Equipos que atiende <span className="text-destructive">*</span>
                </Label>
                {equiposCliente.length > 1 && (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => setEquiposElegidos(equiposElegidos.length === equiposCliente.length ? [] : equiposCliente.map((e) => e.id))}
                  >
                    {equiposElegidos.length === equiposCliente.length ? "Quitar todos" : "Marcar todos"}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Los equipos de la ficha del cliente. Marque todos los que ve el técnico: cada uno sale en la hoja con su serie.
              </p>
              <div className="grid gap-1">
                {equiposCliente.map((eq) => (
                  <label key={eq.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-primary"
                      checked={equiposElegidos.includes(eq.id)}
                      onChange={() => alternarEquipo(eq.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{eq.serie ? `Serie ${eq.serie}` : "Sin serie"}</span>
                      <span className="block truncate text-muted-foreground" title={eq.modelo}>{eq.modelo}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!esGarantia && equiposCliente && equiposCliente.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground sm:col-span-2">
              La ficha de este cliente no tiene equipos registrados: la hoja sale con el equipo anotado en el caso.
            </p>
          )}
          {esGarantia && (
            <div className="grid gap-2 rounded-md border border-border p-3 sm:col-span-2">
              <div>
                <Label className="text-xs">Repuestos que se entregan <span className="text-destructive">*</span></Label>
                <p className="text-[11px] text-muted-foreground">
                  Salen por garantía: <b>sin cobro</b>. Contabilidad la confirma «sin comprobante» y el almacén prepara los repuestos y emite la guía. La hoja sale como la de un pedido: «ENTREGA DE REPUESTOS POR GARANTÍA:» con cada repuesto y su cantidad.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscar();
                    }
                  }}
                  placeholder="Buscar en el catálogo por código o nombre"
                />
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={buscar} disabled={buscando || busca.trim().length < 2}>
                  {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  Buscar
                </Button>
              </div>
              {hallados && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border text-xs">
                  {hallados.length === 0 ? (
                    <p className="p-2 text-muted-foreground">No hay repuestos del catálogo con «{busca}». Escríbalo a mano con «Agregar repuesto».</p>
                  ) : (
                    hallados.map((x) => (
                      <button
                        key={`${x.sku}-${x.descripcion}`}
                        type="button"
                        className="block w-full border-b border-border px-2 py-1.5 text-left last:border-0 hover:bg-accent"
                        onClick={() => agregar(x)}
                      >
                        {x.sku && <span className="mr-1 font-mono text-muted-foreground">{x.sku}</span>}
                        {x.descripcion}
                      </button>
                    ))
                  )}
                </div>
              )}
              {repuestos.map((x, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="w-16" type="number" min={1} value={x.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} aria-label="Cantidad" />
                  <Input
                    value={x.descripcion}
                    onChange={(e) => cambiar(i, { descripcion: e.target.value, sku: null })}
                    placeholder="Descripción del repuesto (o búsquelo arriba)"
                  />
                  {x.sku && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{x.sku}</span>}
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    onClick={() => setRepuestos((l) => l.filter((_, j) => j !== i))}
                    title="Quitar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start"
                onClick={() => setRepuestos((l) => [...l, { cantidad: "1", descripcion: "", sku: null }])}
              >
                <Plus className="size-4" />
                Agregar repuesto
              </Button>
            </div>
          )}
          {interna && <AntecedentesInternaCampos valor={ant} cambiar={(c) => setAnt((x) => ({ ...x, ...c }))} />}
          <div className="grid gap-1">
            <Label className="text-xs">{interna ? "Día en que se atiende en planta" : "Día"} <span className="text-destructive">*</span></Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{interna ? "Técnico que lo atiende" : "Técnico que va"} {esGarantia ? <span className="text-muted-foreground">(si va alguno)</span> : <span className="text-destructive">*</span>}</Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Elija de la relación de técnicos o escriba" list={ID_LISTA_TECNICOS} />
            <ListaTecnicos />
          </div>
          {!interna && (
            <div className="grid gap-1">
              <Label className="text-xs">Transporte</Label>
              <Input value={transporte} onChange={(e) => setTransporte(e.target.value)} placeholder="Ej.: TRANSPORTE CONTRATADO, bus a Jaén" />
            </div>
          )}
          {esGarantia && (
            <>
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs">Cómo llegan los repuestos (fila «Primer destino»)</Label>
                <select className={select} value={entregaModo} onChange={(e) => setEntregaModo(e.target.value as "domicilio" | "agencia" | "planta")}>
                  <option value="domicilio">A domicilio (el almacén los lleva al cliente)</option>
                  <option value="agencia">Por agencia (el almacén los deja en la agencia)</option>
                  <option value="planta">Los recoge el cliente en nuestras instalaciones</option>
                </select>
              </div>
              {entregaModo === "agencia" && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-xs">Agencia <span className="text-destructive">*</span></Label>
                    <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="Ej.: EXPRESO LOS CHANKAS" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Dirección de la agencia (donde los deja el almacén) <span className="text-destructive">*</span></Label>
                    <Input value={agenciaDireccion} onChange={(e) => setAgenciaDireccion(e.target.value)} placeholder="Ej.: JR. LUNA PIZARRO N° 459 - LA VICTORIA" />
                  </div>
                  <div className="grid gap-1 sm:col-span-2">
                    <Label className="text-xs">Horario de atención de la agencia <span className="text-destructive">*</span></Label>
                    <Input value={agenciaHorario} onChange={(e) => setAgenciaHorario(e.target.value)} placeholder="Ej.: L-V 8:00 a 18:00 · Sáb 8:00 a 13:00" />
                  </div>
                </>
              )}
            </>
          )}
          {!interna && (
          <>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">
              {esGarantia ? (entregaModo === "agencia" ? "Destino final: adónde tienen que llegar los repuestos" : "Adónde se entregan los repuestos") : "Dónde se hace el servicio"}, tal
              como lo confirmó el cliente <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={2} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Observación del destino final</Label>
            <Input
              value={destinoObservacion}
              onChange={(e) => setDestinoObservacion(e.target.value)}
              placeholder="Ej.: DESTINO DEL CLIENTE: AV. … (sale en «Observaciones» de la fila «Destino final»)"
            />
          </div>
          </>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">{interna ? "Con quién del cliente se coordinó (nombre y cargo)" : "Con quién lo confirmó (nombre y cargo)"} <span className="text-destructive">*</span></Label>
            <Input value={confirmo} onChange={(e) => setConfirmo(e.target.value)} />
          </div>
          {!interna && (
          <>
          <div className="grid gap-1">
            <Label className="text-xs">Lima o provincia <span className="text-destructive">*</span></Label>
            <select className={select} value={destino} onChange={(e) => setDestino(e.target.value as "lima" | "provincia" | "")}>
              <option value="">Elija…</option>
              <option value="lima">Lima</option>
              <option value="provincia">Provincia</option>
            </select>
          </div>
          {/* Rubí, 09-10: «por qué no aparece el nombre de quien recibe si coloqué el nombre». La fila
              PERSONA QUE RECIBE de la apertura salía «—»: este formulario no la pedía. Si se deja
              vacía, va quien confirmó la dirección. */}
          <div className="grid gap-1">
            <Label className="text-xs">Persona que recibe al técnico</Label>
            <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder={confirmo.trim() ? `Si lo deja vacío: ${confirmo.trim()}` : "Si lo deja vacío, va quien confirmó"} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Celular de quien recibe</Label>
            <Input value={recibeTelefono} onChange={(e) => setRecibeTelefono(e.target.value)} inputMode="tel" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">DNI de quien recibe (o RUC, si recibe una empresa)</Label>
            <Input
              value={recibeDoc}
              onChange={(e) => setRecibeDoc(e.target.value)}
              inputMode="numeric"
              placeholder={esGarantia && entregaModo === "agencia" ? "Sin él la agencia no entrega" : ""}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Contabilidad (movilidad y viáticos): con quién</Label>
            <Input value={coordinaContabilidad} onChange={(e) => setCoordinaContabilidad(e.target.value)} placeholder="Ej.: Jhon Kalsin Sullca" />
          </div>
          </>
          )}
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Logística (herramientas, repuestos y EPP): con quién</Label>
            <Input value={coordinaLogistica} onChange={(e) => setCoordinaLogistica(e.target.value)} placeholder="Si lo deja vacío: Almacén" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Guía que se pide al almacén</Label>
            <select className={select} value={guia} onChange={(e) => setGuia(e.target.value)}>
              <option value="">Ninguna</option>
              {GUIAS_APERTURA.map((g) => (
                <option key={g.clave} value={g.clave}>{g.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Detalle de la guía</Label>
            <Input value={guiaDetalle} onChange={(e) => setGuiaDetalle(e.target.value)} placeholder="Ej.: herramientas, manómetro, quemador" disabled={!guia} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Nota para el técnico y el almacén</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué hay que hacer, con quién coordinar al llegar" />
          </div>
        </div>
        <DialogFooter className="sm:items-center">
          {falta.length > 0 && (
            <p className="text-xs text-destructive sm:mr-auto">
              Para emitir falta: <b>{falta.join(", ")}</b>.
            </p>
          )}
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={pendiente || falta.length > 0}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Emitir la apertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Los antecedentes del servicio interno (0566): lo que el técnico necesita saber antes de abrir el equipo. */
function AntecedentesInternaCampos({ valor, cambiar }: { valor: AntecedentesInterna; cambiar: (c: Partial<AntecedentesInterna>) => void }) {
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const siNo = (
    clave: "problemas" | "vendido_repuesto" | "repuesto_cambiado",
    detalle: "problemas_detalle" | "vendido_repuesto_detalle" | "repuesto_cambiado_detalle",
    titulo: string,
  ) => (
    <div className="grid gap-1 sm:col-span-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-2">
      <Label className="text-xs">{titulo}</Label>
      <div className="flex gap-2">
        <select className={`${select} w-36 shrink-0`} value={valor[clave]} onChange={(e) => cambiar({ [clave]: e.target.value as SiNoVerificar })}>
          {(Object.keys(ETIQUETA_SI_NO_VERIFICAR) as SiNoVerificar[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_SI_NO_VERIFICAR[k]}
            </option>
          ))}
        </select>
        <Input value={valor[detalle] ?? ""} onChange={(e) => cambiar({ [detalle]: e.target.value })} placeholder="Cuál y cuándo" disabled={valor[clave] === "no"} />
      </div>
    </div>
  );
  return (
    <div className="grid gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-xs font-semibold text-foreground">Antecedentes del equipo (servicio interno)</p>
        <p className="text-[11px] text-muted-foreground">
          Sale en la hoja de la apertura y queda en «Antecedentes del equipo» de la máquina. Lo que ya se sabía viene propuesto: revíselo.
        </p>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label className="text-xs">
          Servicio que se le hace en planta <span className="text-destructive">*</span>
        </Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(ETIQUETA_SERVICIO_EN_PLANTA) as Exclude<ServicioEnPlanta, "">[]).map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs ${valor.servicio === k ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
            >
              <input type="radio" name="servicio-en-planta" className="accent-primary" checked={valor.servicio === k} onChange={() => cambiar({ servicio: k })} />
              <span className="font-medium">{ETIQUETA_SERVICIO_EN_PLANTA[k]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label className="text-xs">
          Problema: por qué viene a planta y qué se necesita que se ejecute <span className="text-destructive">*</span>
        </Label>
        <Textarea
          rows={2}
          value={valor.que_ejecutar}
          onChange={(e) => cambiar({ que_ejecutar: e.target.value })}
          placeholder="Ej.: la secadora no calienta: revisar quemador y válvula de gas, probar con carga"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha de compra</Label>
        <Input type="date" value={valor.fecha_compra ?? ""} onChange={(e) => cambiar({ fecha_compra: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha de puesta en marcha</Label>
        <Input type="date" value={valor.fecha_puesta_marcha ?? ""} onChange={(e) => cambiar({ fecha_puesta_marcha: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha del primer mantenimiento</Label>
        <Input type="date" value={valor.fecha_primer_mantenimiento ?? ""} onChange={(e) => cambiar({ fecha_primer_mantenimiento: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha del último mantenimiento correctivo</Label>
        <Input
          type="date"
          value={valor.fecha_mantenimiento_correctivo ?? ""}
          onChange={(e) => cambiar({ fecha_mantenimiento_correctivo: e.target.value || null })}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">N.º de guía</Label>
        <Input value={valor.guia_remision ?? ""} onChange={(e) => cambiar({ guia_remision: e.target.value })} placeholder="Ej.: EG07-921" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label className="text-xs">¿Está en garantía?</Label>
        <select className={select} value={valor.garantia} onChange={(e) => cambiar({ garantia: e.target.value as GarantiaInterna })}>
          {(Object.keys(ETIQUETA_GARANTIA_INTERNA) as GarantiaInterna[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_GARANTIA_INTERNA[k]}
            </option>
          ))}
        </select>
      </div>
      {siNo("problemas", "problemas_detalle", "¿Tuvo algún problema antes?")}
      {siNo("vendido_repuesto", "vendido_repuesto_detalle", "¿Se le vendió repuesto?")}
      <div className="grid gap-1 sm:col-span-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-2">
        <Label className="text-xs">¿Se le vendió mantenimiento?</Label>
        <div className="flex gap-2">
          <select className={`${select} w-44 shrink-0`} value={valor.mantenimiento} onChange={(e) => cambiar({ mantenimiento: e.target.value as MantenimientoInterno })}>
            {(Object.keys(ETIQUETA_MANTENIMIENTO_INTERNO) as MantenimientoInterno[]).map((k) => (
              <option key={k} value={k}>
                {ETIQUETA_MANTENIMIENTO_INTERNO[k]}
              </option>
            ))}
          </select>
          <Input
            value={valor.mantenimiento_detalle ?? ""}
            onChange={(e) => cambiar({ mantenimiento_detalle: e.target.value })}
            placeholder="Cuándo y qué se hizo"
            disabled={valor.mantenimiento === "ninguno"}
          />
        </div>
      </div>
      {siNo("repuesto_cambiado", "repuesto_cambiado_detalle", "¿Se cambió algún repuesto?")}
    </div>
  );
}
