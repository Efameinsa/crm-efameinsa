"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, FileText, Plus, Trash2, TriangleAlert } from "lucide-react";
import { INCLUYE_POR_DEFECTO, avisosDeIdentidad } from "@/lib/informes";
import { GARANTIA_POR_DEFECTO, GARANTIAS_FRECUENTES } from "@/lib/pdf/series";
import {
  guardarBorradorInforme,
  emitirInforme,
  guardarContactoEntrega,
  quitarAdjuntoInforme,
  type DatosInforme,
  type ItemInformeEntrada,
  type PrellenadoInforme,
  type PresupuestoDisponible,
  type ContactoEntrada,
} from "@/lib/acciones/informes";
import { ChipAdjunto, PastillasAdjuntar, subirArchivosCierre, type AdjuntoPendiente } from "@/components/crm/adjuntos-cierre";
import { MAX_ADJUNTOS, type TipoAdjunto } from "@/lib/adjuntos-cierre";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { SelectorHora } from "@/components/crm/selector-hora";
import { cn } from "@/lib/utils";
import { fechaCalendario } from "@/lib/fechas";
import { hoyLima } from "@/lib/periodo";

// Informe de cierre de ventas: la pantalla que el comercial llena.
//
// CRITERIO DE DISEÑO (decidido con Darwin el 21-08): el documento tiene 26
// campos y el comercial no debería verlos todos. El CRM llena lo que ya sabe
// —cliente, RUC, dirección, contactos, Nº de presupuesto y los equipos que ese
// presupuesto listaba— y arriba se dice cuántos resolvió; abajo solo quedan
// los que el sistema NO puede adivinar: el reparto del pago, el despacho y las
// observaciones. Todo lo prellenado sigue ahí, plegado, por si hay que
// corregirlo.
//
// No es un constructor tipo HubSpot a propósito. El motor de esos editores es
// la biblioteca de productos, que gerencia todavía no entrega; y este
// documento vale justamente porque SIEMPRE se ve igual — Central lo lee todos
// los días y busca cada dato en el mismo sitio.

// Valor cuando la entrega todavia no tiene fecha u hora cerrada.
const POR_CONFIRMAR = "Por confirmar";

// Las 4 primeras son las casillas fijas del documento impreso (no tocar el
// orden ni el texto: así las conoce Central). La 5ta es un preset nuevo
// (Carlos, 21-08: "30% adelanto + 70% antes del despacho" es la política
// general de la empresa y no existía en la lista) — se imprime como fila
// adicional bajo la tabla fija, ver informe-cierre-pdf.tsx.
const MODALIDADES = ["CONTADO", "CREDITO", "50% ADELANTO", "50% CREDITO", "30% ADELANTO + 70% ANTES DEL DESPACHO"] as const;

const COMPROBANTES = [
  ["factura", "Factura"],
  ["boleta_ruc", "Boleta con RUC"],
  ["boleta_dni", "Boleta con DNI"],
] as const;

