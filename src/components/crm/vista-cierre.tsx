"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, History, Lock, PencilLine, Plus, ShieldCheck, Trash2, Truck, Users, Wallet, X } from "lucide-react";
import { abrirCorreccionInforme, corregirInformeEmitido } from "@/lib/acciones/informes";
import type { CorreccionInforme } from "@/lib/correccion-informe";
import { AdjuntosCierre } from "@/components/crm/adjuntos-cierre";
import { CompendioGestion } from "@/components/crm/compendio-gestion";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { PedirAnulacionBoton } from "@/components/crm/pedir-anulacion-boton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { IGV } from "@/lib/pdf/series";
import { ORDEN_TIPOS_ITEM, TIPOS_ITEM, tipoDeItem, tituloDeItems, type TipoItemInforme } from "@/lib/informes";
import type { AdjuntoCierreFirmado } from "@/lib/adjuntos-cierre";
import type { Compendio } from "@/lib/compendio-cierre";
import type { ContactoInforme } from "@/lib/pdf/informe-cierre-pdf";
import { cn } from "@/lib/utils";

/**
 * El cierre de venta como pantalla —de un vistazo— y, con código, como
 * formulario.
 *
 * Santos, 02-09, viendo la primera versión: «no es tan amigable, debería ser
 * un poco más compactada o en una columna más corta (…) no veo el botón editar
 * (solicitar PIN) para poder editar cualquier parte de dicha vista, que
 * exportará finalmente a un PDF corregido». De ahí las dos decisiones:
 *
 *  · DOS COLUMNAS. A la izquierda lo que se LEE (cliente, equipos, cómo se
 *    hizo la venta); a la derecha, pegado, lo que se CONSULTA (total, pago,
 *    entrega, contactos, expediente). Los tres contactos que eran la misma
 *    persona se muestran una vez con sus tres roles.
 *  · EDITAR ES LA MISMA PANTALLA. «Editar» pide primero el motivo y el
 *    código de Lesly o gerencia —«que al presionar el botón editar aparezca
 *    el modal para pedir PIN», Santos 02-09—; el código abre media hora
 *    (0154) y cada dato se convierte en su campo, en el mismo sitio. Guardar
 *    ya no pide nada. La base archiva la versión anterior entera antes de
 *    reescribir (0153). El PDF se genera siempre desde lo guardado, así que
 *    sale corregido solo.
 *  · LOS BOTONES SE VEN. «Editar» va en granate y «PDF» al lado, los dos
 *    grandes: en la primera versión eran chicos y blancos y costaba dar con
 *    ellos.
 */

export interface ItemVista {
  /** Equipo (por defecto), repuesto o servicio (02-09, caso FANCAVEL de Ariana). */
  tipo?: TipoItemInforme;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  bloque?: "venta" | "gratuito";
}

export interface InformeVista {
  id: string;
  codigo: string | null;
  serie: string;
  fecha: string;
  emitidoAt: string | null;
  anuladoAt: string | null;
  anuladoMotivo: string | null;
  urgente: boolean;
  clienteNuevo: boolean;
  cliente_nombre: string;
  cliente_doc: string | null;
  cliente_direccion: string | null;
  cliente_correo: string | null;
  referencia: string | null;
  asunto: string;
  presupuesto_ref: string | null;
  orden_compra: string | null;
  modalidad_pago: string[];
  forma_pago: string | null;
  comprobante: string | null;
  nota_condiciones: string | null;
  entrega_fecha: string | null;
  entrega_hora: string | null;
  entrega_lugar: string | null;
  entrega_direccion: string | null;
  nota_despacho: string | null;
  contacto_venta: ContactoInforme;
  contacto_contabilidad: ContactoInforme;
  contacto_despacho: ContactoInforme;
  items: ItemVista[];
  incluye: string[];
  gratis: string | null;
  garantia: string | null;
  nota_final: string | null;
  moneda: string;
  monto_total: number;
  version: number;
  corregidoAt: string | null;
  creadoPor: { nombre: string; codigo: string | null } | null;
}

export interface VersionVista {
  version: number;
  archivadaAt: string;
  motivo: string;
  corregidoPor: string | null;
}

/** La ventana que abrió el código: quién autorizó, hasta cuándo, y por qué. */
export interface VentanaVista {
  expiraAt: string;
  autorizo: string;
  motivo: string;
}

const COMPROBANTE: Record<string, string> = { factura: "Factura", boleta_ruc: "Boleta con RUC", boleta_dni: "Boleta con DNI" };
const FORMA_PAGO: Record<string, string> = { transferencia: "Transferencia", deposito: "Depósito" };
const MOTIVO_MIN = 15;

