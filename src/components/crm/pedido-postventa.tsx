"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, OctagonAlert, Loader2 } from "lucide-react";
import {
  bloquesPedido,
  saldoPendiente,
  estadoPago,
  etiquetaResponsable,
  type ServicioPostventa,
  type PasoPedido,
} from "@/lib/postventa";
import {
  aprobarPedido,
  marcarPaso,
  confirmarPago,
  confirmarPagoCompleto,
  verificarDireccion,
  programarDespacho,
  registrarDespacho,
  cerrarPedido,
  guardarInformeServicio,
} from "@/lib/acciones/postventa";
import { fechaHoraLima, fechaLima } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * La ficha del pedido: los diez pasos del circuito, agrupados de a tres.
 *
 * Dos reglas de diseño que valen para toda la pantalla:
 *   1. Cada paso tiene UNA acción primaria y pide lo mínimo. Nada de
 *      formularios de veinte campos para marcar que el almacén respondió.
 *   2. Ningún check es solo un check: guarda quién y cuándo, y cuando hay
 *      evidencia (protocolo, guía, quién confirmó la dirección) la muestra.
 *      Un ✓ sin autor no defiende nada cuando el cliente reclama.
 */

type Formulario =
  | null
  | { tipo: "pago" }
  | { tipo: "prueba" }
  | { tipo: "direccion" }
  | { tipo: "preinstalacion" }
  | { tipo: "programar" }
  | { tipo: "despacho" }
  | { tipo: "puesta" }
  | { tipo: "cerrar" };