function Campo({ etiqueta, children, pista }: { etiqueta: string; children: React.ReactNode; pista?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-foreground">{etiqueta}</span>
      {pista && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{pista}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Pastilla({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        activa
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Los equipos con los que arranca el informe cuando se elige un presupuesto.
 *
 * Del archivo viejo solo se conoce el NOMBRE del equipo, así que las cantidades
 * y los precios quedan en cero y el comercial los escribe. Las cotizaciones del
 * CRM, en cambio, traen el renglón entero —cantidad y precio ya aprobados—, así
 * que se copian tal cual: es la misma cotización que el cliente aceptó y volver
 * a teclearla es donde se cuelan los errores.
 */
function equiposDe(p: PresupuestoDisponible | undefined): ItemInformeEntrada[] {
  if (!p) return [];
  if (p.lineas?.length)
    return p.lineas.map((l) => ({
      bloque: "venta" as const,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));
  return (p.items ?? []).map((nombre) => ({
    bloque: "venta" as const,
    descripcion: nombre,
    cantidad: 1,
    precio_unitario: 0,
  }));
}

export function FormularioInforme({
  prellenado,
  ventaPreseleccionada,
}: {
  prellenado: PrellenadoInforme;
  /** Cuando se llega desde el aviso de "Mi día", ya se sabe de qué venta es. */
  ventaPreseleccionada?: string;
}) {
  const router = useRouter();
  const hoyISO = hoyLima();
  const [guardando, startTransition] = useTransition();
  const [informeId, setInformeId] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  const { cuenta, contactos, presupuestos, ventasSinInforme } = prellenado;

  // A qué venta corresponde el informe. Atarlo es lo que después permite
  // avisarle al comercial qué venta le quedó sin informe: sin esto el
  // documento queda suelto y el sistema no puede echar de menos ninguno.
  const [ventaId, setVentaId] = useState<string | null>(
    ventaPreseleccionada ?? (ventasSinInforme.length === 1 ? ventasSinInforme[0].id : null),
  );
  const venta = ventasSinInforme.find((v) => v.id === ventaId) ?? null;
  const principal: ContactoEntrada = contactos[0] ?? {};

  const [presupuestoId, setPresupuestoId] = useState<string>(presupuestos[0]?.id ?? "");
  const presupuesto = presupuestos.find((p) => p.id === presupuestoId);

  // Los equipos arrancan con los que listaba el presupuesto del archivo. El
  // documento imprime la ficha técnica completa y el archivo solo guarda el
  // nombre del equipo, así que el comercial completa marca y modelo — que es
  // exactamente lo que hoy escribe a mano en el Word.
  const [items, setItems] = useState<ItemInformeEntrada[]>(() => equiposDe(presupuestos[0]));

  const [serie, setSerie] = useState<"EFAMEINSA" | "OPEN">(presupuestos[0]?.serie ?? "EFAMEINSA");
  const [comprobante, setComprobante] = useState<"factura" | "boleta_ruc" | "boleta_dni">("factura");
  const [clienteNuevo, setClienteNuevo] = useState(cuenta.esNueva);
  const [clienteNombre, setClienteNombre] = useState(cuenta.razon_social);
  const [clienteDoc, setClienteDoc] = useState(cuenta.num_doc ?? "");
  const [clienteDireccion, setClienteDireccion] = useState(cuenta.direccion ?? "");
  const [clienteCorreo, setClienteCorreo] = useState(principal.correo ?? "");
  const [ordenCompra, setOrdenCompra] = useState("");

  const [modalidad, setModalidad] = useState<string[]>([]);
  // Combinación negociada que no calza con ninguna casilla (ej. "50%
  // adelanto + 35% antes del despacho + 15% a la puesta en marcha") — Carlos
  // la pidió explícitamente porque esto pasa en la práctica y una lista fija
  // nunca la va a cubrir toda.
  const [modalidadOtra, setModalidadOtra] = useState("");
  const [formaPago, setFormaPago] = useState<"transferencia" | "deposito" | null>("transferencia");
  const [notaCondiciones, setNotaCondiciones] = useState("");
  // La garantía del cierre (migración 0104). Arranca con la que se le cotizó a
  // este cliente —el papel que firmó— y solo si no hay cotización cae en la de
  // por defecto. Antes era el primer renglón de «Incluye», dentro de la sección
  // plegada: no aparecía, y para cambiarla había que ir a buscarla ahí.
  const [garantia, setGarantia] = useState(presupuestos[0]?.garantia ?? GARANTIA_POR_DEFECTO);

  // Entrega: solo calendario/reloj + pastilla "Por confirmar" (B2/B3 del
  // plan 11). Los modos "texto libre" que existían hasta el 23-08 se
  // quitaron a pedido de Darwin.
  // El selector trabaja en ISO (YYYY-MM-DD); lo que se guarda/imprime es
  // "DD/MM/AAAA" como el resto del documento — se separan para poder volver
  // a abrir el selector en la misma fecha.
  const [entregaFechaIso, setEntregaFechaIso] = useState<string | null>(null);
  const [entregaFecha, setEntregaFecha] = useState("");
  const [entregaHora, setEntregaHora] = useState(POR_CONFIRMAR);
  const [entregaLugar, setEntregaLugar] = useState("");
  const [entregaDireccion, setEntregaDireccion] = useState(cuenta.direccion ?? "");
  const [notaDespacho, setNotaDespacho] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [contactoDespachoIdx, setContactoDespachoIdx] = useState(0);
  // B4: quien recibe la entrega puede no estar entre los contactos de la
  // cuenta. Si el cliente no tiene ninguno cargado, se arranca directamente
  // en "otra persona" porque no hay nada que elegir.
  const [otroRecibe, setOtroRecibe] = useState(contactos.length === 0);
  const [otroNombre, setOtroNombre] = useState("");
  const [otroDocumento, setOtroDocumento] = useState("");
  const [otroTelefono, setOtroTelefono] = useState("");

  const [incluye, setIncluye] = useState<string[]>(INCLUYE_POR_DEFECTO);
  const [gratis, setGratis] = useState("");
  const [notaFinal, setNotaFinal] = useState("");

  // Expediente: la OC del cliente, el voucher, la cotización firmada. Los
  // archivos esperan en el navegador y suben al guardar, cuando el informe ya
  // tiene id — así adjuntar algo no obliga a crear antes un borrador a medias
  // (mismo camino que el registro de gestión).
  const [pendientes, setPendientes] = useState<AdjuntoPendiente[]>([]);
  const [subidos, setSubidos] = useState<{ tipo: string; nombre: string; path: string }[]>([]);

  const totales = useMemo(() => {
    const subtotal = items
      .filter((i) => i.bloque !== "gratuito")
      .reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
    return { subtotal, igv: subtotal * 0.18, total: subtotal * 1.18 };
  }, [items]);

  // Al elegir la venta, se engancha sola la cotización del archivo que lleva
  // ese mismo Nº de presupuesto: es la que trae los equipos correctos y evita
  // que el comercial tenga que adivinar cuál de la lista le toca (B5).
  function alCambiarVenta(id: string | null) {
    setVentaId(id);
    const v = ventasSinInforme.find((x) => x.id === id);
    if (!v?.referencia) return;
    const calza = presupuestos.find((p) => p.codigo === v.referencia);
    if (calza && calza.id !== presupuestoId) alCambiarPresupuesto(calza.id);
  }

  function alCambiarPresupuesto(id: string) {
    setPresupuestoId(id);
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    setSerie(p.serie);
    // La garantía del cierre es la que se cotizó: si el papel que el cliente
    // firmó dice 12 meses, el informe a Central no puede decir 24. Solo las
    // cotizaciones del CRM la traen; las del archivo viejo no la tienen
    // registrada y se queda la que ya estaba.
    if (p.garantia) setGarantia(p.garantia);
    // Solo se pisan los equipos si el comercial todavía no puso precios: si ya
    // estuvo escribiendo, cambiar de presupuesto no puede borrarle el trabajo.
    const intacto = items.every((i) => i.precio_unitario === 0);
    if (intacto) setItems(equiposDe(p));
  }

  function datos(): DatosInforme {
    const contactoDespacho: ContactoEntrada = otroRecibe
      ? {
          nombre: otroNombre.trim() || null,
          documento: otroDocumento.trim() || null,
          telefono: otroTelefono.trim() || null,
          area: "Recepción de despacho",
        }
      : contactos[contactoDespachoIdx] ?? principal;
    return {
      serie,
      presupuestoRef: presupuesto?.codigo ?? venta?.referencia ?? null,
      oportunidadId: venta?.oportunidadId ?? null,
      ventaId: venta?.id ?? null,
      // Si el presupuesto elegido es una cotización del CRM, el informe queda
      // atado a ella: es la trazabilidad que el archivo viejo no puede dar.
      cotizacionId: presupuesto?.fuente === "crm" ? presupuesto.id : null,
      comprobante,
      clienteNuevo,
      clienteNombre,
      clienteDoc: clienteDoc || null,
      clienteDireccion: clienteDireccion || null,
      clienteCorreo: clienteCorreo || null,
      ordenCompra: ordenCompra || null,
      contactoVenta: principal,
      contactoContabilidad: principal,
      contactoDespacho,
      modalidadPago: modalidadOtra.trim() ? [...modalidad, modalidadOtra.trim()] : modalidad,
      formaPago,
      moneda: "USD",
      notaCondiciones: notaCondiciones || null,
      garantia: garantia.trim() || null,
      entregaFecha: entregaFecha || null,
      entregaHora: entregaHora || null,
      entregaLugar: entregaLugar || null,
      entregaDireccion: entregaDireccion || null,
      notaDespacho: notaDespacho || null,
      urgente,
      incluye: incluye.filter((x) => x.trim()),
      gratis: gratis || null,
      notaFinal: notaFinal || null,
      items,
    };
  }

  // A quién se le factura. Hasta hoy la razón social y el RUC eran dos cajas
  // de texto enterradas en "Ver y editar lo prellenado": se podían cambiar sin
  // que nada avisara, y el PDF salía diciendo una cosa mientras la cartera
  // decía otra. La regla vive en lib/informes.ts, con sus pruebas.
  const avisosIdentidad = avisosDeIdentidad(
    { nombre: clienteNombre, doc: clienteDoc },
    { razonSocial: cuenta.razon_social, numDoc: cuenta.num_doc },
  );

  // B6: un equipo sin precio sale en el PDF con "Monto total 0,00" y nadie se
  // entera hasta que el documento ya está enviado — le pasó a Darwin el 23-08.
  // Se avisa, pero NO se bloquea: un equipo puede ir de regalo a propósito.
  const sinPrecio = items.filter((i) => i.bloque !== "gratuito" && i.descripcion.trim() && i.precio_unitario <= 0);

  function guardar(): Promise<string | null> {
    return new Promise((resolver) => {
      startTransition(async () => {
        // Si la entrega la recibe alguien nuevo, queda como contacto del
        // cliente antes de guardar el informe (B4).
        if (otroRecibe && otroNombre.trim()) {
          const rc = await guardarContactoEntrega({
            cuentaId: cuenta.id,
            nombre: otroNombre,
            documento: otroDocumento,
            telefono: otroTelefono,
          });
          if (rc.error) toast.error(`No se pudo guardar el contacto: ${rc.error}`);
        }
        const r = await guardarBorradorInforme(cuenta.id, datos(), informeId ?? undefined);
        if (r.error) {
          toast.error(r.error);
          resolver(null);
          return;
        }
        setInformeId(r.informeId!);

        // Los adjuntos van después: recién acá el informe tiene id, que es la
        // carpeta donde viven los archivos. Si una subida falla se corta —el
        // borrador queda guardado, pero no se emite un cierre al que le falta
        // el voucher que la comercial creyó haber mandado.
        if (pendientes.length) {
          const ra = await subirArchivosCierre(r.informeId!, pendientes);
          if (ra.error) {
            toast.error(ra.error);
            resolver(null);
            return;
          }
          setSubidos((ra.adjuntos ?? []).map((a) => ({ tipo: a.tipo, nombre: a.nombre, path: a.path })));
          setPendientes([]);
        }

        resolver(r.informeId!);
      });
    });
  }

  function agregarPendientes(tipo: TipoAdjunto, archivos: File[]) {
    setPendientes((xs) =>
      [...xs, ...archivos.map((archivo) => ({ tipo, archivo }))].slice(0, Math.max(0, MAX_ADJUNTOS - subidos.length)),
    );
  }

  function quitarSubido(indice: number) {
    const doc = subidos[indice];
    if (!informeId || !doc?.path) {
      setSubidos((xs) => xs.filter((_, i) => i !== indice));
      return;
    }
    startTransition(async () => {
      const r = await quitarAdjuntoInforme(informeId, doc.path);
      if (r.error) toast.error(r.error);
      else setSubidos((xs) => xs.filter((_, i) => i !== indice));
    });
  }

  async function verBorrador() {
    if (sinPrecio.length > 0) {
      toast.warning(
        sinPrecio.length === 1
          ? `“${sinPrecio[0].descripcion}” no tiene precio — saldrá en 0.00`
          : `${sinPrecio.length} equipos sin precio — saldrán en 0.00`,
      );
    }
    // La pestaña se abre ANTES del await: si se abre después, el navegador la
    // bloquea porque ya no viene de un gesto directo del usuario (misma
    // lección que el botón del reporte diario).
    const pestana = window.open("", "_blank");
    const id = await guardar();
    if (!id) {
      pestana?.close();
      return;
    }
    if (pestana) pestana.location.href = `/api/informes/${id}/pdf`;
  }

  async function emitir() {
    // Lo que se revisa ANTES de gastar el número. Ninguna de las dos cosas
    // bloquea —hay ventas legítimas a una razón social distinta de la ficha, y
    // hay cierres donde los papeles llegan después— pero las dos tienen que
    // pasar por delante de los ojos del comercial, porque después el documento
    // ya está en manos de Central.
    if (avisosIdentidad.length > 0) {
      const detalle = avisosIdentidad.map((a) => `· ${a}`).join("\n");
      if (!confirm(`Revise a quién se le factura:\n\n${detalle}\n\n¿Emitir igual el informe?`)) return;
    }
    // El expediente del cierre lleva SUS documentos: cotización, orden de
    // compra y voucher (reunión con el ing. Carlos — es lo que antes viajaba
    // impreso dentro del file). No se bloquea en duro porque hay casos
    // legítimos donde un papel llega después (el voucher con crédito a 30
    // días, que es justo para lo que existe el agregado con código de la
    // 0142) — pero el comercial tiene que ver QUÉ está emitiendo sin, tipo
    // por tipo, antes de gastar el número. Si Carlos decide el bloqueo duro,
    // esta es la línea que se endurece.
    const TIPOS_ESPERADOS: [string, string][] = [
      ["cotizacion", "la cotización"],
      ["orden_compra", "la orden de compra"],
      ["voucher", "el voucher de pago"],
    ];
    const presentes = new Set([...subidos.map((s) => s.tipo), ...pendientes.map((p) => p.tipo)]);
    const faltantes = TIPOS_ESPERADOS.filter(([tipo]) => !presentes.has(tipo));
    if (faltantes.length > 0) {
      const lista = faltantes.map(([, nombre]) => `· Falta ${nombre}`).join("\n");
      if (
        !confirm(
          `Al expediente de este cierre le falta:\n\n${lista}\n\n` +
            "Central y postventa trabajan con estos documentos. Se pueden agregar después de emitido, " +
            "pero ya con el código de autorización de operaciones.\n\n¿Emitir igual?",
        )
      ) {
        return;
      }
    }

    const id = await guardar();
    if (!id) return;
    startTransition(async () => {
      const r = await emitirInforme(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Informe Nº ${r.codigo} emitido`);
      window.open(`/api/informes/${id}/pdf`, "_blank");
      router.refresh();
    });
  }

  const faltan = prellenado.camposTotales - prellenado.camposResueltos;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5">
        <p className="text-sm text-foreground">
          El CRM ya completó <b>{prellenado.camposResueltos}</b> de {prellenado.camposTotales} campos.
          {faltan > 0 && <span className="text-muted-foreground"> Quedan {faltan} por llenar.</span>}
        </p>
        <button
          type="button"
          onClick={() => setVerTodo((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {verTodo ? "Ocultar lo prellenado" : "Ver y editar lo prellenado"}
          <ChevronDown className={cn("size-3.5 transition-transform", verTodo && "rotate-180")} />
        </button>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Falta completar</h3>

        {/* A QUIÉN SE LE FACTURA. Antes esto vivía plegado, en dos cajas de
            texto dentro de "Ver y editar lo prellenado", y el comercial emitía
            sin haberlo leído nunca. Es el control que pidió Carlos el 27-08
            (migración 0087) y va arriba de todo porque es el dato que, si sale
            mal, obliga a anular la factura. */}
        <div
          className={cn(
            "rounded-lg border px-3.5 py-2.5",
            avisosIdentidad.length > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-background",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Se le factura a
            </span>
            <button
              type="button"
              onClick={() => setVerTodo(true)}
              className="text-[11px] text-primary hover:underline"
            >
              Corregir
            </button>
          </div>
          <p className="text-sm font-semibold text-foreground">{clienteNombre || "—"}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {clienteDoc.trim() || "sin RUC / DNI"}
            {serie === "OPEN" ? " · factura Open Investments" : " · factura Efameinsa"}
          </p>
          {avisosIdentidad.map((aviso, i) => (
            <p key={i} className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700">
              <TriangleAlert className="mt-0.5 size-3 flex-none" />
              {aviso}
            </p>
          ))}
        </div>

        {ventasSinInforme.length > 0 && (
          <Campo etiqueta="¿De qué venta es este informe?" pista="solo las ventas registradas en el CRM">
            <select
              value={ventaId ?? ""}
              onChange={(e) => alCambiarVenta(e.target.value || null)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Sin atar a una venta</option>
              {ventasSinInforme.map((v) => (
                <option key={v.id} value={v.id}>
                  {fechaCalendario(v.fecha)}
                  {v.fecha === hoyISO ? " (hoy)" : ""} · {v.moneda} {Number(v.monto).toLocaleString("es-PE")}
                  {v.referencia ? ` · presupuesto ${v.referencia}` : ""}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {/* B5: Darwin, probando el 23-08: «yo no entiendo qué significa
            presupuesto del archivo de este cliente… no sé qué significa este
            combo box de dos y un equipo». Son las cotizaciones VIEJAS del
            cliente, las que la empresa emitió en Word antes del CRM: están acá
            solo para no volver a tipear los equipos. Ahora lo dice el rótulo,
            se puede decir que ninguno, y al elegir la venta se preselecciona
            sola la que corresponde por número de presupuesto. */}
        {presupuestos.length > 0 && (
          <Campo
            etiqueta="¿De qué presupuesto copio los equipos?"
            pista="las cotizaciones que le hiciste a este cliente en el CRM y, más abajo, las que ya tenía en el archivo de antes — es un atajo para no tipearlos"
          >
            <select
              value={presupuestoId}
              onChange={(e) => alCambiarPresupuesto(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">De ninguno — los cargo a mano</option>
              {presupuestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ?? (p.fuente === "crm" && p.estado === "borrador" ? "borrador sin enviar" : "sin número")} ·{" "}
                  {p.serie === "OPEN" ? "Open" : "Efameinsa"}
                  {p.fecha ? ` · ${fechaCalendario(p.fecha)}` : ""}
                  {p.items.length ? ` · ${p.items.length} equipo${p.items.length === 1 ? "" : "s"}` : ""}
                  {p.fuente === "archivo" ? " · del archivo" : ""}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Equipos</span>
            <span className="text-[11px] text-muted-foreground">
              El archivo guarda el nombre; la marca, el modelo y el precio se completan acá.
            </span>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-md border border-border p-2.5">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={it.descripcion}
                    rows={3}
                    placeholder={"LAVADORA INDUSTRIAL RIGIDA\nMARCA: PRIMUS\nMODELO: RX350"}
                    onChange={(e) =>
                      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))
                    }
                    className="flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                    aria-label="Quitar equipo"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={(e) =>
                      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))
                    }
                    className="h-8 w-20"
                    aria-label="Cantidad"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.precio_unitario || ""}
                    placeholder="Precio unitario"
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, precio_unitario: Number(e.target.value) } : x)),
                      )
                    }
                    className="h-8 w-36"
                    aria-label="Precio unitario"
                  />
                  <Pastilla
                    activa={it.bloque === "gratuito"}
                    onClick={() =>
                      setItems((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, bloque: x.bloque === "gratuito" ? "venta" : "gratuito" } : x)),
                      )
                    }
                  >
                    Gratuito
                  </Pastilla>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setItems((xs) => [...xs, { bloque: "venta", descripcion: "", cantidad: 1, precio_unitario: 0 }])}
          >
            <Plus className="size-3.5" /> Agregar equipo
          </Button>
          <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
            Sub total US$ {totales.subtotal.toLocaleString("es-PE", { minimumFractionDigits: 2 })} · IGV US${" "}
            {totales.igv.toLocaleString("es-PE", { minimumFractionDigits: 2 })} ·{" "}
            <b className="text-foreground">
              Total US$ {totales.total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
            </b>
          </p>
        </div>

        <Campo etiqueta="Modalidad de pago">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {/* Excluyentes (corrección 24-08, B1): antes eran casillas
                  sueltas y quedaban CONTADO + CRÉDITO + 50% ADELANTO marcadas
                  a la vez —«no pueden ser todos los que yo cliqué ahí»—.
                  Volver a pulsar la activa la desmarca, para poder dejar la
                  modalidad solo en el texto libre de abajo. */}
              {MODALIDADES.map((m) => (
                <Pastilla
                  key={m}
                  activa={modalidad[0] === m}
                  onClick={() => setModalidad((xs) => (xs[0] === m ? [] : [m]))}
                >
                  {m}
                </Pastilla>
              ))}
            </div>
            <Input
              value={modalidadOtra}
              onChange={(e) => setModalidadOtra(e.target.value)}
              placeholder="Otra combinación negociada (ej. 50% adelanto + 35% antes del despacho + 15% a la puesta en marcha)"
              className="text-xs"
            />
          </div>
        </Campo>

        <Campo etiqueta="Forma de pago">
          <div className="flex gap-1.5">
            <Pastilla activa={formaPago === "transferencia"} onClick={() => setFormaPago("transferencia")}>
              Transferencia
            </Pastilla>
            <Pastilla activa={formaPago === "deposito"} onClick={() => setFormaPago("deposito")}>
              Depósito
            </Pastilla>
          </div>
        </Campo>

        {/* GARANTÍA (28-08). Va acá, con el resto de las condiciones de venta y
            a la vista, porque de este plazo salen dos cosas: lo que Central le
            confirma al cliente y el `garantia_hasta` con el que postventa
            atiende después cada serie. Hasta hoy era un renglón de texto
            escondido en «Incluye», dentro de la sección plegada. */}
        <Campo
          etiqueta="Garantía"
          pista={
            presupuesto?.garantia
              ? `la que se cotizó en ${presupuesto.codigo ?? "el presupuesto elegido"}`
              : "sale impresa en las condiciones de venta"
          }
        >
          <div className="space-y-1.5">
            <Input
              value={garantia}
              onChange={(e) => setGarantia(e.target.value)}
              placeholder="Sin garantía en el documento"
            />
            <div className="flex flex-wrap gap-1.5">
              {GARANTIAS_FRECUENTES.map((g) => (
                <Pastilla key={g} activa={garantia.trim().toLowerCase() === g.toLowerCase()} onClick={() => setGarantia(g)}>
                  {g}
                </Pastilla>
              ))}
            </div>
            {!garantia.trim() && (
              <p className="text-[11px] text-amber-700">
                Vacío: el informe sale sin línea de garantía y postventa no sabrá hasta cuándo cubre el equipo.
              </p>
            )}
          </div>
        </Campo>

        <Campo etiqueta="Nota sobre condiciones de venta" pista="opcional">
          <Textarea
            rows={2}
            value={notaCondiciones}
            placeholder="50% adelanto con la OC: enviar urgente la factura para que programen el pago."
            onChange={(e) => setNotaCondiciones(e.target.value)}
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Corrección 24-08 (B2/B3). El 21-08 se resolvió esto como
              "Texto libre / Fecha exacta" porque el valor más usado en el Word
              no es una fecha ("INMEDIATA AL PAGO DEL 50%"). Probándolo el
              23-08 Darwin pidió lo contrario: «no entiendo por qué hay que
              poner un texto libre… mejor con el calendario». Se conserva el
              caso real —hay entregas sin fecha— pero como una pastilla "Por
              confirmar" explícita, no como una caja de texto donde cada
              comercial escribe lo que quiere. Decisión suya del 23-08, revierte
              lo que había pedido Carlos. */}
          <Campo etiqueta="Fecha de entrega">
            <div className="flex flex-wrap items-center gap-1.5">
              <SelectorFecha
                valor={entregaFechaIso}
                onCambiar={(f) => {
                  setEntregaFechaIso(f);
                  setEntregaFecha(f ? fechaCalendario(f) : "");
                }}
                etiquetaVacia="Elegir fecha"
              />
              <Pastilla
                activa={!entregaFechaIso && entregaFecha === POR_CONFIRMAR}
                onClick={() => {
                  setEntregaFechaIso(null);
                  setEntregaFecha(entregaFecha === POR_CONFIRMAR ? "" : POR_CONFIRMAR);
                }}
              >
                Por confirmar
              </Pastilla>
            </div>
          </Campo>
          <Campo etiqueta="Hora de entrega">
            <div className="flex flex-wrap items-center gap-1.5">
              <SelectorHora
                valor={/^\d{2}:\d{2}$/.test(entregaHora) ? entregaHora : null}
                onCambiar={(h) => setEntregaHora(h ?? "")}
                etiquetaVacia="Elegir hora"
                horaAlAbrir="12:00"
              />
              <Pastilla
                activa={entregaHora === POR_CONFIRMAR}
                onClick={() => setEntregaHora(entregaHora === POR_CONFIRMAR ? "" : POR_CONFIRMAR)}
              >
                Por confirmar
              </Pastilla>
            </div>
          </Campo>
        </div>

        <Campo etiqueta="Lugar de entrega" pista="agencia o transportista — sin esto logística no puede despachar">
          <Textarea
            rows={2}
            value={entregaLugar}
            placeholder="GRAU C LOGISTA EXPRESS – GRUPO CARRANZA. Calle 1 N° 253 Urb. Fundo Bocanegra Alto – Callao."
            onChange={(e) => setEntregaLugar(e.target.value)}
          />
        </Campo>

        {/* B4: la entrega la puede recibir alguien que no está en la cuenta.
            Se captura con su DNI —es lo que pide el transportista— y al
            guardar el informe queda como contacto del cliente, para no
            volver a escribirlo la próxima vez. */}
        <Campo etiqueta="Quién recibe">
          <div className="space-y-2">
            <select
              value={otroRecibe ? "otro" : String(contactoDespachoIdx)}
              onChange={(e) => {
                const v = e.target.value;
                setOtroRecibe(v === "otro");
                if (v !== "otro") setContactoDespachoIdx(Number(v));
              }}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {contactos.map((c, i) => (
                <option key={i} value={i}>
                  {c.nombre} {c.telefono ? `· ${c.telefono}` : ""} {c.area ? `· ${c.area}` : ""}
                </option>
              ))}
              <option value="otro">Otra persona…</option>
            </select>
            {otroRecibe && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  value={otroNombre}
                  onChange={(e) => setOtroNombre(e.target.value)}
                  placeholder="Nombre y apellidos"
                  aria-label="Nombre de quien recibe"
                />
                <Input
                  value={otroDocumento}
                  onChange={(e) => setOtroDocumento(e.target.value)}
                  placeholder="DNI / CE"
                  aria-label="Documento de quien recibe"
                />
                <Input
                  value={otroTelefono}
                  onChange={(e) => setOtroTelefono(e.target.value)}
                  placeholder="Teléfono"
                  aria-label="Teléfono de quien recibe"
                />
                <p className="text-[11px] text-muted-foreground sm:col-span-3">
                  Se guardará como contacto de {cuenta.razon_social} para la próxima entrega.
                </p>
              </div>
            )}
          </div>
        </Campo>

        <Campo etiqueta="Observaciones de despacho y postventa" pista="opcional">
          <Textarea
            rows={2}
            value={notaDespacho}
            placeholder="Indicación de frágil."
            onChange={(e) => setNotaDespacho(e.target.value)}
          />
        </Campo>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="size-4" />
          Pedido urgente
        </label>

        {/* Pedido de Brenda (C1) el 28-08: los papeles del cierre —la OC que
            mandó el cliente, el voucher del depósito, la cotización firmada—
            hoy viven en su WhatsApp y Central se los pide por chat. Acá viajan
            con el documento. Se suben al guardar o al emitir. */}
        {/* OJO: esto NO va dentro de <Campo>. Campo es un <label>, y un
            <input type="file"> dentro de un label se dispara al pulsar
            CUALQUIER punto del label — incluidas las pastillas de categoría y
            la X de quitar. Se abriría el selector de archivos de la nada. */}
        <div className="block">
          <span className="text-xs font-semibold text-foreground">Documentos del expediente</span>
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            opcional — el voucher también se puede adjuntar después de emitido
          </span>
          <div className="mt-1 space-y-2">
            <PastillasAdjuntar onArchivos={agregarPendientes} deshabilitado={guardando} />
            {(subidos.length > 0 || pendientes.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {subidos.map((d, i) => (
                  <ChipAdjunto key={d.path || i} tipo={d.tipo} nombre={d.nombre} onQuitar={() => quitarSubido(i)} />
                ))}
                {pendientes.map((p, i) => (
                  <ChipAdjunto
                    key={`p${i}`}
                    tipo={p.tipo}
                    nombre={p.archivo.name}
                    pendiente
                    onQuitar={() => setPendientes((xs) => xs.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {verTodo && (
        <section className="space-y-3 rounded-lg border border-dashed border-border p-3.5">
          <h3 className="text-sm font-semibold text-foreground">Lo que el CRM ya completó</h3>

          <Campo etiqueta="Razón social que factura">
            <div className="flex gap-1.5">
              <Pastilla activa={serie === "EFAMEINSA"} onClick={() => setSerie("EFAMEINSA")}>
                Efameinsa
              </Pastilla>
              <Pastilla activa={serie === "OPEN"} onClick={() => setSerie("OPEN")}>
                Open Investments
              </Pastilla>
            </div>
          </Campo>

          <Campo etiqueta="Comprobante">
            <div className="flex flex-wrap gap-1.5">
              {COMPROBANTES.map(([valor, texto]) => (
                <Pastilla key={valor} activa={comprobante === valor} onClick={() => setComprobante(valor)}>
                  {texto}
                </Pastilla>
              ))}
            </div>
          </Campo>

          <Campo etiqueta="Cliente" pista={cuenta.esNueva ? "sin compras previas en el CRM" : "ya nos compró antes"}>
            <div className="flex gap-1.5">
              <Pastilla activa={!clienteNuevo} onClick={() => setClienteNuevo(false)}>
                Cliente antiguo
              </Pastilla>
              <Pastilla activa={clienteNuevo} onClick={() => setClienteNuevo(true)}>
                Cliente nuevo
              </Pastilla>
            </div>
          </Campo>

          <Campo etiqueta="Razón social">
            <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="RUC / DNI">
              <Input value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} />
            </Campo>
            <Campo etiqueta="Orden de compra" pista="opcional">
              <Input value={ordenCompra} onChange={(e) => setOrdenCompra(e.target.value)} />
            </Campo>
          </div>
          <Campo etiqueta="Dirección">
            <Input value={clienteDireccion} onChange={(e) => setClienteDireccion(e.target.value)} />
          </Campo>
          <Campo etiqueta="Correo electrónico">
            <Input value={clienteCorreo} onChange={(e) => setClienteCorreo(e.target.value)} />
          </Campo>
          <Campo etiqueta="Dirección final del despacho">
            <Input value={entregaDireccion} onChange={(e) => setEntregaDireccion(e.target.value)} />
          </Campo>

          <Campo etiqueta="Incluye" pista="una línea por beneficio; se puede cambiar por cliente">
            <Textarea rows={5} value={incluye.join("\n")} onChange={(e) => setIncluye(e.target.value.split("\n"))} />
          </Campo>
          <Campo etiqueta="Gratis" pista="opcional">
            <Input value={gratis} onChange={(e) => setGratis(e.target.value)} />
          </Campo>
          <Campo etiqueta="Nota final" pista="opcional">
            <Textarea rows={2} value={notaFinal} onChange={(e) => setNotaFinal(e.target.value)} />
          </Campo>
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={verBorrador} disabled={guardando}>
          <FileText className="size-4" /> Ver borrador PDF
        </Button>
        <Button type="button" onClick={emitir} disabled={guardando}>
          Emitir informe
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          El número se asigna recién al emitir: mirar el borrador no gasta un correlativo. Una vez emitido, el informe
          ya no se modifica.
        </p>
      </div>
    </div>
  );
}
