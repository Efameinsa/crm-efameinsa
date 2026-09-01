"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, MessageSquare, Search, Send, User, X } from "lucide-react";
import { buscarCoincidencias, registrarContacto, type CoincidenciaCartera } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
import { CampoAdjuntos, useAdjuntos } from "@/components/crm/campo-adjuntos";
import { cn } from "@/lib/utils";

// Cuando a la comercial le entra un WhatsApp o una llamada directa de alguien
// que no está en su cartera.
//
// Hasta el 24-08 lo mandaba por correo a Central, que lo volvía a tipear a mano.
// Ahora lo registra una vez y entra a la bandeja de triaje como cualquier otro
// contacto. Pedido de las comerciales en la capacitación y ratificado por
// gerencia esa misma mañana.
//
// ⚠️ NO se autoasigna. La derivación la decide Central: si el contacto resulta
// ser de su propia cartera, se lo devolverán — pero pasando por la cola, que es
// lo que deja rastro de cuánto le derivan a cada quien. La regla está también en
// la política de la migración 0060, no solo acá.
//
// 01-09: el formulario se rehízo a pedido de las comerciales. Lo de fondo es
// que ahora se pueden adjuntar fotos —arrastrando o con Ctrl+V, igual que la
// captura de Central (CampoAdjuntos)—: el cliente manda por WhatsApp la foto
// de la placa o del equipo y antes había que describirla con palabras. De paso
// el formulario se ordenó en tres bloques con una sola pregunta cada uno, el
// canal pasó a botones (se elige de un toque, sin desplegar nada) y las
// coincidencias de cartera dejaron de empujar los campos hacia abajo: aparecen
// flotando bajo la empresa, como un buscador.

const CANALES = [
  ["whatsapp", "WhatsApp"],
  ["llamada", "Llamada"],
  ["email", "Correo"],
  ["presencial", "Presencial"],
  ["referido", "Referido"],
  ["otro", "Otro"],
] as const;

function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof User;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icono className="size-3.5" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** El asterisco de obligatorio, con el mismo peso en los tres bloques. */
function Obligatorio() {
  return <span className="text-destructive"> *</span>;
}

