"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackageCheck, Truck, FileCheck2, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { marcarProbado, confirmarListo, registrarSalida, registrarAgencia } from "@/lib/acciones/almacen";
import { bloquesPedido, faltanFotosDeCarga, type FotoAlmacen, type ServicioPostventa } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TomarOSubir, TomarOSubirVarias } from "@/components/crm/tomar-o-subir";

/**
 * Lo que el almacén hace con un pedido, en el orden en que pasa (0246).
 *
 * Carlos, 16-09: «postventa dice "prueba la máquina" → almacén prueba, sube
 * su protocolo y le da un check → postventa programa el despacho → almacén
 * confirma que está listo (de repente tengo que contratar un montacarga) →
 * despacha: 5 fotos, 5 ángulos, y un video → llega a la agencia y sube la
 * guía y la máquina → postventa da el doble check».
 *
 * Cada tarjeta aparece cuando le toca y desaparece cuando ya está: la
 * pantalla lee como una lista de lo que falta, no como un formulario.
 */
const ANGULOS: { etiqueta: string; titulo: string }[] = [
  { etiqueta: "frente", titulo: "Frente" },
  { etiqueta: "lateral_izq", titulo: "Lateral izquierdo" },
  { etiqueta: "lateral_der", titulo: "Lateral derecho" },
  { etiqueta: "posterior", titulo: "Posterior" },
  { etiqueta: "arriba", titulo: "Arriba" },
];

type Archivos = Record<string, File | null>;