/** Lo editable, como lo edita el formulario (todo texto, sin nulls). */
interface Borrador {
  cliente_nombre: string;
  cliente_doc: string;
  cliente_direccion: string;
  cliente_correo: string;
  referencia: string;
  asunto: string;
  presupuesto_ref: string;
  orden_compra: string;
  cliente_nuevo: boolean;
  urgente: boolean;
  modalidad_pago: string;
  forma_pago: string;
  comprobante: string;
  nota_condiciones: string;
  entrega_fecha: string;
  entrega_hora: string;
  entrega_lugar: string;
  entrega_direccion: string;
  nota_despacho: string;
  contacto_venta: ContactoInforme;
  contacto_contabilidad: ContactoInforme;
  contacto_despacho: ContactoInforme;
  items: ItemVista[];
  incluye: string;
  gratis: string;
  garantia: string;
  nota_final: string;
}

function aBorrador(i: InformeVista): Borrador {
  const c = (x: ContactoInforme | null | undefined): ContactoInforme => ({
    area: x?.area ?? "",
    nombre: x?.nombre ?? "",
    telefono: x?.telefono ?? "",
    correo: x?.correo ?? "",
  });
  return {
    cliente_nombre: i.cliente_nombre,
    cliente_doc: i.cliente_doc ?? "",
    cliente_direccion: i.cliente_direccion ?? "",
    cliente_correo: i.cliente_correo ?? "",
    referencia: i.referencia ?? "",
    asunto: i.asunto,
    presupuesto_ref: i.presupuesto_ref ?? "",
    orden_compra: i.orden_compra ?? "",
    cliente_nuevo: i.clienteNuevo,
    urgente: i.urgente,
    modalidad_pago: i.modalidad_pago.join("\n"),
    forma_pago: i.forma_pago ?? "",
    comprobante: i.comprobante ?? "",
    nota_condiciones: i.nota_condiciones ?? "",
    entrega_fecha: i.entrega_fecha ?? "",
    entrega_hora: i.entrega_hora ?? "",
    entrega_lugar: i.entrega_lugar ?? "",
    entrega_direccion: i.entrega_direccion ?? "",
    nota_despacho: i.nota_despacho ?? "",
    contacto_venta: c(i.contacto_venta),
    contacto_contabilidad: c(i.contacto_contabilidad),
    contacto_despacho: c(i.contacto_despacho),
    items: i.items.map((x) => ({ ...x, bloque: x.bloque ?? "venta" })),
    incluye: i.incluye.join("\n"),
    gratis: i.gratis ?? "",
    garantia: i.garantia ?? "",
    nota_final: i.nota_final ?? "",
  };
}

/** Solo lo que cambió, en la forma que espera la base. */
function diferencias(original: Borrador, editado: Borrador): CorreccionInforme {
  const d: Record<string, unknown> = {};
  const lineas = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(editado) as (keyof Borrador)[]) {
    if (igual(original[k], editado[k])) continue;
    if (k === "modalidad_pago" || k === "incluye") d[k] = lineas(editado[k] as string);
    else if (k === "items") d.items = editado.items.map((i) => ({ ...i, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) }));
    else d[k] = editado[k];
  }
  return d as CorreccionInforme;
}