export function PasarContactoCentral({ contexto = "comercial" }: { contexto?: "comercial" | "postventa" }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // El temporizador vive en un ref, no en un global del módulo: si no, dos
  // instancias del diálogo se pisarían el mismo timeout.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState<string>("whatsapp");
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCartera[]>([]);
  const [enviando, startTransition] = useTransition();
  const adjuntos = useAdjuntos();

  /**
   * Busca el cliente mientras se escribe la empresa o el RUC.
   *
   * Lo pidió el ing. Carlos en la charla del 24-08: «acá no le he puesto para
   * que tenga una búsqueda… hay que tener una búsqueda, de todas maneras»,
   * porque si no hay que tipear todo de nuevo cada vez.
   *
   * Busca SOLO en la cartera de quien lo usa: las políticas de `cuentas` no le
   * dejan ver las de otros comerciales, y eso es deliberado — Carlos insistió
   * en no compartir información entre comerciales. Si el cliente es de otro,
   * Central lo resuelve al derivar, que es donde vive la búsqueda completa.
   */
  function buscar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    const form = formRef.current;
    if (!form) return;
    const dato = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const razonSocial = dato("razon_social");
    const numDoc = dato("num_doc");
    if (razonSocial.trim().length < 3 && numDoc.replace(/\D/g, "").length < 8) {
      setCoincidencias([]);
      return;
    }
    temporizador.current = setTimeout(async () => {
      setCoincidencias(await buscarCoincidencias({ razonSocial, numDoc }));
    }, 400);
  }

  function usar(c: CoincidenciaCartera) {
    const form = formRef.current;
    if (!form) return;
    // Se completa la EMPRESA, nunca la persona: Carlos fue explícito —
    // «si has recibido la llamada con otra persona completamente distinta, eso
    // sí tiene que permitirte digitar la persona de contacto. No vamos a
    // confiar solamente en lo que arroja la ficha».
    (form.elements.namedItem("razon_social") as HTMLInputElement).value = c.razonSocial;
    setCoincidencias([]);
    (form.elements.namedItem("nombre_contacto") as HTMLInputElement)?.focus();
  }

  function limpiarTodo() {
    if (temporizador.current) clearTimeout(temporizador.current);
    formRef.current?.reset();
    setCanal("whatsapp");
    setCoincidencias([]);
    adjuntos.limpiar();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // area_destino siempre comercial: este atajo existe para contactos de
    // venta. Lo de servicio técnico o postventa lo sigue tomando Central.
    formData.set("area_destino", "comercial");
    startTransition(async () => {
      // Las fotos primero: si una subida falla se avisa y NO se registra el
      // contacto — mejor reintentar que dejarlo sin la foto que el cliente
      // mandó, que es justamente lo que se vino a adjuntar.
      const subida = await adjuntos.subir();
      if (subida.error) {
        toast.error(subida.error);
        return;
      }
      formData.set("adjuntos", JSON.stringify(subida.adjuntos));
      const r = await registrarContacto(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Contacto ${r.codigo ?? ""} enviado a Central`.trim());
      limpiarTodo();
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        // Al cerrar se descarta lo escrito: si no, la próxima vez el diálogo
        // abre con los datos del contacto anterior y su foto adjunta.
        if (!v) limpiarTodo();
        setAbierto(v);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Send className="size-3.5" /> Pasar contacto a Central
          </Button>
        }
      />
      {/* El Ctrl+V se escucha en todo el diálogo, no solo en la caja de
          archivos: al pegar la captura, el cursor está en cualquier campo. */}
      <DialogContent
        onPaste={adjuntos.onPaste}
        className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Pasar un contacto a Central</DialogTitle>
          <DialogDescription>
            {contexto === "postventa"
              ? // El pedido del ing. Carlos en la reunión del 01-09 (vía Santos):
                // lo que le llega directo a postventa se REGISTRA y pasa por
                // Central, que lo deriva a postventa o al área que corresponda.
                // Todo contacto entra por Central — también los del técnico.
                "Para el cliente que llama o escribe directo a postventa. Central lo recibe en su cola y lo deriva a postventa o al área que corresponda."
              : "Para cuando le escriben o la llaman directamente. Central lo revisa y lo deriva — si es de su cartera, se lo devuelve a usted."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={onSubmit} className="flex min-h-0 flex-col">
          {/* El cuerpo desplaza solo: el botón de enviar nunca se va de la
              pantalla, ni en una laptop de 13". */}
          <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
            <Seccion icono={User} titulo="Quién es">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pc-nombre">
                    Nombre del contacto
                    <Obligatorio />
                  </Label>
                  <Input
                    id="pc-nombre"
                    name="nombre_contacto"
                    required
                    autoComplete="off"
                    placeholder="Cómo se presentó la persona"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pc-telefono">Teléfono</Label>
                  <Input id="pc-telefono" name="telefono" inputMode="tel" autoComplete="off" placeholder="9XX XXX XXX" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pc-email">Correo</Label>
                  <Input id="pc-email" name="email" type="email" autoComplete="off" placeholder="nombre@empresa.com" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Deje al menos el teléfono o el correo: es por donde lo van a ubicar.
              </p>
            </Seccion>

            {/* La caja de coincidencias flota sobre lo que sigue en vez de
                empujarlo (la misma lección de la captura de Central, 25-08:
                los avisos que aparecían entre los campos movían justo lo que
                se estaba llenando). */}
            <Seccion icono={Building2} titulo="De qué empresa">
              <div className="relative">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pc-razon">Empresa</Label>
                    <Input
                      id="pc-razon"
                      name="razon_social"
                      autoComplete="off"
                      placeholder="Razón social o nombre comercial"
                      onChange={buscar}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pc-doc">RUC / DNI</Label>
                    <Input
                      id="pc-doc"
                      name="num_doc"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Si lo tiene a la mano"
                      onChange={buscar}
                    />
                  </div>
                </div>

                {coincidencias.length > 0 && (
                  <div className="absolute inset-x-0 top-full z-20 mt-1.5 space-y-1 rounded-lg border border-primary/30 bg-popover p-2.5 shadow-lg">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Search className="size-3.5" />
                        Ya está en su cartera — toque para completar la empresa
                      </p>
                      <button
                        type="button"
                        onClick={() => setCoincidencias([])}
                        aria-label="Cerrar sugerencias"
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    {coincidencias.map((c) => (
                      <button
                        key={c.cuentaId}
                        type="button"
                        onClick={() => usar(c)}
                        className="block w-full cursor-pointer truncate rounded px-1.5 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                      >
                        {c.razonSocial}
                        <span className="ml-1.5 text-muted-foreground">por {c.motivo}</span>
                      </button>
                    ))}
                    <p className="px-1.5 pt-0.5 text-[11px] text-muted-foreground">
                      El nombre del contacto escríbalo igual: puede ser otra persona de la misma empresa.
                    </p>
                  </div>
                )}
              </div>
            </Seccion>

            <Seccion icono={MessageSquare} titulo="Qué necesita">
              {/* El canal en botones y no en una lista desplegable: son seis y
                  casi siempre es WhatsApp — se confirma de un toque. */}
              <div className="space-y-1.5">
                <Label>
                  ¿Por dónde llegó?
                  <Obligatorio />
                </Label>
                <input type="hidden" name="canal" value={canal} />
                <div className="flex flex-wrap gap-1.5">
                  {CANALES.map(([v, t]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={canal === v}
                      onClick={() => setCanal(v)}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors",
                        canal === v
                          ? "border-primary bg-primary font-medium text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pc-mensaje">¿Qué solicita?</Label>
                <Textarea
                  id="pc-mensaje"
                  name="mensaje"
                  rows={3}
                  placeholder="Qué equipo pide, capacidad, para qué uso. Es lo que va a leer quien lo atienda."
                />
              </div>

              {/* Lo pedido el 01-09: la foto que el cliente manda por WhatsApp
                  —la placa del equipo, el ambiente, la cotización de otro— se
                  adjunta acá y viaja con el contacto. */}
              <div className="space-y-1.5">
                <Label>Fotos y archivos que le mandó</Label>
                <CampoAdjuntos
                  ctl={adjuntos}
                  ayuda="La foto de la placa, del equipo o el PDF que le mandaron · hasta 5 archivos de 10 MB"
                />
              </div>
            </Seccion>
          </div>

          <DialogFooter className="mt-4 items-center sm:justify-between">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Central lo recibe al instante en su bandeja.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose render={<Button type="button" variant="outline" disabled={enviando} />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={enviando}>
                {adjuntos.progreso
                  ? `Subiendo archivo ${adjuntos.progreso.hecho + 1} de ${adjuntos.progreso.total}…`
                  : enviando
                    ? "Enviando…"
                    : "Enviar a Central"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