export function PedidoAlmacen({ servicio, porEquipo = false }: { servicio: ServicioPostventa; porEquipo?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const cliente = (servicio.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const probado = servicio.prueba_lista_at != null || String(servicio.prueba_embalaje ?? "").toUpperCase() === "SI";
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  // EL DOBLE FILTRO (Carlos, 22-09): «tú programas el despacho, pero de nada
  // se va a despachar. No debería permitirte despachar si no ha cumplido los
  // otros pasos. Al almacén tendría que aparecerle: si hay programación,
  // perfecto, pero me sale con rojo, o sea que postventa no ha cumplido».
  // La apertura ya la revalida el servidor contra estos mismos requisitos al
  // emitirla (`emitirAperturaDespacho`); por eso `apertura_despacho_at` es la
  // señal fiable de que postventa terminó, y su `trabado` dice exactamente
  // qué falta mientras tanto.
  const trabadoApertura = bloquesPedido(servicio)
    .flatMap((b) => b.pasos)
    .find((p) => p.clave === "apertura")?.trabado;
  const postventaCumplio = servicio.apertura_despacho_at != null;

  // Probar y embalar
  const [protocolo, setProtocolo] = useState(servicio.protocolo_prueba_ref ?? "");
  const [notaPrueba, setNotaPrueba] = useState("");
  const [fotosProtocolo, setFotosProtocolo] = useState<File[]>([]);
  // Listo
  const [notaListo, setNotaListo] = useState("");
  // Salida
  const [fechaSalida, setFechaSalida] = useState(servicio.fecha_despacho ?? hoy);
  const [angulos, setAngulos] = useState<Archivos>({});
  const [video, setVideo] = useState<File | null>(null);
  const [notaSalida, setNotaSalida] = useState("");
  // Agencia
  const [transportista, setTransportista] = useState(servicio.transportista ?? "");
  const [guia, setGuia] = useState(servicio.guia ?? "");
  const [recibe, setRecibe] = useState("");
  const [fotoGuia, setFotoGuia] = useState<File | null>(null);
  const [fotoMaquina, setFotoMaquina] = useState<File | null>(null);

  async function subir(archivos: { file: File; etiqueta: string }[]): Promise<FotoAlmacen[] | null> {
    const storage = createClient().storage.from("adjuntos");
    const salida: FotoAlmacen[] = [];
    for (const { file, etiqueta } of archivos) {
      const path = `pedidos/${servicio.id}/almacen/${etiqueta}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      const { error } = await storage.upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) {
        toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        return null;
      }
      salida.push({ path, nombre: file.name.slice(0, 120), tipo: file.type.slice(0, 100), etiqueta });
    }
    return salida;
  }

  function correr(fn: () => Promise<{ error: string | null }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(exito);
      router.refresh();
    });
  }

  const salidaLista = ANGULOS.filter((a) => angulos[a.etiqueta]).length >= 3;
  const puedeSalir = Boolean(servicio.apertura_despacho_at) || !servicio.informe_cierre_id;
  // POSTVENTA YA MARCÓ LA SALIDA, PERO FALTAN LAS FOTOS DE LA CARGA (23-09).
  // Postventa puede registrar el despacho desde su pantalla (con la guía), y
  // eso escondía esta tarjeta: el almacén se quedaba sin dónde subir las
  // fotos de la máquina ya puesta en el transporte. Caso Titan 676-26, el
  // almacén: «la plataforma no me permite cargar las fotografías
  // correspondientes a la carga una vez que esta ha sido colocada en el
  // transporte». La base ya lo admite (suma las fotos y respeta la fecha).
  const faltanFotosCarga = faltanFotosDeCarga(servicio);

  return (
    <div className="space-y-3">
      {/* 1 · Probar y embalar. Desde la 0260 va máquina por máquina, cada una
          con su protocolo, en la lista de la derecha; esta tarjeta solo dice
          dónde. Queda el formulario de un solo protocolo para los pedidos
          que no tienen lista. */}
      {!probado && porEquipo && (
        <Tarjeta icono={FileCheck2} titulo="Probar y embalar" tono={servicio.prueba_solicitada_at ? "activa" : "normal"}>
          <p className="text-xs text-muted-foreground">
            {servicio.prueba_solicitada_at ? "Postventa pidió la prueba. " : "Postventa todavía no pidió la prueba; se puede adelantar. "}
            Cada máquina tiene su protocolo: pruébelas una por una en <b>Equipos de este pedido</b> (a la derecha). Cuando estén todas las que van, el pedido queda probado y embalado solo.
          </p>
        </Tarjeta>
      )}
      {!probado && !porEquipo && (
        <Tarjeta icono={FileCheck2} titulo="Probar y embalar" tono={servicio.prueba_solicitada_at ? "activa" : "normal"}>
          <p className="text-xs text-muted-foreground">
            {servicio.prueba_solicitada_at
              ? "Postventa pidió la prueba. Pruebe la máquina, suba el protocolo (foto o PDF) y marque."
              : "Postventa todavía no pidió la prueba; se puede adelantar."}
          </p>
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">N.º de protocolo</Label>
              <Input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="ej. PROT-2026-045" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Nota</Label>
              <Input value={notaPrueba} onChange={(e) => setNotaPrueba(e.target.value)} placeholder="ej. probada con carga, embalada en pallet" />
            </div>
          </div>
          <TomarOSubirVarias titulo="Protocolo y fotos de la prueba" archivos={fotosProtocolo} onChange={setFotosProtocolo} acepta="image/*,application/pdf" />
          <Button
            size="sm"
            disabled={pendiente}
            onClick={() =>
              correr(async () => {
                const fotos = await subir(fotosProtocolo.map((f) => ({ file: f, etiqueta: "protocolo" })));
                if (!fotos) return { error: "No se subieron los archivos" };
                return marcarProbado(servicio.id, { protocoloRef: protocolo, fotos, nota: notaPrueba, cliente });
              }, "Marcado como probado y embalado. Postventa ya lo sabe.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Probado y embalado
          </Button>
        </Tarjeta>
      )}

      {/* 2 · Listo para el despacho programado. EL DOBLE FILTRO (Carlos,
          22-09): programar el despacho no significa que postventa ya cumplió
          los otros pasos. Verde = la apertura salió, todo revisado por el
          servidor; rojo = todavía no, y acá no hay nada que confirmar. */}
      {probado && servicio.fecha_despacho && !servicio.despachado_at && !servicio.almacen_listo_at && (
        <Tarjeta
          icono={Warehouse}
          titulo={`Despacho programado para el ${servicio.fecha_despacho}${servicio.despacho_hora ? ` a las ${String(servicio.despacho_hora).slice(0, 5)}` : ""}`}
          tono={postventaCumplio ? "verde" : "roja"}
        >
          {postventaCumplio ? (
            <>
              <p className="text-xs text-muted-foreground">
                Confirme que el almacén está listo (montacarga, embalaje, personal). Postventa se entera al toque.
                {servicio.despacho_nota ? ` Nota de postventa: ${servicio.despacho_nota}.` : ""}
              </p>
              <Input value={notaListo} onChange={(e) => setNotaListo(e.target.value)} placeholder="ej. montacarga contratado para las 3 pm" />
              <Button size="sm" disabled={pendiente} onClick={() => correr(() => confirmarListo(servicio.id, { nota: notaListo, cliente, fecha: servicio.fecha_despacho ?? null }), "Confirmado: almacén listo.")}>
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Estamos listos
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-destructive">
                Postventa todavía no cumplió{trabadoApertura ? `: ${trabadoApertura}` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">No se prepara ni sale nada hasta que emita la apertura de despacho.</p>
              <Button size="sm" disabled className="cursor-not-allowed opacity-60">
                Estamos listos
              </Button>
            </>
          )}
        </Tarjeta>
      )}

      {/* 3 · La salida */}
      {probado && (!servicio.despachado_at || faltanFotosCarga) && (
        <Tarjeta
          icono={Truck}
          titulo={faltanFotosCarga ? "Fotos de la carga en el transporte" : "Registrar la salida"}
          tono={puedeSalir ? "activa" : "bloqueada"}
        >
          {!puedeSalir ? (
            <p className="text-xs text-destructive">Sin apertura de despacho no sale nada del almacén. Pídasela a postventa.</p>
          ) : faltanFotosCarga ? (
            <p className="text-xs text-muted-foreground">
              Postventa ya registró la salida{servicio.guia ? ` (guía ${servicio.guia})` : ""}, pero falta la evidencia del almacén: cinco ángulos de la máquina ya cargada y un video. Mínimo tres fotos.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Cinco ángulos y un video al terminar de cargar. Mínimo tres fotos para registrar.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ANGULOS.map((a) => (
              <TomarOSubir key={a.etiqueta} titulo={a.titulo} archivo={angulos[a.etiqueta] ?? null} onChange={(f) => setAngulos((x) => ({ ...x, [a.etiqueta]: f }))} compacto />
            ))}
            <TomarOSubir titulo="Video (corto)" archivo={video} onChange={setVideo} video compacto />
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">Fecha de salida</Label>
              <Input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Nota</Label>
              <Input value={notaSalida} onChange={(e) => setNotaSalida(e.target.value)} placeholder="ej. salió en la camioneta de la empresa a las 4 pm" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pendiente || !puedeSalir || !salidaLista}
            title={!salidaLista ? "Faltan fotos (mínimo 3)" : undefined}
            onClick={() =>
              correr(async () => {
                const archivos = [
                  ...ANGULOS.filter((a) => angulos[a.etiqueta]).map((a) => ({ file: angulos[a.etiqueta]!, etiqueta: a.etiqueta })),
                  ...(video ? [{ file: video, etiqueta: "video" }] : []),
                ];
                const fotos = await subir(archivos);
                if (!fotos) return { error: "No se subieron los archivos" };
                return registrarSalida(servicio.id, { fecha: fechaSalida, fotos, nota: notaSalida, cliente });
              }, faltanFotosCarga ? "Fotos de la carga subidas. Postventa ya las ve." : "Salida registrada. Falta la guía en la agencia.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            {faltanFotosCarga ? "Subir las fotos de la carga" : "Salió del almacén"}
          </Button>
        </Tarjeta>
      )}

      {/* 4 · En la agencia (o en el cliente) */}
      {servicio.despachado_at && !servicio.agencia_at && (
        <Tarjeta icono={PackageCheck} titulo="En la agencia o en el cliente" tono="activa">
          <p className="text-xs text-muted-foreground">
            La guía de remisión es lo que el cliente necesita para recoger. Foto de la guía y foto de la máquina entregada.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs">Agencia o transportista</Label>
              <Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="ej. Shalom, Marvisur, camioneta propia" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">N.º de guía de remisión <span className="text-destructive">*</span></Label>
              <Input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="ej. T001-0004567" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Quién recibió</Label>
              <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="nombre en la agencia o en el cliente" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <TomarOSubir titulo="Foto de la guía" archivo={fotoGuia} onChange={setFotoGuia} compacto />
            <TomarOSubir titulo="Foto de la máquina entregada" archivo={fotoMaquina} onChange={setFotoMaquina} compacto />
          </div>
          <Button
            size="sm"
            disabled={pendiente || !guia.trim()}
            onClick={() =>
              correr(async () => {
                const fotos = await subir([
                  ...(fotoGuia ? [{ file: fotoGuia, etiqueta: "guia" }] : []),
                  ...(fotoMaquina ? [{ file: fotoMaquina, etiqueta: "maquina" }] : []),
                ]);
                if (!fotos) return { error: "No se subieron las fotos" };
                return registrarAgencia(servicio.id, { transportista, guia, fotos, recibe, cliente });
              }, "Entrega registrada con su guía. Postventa da el doble check.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
            Entregado con guía
          </Button>
        </Tarjeta>
      )}

      {servicio.agencia_at && (
        <div className="rounded-xl border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 p-4 text-sm text-[#1E7F4F]">
          <Check className="mr-1 inline size-4" />
          Despachado con guía {servicio.guia}. {servicio.despacho_verificado_at ? "Postventa ya lo verificó." : "Falta el doble check de postventa."}
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  icono: Icono,
  titulo,
  tono,
  children,
}: {
  icono: typeof Truck;
  titulo: string;
  /** «verde»/«roja» (22-09): el semáforo de si postventa ya cumplió lo suyo. */
  tono: "activa" | "normal" | "bloqueada" | "verde" | "roja";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-xl border p-4 shadow-sm",
        tono === "activa"
          ? "border-primary/40 bg-primary/5"
          : tono === "bloqueada"
            ? "border-border bg-secondary/40"
            : tono === "verde"
              ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5"
              : tono === "roja"
                ? "border-destructive/50 bg-destructive/5"
                : "border-border bg-card",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icono className={cn("size-4", tono === "verde" ? "text-[#1E7F4F]" : tono === "roja" ? "text-destructive" : "text-primary")} /> {titulo}
      </p>
      {children}
    </div>
  );
}