export function PedidoPostventa({
  servicio,
  /**
   * Si esta pantalla puede nombrar plata. En falso —el área de postventa— el
   * `servicio` llega sin montos desde el servidor, así que acá no hay cifra
   * que esconder: lo que cambia es que el pago se confirma entero o nada,
   * porque un pago parcial no se puede tipear sin ver el total.
   */
  verPrecios = true,
}: {
  servicio: ServicioPostventa;
  verPrecios?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [form, setForm] = useState<Formulario>(null);

  const bloques = bloquesPedido(servicio);
  const saldo = saldoPendiente(servicio);
  // «No se despacha con saldo pendiente sin autorización». Con las cifras
  // tapadas no hay saldo que mirar —`monto` viene en null y restar daría
  // cero—, así que se pregunta por el estado, que es el mismo dato sin número.
  // Sin esto, tapar los precios habría borrado el campo obligatorio de «quién
  // autorizó», que es justo el que defiende al área cuando el despacho sale.
  const pagoIncompleto = verPrecios ? saldo > 0 : estadoPago(servicio) !== "completo";
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  function correr(fn: () => Promise<{ error: string | null }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(exito);
      setForm(null);
      router.refresh();
    });
  }

  // Todavía sin aprobar: la pantalla no muestra los diez pasos, muestra un
  // botón. Aprobar es el acuse que Central espera y lo que arranca el reloj.
  if (!servicio.aprobado_at && servicio.informe_cierre_id) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm font-semibold text-foreground">Este pedido todavía no fue aprobado</p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Al aprobarlo, Central ve que ya está en ejecución y usted empieza a trabajarlo con todo lo que adjuntó el
          comercial. Desde acá se cuenta el tiempo del área.
        </p>
        <Button
          className="mt-3"
          disabled={pendiente}
          onClick={() => correr(() => aprobarPedido(servicio.id), "Pedido aprobado. Central ya lo ve en ejecución.")}
        >
          {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Aprobar el pedido
        </Button>
      </div>
    );
  }

  function accionDePaso(paso: PasoPedido): React.ReactNode {
    if (paso.hecho) return null;
    switch (paso.clave) {
      case "prueba":
        return servicio.prueba_solicitada_at ? (
          <BotonPaso onClick={() => setForm({ tipo: "prueba" })}>Marcar listo</BotonPaso>
        ) : (
          <BotonPaso
            onClick={() =>
              correr(
                () => marcarPaso(servicio.id, "prueba_solicitada_at"),
                "Solicitud enviada al almacén. Queda registrada con fecha.",
              )
            }
          >
            Solicitar al almacén
          </BotonPaso>
        );
      case "plano":
        return (
          <BotonPaso
            onClick={() =>
              correr(() => marcarPaso(servicio.id, "plano_enviado_at"), "Plano marcado como enviado")
            }
          >
            Marcar enviado
          </BotonPaso>
        );
      case "pago":
        return <BotonPaso onClick={() => setForm({ tipo: "pago" })}>Confirmar pago</BotonPaso>;
      case "direccion":
        return <BotonPaso onClick={() => setForm({ tipo: "direccion" })}>Verificar ahora</BotonPaso>;
      case "preinstalacion":
        return <BotonPaso onClick={() => setForm({ tipo: "preinstalacion" })}>Registrar</BotonPaso>;
      case "despacho":
        return (
          <span className="flex gap-1.5">
            {!servicio.fecha_despacho && (
              <BotonPaso onClick={() => setForm({ tipo: "programar" })}>Programar</BotonPaso>
            )}
            <BotonPaso onClick={() => setForm({ tipo: "despacho" })}>Registrar salida</BotonPaso>
          </span>
        );
      case "puesta":
        return <BotonPaso onClick={() => setForm({ tipo: "puesta" })}>Llenar informe</BotonPaso>;
      case "cerrado":
        return <BotonPaso onClick={() => setForm({ tipo: "cerrar" })}>Cerrar pedido</BotonPaso>;
      default:
        return null;
    }
  }

  // El PASO ACTUAL: el primero sin hacer de todo el circuito. Es el que la
  // pantalla agranda — el resto se lee como el tracking de una encomienda
  // (rediseño del 01-09 a pedido de Santos: lo hecho compacto con su ✓ y su
  // fecha, lo que sigue destacado, lo lejano atenuado).
  const pasoActual = bloques.flatMap((b) => b.pasos).find((p) => !p.hecho)?.clave ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card px-4 pb-3 pt-1 shadow-sm">
        {bloques.map((bloque, bi) => (
          <div key={bloque.numero}>
            <div className="flex items-center justify-between pb-1.5 pt-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span className="mr-1">{"①②③"[bloque.numero - 1]}</span>
                {bloque.titulo}
              </h3>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  bloque.completo ? "text-[#1E7F4F]" : bloque.enCurso ? "text-amber-700" : "text-muted-foreground/60",
                )}
              >
                {bloque.completo ? "Completo" : bloque.enCurso ? "En curso" : "Pendiente"}
              </span>
            </div>
            {bloque.pasos.map((paso, pi) => {
              const esActual = paso.clave === pasoActual;
              const esUltimo = bi === bloques.length - 1 && pi === bloque.pasos.length - 1;
              return (
                <div key={paso.clave} className="relative flex gap-3">
                  {/* El riel: nodo + línea que conecta con el siguiente paso. */}
                  <div className="flex w-5 flex-none flex-col items-center">
                    {paso.hecho ? (
                      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-[#1E7F4F]">
                        <Check className="size-3 text-white" />
                      </span>
                    ) : paso.trabado ? (
                      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-amber-500/15">
                        <OctagonAlert className="size-3.5 text-amber-600" />
                      </span>
                    ) : esActual ? (
                      <span className="flex size-5 flex-none items-center justify-center rounded-full border-2 border-primary bg-primary/10">
                        <span className="size-1.5 rounded-full bg-primary" />
                      </span>
                    ) : (
                      <span className="mt-0.5 flex size-4 flex-none items-center justify-center">
                        <CircleDashed className="size-4 text-muted-foreground/50" />
                      </span>
                    )}
                    {!esUltimo && (
                      <span className={cn("w-px flex-1", paso.hecho ? "bg-[#1E7F4F]/40" : "bg-border")} />
                    )}
                  </div>

                  {/* Lo hecho se lee en una línea; lo actual, en su tarjeta. */}
                  {paso.hecho ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 pb-3">
                      <p className="text-xs text-muted-foreground">{paso.etiqueta}</p>
                      {paso.detalle && <span className="text-[11px] text-muted-foreground/70">{paso.detalle}</span>}
                      {paso.cuando && (
                        <span className="ml-auto whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground/70">
                          {fechaHoraLima(paso.cuando)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "mb-3 min-w-0 flex-1",
                        (esActual || paso.trabado) &&
                          "rounded-lg border px-3 py-2.5 " +
                            (paso.trabado ? "border-amber-400/50 bg-amber-500/5" : "border-primary/30 bg-primary/5"),
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "flex-1 text-sm",
                            esActual || paso.trabado ? "font-semibold text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {paso.etiqueta}
                        </p>
                        {paso.cuando && (
                          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                            {fechaLima(paso.cuando)}
                          </span>
                        )}
                        {accionDePaso(paso)}
                      </div>
                      {paso.trabado && <p className="mt-0.5 text-xs font-medium text-amber-700">{paso.trabado}</p>}
                      {!paso.trabado && (esActual || paso.detalle) && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {paso.detalle ?? `Lo mueve ${etiquetaResponsable(paso.responsable).toLowerCase()}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Diálogos ───────────────────────────────────────────────────── */}

      <Cuadro
        abierto={form?.tipo === "prueba"}
        cerrar={() => setForm(null)}
        titulo="El almacén respondió"
        descripcion="El manual pide un protocolo de pruebas firmado por supervisor, inspector y técnico. Si tiene el número a mano, anótelo: es lo que después prueba que la máquina salió bien."
        boton="Marcar probado y embalado"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(
            () => marcarPaso(servicio.id, "prueba_lista_at", datos.protocolo),
            "Prueba y embalaje confirmados",
          )
        }
        campos={[{ nombre: "protocolo", etiqueta: "N.º de protocolo de prueba", requerido: false }]}
      />

      {/* Con precios a la vista se puede registrar un pago parcial: se escribe
          cuánto lleva pagado. Sin precios —postventa— la única confirmación
          posible es «ya está cobrado del todo»: pedirle una cifra a quien no
          puede ver el total sería pedirle que adivine. */}
      <Cuadro
        abierto={form?.tipo === "pago" && verPrecios}
        cerrar={() => setForm(null)}
        titulo="Confirmar el pago"
        descripcion={`Total del pedido: ${servicio.moneda} ${Number(servicio.monto ?? 0).toLocaleString("es-PE")}. Escriba cuánto lleva pagado el cliente en total, no el último abono.`}
        boton="Confirmar"
        pendiente={pendiente}
        onEnviar={(datos) => {
          const monto = Number(datos.monto);
          if (!Number.isFinite(monto) || monto < 0) {
            toast.error("Escriba un monto válido");
            return;
          }
          correr(() => confirmarPago(servicio.id, monto), "Pago confirmado");
        }}
        campos={[
          {
            nombre: "monto",
            etiqueta: "Total pagado hasta ahora",
            tipo: "number",
            inicial: String(servicio.monto ?? 0),
            requerido: true,
          },
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "pago" && !verPrecios}
        cerrar={() => setForm(null)}
        titulo="Confirmar el pago"
        descripcion="Confirme solo cuando Finanzas dé el pedido por cobrado del todo. Si el cliente todavía debe, deje el paso pendiente: el despacho con saldo necesita autorización y queda registrada."
        boton="El pedido está cobrado"
        pendiente={pendiente}
        onEnviar={() => correr(() => confirmarPagoCompleto(servicio.id), "Pago confirmado")}
        campos={[]}
      />

      <Cuadro
        abierto={form?.tipo === "direccion"}
        cerrar={() => setForm(null)}
        titulo="Dirección verificada con el cliente"
        descripcion="Llame antes de programar: la dirección del cierre la escribió el comercial de oído y es donde más se pierde el flete. Lo que confirme acá queda para las próximas entregas."
        boton="Guardar la dirección"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(
            () => verificarDireccion(servicio.id, { direccion: datos.direccion, confirmoNombre: datos.confirmo }),
            "Dirección verificada",
          )
        }
        campos={[
          {
            nombre: "direccion",
            etiqueta: "Dirección tal como la confirmó",
            area: true,
            inicial: servicio.direccion_entrega ?? servicio.ubicacion ?? "",
            requerido: true,
          },
          { nombre: "confirmo", etiqueta: "Quién la confirmó (nombre y teléfono)", requerido: false },
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "preinstalacion"}
        cerrar={() => setForm(null)}
        titulo="Preinstalación confirmada"
        descripcion="En provincia conviene pedirle al cliente una foto de sus puntos de agua, desagüe y energía antes de despachar. Es lo que evita el viaje en falso y la puesta en marcha que no se puede hacer."
        boton="Registrar"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(
            () => marcarPaso(servicio.id, "preinstalacion_ok_at", datos.nota),
            "Preinstalación registrada",
          )
        }
        campos={[
          {
            nombre: "nota",
            etiqueta: "Qué confirmó el cliente",
            area: true,
            inicial: "Agua, desagüe y conexión eléctrica listos",
            requerido: false,
          },
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "programar"}
        cerrar={() => setForm(null)}
        titulo="Programar el despacho"
        descripcion="La fecha que ponga acá es la que aparece en la agenda del área."
        boton="Programar"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(() => programarDespacho(servicio.id, datos.fecha, datos.nota), "Despacho programado")
        }
        campos={[
          { nombre: "fecha", etiqueta: "Fecha de despacho", tipo: "date", inicial: hoy, requerido: true },
          { nombre: "nota", etiqueta: "Nota (agencia, horario, quién recibe)", requerido: false },
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "despacho"}
        cerrar={() => setForm(null)}
        titulo="Registrar la salida"
        descripcion={
          pagoIncompleto
            ? verPrecios
              ? `Ojo: quedan ${servicio.moneda} ${saldo.toLocaleString("es-PE")} por cobrar. Para despachar igual hay que decir quién lo autorizó.`
              : "Ojo: el pedido no figura cobrado del todo. Para despachar igual hay que decir quién lo autorizó."
            : "En provincia, la garantía del equipo empieza a correr con esta fecha."
        }
        boton="Registrar despacho"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(
            () =>
              registrarDespacho(servicio.id, {
                fecha: datos.fecha,
                transportista: datos.transportista,
                guia: datos.guia,
                recibeNombre: datos.recibe,
                recibeDoc: datos.doc,
                recibeTelefono: datos.telefono,
                motivoSinCancelar: datos.motivo,
              }),
            "Despacho registrado",
          )
        }
        campos={[
          { nombre: "fecha", etiqueta: "Fecha de salida", tipo: "date", inicial: hoy, requerido: true },
          { nombre: "transportista", etiqueta: "Agencia o transportista", requerido: false },
          { nombre: "guia", etiqueta: "N.º de guía de remisión", requerido: false },
          { nombre: "recibe", etiqueta: "Quién recibe", requerido: false },
          { nombre: "doc", etiqueta: "DNI de quien recibe", requerido: false },
          { nombre: "telefono", etiqueta: "Su teléfono", requerido: false },
          ...(pagoIncompleto
            ? [{ nombre: "motivo", etiqueta: "Quién autorizó despachar con saldo, y por qué", area: true, requerido: true }]
            : []),
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "puesta"}
        cerrar={() => setForm(null)}
        titulo="Informe de puesta en marcha"
        descripcion="Instalación y capacitación. La lectura de ciclos es el kilometraje del equipo: es lo que después permite decirle al cliente cuánto lo usó."
        boton="Guardar el informe"
        pendiente={pendiente}
        onEnviar={(datos) => {
          startTransition(async () => {
            const r = await guardarInformeServicio({
              servicioId: servicio.id,
              cuentaId: servicio.cuenta_id,
              clienteTexto: servicio.cliente_texto,
              equipoTexto: servicio.equipo,
              tipo: "puesta_en_marcha",
              modalidad: servicio.modalidad === "provincia" ? "videollamada" : "in_situ",
              ejecutadoAt: new Date(`${datos.fecha}T${datos.hora || "12:00"}:00-05:00`).toISOString(),
              tecnico: datos.tecnico,
              detalle: datos.detalle,
              observaciones: datos.observaciones,
              ciclos: datos.ciclos ? Number(datos.ciclos) : null,
              capacitacion: { uso: true, cuidado: true, mantenimiento_diario: true },
              conformeNombre: datos.conforme,
              conformeDoc: datos.conformeDoc,
            });
            if (r.error) {
              toast.error(r.error, { duration: 8000 });
              return;
            }
            toast.success("Informe guardado y puesta en marcha registrada");
            setForm(null);
            router.refresh();
          });
        }}
        campos={[
          { nombre: "fecha", etiqueta: "Fecha de ejecución", tipo: "date", inicial: hoy, requerido: true },
          { nombre: "hora", etiqueta: "Hora", tipo: "time", requerido: false },
          { nombre: "tecnico", etiqueta: "Técnico a cargo", requerido: false },
          { nombre: "ciclos", etiqueta: "Ciclos con que queda el equipo", tipo: "number", inicial: "5", requerido: false },
          { nombre: "detalle", etiqueta: "Trabajo realizado", area: true, requerido: false },
          { nombre: "observaciones", etiqueta: "Observaciones y recomendaciones", area: true, requerido: false },
          { nombre: "conforme", etiqueta: "Cliente que da conformidad", requerido: false },
          { nombre: "conformeDoc", etiqueta: "Su DNI", requerido: false },
        ]}
      />

      <Cuadro
        abierto={form?.tipo === "cerrar"}
        cerrar={() => setForm(null)}
        titulo="Cerrar el pedido"
        descripcion="Al cerrar, cada serie que anote acá entra al parque instalado con su garantía calculada y su primer mantenimiento agendado. Si van varias, sepárelas con coma."
        boton="Cerrar el pedido"
        pendiente={pendiente}
        onEnviar={(datos) =>
          correr(
            () =>
              cerrarPedido(servicio.id, {
                series: (datos.series ?? "").split(/[,;\n]/),
                garantiaMeses: datos.garantia ? Number(datos.garantia) : 24,
              }),
            "Pedido cerrado. El equipo ya está en el parque instalado.",
          )
        }
        campos={[
          { nombre: "series", etiqueta: "Series de los equipos entregados", area: true, requerido: false },
          { nombre: "garantia", etiqueta: "Meses de garantía", tipo: "number", inicial: "24", requerido: false },
        ]}
      />
    </div>
  );
}

function BotonPaso({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

interface Campo {
  nombre: string;
  etiqueta: string;
  tipo?: string;
  area?: boolean;
  inicial?: string;
  requerido?: boolean;
}

/**
 * El diálogo de un paso. Uno solo para todos: los pasos se diferencian en qué
 * preguntan, no en cómo se ven, y repetir ocho diálogos casi iguales sería la
 * forma más rápida de que se desincronicen.
 */
function Cuadro({
  abierto,
  cerrar,
  titulo,
  descripcion,
  boton,
  campos,
  onEnviar,
  pendiente,
}: {
  abierto: boolean;
  cerrar: () => void;
  titulo: string;
  descripcion: string;
  boton: string;
  campos: Campo[];
  onEnviar: (datos: Record<string, string>) => void;
  pendiente: boolean;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});

  // Al abrir, cada campo arranca con su valor inicial. Se recalcula con la
  // apertura y no en un efecto para no pisar lo que el usuario ya escribió.
  const datos = campos.reduce<Record<string, string>>((acc, c) => {
    acc[c.nombre] = valores[c.nombre] ?? c.inicial ?? "";
    return acc;
  }, {});

  function enviar() {
    const falta = campos.find((c) => c.requerido && !datos[c.nombre]?.trim());
    if (falta) {
      toast.error(`Falta: ${falta.etiqueta.toLowerCase()}`);
      return;
    }
    onEnviar(datos);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) {
          setValores({});
          cerrar();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {campos.map((c) => (
            <div key={c.nombre} className="grid gap-1.5">
              <Label htmlFor={`campo-${c.nombre}`} className="text-xs">
                {c.etiqueta}
                {c.requerido && <span className="text-destructive"> *</span>}
              </Label>
              {c.area ? (
                <Textarea
                  id={`campo-${c.nombre}`}
                  rows={2}
                  value={datos[c.nombre]}
                  onChange={(e) => setValores((v) => ({ ...v, [c.nombre]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`campo-${c.nombre}`}
                  type={c.tipo ?? "text"}
                  value={datos[c.nombre]}
                  onChange={(e) => setValores((v) => ({ ...v, [c.nombre]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            {boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
