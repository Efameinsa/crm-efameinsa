"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, FileText, Plus, Trash2 } from "lucide-react";
import { INCLUYE_POR_DEFECTO } from "@/lib/informes";
import {
  guardarBorradorInforme,
  emitirInforme,
  type DatosInforme,
  type ItemInformeEntrada,
  type PrellenadoInforme,
  type ContactoEntrada,
} from "@/lib/acciones/informes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const MODALIDADES = ["CONTADO", "CREDITO", "50% ADELANTO", "50% CREDITO"] as const;

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

export function FormularioInforme({
  prellenado,
  ventaPreseleccionada,
}: {
  prellenado: PrellenadoInforme;
  /** Cuando se llega desde el aviso de "Mi día", ya se sabe de qué venta es. */
  ventaPreseleccionada?: string;
}) {
  const router = useRouter();
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
  const [items, setItems] = useState<ItemInformeEntrada[]>(() =>
    (presupuestos[0]?.items ?? []).map((nombre) => ({
      bloque: "venta" as const,
      descripcion: nombre,
      cantidad: 1,
      precio_unitario: 0,
    })),
  );

  const [serie, setSerie] = useState<"EFAMEINSA" | "OPEN">(presupuestos[0]?.serie ?? "EFAMEINSA");
  const [comprobante, setComprobante] = useState<"factura" | "boleta_ruc" | "boleta_dni">("factura");
  const [clienteNuevo, setClienteNuevo] = useState(cuenta.esNueva);
  const [clienteNombre, setClienteNombre] = useState(cuenta.razon_social);
  const [clienteDoc, setClienteDoc] = useState(cuenta.num_doc ?? "");
  const [clienteDireccion, setClienteDireccion] = useState(cuenta.direccion ?? "");
  const [clienteCorreo, setClienteCorreo] = useState(principal.correo ?? "");
  const [ordenCompra, setOrdenCompra] = useState("");

  const [modalidad, setModalidad] = useState<string[]>([]);
  const [formaPago, setFormaPago] = useState<"transferencia" | "deposito" | null>("transferencia");
  const [notaCondiciones, setNotaCondiciones] = useState("");

  const [entregaFecha, setEntregaFecha] = useState("");
  const [entregaHora, setEntregaHora] = useState("Por confirmar");
  const [entregaLugar, setEntregaLugar] = useState("");
  const [entregaDireccion, setEntregaDireccion] = useState(cuenta.direccion ?? "");
  const [notaDespacho, setNotaDespacho] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [contactoDespachoIdx, setContactoDespachoIdx] = useState(0);

  const [incluye, setIncluye] = useState<string[]>(INCLUYE_POR_DEFECTO);
  const [gratis, setGratis] = useState("");
  const [notaFinal, setNotaFinal] = useState("");

  const totales = useMemo(() => {
    const subtotal = items
      .filter((i) => i.bloque !== "gratuito")
      .reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
    return { subtotal, igv: subtotal * 0.18, total: subtotal * 1.18 };
  }, [items]);

  function alCambiarPresupuesto(id: string) {
    setPresupuestoId(id);
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    setSerie(p.serie);
    // Solo se pisan los equipos si el comercial todavía no puso precios: si ya
    // estuvo escribiendo, cambiar de presupuesto no puede borrarle el trabajo.
    const intacto = items.every((i) => i.precio_unitario === 0);
    if (intacto) {
      setItems(p.items.map((nombre) => ({ bloque: "venta" as const, descripcion: nombre, cantidad: 1, precio_unitario: 0 })));
    }
  }

  function datos(): DatosInforme {
    const contactoDespacho = contactos[contactoDespachoIdx] ?? principal;
    return {
      serie,
      presupuestoRef: presupuesto?.codigo ?? venta?.referencia ?? null,
      oportunidadId: venta?.oportunidadId ?? null,
      ventaId: venta?.id ?? null,
      cotizacionId: null,
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
      modalidadPago: modalidad,
      formaPago,
      moneda: "USD",
      notaCondiciones: notaCondiciones || null,
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

  function guardar(): Promise<string | null> {
    return new Promise((resolver) => {
      startTransition(async () => {
        const r = await guardarBorradorInforme(cuenta.id, datos(), informeId ?? undefined);
        if (r.error) {
          toast.error(r.error);
          resolver(null);
          return;
        }
        setInformeId(r.informeId!);
        resolver(r.informeId!);
      });
    });
  }

  async function verBorrador() {
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

        {ventasSinInforme.length > 0 && (
          <Campo etiqueta="¿De qué venta es este informe?" pista="solo las ventas registradas en el CRM">
            <select
              value={ventaId ?? ""}
              onChange={(e) => setVentaId(e.target.value || null)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Sin atar a una venta</option>
              {ventasSinInforme.map((v) => (
                <option key={v.id} value={v.id}>
                  {new Date(`${v.fecha}T12:00:00`).toLocaleDateString("es-PE")} · {v.moneda}{" "}
                  {Number(v.monto).toLocaleString("es-PE")}
                  {v.referencia ? ` · presupuesto ${v.referencia}` : ""}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {presupuestos.length > 0 && (
          <Campo etiqueta="Presupuesto" pista="del archivo de este cliente">
            <select
              value={presupuestoId}
              onChange={(e) => alCambiarPresupuesto(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {presupuestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ?? "sin número"} · {p.serie === "OPEN" ? "Open" : "Efameinsa"}
                  {p.fecha ? ` · ${new Date(`${p.fecha}T12:00:00`).toLocaleDateString("es-PE")}` : ""}
                  {p.items.length ? ` · ${p.items.length} equipo${p.items.length === 1 ? "" : "s"}` : ""}
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
          <div className="flex flex-wrap gap-1.5">
            {MODALIDADES.map((m) => (
              <Pastilla
                key={m}
                activa={modalidad.includes(m)}
                onClick={() => setModalidad((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m]))}
              >
                {m}
              </Pastilla>
            ))}
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

        <Campo etiqueta="Nota sobre condiciones de venta" pista="opcional">
          <Textarea
            rows={2}
            value={notaCondiciones}
            placeholder="50% adelanto con la OC: enviar urgente la factura para que programen el pago."
            onChange={(e) => setNotaCondiciones(e.target.value)}
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha de entrega">
            <Input
              value={entregaFecha}
              placeholder="INMEDIATA AL PAGO DEL 50%"
              onChange={(e) => setEntregaFecha(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Hora de entrega">
            <Input value={entregaHora} onChange={(e) => setEntregaHora(e.target.value)} />
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

        {contactos.length > 0 && (
          <Campo etiqueta="Quién recibe">
            <select
              value={contactoDespachoIdx}
              onChange={(e) => setContactoDespachoIdx(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {contactos.map((c, i) => (
                <option key={i} value={i}>
                  {c.nombre} {c.telefono ? `· ${c.telefono}` : ""} {c.area ? `· ${c.area}` : ""}
                </option>
              ))}
            </select>
          </Campo>
        )}

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
