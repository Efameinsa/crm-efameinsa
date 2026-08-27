"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, OctagonAlert, Loader2 } from "lucide-react";
import {
  bloquesPedido,
  saldoPendiente,
  etiquetaResponsable,
  type ServicioPostventa,
  type PasoPedido,
} from "@/lib/postventa";
import {
  aprobarPedido,
  marcarPaso,
  confirmarPago,
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

export function PedidoPostventa({ servicio }: { servicio: ServicioPostventa }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [form, setForm] = useState<Formulario>(null);

  const bloques = bloquesPedido(servicio);
  const saldo = saldoPendiente(servicio);
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

  return (
    <div className="space-y-3">
      {bloques.map((bloque) => (
        <div key={bloque.numero} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-foreground">
              <span className="mr-1.5 text-muted-foreground">{"①②③"[bloque.numero - 1]}</span>
              {bloque.titulo}
            </h3>
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wide",
                bloque.completo ? "text-[#1E7F4F]" : bloque.enCurso ? "text-amber-700" : "text-muted-foreground",
              )}
            >
              {bloque.completo ? "Completo" : bloque.enCurso ? "En curso" : "Pendiente"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {bloque.pasos.map((paso) => (
              <div key={paso.clave} className="flex flex-wrap items-start gap-2.5 px-4 py-2.5">
                <span className="mt-0.5 flex-none">
                  {paso.hecho ? (
                    <Check className="size-4 text-[#1E7F4F]" />
                  ) : paso.trabado ? (
                    <OctagonAlert className="size-4 text-amber-600" />
                  ) : (
                    <CircleDashed className="size-4 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-[180px] flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      paso.hecho ? "text-muted-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {paso.etiqueta}
                  </p>
                  {paso.trabado && <p className="text-xs font-medium text-amber-700">{paso.trabado}</p>}
                  {!paso.trabado && paso.detalle && (
                    <p className="text-[11px] text-muted-foreground">{paso.detalle}</p>
                  )}
                  {!paso.hecho && !paso.trabado && (
                    <p className="text-[11px] text-muted-foreground">
                      Lo mueve {etiquetaResponsable(paso.responsable).toLowerCase()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-right">
                  {paso.cuando && (
                    <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                      {paso.hecho ? fechaHoraLima(paso.cuando) : fechaLima(paso.cuando)}
                    </span>
                  )}
                  {accionDePaso(paso)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

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

      <Cuadro
        abierto={form?.tipo === "pago"}
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
          saldo > 0
            ? `Ojo: quedan ${servicio.moneda} ${saldo.toLocaleString("es-PE")} por cobrar. Para despachar igual hay que decir quién lo autorizó.`
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
          ...(saldo > 0
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