export function VistaCierre({
  informe,
  adjuntos,
  compendio,
  versiones,
  puedeCorregir,
  correccionAbierta,
  editarBorradorHref = null,
  puedePedirAnulacion = false,
}: {
  informe: InformeVista;
  adjuntos: AdjuntoCierreFirmado[];
  compendio: Compendio | null;
  versiones: VersionVista[];
  /** Dueño del cierre o backoffice, sobre un emitido no anulado. */
  puedeCorregir: boolean;
  /** Si ya hay una ventana viva de este usuario (un F5 a mitad de la corrección no pide otro código). */
  correccionAbierta: VentanaVista | null;
  /** Sobre un BORRADOR: a dónde se sigue editando, sin código (03-09). Null si no le toca a quien mira. */
  editarBorradorHref?: string | null;
  /** Emitido, no anulado y de quien mira: puede pedir que operaciones lo anule (0170). */
  puedePedirAnulacion?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const original = useMemo(() => aBorrador(informe), [informe]);
  const [b, setB] = useState<Borrador>(original);
  const [pidiendoCodigo, setPidiendoCodigo] = useState(false);
  const [ventana, setVentana] = useState<VentanaVista | null>(correccionAbierta);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [abriendo, empezarAbrir] = useTransition();
  const [guardando, empezar] = useTransition();

  // El servidor ya filtró las vencidas; la que abre el cuadro es fresca. Si
  // caducó mientras la pantalla estaba abierta, lo dice la base al guardar.
  const ventanaViva = ventana != null;

  const emitido = informe.emitidoAt != null;
  const anulado = informe.anuladoAt != null;
  const simbolo = informe.moneda === "PEN" ? "S/" : "US$";
  const dinero = (n: number) => `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const items = (editando ? b.items : original.items).filter((i) => i.bloque !== "gratuito");
  const gratuitos = (editando ? b.items : original.items).filter((i) => i.bloque === "gratuito");
  const subtotal = items.reduce((a, i) => a + Number(i.cantidad || 0) * Number(i.precio_unitario || 0), 0);

  const cambios = useMemo(() => diferencias(original, b), [original, b]);
  const nCambios = Object.keys(cambios).length;

  function set<K extends keyof Borrador>(k: K, v: Borrador[K]) {
    setB((x) => ({ ...x, [k]: v }));
  }
  function setItem(idx: number, campo: keyof ItemVista, v: string) {
    setB((x) => {
      const items = x.items.slice();
      const it = { ...items[idx] };
      if (campo === "descripcion") it.descripcion = v;
      else if (campo === "cantidad") it.cantidad = Math.max(0, Math.floor(Number(v) || 0));
      else if (campo === "precio_unitario") it.precio_unitario = Math.max(0, Number(v) || 0);
      else if (campo === "tipo") it.tipo = v === "repuesto" || v === "servicio" ? v : "equipo";
      items[idx] = it;
      return { ...x, items };
    });
  }
  function agregarItem(bloque: "venta" | "gratuito", tipo: TipoItemInforme = "equipo") {
    setB((x) => ({ ...x, items: [...x.items, { tipo, descripcion: "", cantidad: 1, precio_unitario: 0, bloque }] }));
  }
  function quitarItem(idx: number) {
    setB((x) => ({ ...x, items: x.items.filter((_, i) => i !== idx) }));
  }
  function cancelar() {
    setB(original);
    setEditando(false);
  }
  // «Editar»: si la ventana sigue viva se entra directo; si no, el cuadro
  // del motivo y el código. El código lo dicta Lesly o gerencia por teléfono.
  function editar() {
    if (ventana && new Date(ventana.expiraAt).getTime() > Date.now()) setEditando(true);
    else {
      setVentana(null);
      setPidiendoCodigo(true);
    }
  }
  function abrir() {
    empezarAbrir(async () => {
      const r = await abrirCorreccionInforme(informe.id, motivo, pin);
      if (r.error || !r.ventana) {
        toast.error(r.error ?? "No se pudo abrir la corrección", { duration: 8000 });
        setPin("");
        return;
      }
      setVentana({ expiraAt: r.ventana.expiraAt, autorizo: r.ventana.autorizo, motivo: motivo.trim() });
      setPidiendoCodigo(false);
      setEditando(true);
      setPin("");
      toast.success(`Autorizado por ${r.ventana.autorizo}. Tiene ${Math.round(r.ventana.minutos)} minutos para corregir.`);
    });
  }
  function guardar() {
    empezar(async () => {
      const r = await corregirInformeEmitido(informe.id, cambios);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(`Cierre corregido: ahora es la versión ${r.version ?? informe.version + 1}. El PDF ya sale corregido.`);
      setEditando(false);
      setVentana(null);
      setMotivo("");
      router.refresh();
    });
  }

  // Los índices reales dentro de b.items, para editar por bloque sin perder la posición.
  const indicesDe = (bloque: "venta" | "gratuito") =>
    b.items.map((it, i) => ((it.bloque ?? "venta") === bloque ? i : -1)).filter((i) => i >= 0);

  const contactosVista = agruparContactos([
    ["Venta", informe.contacto_venta],
    ["Contabilidad", informe.contacto_contabilidad],
    ["Despacho", informe.contacto_despacho],
  ]);

  return (
    <div className="space-y-4">
      {/* ── Cabecera: qué es, en qué estado, y qué se puede hacer ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight text-foreground">
            {emitido ? `Informe N.º ${informe.codigo}` : "Borrador de cierre"}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                informe.serie === "OPEN" ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {informe.serie === "OPEN" ? "Open Investments" : "Efameinsa"}
            </span>
            {informe.urgente && !anulado && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">URGENTE</span>
            )}
            {informe.version > 1 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                versión {informe.version}
              </span>
            )}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {anulado ? (
              <>
                <Lock className="size-3.5 flex-none" />
                <span>
                  <b className="uppercase text-foreground">Anulado</b>
                  {informe.anuladoMotivo ? ` · ${informe.anuladoMotivo}` : ""} · conserva su número, no cuenta, y hay que emitir uno nuevo.
                </span>
              </>
            ) : emitido ? (
              <>
                <ShieldCheck className="size-3.5 flex-none" />
                <span>
                  Emitido el {fechaHoraLima(informe.emitidoAt)}
                  {informe.creadoPor ? ` por ${informe.creadoPor.nombre}${informe.creadoPor.codigo ? ` (${informe.creadoPor.codigo})` : ""}` : ""}
                  {informe.corregidoAt ? ` · corregido el ${fechaHoraLima(informe.corregidoAt)}` : ""} · sellado: corregir o agregar documentos
                  pide el código de operaciones o gerencia.
                </span>
              </>
            ) : (
              <>
                <Lock className="size-3.5 flex-none" />
                <span>
                  Borrador sin numerar: no llegó a Central ni cuenta. Se edita sin código —el código se pide recién
                  cuando el informe tiene número— y se borra desde la lista.
                </span>
              </>
            )}
          </p>
        </div>
        {/* Los dos botones grandes y distintos: granate el que cambia algo,
            blanco el que solo abre el documento. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Un borrador se sigue en el formulario, sin código (Santos, 03-09:
              «no tiene sentido que se guarden en borrador si no se pueden
              editar»). El PIN es para lo numerado. */}
          {!emitido && !anulado && editarBorradorHref && (
            <Button
              size="lg"
              className="h-11 px-5 text-sm font-semibold shadow-sm"
              render={
                <Link href={editarBorradorHref}>
                  <PencilLine className="size-4" /> Editar
                </Link>
              }
            />
          )}
          {puedeCorregir && !editando && (
            <Button size="lg" onClick={editar} className="h-11 px-5 text-sm font-semibold shadow-sm">
              <PencilLine className="size-4" /> {ventanaViva ? "Seguir corrigiendo" : "Editar"}
            </Button>
          )}
          {/* La venta se cayó después de emitir: el comercial lo pide,
              operaciones lo ejecuta con su código (Carlos, 04-09 14:30). */}
          {puedePedirAnulacion && !editando && (
            <PedirAnulacionBoton informeId={informe.id} codigo={informe.codigo} />
          )}
          <a
            href={`/api/informes/${informe.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md border-2 border-primary/50 bg-background px-5 text-sm font-semibold text-primary shadow-sm hover:bg-primary/5"
          >
            <FileText className="size-4" /> {emitido ? "Ver PDF" : "Borrador en PDF"}
          </a>
        </div>
      </div>

      {editando && ventana && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          <span>
            <b>Corrigiendo con autorización de {ventana.autorizo}</b> · válida hasta las{" "}
            {new Date(ventana.expiraAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })} · «
            {ventana.motivo}». Cambie lo que haga falta en su sitio: la razón social tal como el cliente la quiere, los renglones vendidos, el pago.
            La serie, el número, la fecha y la ficha a la que pertenece no se tocan: si eso está mal, se anula.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {/* ══ Columna de lectura ══ */}
        <div className="space-y-4">
          {/* Cliente */}
          <Tarjeta titulo="Cliente">
            {editando ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo etiqueta="Razón social" className="sm:col-span-2">
                  <Input value={b.cliente_nombre} onChange={(e) => set("cliente_nombre", e.target.value)} />
                </Campo>
                <Campo etiqueta="RUC / DNI">
                  <Input value={b.cliente_doc} onChange={(e) => set("cliente_doc", e.target.value)} className="font-mono" />
                </Campo>
                <Campo etiqueta="Correo">
                  <Input value={b.cliente_correo} onChange={(e) => set("cliente_correo", e.target.value)} />
                </Campo>
                <Campo etiqueta="Dirección" className="sm:col-span-2">
                  <Input value={b.cliente_direccion} onChange={(e) => set("cliente_direccion", e.target.value)} />
                </Campo>
                <Campo etiqueta="Presupuesto">
                  <Input value={b.presupuesto_ref} onChange={(e) => set("presupuesto_ref", e.target.value)} />
                </Campo>
                <Campo etiqueta="O/C del cliente">
                  <Input value={b.orden_compra} onChange={(e) => set("orden_compra", e.target.value)} />
                </Campo>
                <Campo etiqueta="Referencia">
                  <Input value={b.referencia} onChange={(e) => set("referencia", e.target.value)} />
                </Campo>
                <Campo etiqueta="Asunto">
                  <Input value={b.asunto} onChange={(e) => set("asunto", e.target.value)} />
                </Campo>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={b.cliente_nuevo} onChange={(e) => set("cliente_nuevo", e.target.checked)} /> Cliente nuevo
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={b.urgente} onChange={(e) => set("urgente", e.target.checked)} /> Urgente
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-tight text-foreground">{informe.cliente_nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {informe.cliente_doc && <span className="font-mono">{informe.cliente_doc}</span>}
                    {informe.cliente_doc && informe.cliente_correo && " · "}
                    {informe.cliente_correo}
                  </p>
                  {informe.cliente_direccion && <p className="text-xs text-muted-foreground">{informe.cliente_direccion}</p>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd className="font-medium text-foreground">{fechaCalendario(informe.fecha)}</dd>
                  {informe.presupuesto_ref && (
                    <>
                      <dt className="text-muted-foreground">Presupuesto</dt>
                      <dd className="font-medium text-foreground">{informe.presupuesto_ref}</dd>
                    </>
                  )}
                  {informe.orden_compra && (
                    <>
                      <dt className="text-muted-foreground">O/C</dt>
                      <dd className="font-medium text-foreground">{informe.orden_compra}</dd>
                    </>
                  )}
                  {informe.referencia && (
                    <>
                      <dt className="text-muted-foreground">Ref.</dt>
                      <dd className="text-foreground">{informe.referencia}</dd>
                    </>
                  )}
                  {informe.clienteNuevo && (
                    <>
                      <dt />
                      <dd>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Cliente nuevo</span>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            )}
          </Tarjeta>

          {/* Equipos, repuestos o servicios: el título dice lo que hay (02-09). */}
          <Tarjeta
            titulo={tituloDeItems(editando ? b.items : original.items)}
            accion={
              editando ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {ORDEN_TIPOS_ITEM.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => agregarItem("venta", t)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Plus className="size-3.5" /> {TIPOS_ITEM[t].singular}
                    </button>
                  ))}
                </span>
              ) : undefined
            }
          >
            <TablaItems
              filas={editando ? indicesDe("venta").map((i) => ({ idx: i, it: b.items[i] })) : items.map((it, i) => ({ idx: i, it }))}
              editando={editando}
              dinero={dinero}
              subtotal={subtotal}
              onCambiar={setItem}
              onQuitar={quitarItem}
            />
            {(editando || gratuitos.length > 0) && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Sin costo para el cliente</p>
                  {editando && (
                    <button type="button" onClick={() => agregarItem("gratuito")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Plus className="size-3.5" /> Agregar
                    </button>
                  )}
                </div>
                {gratuitos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada sin costo.</p>
                ) : (
                  <TablaItems
                    filas={editando ? indicesDe("gratuito").map((i) => ({ idx: i, it: b.items[i] })) : gratuitos.map((it, i) => ({ idx: i, it }))}
                    editando={editando}
                    dinero={dinero}
                    onCambiar={setItem}
                    onQuitar={quitarItem}
                  />
                )}
              </div>
            )}

            {editando ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Campo etiqueta="Incluye (una línea por punto)" className="sm:col-span-2">
                  <Textarea rows={4} value={b.incluye} onChange={(e) => set("incluye", e.target.value)} />
                </Campo>
                <Campo etiqueta="Gratis">
                  <Input value={b.gratis} onChange={(e) => set("gratis", e.target.value)} />
                </Campo>
                <Campo etiqueta="Garantía">
                  <Input value={b.garantia} onChange={(e) => set("garantia", e.target.value)} />
                </Campo>
                <Campo etiqueta="Nota final" className="sm:col-span-2">
                  <Textarea rows={2} value={b.nota_final} onChange={(e) => set("nota_final", e.target.value)} />
                </Campo>
              </div>
            ) : (
              (informe.incluye.length > 0 || informe.gratis || informe.garantia || informe.nota_final) && (
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-[1fr_auto]">
                  {informe.incluye.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Incluye</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {informe.incluye.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-1 text-muted-foreground">
                    {informe.gratis && (
                      <p>
                        <b className="text-foreground">Gratis:</b> {informe.gratis}
                      </p>
                    )}
                    {informe.garantia && (
                      <p>
                        <b className="text-foreground">Garantía:</b> {informe.garantia}
                      </p>
                    )}
                    {informe.nota_final && (
                      <p>
                        <b className="text-foreground">Nota:</b> {informe.nota_final}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </Tarjeta>

          {compendio && !editando && <CompendioGestion compendio={compendio} compacto />}

          {versiones.length > 0 && !editando && (
            <Tarjeta titulo="Correcciones" icono={<History className="size-3.5" />}>
              <ul className="space-y-1.5 text-xs">
                {versiones.map((v) => (
                  <li key={v.version} className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">Versión {v.version}</span>
                    <span>archivada el {fechaHoraLima(v.archivadaAt)}</span>
                    {v.corregidoPor && <span>· por {v.corregidoPor}</span>}
                    <span className="basis-full text-foreground">«{v.motivo}»</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        {/* ══ Columna de consulta ══ */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-3 text-right shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total con IGV</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {dinero(editando ? subtotal * (1 + IGV) : Number(informe.monto_total))}
            </p>
            {editando && subtotal * (1 + IGV) !== Number(informe.monto_total) && (
              <p className="text-[11px] text-amber-700">antes {dinero(Number(informe.monto_total))}</p>
            )}
          </div>

          <Tarjeta titulo="Pago" icono={<Wallet className="size-3.5" />} compacta>
            {editando ? (
              <div className="space-y-2">
                <Campo etiqueta="Modalidad (una por línea)">
                  <Textarea rows={3} value={b.modalidad_pago} onChange={(e) => set("modalidad_pago", e.target.value)} />
                </Campo>
                <Campo etiqueta="Forma">
                  <Selector value={b.forma_pago} onChange={(v) => set("forma_pago", v)} opciones={FORMA_PAGO} />
                </Campo>
                <Campo etiqueta="Comprobante">
                  <Selector value={b.comprobante} onChange={(v) => set("comprobante", v)} opciones={COMPROBANTE} />
                </Campo>
                <Campo etiqueta="Condiciones">
                  <Textarea rows={2} value={b.nota_condiciones} onChange={(e) => set("nota_condiciones", e.target.value)} />
                </Campo>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                {informe.modalidad_pago.length ? (
                  informe.modalidad_pago.map((m) => (
                    <p key={m} className="leading-snug text-foreground">
                      {m}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {[informe.forma_pago && FORMA_PAGO[informe.forma_pago], informe.comprobante && COMPROBANTE[informe.comprobante]]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {informe.nota_condiciones && <p className="text-xs text-muted-foreground">{informe.nota_condiciones}</p>}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Entrega" icono={<Truck className="size-3.5" />} compacta>
            {editando ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta="Fecha">
                    <Input value={b.entrega_fecha} onChange={(e) => set("entrega_fecha", e.target.value)} placeholder="Por confirmar" />
                  </Campo>
                  <Campo etiqueta="Hora">
                    <Input value={b.entrega_hora} onChange={(e) => set("entrega_hora", e.target.value)} />
                  </Campo>
                </div>
                <Campo etiqueta="Lugar">
                  <Input value={b.entrega_lugar} onChange={(e) => set("entrega_lugar", e.target.value)} />
                </Campo>
                <Campo etiqueta="Dirección">
                  <Textarea rows={2} value={b.entrega_direccion} onChange={(e) => set("entrega_direccion", e.target.value)} />
                </Campo>
                <Campo etiqueta="Nota de despacho">
                  <Textarea rows={3} value={b.nota_despacho} onChange={(e) => set("nota_despacho", e.target.value)} />
                </Campo>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  {informe.entrega_fecha ? fechaCalendario(informe.entrega_fecha) : "Sin fecha"}
                  {informe.entrega_hora && ` · ${informe.entrega_hora}`}
                </p>
                {informe.entrega_lugar && <p className="text-xs text-foreground">{informe.entrega_lugar}</p>}
                {informe.entrega_direccion && <p className="whitespace-pre-line text-xs text-muted-foreground">{informe.entrega_direccion}</p>}
                {informe.nota_despacho && (
                  <p className="mt-1 rounded-md bg-amber-500/10 p-2 text-xs leading-snug text-amber-800">{informe.nota_despacho}</p>
                )}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Contactos" icono={<Users className="size-3.5" />} compacta>
            {editando ? (
              <div className="space-y-3">
                {(
                  [
                    ["contacto_venta", "Venta"],
                    ["contacto_contabilidad", "Contabilidad"],
                    ["contacto_despacho", "Recibe el despacho"],
                  ] as const
                ).map(([k, rotulo]) => (
                  <div key={k} className="space-y-1.5 rounded-md border border-border p-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
                    <Input placeholder="Nombre" value={b[k].nombre ?? ""} onChange={(e) => set(k, { ...b[k], nombre: e.target.value })} />
                    <Input placeholder="Área o cargo" value={b[k].area ?? ""} onChange={(e) => set(k, { ...b[k], area: e.target.value })} />
                    <Input placeholder="Teléfono" value={b[k].telefono ?? ""} onChange={(e) => set(k, { ...b[k], telefono: e.target.value })} />
                    <Input placeholder="Correo" value={b[k].correo ?? ""} onChange={(e) => set(k, { ...b[k], correo: e.target.value })} />
                  </div>
                ))}
              </div>
            ) : contactosVista.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin contactos.</p>
            ) : (
              <ul className="space-y-2">
                {contactosVista.map((c) => (
                  <li key={c.clave} className="text-sm">
                    <p className="font-medium text-foreground">{c.nombre || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{c.roles.join(" · ")}</p>
                    {c.area && <p className="text-xs text-muted-foreground">{c.area}</p>}
                    {c.telefono && <p className="text-xs text-muted-foreground">{c.telefono}</p>}
                    {c.correo && <p className="text-xs text-muted-foreground">{c.correo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {!editando && (
            <Tarjeta
              titulo="Expediente"
              icono={<FileText className="size-3.5" />}
              compacta
              accion={
                <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums text-foreground">{adjuntos.length}</span>
              }
            >
              <AdjuntosCierre informeId={informe.id} adjuntos={adjuntos} emitido={emitido} compacto />
              {emitido && !anulado && (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Agregar pide el código y queda firmado. Quitar no se puede: el expediente solo crece.
                </p>
              )}
            </Tarjeta>
          )}
        </aside>
      </div>

      {/* ── Barra de guardar, solo mientras se edita ── */}
      {editando && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 shadow-lg">
          <p className="text-xs text-muted-foreground">
            {nCambios === 0 ? "Todavía no cambió nada." : `${nCambios} ${nCambios === 1 ? "dato cambiado" : "datos cambiados"} · sin guardar`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelar} disabled={guardando}>
              <X className="size-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={guardar} disabled={nCambios === 0 || guardando}>
              <ShieldCheck className="size-3.5" /> {guardando ? "Guardando…" : "Guardar corrección"}
            </Button>
          </div>
        </div>
      )}

      {/* El cuadro que aparece al tocar «Editar»: motivo y código, en ese
          orden, porque el motivo es lo que se le lee por teléfono a quien
          dicta el código. */}
      <Dialog open={pidiendoCodigo} onOpenChange={setPidiendoCodigo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corregir el informe N.º {informe.codigo}</DialogTitle>
            <DialogDescription>
              Un cierre emitido solo se corrige con autorización. Diga qué está mal y pida el código de cuatro dígitos a Lesly
              (operaciones) o a gerencia: abre media hora para corregir en esta misma pantalla. La versión de hoy queda archivada y el
              PDF sale corregido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="motivo-correccion">
                Qué estaba mal
              </label>
              <Textarea
                id="motivo-correccion"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej. El teléfono del contacto de despacho estaba con un dígito cambiado"
              />
              <p className={cn("mt-1 text-[11px]", motivo.trim().length >= MOTIVO_MIN ? "text-[#1E7F4F]" : "text-muted-foreground")}>
                {motivo.trim().length >= MOTIVO_MIN
                  ? `✓ ${motivo.trim().length} caracteres`
                  : `${motivo.trim().length} de ${MOTIVO_MIN} caracteres mínimos`}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="codigo-correccion">
                Código de Lesly o gerencia
              </label>
              <CampoCodigo id="codigo-correccion" valor={pin} onChange={setPin} autoFocus={motivo.trim().length >= MOTIVO_MIN} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPidiendoCodigo(false)} disabled={abriendo}>
              Cancelar
            </Button>
            <Button size="sm" onClick={abrir} disabled={abriendo || motivo.trim().length < MOTIVO_MIN || pin.length !== 4}>
              {abriendo ? "Verificando…" : "Abrir la corrección"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────

function Tarjeta({
  titulo,
  icono,
  accion,
  compacta = false,
  children,
}: {
  titulo: string;
  icono?: React.ReactNode;
  accion?: React.ReactNode;
  compacta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-sm", compacta ? "p-3" : "p-4")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {icono}
          {titulo}
        </h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Campo({ etiqueta, className, children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">{etiqueta}</span>
      {children}
    </label>
  );
}

function Selector({ value, onChange, opciones }: { value: string; onChange: (v: string) => void; opciones: Record<string, string> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
    >
      <option value="">—</option>
      {Object.entries(opciones).map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

function TablaItems({
  filas,
  editando,
  dinero,
  subtotal,
  onCambiar,
  onQuitar,
}: {
  filas: { idx: number; it: ItemVista }[];
  editando: boolean;
  dinero: (n: number) => string;
  subtotal?: number;
  onCambiar: (idx: number, campo: keyof ItemVista, v: string) => void;
  onQuitar: (idx: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1.5 font-medium">Descripción</th>
            <th className="w-16 pb-1.5 pl-2 text-right font-medium">Cant.</th>
            <th className="w-28 pb-1.5 pl-2 text-right font-medium">P. unitario</th>
            <th className="w-28 pb-1.5 pl-2 text-right font-medium">Total</th>
            {editando && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ idx, it }) => (
            <tr key={idx} className="border-b border-border align-top last:border-0">
              <td className="py-1.5 pr-2">
                {editando ? (
                  <div className="space-y-1">
                    <select
                      value={tipoDeItem(it)}
                      onChange={(e) => onCambiar(idx, "tipo", e.target.value)}
                      aria-label="Tipo de renglón"
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] text-foreground"
                    >
                      {ORDEN_TIPOS_ITEM.map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_ITEM[t].singular}
                        </option>
                      ))}
                    </select>
                    <Textarea
                      rows={2}
                      value={it.descripcion}
                      placeholder={TIPOS_ITEM[tipoDeItem(it)].ejemplo}
                      onChange={(e) => onCambiar(idx, "descripcion", e.target.value)}
                      className="min-h-0 text-xs"
                    />
                  </div>
                ) : (
                  <span className="whitespace-pre-line text-xs leading-snug text-foreground">
                    {tipoDeItem(it) !== "equipo" && (
                      <span className="mr-1.5 rounded bg-secondary px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {TIPOS_ITEM[tipoDeItem(it)].singular}
                      </span>
                    )}
                    {it.descripcion}
                  </span>
                )}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums">
                {editando ? (
                  <Input type="number" min={0} step={1} value={it.cantidad} onChange={(e) => onCambiar(idx, "cantidad", e.target.value)} className="h-8 text-right" />
                ) : (
                  it.cantidad
                )}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums">
                {editando ? (
                  <Input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={(e) => onCambiar(idx, "precio_unitario", e.target.value)} className="h-8 text-right" />
                ) : (
                  dinero(Number(it.precio_unitario))
                )}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums text-foreground">{dinero(Number(it.cantidad || 0) * Number(it.precio_unitario || 0))}</td>
              {editando && (
                <td className="py-1.5 pl-1 text-right">
                  <button
                    type="button"
                    onClick={() => onQuitar(idx)}
                    aria-label="Quitar este renglón"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {subtotal !== undefined && (
          <tfoot className="text-xs">
            <tr>
              <td colSpan={3} className="pt-2 text-right text-muted-foreground">
                Subtotal
              </td>
              <td className="pt-2 pl-2 text-right tabular-nums">{dinero(subtotal)}</td>
              {editando && <td />}
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-muted-foreground">
                IGV {Math.round(IGV * 100)}%
              </td>
              <td className="pl-2 text-right tabular-nums">{dinero(subtotal * IGV)}</td>
              {editando && <td />}
            </tr>
            <tr className="font-semibold text-foreground">
              <td colSpan={3} className="pt-1 text-right">
                Total
              </td>
              <td className="pt-1 pl-2 text-right tabular-nums">{dinero(subtotal * (1 + IGV))}</td>
              {editando && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Tres roles que suelen ser la misma persona: se muestra una vez con sus roles. */
function agruparContactos(entradas: [string, ContactoInforme | null | undefined][]) {
  const grupos = new Map<string, { clave: string; nombre: string; area: string; telefono: string; correo: string; roles: string[] }>();
  for (const [rol, c] of entradas) {
    if (!c || !(c.nombre || c.telefono || c.correo)) continue;
    const clave = [c.nombre, c.telefono, c.correo].map((x) => (x ?? "").trim().toLowerCase()).join("|");
    const g = grupos.get(clave);
    if (g) g.roles.push(rol);
    else grupos.set(clave, { clave, nombre: c.nombre ?? "", area: c.area ?? "", telefono: c.telefono ?? "", correo: c.correo ?? "", roles: [rol] });
  }
  return [...grupos.values()];
}
