"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackageCheck, Truck, FileCheck2, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { marcarProbado, confirmarListo, registrarSalida, registrarAgencia, autorizarSalidaConSaldo } from "@/lib/acciones/almacen";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { bloquesPedido, circuitoDe, faltanFotosDeCarga, type FotoAlmacen, type ServicioPostventa } from "@/lib/postventa";
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

/** Una máquina que sale en este despacho, con su serie (la secadora de la torre va aparte). */
export interface MaquinaDeLaSalida {
  clave: string;
  titulo: string;
  serie: string | null;
}

export function PedidoAlmacen({
  servicio,
  porEquipo = false,
  maquinas = [],
}: {
  servicio: ServicioPostventa;
  porEquipo?: boolean;
  maquinas?: MaquinaDeLaSalida[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const cliente = (servicio.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  // UN SERVICIO NO SE PRUEBA NI SE EMBALA (Lesly, 09-10, MERCEDARIAS): en
  // una revisión o un mantenimiento no sale ninguna máquina, sale el técnico
  // (con materiales o repuestos, si la apertura los pide). El renglón
  // «Servicio técnico» se veía como una máquina sin protocolo y el pedido no
  // pasaba de «pendiente de prueba», aunque el servicio ya se había hecho.
  const esServicio = circuitoDe(servicio).esServicio;
  const probado = esServicio || servicio.prueba_lista_at != null || String(servicio.prueba_embalaje ?? "").toUpperCase() === "SI";
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

  async function subir(archivos: { file: File; etiqueta: string; maquina?: MaquinaDeLaSalida }[]): Promise<FotoAlmacen[] | null> {
    const storage = createClient().storage.from("adjuntos");
    const salida: FotoAlmacen[] = [];
    for (const { file, etiqueta, maquina } of archivos) {
      const path = `pedidos/${servicio.id}/almacen/${etiqueta}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      const { error } = await storage.upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) {
        toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        return null;
      }
      salida.push({
        path,
        nombre: file.name.slice(0, 120),
        tipo: file.type.slice(0, 100),
        etiqueta,
        ...(maquina ? { maquina: maquina.titulo, serie: maquina.serie } : {}),
      });
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

  // FOTOS POR SERIE (Lesly, 10-10, PED-0013 LINO ESPIRITU: «el cliente tiene
  // varios equipos»). Con dos máquinas o más, cada una tiene sus ángulos y su
  // video, y las fotos quedan marcadas con su serie y en el orden del pedido.
  // Cada máquina necesita al menos una foto; el servidor sigue pidiendo tres
  // en total.
  const porMaquina = !esServicio && maquinas.length >= 2;
  const claveFoto = (m: MaquinaDeLaSalida, etiqueta: string) => `${m.clave}|${etiqueta}`;
  const fotosDe = (m: MaquinaDeLaSalida) => ANGULOS.filter((a) => angulos[claveFoto(m, a.etiqueta)]).length;
  const archivosPorMaquina = () =>
    maquinas.flatMap((m) => [
      ...ANGULOS.filter((a) => angulos[claveFoto(m, a.etiqueta)]).map((a) => ({ file: angulos[claveFoto(m, a.etiqueta)]!, etiqueta: a.etiqueta, maquina: m })),
      ...(angulos[claveFoto(m, "video")] ? [{ file: angulos[claveFoto(m, "video")]!, etiqueta: "video", maquina: m }] : []),
    ]);
  const faltaMaquina = porMaquina ? maquinas.find((m) => fotosDe(m) === 0) : undefined;
  // En el servicio las fotos (lo que lleva el técnico) son opcionales.
  const salidaLista = esServicio
    ? true
    : porMaquina
      ? !faltaMaquina && maquinas.reduce((n, m) => n + fotosDe(m), 0) >= 3
      : ANGULOS.filter((a) => angulos[a.etiqueta]).length >= 3;
  // Ya salió con las fotos juntas: puede sumar las de cada máquina (PED-0013).
  const sumarPorMaquina = porMaquina && Boolean(servicio.despachado_at) && !servicio.despacho_verificado_at;
  const puedeSalir = Boolean(servicio.apertura_despacho_at) || !servicio.informe_cierre_id;
  // CON SALDO PENDIENTE NO SALE SIN AUTORIZACIÓN (0297). El almacén no ve
  // montos: `despacho_liberado` ya lo resolvió el servidor antes de taparlos.
  const conSaldo = servicio.despacho_liberado === false && !servicio.despachado_at;
  const salidaAutorizada = Boolean(servicio.salida_autorizada_at || servicio.despacho_autorizado_por);
  const trabadaPorSaldo = puedeSalir && conSaldo && !salidaAutorizada;
  const [pinSalida, setPinSalida] = useState("");
  const [motivoSalida, setMotivoSalida] = useState("");
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
      {probado && (!servicio.despachado_at || (faltanFotosCarga && !esServicio)) && (
        <Tarjeta
          icono={Truck}
          titulo={faltanFotosCarga ? "Fotos de la carga en el transporte" : esServicio ? "Registrar la salida del técnico" : "Registrar la salida"}
          tono={puedeSalir ? "activa" : "bloqueada"}
        >
          {!puedeSalir ? (
            <p className="text-xs text-destructive">Sin apertura de despacho no sale nada del almacén. Pídasela a postventa.</p>
          ) : trabadaPorSaldo ? (
            <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-500/10">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                Este pedido tiene saldo pendiente: la máquina no sale hasta que gerencia u operaciones lo autorice.
              </p>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80">
                Quien autoriza le dicta su código. Queda escrito quién autorizó y por qué, y postventa recibe el aviso.
              </p>
              <Input value={motivoSalida} onChange={(e) => setMotivoSalida(e.target.value)} placeholder="Por qué sale con saldo (ej. el cliente paga el saldo contra entrega)" />
              <CampoCodigo valor={pinSalida} onChange={setPinSalida} tono="amber" id={`pin-salida-${servicio.id}`} />
              <Button
                size="sm"
                disabled={pendiente || motivoSalida.trim().length < 5 || pinSalida.replace(/\D/g, "").length < 4}
                onClick={() => correr(() => autorizarSalidaConSaldo(servicio.id, pinSalida, motivoSalida, cliente), "Salida autorizada: ya puede registrar la salida")}
              >
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Autorizar la salida
              </Button>
            </div>
          ) : faltanFotosCarga ? (
            <p className="text-xs text-muted-foreground">
              Postventa ya registró la salida{servicio.guia ? ` (guía ${servicio.guia})` : ""}, pero falta la evidencia del almacén: cinco ángulos de la máquina ya cargada y un video. Mínimo tres fotos.
            </p>
          ) : esServicio ? (
            <p className="text-xs text-muted-foreground">
              Es un servicio{servicio.tipo_pedido === "mantenimiento" ? " de mantenimiento" : " de revisión"}: no hay máquina que probar ni embalar. Registre el día en que salió el técnico
              {servicio.apertura_guia ? " con lo que pide la apertura (materiales o repuestos)" : ""}. Las fotos de lo que lleva son opcionales.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {porMaquina
                ? `Este pedido lleva ${maquinas.length} máquinas: suba las fotos de cada una con su serie (cinco ángulos y un video). Al menos una foto por máquina y tres en total.`
                : "Cinco ángulos y un video al terminar de cargar. Mínimo tres fotos para registrar."}
            </p>
          )}
          {servicio.salida_autorizada_at && conSaldo && (
            <p className="text-[11px] font-medium text-[#1E7F4F]">Salida con saldo autorizada: {servicio.salida_autorizada_motivo}</p>
          )}
          {!trabadaPorSaldo && (
          <>
          {porMaquina ? (
            <FotosPorMaquina maquinas={maquinas} angulos={angulos} setAngulos={setAngulos} claveFoto={claveFoto} fotosDe={fotosDe} />
          ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(esServicio ? ANGULOS.slice(0, 2).map((a, i) => ({ ...a, titulo: `Lo que lleva el técnico${i ? " (otra foto)" : ""}` })) : ANGULOS).map((a) => (
              <TomarOSubir key={a.etiqueta} titulo={a.titulo} archivo={angulos[a.etiqueta] ?? null} onChange={(f) => setAngulos((x) => ({ ...x, [a.etiqueta]: f }))} compacto />
            ))}
            {!esServicio && <TomarOSubir titulo="Video (corto)" archivo={video} onChange={setVideo} video compacto />}
          </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">Fecha de salida</Label>
              <Input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Nota</Label>
              <Input value={notaSalida} onChange={(e) => setNotaSalida(e.target.value)} placeholder={esServicio ? "ej. salió el técnico Juan a las 8 am con los materiales" : "ej. salió en la camioneta de la empresa a las 4 pm"} />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pendiente || !puedeSalir || !salidaLista}
            title={!salidaLista ? (faltaMaquina ? `Falta al menos una foto de ${faltaMaquina.titulo}${faltaMaquina.serie ? ` (${faltaMaquina.serie})` : ""}` : "Faltan fotos (mínimo 3)") : undefined}
            onClick={() =>
              correr(async () => {
                const archivos = porMaquina
                  ? archivosPorMaquina()
                  : [
                      ...ANGULOS.filter((a) => angulos[a.etiqueta]).map((a) => ({ file: angulos[a.etiqueta]!, etiqueta: a.etiqueta })),
                      ...(video ? [{ file: video, etiqueta: "video" }] : []),
                    ];
                const fotos = await subir(archivos);
                if (!fotos) return { error: "No se subieron los archivos" };
                return registrarSalida(servicio.id, { fecha: fechaSalida, fotos, nota: notaSalida, cliente });
              }, faltanFotosCarga ? "Fotos de la carga subidas. Postventa ya las ve." : esServicio ? "Salida del técnico registrada. El servicio lo cierra postventa con el informe." : "Salida registrada. Falta la guía en la agencia.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            {faltanFotosCarga ? "Subir las fotos de la carga" : esServicio ? "Salió el técnico" : "Salió del almacén"}
          </Button>
          </>
          )}
        </Tarjeta>
      )}

      {/* Ya salió con las fotos juntas: sumar las de cada máquina con su serie (Lesly, 10-10). */}
      {sumarPorMaquina && !faltanFotosCarga && (
        <Tarjeta icono={Truck} titulo="Fotos de la salida por máquina" tono="normal">
          <p className="text-xs text-muted-foreground">
            La salida ya está registrada{(servicio.salida_fotos?.length ?? 0) > 0 ? ` con ${servicio.salida_fotos!.length} fotos juntas` : ""}. Si quiere, suba aquí las fotos de cada máquina: quedan con su serie y ordenadas en las fotos del almacén.
          </p>
          <FotosPorMaquina maquinas={maquinas} angulos={angulos} setAngulos={setAngulos} claveFoto={claveFoto} fotosDe={fotosDe} />
          <Button
            size="sm"
            variant="outline"
            disabled={pendiente || maquinas.every((m) => fotosDe(m) === 0 && !angulos[claveFoto(m, "video")])}
            onClick={() =>
              correr(async () => {
                const fotos = await subir(archivosPorMaquina());
                if (!fotos) return { error: "No se subieron los archivos" };
                const r = await registrarSalida(servicio.id, { fecha: fechaSalida, fotos, nota: "", cliente });
                if (!r.error) setAngulos({});
                return r;
              }, "Fotos subidas, cada una con su serie.")
            }
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            Subir las fotos por máquina
          </Button>
        </Tarjeta>
      )}

      {/* El servicio termina para el almacén cuando sale el técnico: no hay agencia ni guía de la máquina. */}
      {esServicio && servicio.despachado_at && (
        <div className="rounded-xl border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 p-4 text-sm text-[#1E7F4F]">
          <Check className="mr-1 inline size-4" />
          El técnico salió el {new Date(servicio.despachado_at).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}. Para el almacén el servicio está hecho; lo cierra postventa con el informe del técnico.
        </div>
      )}

      {/* 4 · En la agencia (o en el cliente) */}
      {!esServicio && servicio.despachado_at && !servicio.agencia_at && (
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

      {!esServicio && servicio.agencia_at && (
        <div className="rounded-xl border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 p-4 text-sm text-[#1E7F4F]">
          <Check className="mr-1 inline size-4" />
          Despachado con guía {servicio.guia}. {servicio.despacho_verificado_at ? "Postventa ya lo verificó." : "Falta el doble check de postventa."}
        </div>
      )}
    </div>
  );
}

/** Un bloque por máquina, con su serie: cinco ángulos y un video (Lesly, 10-10). */
function FotosPorMaquina({
  maquinas,
  angulos,
  setAngulos,
  claveFoto,
  fotosDe,
}: {
  maquinas: MaquinaDeLaSalida[];
  angulos: Archivos;
  setAngulos: React.Dispatch<React.SetStateAction<Archivos>>;
  claveFoto: (m: MaquinaDeLaSalida, etiqueta: string) => string;
  fotosDe: (m: MaquinaDeLaSalida) => number;
}) {
  return (
    <div className="space-y-2">
      {maquinas.map((m, i) => (
        <div key={m.clave} className="rounded-lg border border-border bg-card p-2.5">
          <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary">{i + 1}</span>
            {m.titulo}
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-medium">{m.serie ? `Serie ${m.serie}` : "sin serie todavía"}</span>
            <span className={cn("text-[11px] font-normal", fotosDe(m) ? "text-[#1E7F4F]" : "text-muted-foreground")}>
              {fotosDe(m) ? `${fotosDe(m)} de 5 fotos` : "sin fotos"}
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ANGULOS.map((a) => (
              <TomarOSubir
                key={a.etiqueta}
                titulo={a.titulo}
                archivo={angulos[claveFoto(m, a.etiqueta)] ?? null}
                onChange={(f) => setAngulos((x) => ({ ...x, [claveFoto(m, a.etiqueta)]: f }))}
                compacto
              />
            ))}
            <TomarOSubir
              titulo="Video (corto)"
              archivo={angulos[claveFoto(m, "video")] ?? null}
              onChange={(f) => setAngulos((x) => ({ ...x, [claveFoto(m, "video")]: f }))}
              video
              compacto
            />
          </div>
        </div>
      ))}
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
