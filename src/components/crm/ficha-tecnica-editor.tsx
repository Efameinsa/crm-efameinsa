"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Check, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { bloquesATexto, textoABloques, type BloqueFicha } from "@/lib/ficha-texto";
import {
  crearEquipoDesdeFicha,
  fichaDeReferencia,
  fijarImagenProducto,
  fijarPrecio,
  guardarEquipo,
  type DatosEquipo,
} from "@/lib/acciones/productos";
import { TIPOS_EQUIPO, casillasDe, tipoDeCategoria, type CasillaEquipo } from "@/lib/tipos-equipo";
import { createClient } from "@/lib/supabase/client";
import { prepararFoto, rutaFoto } from "@/lib/foto-producto";
import { leerFichaDeWord } from "@/lib/leer-ficha-word";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * La hoja técnica del equipo, tal como sale impresa, y editable ahí mismo.
 *
 * POR QUÉ ASÍ Y NO UN FORMULARIO. Lo que hay que comprobar de un equipo es cómo
 * QUEDA la hoja que recibe el cliente: si el nombre entra en el título, si la
 * capacidad está en la casilla que le toca, si la descripción se lee. Un
 * formulario de campos apilados contesta «qué dice cada dato» y no contesta
 * ninguna de esas. Así que la pantalla ES la hoja —mismo título, mismo
 * encabezado de especificaciones, foto a la izquierda y descripción a la
 * derecha (docs/14)— y se edita encima de lo que se está mirando.
 *
 * LAS CASILLAS SALEN DEL TIPO DE EQUIPO. Una plancha no tiene panel
 * computarizado —ninguna de las 26 del catálogo lo tiene— y un coche solo pide
 * volumen y color. Ofrecer los siete campos a todos hace que quien carga un
 * equipo se pregunte si se le olvidó algo. Ver `tipos-equipo.ts`.
 *
 * ES LA MISMA HOJA PARA CARGAR UNO NUEVO, con una pregunta al principio: qué se
 * está cargando. Dos formularios distintos —uno de alta y otro de corrección—
 * es la manera segura de que las fichas nuevas salgan con otra forma.
 */

export interface EquipoEditable {
  id: string | null;
  nombre: string;
  marca: string;
  modelo: string;
  sku: string | null;
  categoria: string | null;
  capacidad: string | null;
  segmento: "industrial" | "semi_industrial";
  activo: boolean;
  calentamiento: string | null;
  panel: string | null;
  controles: string | null;
  montaje: string | null;
  colores: string[];
  /**
   * Las casillas propias de ESTE equipo, con su rótulo escrito a mano.
   *
   * El encabezado tenía una lista cerrada de seis —capacidad, calentamiento,
   * panel, controles, montaje, colores— pensada mirando lavadoras y secadoras.
   * La MESA VAPORIZADORA EFALMV2000 pide «Potencia», «Dimensión de mesa» y
   * «Presión de trabajo», y no había dónde escribirlas (Santos, 09-09). Cada
   * familia trae las suyas; la lista no puede ser cerrada.
   */
  encabezadoExtra: { rotulo: string; valor: string }[];
  fotoPath: string | null;
  fichaTexto: string;
  precios: { tier: string; precio: number }[];
  /** De qué equipo se copió, cuando es un duplicado. Cambia el título y
   *  evita la pregunta del tipo: los datos ya vienen. */
  duplicadoDe?: string | null;
  /** De qué Word se leyó, cuando Lesly arrastró la ficha. Igual que el
   *  duplicado, no pregunta qué se está cargando: el Word ya lo dijo. */
  leidaDe?: string | null;
  /** La foto que traía ese Word: recortada como la muestra el documento y ya
   *  acomodada a la caja de la hoja (`leerFichaDeWord` la deja lista). Espera
   *  al guardado, igual que una elegida a mano. */
  fotoLista?: Blob | null;
  /** Para verla mientras tanto, sin volver a leer el archivo. */
  fotoUrl?: string | null;
  /**
   * Las otras dos imágenes de la hoja impresa: el logo del fabricante y la
   * vista del panel de control (migración 0205).
   *
   * También vienen en el Word y también tienen su caja en la cotización —27 ×
   * 14 mm y 35 × 32—. Antes solo se guardaba la del equipo, así que una ficha
   * cargada desde acá salía impresa sin logo y sin panel mientras la misma
   * ficha cargada por el pipeline sí los tenía: «al subir este producto con el
   * Word no carga completo la imagen» (operaciones, 09-09, con la SECU75E3).
   */
  logoPath: string | null;
  panelPath: string | null;
  logoLista?: Blob | null;
  logoUrl?: string | null;
  panelLista?: Blob | null;
  panelUrl?: string | null;
  disponibles: number | null;
  stockReferencia: number | null;
  ubicacionMaestro: string | null;
}

/** Las dos imágenes que acompañan a la del equipo en la hoja impresa. */
type RolImagen = "logo" | "panel";

const ROLES_IMAGEN: RolImagen[] = ["logo", "panel"];

/** Cómo se llaman en pantalla, que es como las nombra quien las mira. */
const NOMBRE_IMAGEN: Record<RolImagen, string> = {
  logo: "Logo del fabricante",
  panel: "Panel de control",
};

/** Lo que la hoja sabe de una de ellas mientras se la edita. */
interface ImagenDeHoja {
  /** Para verla ahora: la del Word recién leído o la que ya está guardada. */
  url: string | null;
  /** La que espera al guardado, ya recortada y acomodada. */
  pendiente: Blob | null;
  /** La que el equipo ya tiene guardada, si tiene. */
  guardada: string | null;
  /** Se pidió sacarla: la foto del equipo ya trae el logo impreso, o el Word
   *  nuevo no la trae. */
  quitar: boolean;
}

export const EQUIPO_NUEVO: EquipoEditable = {
  id: null,
  nombre: "",
  marca: "",
  modelo: "",
  sku: null,
  categoria: null,
  capacidad: null,
  segmento: "industrial",
  activo: true,
  calentamiento: null,
  panel: null,
  controles: null,
  montaje: null,
  colores: [],
  encabezadoExtra: [],
  fotoPath: null,
  logoPath: null,
  panelPath: null,
  fichaTexto: "# CARACTERÍSTICAS\n- ",
  precios: [],
  disponibles: null,
  stockReferencia: null,
  ubicacionMaestro: null,
};



/**
 * Sube el archivo ya preparado y lo deja apuntado en el equipo.
 *
 * Vive fuera del componente porque no usa nada de él: recibe el id y la imagen.
 * Adentro, el compilador de React marcaba el `Date.now()` del nombre del
 * archivo como impuro —aunque solo corra al pulsar un botón—, y suprimir la
 * regla habría sido tapar el aviso en vez de sacar del cuerpo del componente lo
 * que nunca fue suyo.
 */
async function subirAlAlmacen(id: string, blob: Blob, rol: "foto" | "logo" | "panel" = "foto"): Promise<string | null> {
  const supabase = createClient();
  const ruta = `${id}${rol === "foto" ? "" : `-${rol}`}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("productos")
    .upload(ruta, blob, { contentType: "image/jpeg", upsert: true });
  if (error) return error.message;
  const r = await fijarImagenProducto(id, rol, ruta);
  return r.error;
}

export function FichaTecnicaEditor({
  equipo,
  onListo,
}: {
  equipo: EquipoEditable;
  /** Al terminar. Con el id cuando el equipo se acaba de crear, para poder
   *  llevarlo arriba de la lista y resaltarlo. */
  onListo: (id?: string) => void;
}) {
  const esNuevo = equipo.id === null;
  const [d, setD] = useState(equipo);
  const [bloques, ponerBloques] = useState<BloqueFicha[]>(() => textoABloques(equipo.fichaTexto));
  const [precio, ponerPrecio] = useState(String(equipo.precios[0]?.precio ?? ""));
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const set = <K extends keyof EquipoEditable>(k: K, v: EquipoEditable[K]) => {
    setTocado(true);
    setConfirmandoSalida(false);
    setD({ ...d, [k]: v });
  };

  // Un equipo nuevo empieza por la pregunta: qué se está cargando.
  // Un duplicado no pregunta qué es: ya lo sabe, viene del equipo copiado.
  const [eligiendoTipo, setEligiendoTipo] = useState(esNuevo && !equipo.duplicadoDe && !equipo.leidaDe);
  const [copiadaDe, setCopiadaDe] = useState<string | null>(equipo.duplicadoDe ?? null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // La del Word ya viene lista y con su URL: la hoja la recibe, no la fabrica.
  const [fotoLocal, setFotoLocal] = useState<string | null>(equipo.fotoUrl ?? null);
  const [fotoPendiente, setFotoPendiente] = useState<Blob | null>(equipo.fotoLista ?? null);
  // Las otras dos cajas de la hoja impresa —logo del fabricante y vista del
  // panel—, que salen del mismo Word (0205).
  const [complementos, setComplementos] = useState<Record<RolImagen, ImagenDeHoja>>({
    logo: { url: equipo.logoUrl ?? null, pendiente: equipo.logoLista ?? null, guardada: equipo.logoPath, quitar: false },
    panel: { url: equipo.panelUrl ?? null, pendiente: equipo.panelLista ?? null, guardada: equipo.panelPath, quitar: false },
  });
  const [arrastrando, setArrastrando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  // ── Salir sin guardar ──────────────────────────────────────────────
  //
  // «Por si la señorita se equivoca de Word y quiere cancelar dicha acción»
  // (Santos, 31-08, después de que le pasara). Se podía —la X, Esc, un clic
  // afuera— pero ninguna de las tres lo dice.
  //
  // Y NO PREGUNTA SIEMPRE. Cancelar una hoja recién abierta no tiene nada que
  // confirmar: no se escribió nada todavía y preguntar convierte el arrepentirse
  // en dos pasos. Solo si ella ya escribió algo, el botón pide un segundo clic
  // —ahí sí hay trabajo que perder, y el botón está al lado del de guardar—.
  const [tocado, setTocado] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [ficha, setFicha] = useState(equipo.leidaDe ?? null);
  const [cambiandoWord, setCambiandoWord] = useState(false);
  const [arrastrandoWord, setArrastrandoWord] = useState(false);
  const inputWord = useRef<HTMLInputElement>(null);

  /** Cualquier cambio de ella cuenta, venga del campo que venga. */
  const setBloques = (v: BloqueFicha[]) => {
    setTocado(true);
    setConfirmandoSalida(false);
    ponerBloques(v);
  };
  const setPrecio = (v: string) => {
    setTocado(true);
    setConfirmandoSalida(false);
    ponerPrecio(v);
  };

  /**
   * Cambiar el Word sin salir de la hoja.
   *
   * Es lo que uno quiere hacer de verdad cuando se equivocó de archivo: no
   * cancelar y volver a empezar, sino traer el correcto. Reemplaza todo lo que
   * vino del Word —cabecera, descripción y foto— y deja lo que no sale de él:
   * el precio y el código, que Lesly ya pudo haber escrito.
   */
  function cambiarWord(archivo: File) {
    setCambiandoWord(true);
    void (async () => {
      try {
        const { equipo: leido, bloques: cuantos, fotoIlegible } = await leerFichaDeWord(archivo);
        setD((antes) => ({
          ...antes,
          nombre: leido.nombre,
          marca: leido.marca,
          modelo: leido.modelo,
          sku: antes.sku ?? leido.sku,
          categoria: leido.categoria,
          segmento: leido.segmento,
          capacidad: leido.capacidad,
          panel: leido.panel,
          controles: leido.controles,
          calentamiento: leido.calentamiento,
        }));
        ponerBloques(textoABloques(leido.fichaTexto));
        setFicha(leido.leidaDe ?? null);
        setConfirmandoSalida(false);
        setFotoPendiente(leido.fotoLista ?? null);
        setFotoLocal(leido.fotoUrl ?? null);
        // El Word nuevo manda: lo que ese archivo no trae se quita, para que no
        // queden mezcladas las imágenes de dos fichas distintas.
        setComplementos((antes) => ({
          logo: {
            url: leido.logoUrl ?? null,
            pendiente: leido.logoLista ?? null,
            guardada: antes.logo.guardada,
            quitar: !leido.logoLista,
          },
          panel: {
            url: leido.panelUrl ?? null,
            pendiente: leido.panelLista ?? null,
            guardada: antes.panel.guardada,
            quitar: !leido.panelLista,
          },
        }));
        if (fotoIlegible) toast.warning("La ficha trae una imagen que el navegador no sabe abrir. Todo lo demás sí se leyó.");
        toast.success(`Ahora se está leyendo ${leido.leidaDe}: ${cuantos} líneas de descripción.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setCambiandoWord(false);
      }
    })();
  }

  /** Salir sin guardar. Pregunta una sola vez, y solo si hay algo que perder. */
  function cancelar() {
    if (!tocado || confirmandoSalida) {
      onListo();
      return;
    }
    setConfirmandoSalida(true);
  }

  const yaCargadas: CasillaEquipo[] = [
    d.capacidad && "capacidad",
    d.calentamiento && "calentamiento",
    d.panel && "panel",
    d.controles && "controles",
    d.montaje && "montaje",
    d.colores.length > 0 && "colores",
  ].filter(Boolean) as CasillaEquipo[];
  const casillas = casillasDe(d.categoria, yaCargadas);
  const tipo = tipoDeCategoria(d.categoria);

  /**
   * Elegir la foto. Se acomoda en el navegador antes de que viaje nada: a la
   * caja de la ficha, centrada sobre blanco y comprimida.
   *
   * Si el equipo TODAVÍA NO EXISTE, la foto espera y se sube al guardarlo. La
   * versión anterior desactivaba el botón mientras el equipo era nuevo, que es
   * justo cuando uno tiene la foto a mano.
   */
  function elegirFoto(archivo: File) {
    setSubiendoFoto(true);
    void (async () => {
      const lista = await prepararFoto(archivo);
      if (!lista) {
        toast.error("Ese archivo no se pudo leer como imagen");
        setSubiendoFoto(false);
        return;
      }
      setTocado(true);
      setFotoLocal(URL.createObjectURL(lista.archivo));
      const kb = Math.round(lista.bytes / 1024);

      if (!equipo.id) {
        setFotoPendiente(lista.archivo);
        setSubiendoFoto(false);
        toast.success(`Foto lista: ${lista.ancho}×${lista.alto} px, ${kb} KB. Se sube al guardar.`);
        return;
      }

      const error = await subirAlAlmacen(equipo.id, lista.archivo);
      setSubiendoFoto(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Foto lista: ${lista.ancho}×${lista.alto} px, ${kb} KB.`);
      router.refresh();
    })();
  }



  /**
   * Deja las tres imágenes de la hoja donde el PDF las va a buscar.
   *
   * Devuelve el aviso de lo que no se pudo, en castellano y en una frase, para
   * que el toast diga qué falta y no un error de la nube. Que falle una imagen
   * no deshace el equipo: ya está cargado y la ficha se arregla volviendo a
   * entrar.
   */
  async function guardarImagenes(id: string): Promise<string | null> {
    const fallas: string[] = [];
    if (fotoPendiente) {
      const e = await subirAlAlmacen(id, fotoPendiente, "foto");
      if (e) fallas.push(`la foto no se subió (${e})`);
    }
    for (const rol of ROLES_IMAGEN) {
      const c = complementos[rol];
      const comoSeLlama = rol === "logo" ? "el logo del fabricante" : "la vista del panel";
      if (c.quitar) {
        if (!c.guardada) continue; // nunca estuvo: no hay nada que sacar
        const e = await fijarImagenProducto(id, rol, null);
        if (e.error) fallas.push(`${comoSeLlama} no se pudo quitar (${e.error})`);
      } else if (c.pendiente) {
        const e = await subirAlAlmacen(id, c.pendiente, rol);
        if (e) fallas.push(`${comoSeLlama} no se subió (${e})`);
      }
    }
    return fallas.length > 0 ? fallas.join("; ") : null;
  }

  function guardar() {
    // EL PRECIO SE REVISA ACÁ, no después.
    //
    // Un equipo sin precio entra al catálogo igual, el comercial lo encuentra
    // y no lo puede cotizar: el error aparece recién en el aviso de la
    // pantalla, cuando ya está cargado y hay que ir a buscarlo entre ciento
    // veinte (reportado 28-08). Se avisa cuando todavía se puede escribir.
    const monto = Number(precio);
    if (!precio.trim() || !Number.isFinite(monto) || monto <= 0) {
      toast.error("Falta el precio. Sin precio el comercial lo encuentra pero no lo puede cotizar.");
      return;
    }

    empezar(async () => {
      const datos: DatosEquipo = {
        nombre: d.nombre,
        marca: d.marca,
        modelo: d.modelo,
        sku: d.sku,
        categoria: d.categoria,
        capacidad: d.capacidad,
        segmento: d.segmento,
        activo: d.activo,
        calentamiento: d.calentamiento,
        panel: d.panel,
        controles: d.controles,
        montaje: d.montaje,
        colores: d.colores,
        encabezadoExtra: d.encabezadoExtra,
        stockReferencia: d.stockReferencia,
        fichaTexto: bloquesATexto(bloques),
      };

      if (esNuevo) {
        const r = await crearEquipoDesdeFicha(datos, Number(precio) || null);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        // Las imágenes elegidas antes de que el equipo existiera: ahora sí
        // tienen dónde colgarse. Las tres, no solo la del equipo.
        if (r.id) {
          const eImagenes = await guardarImagenes(r.id);
          if (eImagenes) toast.error(`El equipo se creó, pero ${eImagenes}`);
        }
        toast.success(`${d.marca} ${d.modelo} entró al catálogo.`);
        onListo(r.id);
        router.refresh();
        return;
      } else {
        const r = await guardarEquipo(equipo.id!, datos);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const nuevo = Number(precio);
        const anterior = equipo.precios[0];
        // EL PRIMER PRECIO TAMBIÉN SE GUARDA (Lesly, 11-09: «SECU75E, quiero
        // que sea 9300 y no se guarda»). Solo se mandaba el precio cuando ya
        // había uno vigente que cambiar; un equipo que entró sin precio no
        // tenía cómo recibir el primero desde esta ficha. Sin precio anterior
        // el tier es el mismo que al crear el equipo: óptimo para
        // semi-industrial, base para industrial.
        if (Number.isFinite(nuevo) && nuevo > 0 && (!anterior || nuevo !== anterior.precio)) {
          const tier = anterior?.tier ?? (d.segmento === "semi_industrial" ? "optimo" : "base");
          const rp = await fijarPrecio(equipo.id!, tier, nuevo);
          if (rp.error) {
            toast.error(`Precio: ${rp.error}`);
            return;
          }
        }
        // Las imágenes que trajo el Word cambiado sobre una ficha que ya
        // existía: antes se veían en la hoja y no se subían nunca.
        const eImagenes = await guardarImagenes(equipo.id!);
        if (eImagenes) {
          toast.error(`La ficha se guardó, pero ${eImagenes}`);
          return;
        }
        toast.success("Ficha guardada.");
      }
      onListo();
      router.refresh();
    });
  }

  // ── La pregunta de apertura, solo al cargar uno nuevo ──────────────
  if (eligiendoTipo) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">¿Qué equipo va a cargar?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_EQUIPO.map((t) => (
            <button
              key={t.clave}
              type="button"
              onClick={() =>
                empezar(async () => {
                  // Se parte de un equipo real del mismo tipo: la hoja
                  // abre llena y solo hay que corregir las letras. Si no
                  // hubiera ninguno de ese tipo, se abre en blanco.
                  const r = await fichaDeReferencia(t.clave);
                  if (r.referencia) {
                    setD({
                      ...d,
                      categoria: t.clave,
                      nombre: r.referencia.nombre,
                      marca: r.referencia.marca,
                      modelo: r.referencia.modelo,
                      capacidad: r.referencia.capacidad,
                      segmento: r.referencia.segmento,
                      calentamiento: r.referencia.calentamiento,
                      panel: r.referencia.panel,
                      controles: r.referencia.controles,
                      montaje: r.referencia.montaje,
                      colores: r.referencia.colores,
                    });
                    ponerBloques(textoABloques(r.referencia.fichaTexto));
                    setCopiadaDe(r.referencia.de);
                  } else {
                    setD({ ...d, categoria: t.clave });
                  }
                  setEligiendoTipo(false);
                })
              }
              className="group rounded-xl border border-border p-4 text-left transition-all hover:border-primary hover:bg-accent/40 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-foreground">{t.nombre}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t.ejemplo}</p>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                {t.casillas.length} casillas: {t.casillas.map((c) => ROTULO[c].toLowerCase()).join(", ")}
              </p>
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          La hoja se acomoda al tipo: una plancha no muestra «panel computarizado» porque ninguna lo tiene, y un coche
          pide volumen en vez de capacidad. Se puede cambiar después.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* De dónde salió lo que está escrito. Sin decirlo, se guarda la
          ficha de otro equipo creyendo que es la nueva. */}
      {copiadaDe && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
          {equipo.duplicadoDe ? (
            <>
              Duplicado de <strong>{copiadaDe}</strong>. Todavía no está guardado: cambie el nombre, el modelo y el
              código antes de hacerlo, o quedarán dos equipos iguales en el catálogo.
            </>
          ) : (
            <>
              Está partiendo de la ficha de <strong>{copiadaDe}</strong>: cambie el nombre, la marca, el modelo y lo
              que no corresponda antes de guardar.
            </>
          )}
        </p>
      )}
      {/* DE QUÉ WORD SALIÓ, Y CÓMO CAMBIARLO SIN SALIR.
          Una ficha leída del archivo equivocado abre igual de llena y de
          creíble que la correcta: lo único que delata el error es el nombre del
          archivo, así que se dice arriba. Y al lado va lo que uno quiere hacer
          de verdad al darse cuenta —traer el correcto—, en vez de cancelar y
          volver a empezar (Santos, 31-08). Se puede soltar encima o elegirlo. */}
      {ficha && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrandoWord(true);
          }}
          onDragLeave={() => setArrastrandoWord(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrandoWord(false);
            const f = e.dataTransfer.files?.[0];
            if (f) cambiarWord(f);
          }}
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs transition-colors",
            arrastrandoWord && "border-primary bg-primary/5",
          )}
        >
          {cambiandoWord ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">
            {arrastrandoWord ? "Suelte el Word correcto acá" : "Leída de"}
          </span>
          {!arrastrandoWord && <strong className="font-medium text-foreground">{ficha}</strong>}
          <button
            type="button"
            onClick={() => inputWord.current?.click()}
            disabled={cambiandoWord || enviando}
            className="cursor-pointer text-muted-foreground underline underline-offset-2 hover:text-primary disabled:opacity-60"
          >
            {cambiandoWord ? "leyendo…" : "¿no es esa? cambiar el Word"}
          </button>
          <input
            ref={inputWord}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) cambiarWord(f);
            }}
          />
        </div>
      )}

      {/* ── LA HOJA ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border shadow-sm ring-1 ring-black/[0.03]">
        {/* Título del ítem */}
        <div className="flex items-center gap-3 bg-[#7E1210] px-4 py-3">
          <span className="flex-none rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-white/90">
            ITEM I
          </span>
          <input
            value={d.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="NOMBRE DEL EQUIPO"
            className="w-full bg-transparent text-base font-bold uppercase tracking-tight text-white outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40"
          />
        </div>

        {/* Especificaciones: rótulo arriba, valor debajo, como en la hoja */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
          <Casilla rotulo="Marca" valor={d.marca} onChange={(v) => set("marca", v)} obligatorio />
          <Casilla rotulo="Modelo" valor={d.modelo} onChange={(v) => set("modelo", v)} obligatorio />
          {casillas.includes("capacidad") && (
            <Casilla
              rotulo={tipo?.rotuloCapacidad ?? "Capacidad"}
              valor={d.capacidad ?? ""}
              onChange={(v) => set("capacidad", v || null)}
            />
          )}
          {casillas.includes("calentamiento") && (
            <Casilla
              rotulo="Calentamiento"
              valor={d.calentamiento ?? ""}
              onChange={(v) => set("calentamiento", v || null)}
              sugerencias={["ELÉCTRICA", "GAS GLP", "GAS NATURAL", "VAPOR"]}
            />
          )}
          {casillas.includes("panel") && (
            <Casilla rotulo="Panel computarizado" valor={d.panel ?? ""} onChange={(v) => set("panel", v || null)} />
          )}
          {casillas.includes("controles") && (
            <Casilla rotulo="Controles Automático" valor={d.controles ?? ""} onChange={(v) => set("controles", v || null)} />
          )}
          {casillas.includes("montaje") && (
            <Casilla
              rotulo="Montaje"
              valor={d.montaje ?? ""}
              onChange={(v) => set("montaje", v || null)}
              sugerencias={["Apilable", "No apilable"]}
            />
          )}
          {casillas.includes("colores") && (
            <Casilla
              rotulo="Colores"
              valor={d.colores.join(" / ")}
              onChange={(v) => set("colores", v.split("/").map((x) => x.trim()).filter(Boolean))}
              ayuda="separados por /"
            />
          )}

          {/* LAS CASILLAS PROPIAS DE ESTE EQUIPO (0199). La lista de arriba se
              pensó mirando lavadoras y secadoras; la mesa vaporizadora pide
              «Potencia», «Dimensión de mesa» y «Presión de trabajo», y no
              había dónde escribirlas. El rótulo lo pone quien carga la ficha,
              como en el Word. */}
          {d.encabezadoExtra.map((x, i) => (
            <CasillaPropia
              key={i}
              rotulo={x.rotulo}
              valor={x.valor}
              onRotulo={(v) => set("encabezadoExtra", d.encabezadoExtra.map((y, j) => (j === i ? { ...y, rotulo: v } : y)))}
              onValor={(v) => set("encabezadoExtra", d.encabezadoExtra.map((y, j) => (j === i ? { ...y, valor: v } : y)))}
              onBorrar={() => set("encabezadoExtra", d.encabezadoExtra.filter((_, j) => j !== i))}
            />
          ))}

          <button
            type="button"
            onClick={() => set("encabezadoExtra", [...d.encabezadoExtra, { rotulo: "", valor: "" }])}
            className="flex min-h-[3.25rem] cursor-pointer items-center justify-center gap-1.5 border border-dashed border-border bg-secondary/30 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" /> Agregar un dato
          </button>
        </div>

        {/* Foto y descripción */}
        <div className="grid gap-px bg-border md:grid-cols-[34%_1fr]">
          {/* LA FOTO.
              Se elige con un botón que dispara el input por referencia, no con
              una etiqueta envolviendo un input escondido: dentro del diálogo
              esa forma no abría nada —y encima el input estaba `disabled`
              mientras el equipo era nuevo, así que al cargar uno no se podía
              elegir foto de ninguna manera (reportado 28-08)—.

              También se puede soltar la imagen encima, que es lo que la mano
              intenta primero cuando la foto está en el escritorio. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const f = e.dataTransfer.files?.[0];
              if (f) elegirFoto(f);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 bg-card p-4 transition-colors",
              arrastrando && "bg-primary/5 outline-dashed outline-2 -outline-offset-4 outline-primary/40",
            )}
          >
            {fotoLocal || d.fotoPath ? (
              <Image
                src={fotoLocal ?? rutaFoto(d.fotoPath!)}
                alt={`${d.marca} ${d.modelo}`}
                width={240}
                height={240}
                className="max-h-60 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="py-8 text-center text-xs text-muted-foreground">
                {arrastrando ? "Suelte la imagen acá" : "Todavía sin foto"}
              </span>
            )}

            {/* La imagen se acomoda ANTES de subir: a la caja de la ficha
                (54 × 96 mm), centrada sobre blanco y comprimida. Las 296 que ya
                están pesan 44 MB entre todas; esa es la cuenta que no conviene
                repetir. */}
            <button
              type="button"
              onClick={() => inputFoto.current?.click()}
              disabled={subiendoFoto}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {subiendoFoto ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              {subiendoFoto ? "Preparando…" : d.fotoPath || fotoLocal ? "Cambiar la foto" : "Agregar foto"}
            </button>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) elegirFoto(f);
              }}
            />
            <span className="text-center text-[10px] leading-snug text-muted-foreground">
              {fotoPendiente
                ? "Se sube al guardar el equipo."
                : "Elíjala o arrástrela acá. Se acomoda sola a la hoja."}
            </span>

            {/* EL LOGO DEL FABRICANTE Y LA VISTA DEL PANEL.
                Son las otras dos cajas de la hoja impresa (27 × 14 mm y 35 ×
                32) y vienen en el mismo Word. Se muestran para que se vean
                antes de imprimir, y cada una se puede quitar: hay fotos de
                catálogo que YA traen el logo encima, y ahí agregarlo lo
                duplica (pasó con la 1SECU1701 el 26-08). Si la ficha no las
                trae, no hay nada que mostrar y el bloque no aparece. */}
            {ROLES_IMAGEN.some((rol) => complementos[rol].url) && (
              <div className="mt-1 flex w-full items-start justify-center gap-4 border-t border-border pt-3">
                {ROLES_IMAGEN.map((rol) => {
                  const c = complementos[rol];
                  if (!c.url) return null;
                  return (
                    <div key={rol} className="flex max-w-[45%] flex-col items-center gap-1">
                      <Image
                        src={c.url}
                        alt={NOMBRE_IMAGEN[rol]}
                        width={140}
                        height={100}
                        className={cn("max-h-16 w-auto object-contain", c.quitar && "opacity-25 grayscale")}
                        unoptimized
                      />
                      <span className="text-center text-[10px] leading-tight text-muted-foreground">
                        {NOMBRE_IMAGEN[rol]}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTocado(true);
                          setComplementos((antes) => ({ ...antes, [rol]: { ...antes[rol], quitar: !antes[rol].quitar } }));
                        }}
                        className="cursor-pointer text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {c.quitar ? "Volver a ponerla" : "Quitar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-px bg-card p-3">
            {bloques.map((b, i) => (
              <LineaFicha
                key={i}
                bloque={b}
                onCambiar={(nuevo) => setBloques(bloques.map((x, j) => (j === i ? nuevo : x)))}
                onBorrar={() => setBloques(bloques.filter((_, j) => j !== i))}
                onInsertar={(t) =>
                  setBloques([
                    ...bloques.slice(0, i + 1),
                    t === "dato" ? { t, rotulo: "", valor: "" } : { t, texto: "" },
                    ...bloques.slice(i + 1),
                  ])
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setBloques([...bloques, { t: "vineta", texto: "" }])}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3" /> Agregar línea
            </button>
          </div>
        </div>
      </div>

      {/* ── LO QUE NO SALE EN LA HOJA PERO MANDA EN EL CRM ──────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CampoFlotante etiqueta="Código (SKU)" valor={d.sku ?? ""} onChange={(v) => set("sku", v || null)} mono />
        <label className="relative block">
          <select
            value={d.categoria ?? ""}
            onChange={(e) => set("categoria", e.target.value || null)}
            className="peer h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm capitalize outline-none transition-colors focus:border-primary"
          >
            {TIPOS_EQUIPO.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.nombre}
              </option>
            ))}
            {d.categoria && !tipo && <option value={d.categoria}>{d.categoria}</option>}
          </select>
          <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tipo de equipo
          </span>
        </label>
        <label className="relative block">
          <select
            value={d.segmento}
            onChange={(e) => set("segmento", e.target.value as EquipoEditable["segmento"])}
            className="h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm outline-none transition-colors focus:border-primary"
          >
            <option value="industrial">industrial</option>
            <option value="semi_industrial">semi-industrial</option>
          </select>
          <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Segmento
          </span>
        </label>
        <CampoFlotante
          etiqueta={equipo.precios[0] ? `Precio (${equipo.precios[0].tier})` : "Precio"}
          valor={precio}
          onChange={(v) => setPrecio(v.replace(/[^\d.]/g, ""))}
          mono
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded border transition-colors",
              d.activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {d.activo && <Check className="size-3" />}
          </span>
          <input type="checkbox" checked={d.activo} onChange={(e) => set("activo", e.target.checked)} className="sr-only" />
          <span className="text-foreground">
            {d.activo ? "En el catálogo — el comercial lo encuentra" : "Fuera del catálogo — el comercial no lo ve"}
          </span>
        </label>
        <CampoStock
          valor={d.stockReferencia}
          onChange={(v) => set("stockReferencia", v)}
          enAlmacen={d.disponibles}
          ubicacion={d.ubicacionMaestro}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : esNuevo ? "Cargar el equipo al catálogo" : "Guardar los cambios"}
        </Button>
        {/* SALIR SIN GUARDAR, DICHO CON TODAS LAS LETRAS. Ver `cancelar()`. */}
        <Button
          variant={confirmandoSalida ? "destructive" : "ghost"}
          onClick={cancelar}
          disabled={enviando}
          title={confirmandoSalida ? "Se pierde lo escrito en esta hoja" : undefined}
        >
          {confirmandoSalida ? "Sí, salir sin guardar" : "Cancelar"}
        </Button>
        {confirmandoSalida && (
          <span className="text-[11px] text-muted-foreground">Se pierde lo escrito. Pulse cualquier campo para seguir editando.</span>
        )}
        {!esNuevo && (
          <>
            <a
              href={`/api/productos/${equipo.id}/vista-previa`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <FileText className="size-3.5" /> Ver el PDF, Efameinsa
            </a>
            <a
              href={`/api/productos/${equipo.id}/vista-previa?serie=OPEN`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <FileText className="size-3.5" /> en Open
            </a>
            <span className="text-[11px] text-muted-foreground">El PDF abre lo guardado: guarde primero.</span>
          </>
        )}
      </div>
    </div>
  );
}

const ROTULO: Record<CasillaEquipo, string> = {
  capacidad: "Capacidad",
  calentamiento: "Calentamiento",
  panel: "Panel",
  controles: "Controles",
  montaje: "Montaje",
  colores: "Colores",
};

/** Una casilla del encabezado: el rótulo vive DENTRO del campo, arriba. */
function Casilla({
  rotulo,
  valor,
  onChange,
  obligatorio = false,
  sugerencias,
  ayuda,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  obligatorio?: boolean;
  sugerencias?: string[];
  ayuda?: string;
}) {
  const vacia = valor.trim() === "";
  const id = `casilla-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div
      className={cn(
        "group relative bg-card px-3 pb-2 pt-6 transition-colors focus-within:bg-accent/40",
        vacia && !obligatorio && "bg-secondary/40",
      )}
    >
      <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        list={sugerencias ? id : undefined}
        placeholder={obligatorio ? "obligatorio" : ayuda ?? "no sale impresa"}
        className={cn(
          "w-full bg-transparent text-sm font-medium text-foreground outline-none",
          obligatorio && vacia ? "placeholder:font-normal placeholder:text-destructive/70" : "placeholder:font-normal placeholder:text-muted-foreground/50",
        )}
      />
      {sugerencias && (
        <datalist id={id}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/**
 * Una casilla cuyo RÓTULO también se escribe.
 *
 * Se ve igual que las de la lista fija —el rótulo arriba, chiquito; el valor
 * abajo— para que la hoja se lea pareja, pero acá el rótulo es un campo. Es lo
 * que permite que cada familia de equipos traiga los suyos sin que nadie tenga
 * que tocar el programa: mesa vaporizadora «Dimensión de mesa», caldero
 * «Presión de trabajo», barrera sanitaria lo que corresponda.
 */
function CasillaPropia({
  rotulo,
  valor,
  onRotulo,
  onValor,
  onBorrar,
}: {
  rotulo: string;
  valor: string;
  onRotulo: (v: string) => void;
  onValor: (v: string) => void;
  onBorrar: () => void;
}) {
  return (
    <div className="group relative bg-card px-3 pb-2 pt-6 transition-colors focus-within:bg-accent/40">
      <input
        value={rotulo}
        onChange={(e) => onRotulo(e.target.value)}
        placeholder="RÓTULO"
        className="absolute left-3 top-1.5 w-[70%] bg-transparent text-[10px] font-semibold uppercase tracking-wide text-muted-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <input
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        placeholder="valor"
        className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
      />
      <button
        type="button"
        onClick={onBorrar}
        title="Quitar este dato"
        className="absolute right-1 top-1 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Una línea de la descripción.
 *
 * SIN RÓTULOS A LA VISTA. Antes cada línea llevaba delante un desplegable que
 * decía «Viñeta», «Título», «Viñeta»… — una columna de palabras repetidas que
 * no es la ficha y que estorba justo lo que se viene a hacer, que es leerla.
 * La forma ya se ve: un título es granate y va en mayúsculas, una viñeta tiene
 * su punto. Los controles aparecen al acercar el mouse y desaparecen al irse.
 */
function LineaFicha({
  bloque,
  onCambiar,
  onBorrar,
  onInsertar,
}: {
  bloque: BloqueFicha;
  onCambiar: (b: BloqueFicha) => void;
  onBorrar: () => void;
  onInsertar: (t: BloqueFicha["t"]) => void;
}) {
  const [menu, setMenu] = useState(false);

  function cambiarTipo(t: BloqueFicha["t"]) {
    if (t === "dato") onCambiar({ t, rotulo: bloque.texto ?? bloque.rotulo ?? "", valor: bloque.valor ?? "" });
    else onCambiar({ t, texto: bloque.texto ?? [bloque.rotulo, bloque.valor].filter(Boolean).join(": ") });
  }

  return (
    <div className="group relative flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50">
      {bloque.t === "dato" ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <input
            value={bloque.rotulo ?? ""}
            onChange={(e) => onCambiar({ ...bloque, rotulo: e.target.value })}
            placeholder="Rótulo"
            className="w-2/5 min-w-0 rounded border-b border-transparent bg-transparent px-1 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">:</span>
          <input
            value={bloque.valor ?? ""}
            onChange={(e) => onCambiar({ ...bloque, valor: e.target.value })}
            placeholder="valor"
            className="min-w-0 flex-1 rounded border-b border-transparent bg-transparent px-1 text-xs outline-none transition-colors focus:border-primary"
          />
        </span>
      ) : (
        <span className={cn("flex min-w-0 flex-1 items-baseline gap-1.5", bloque.t === "subtitulo" && "pl-1")}>
          {bloque.t === "vineta" && <span className="text-[9px] text-muted-foreground">●</span>}
          <input
            value={bloque.texto ?? ""}
            onChange={(e) => onCambiar({ ...bloque, texto: e.target.value })}
            placeholder={
              bloque.t === "titulo" ? "TÍTULO DE SECCIÓN" : bloque.t === "subtitulo" ? "Subtítulo" : "texto de la viñeta"
            }
            className={cn(
              "min-w-0 flex-1 rounded border-b border-transparent bg-transparent px-1 outline-none transition-colors focus:border-primary",
              bloque.t === "titulo" && "mt-1 text-[11px] font-bold uppercase tracking-wide text-[#7E1210]",
              bloque.t === "subtitulo" && "text-xs font-semibold text-foreground",
              bloque.t === "vineta" && "text-xs text-foreground",
            )}
          />
        </span>
      )}

      {/* Los controles, solo al acercarse. */}
      <span className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setMenu(!menu)}
          title="Insertar una línea debajo"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onBorrar}
          title="Quitar esta línea"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>

      {menu && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full z-20 mt-0.5 w-52 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <p className="border-b border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Insertar debajo
            </p>
            {(["vineta", "dato", "subtitulo", "titulo"] as BloqueFicha["t"][]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onInsertar(t);
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
              >
                <MuestraTipo t={t} />
              </button>
            ))}
            <p className="border-t border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Esta línea es
            </p>
            {(["vineta", "dato", "subtitulo", "titulo"] as BloqueFicha["t"][]).map((t) => (
              <button
                key={"c" + t}
                type="button"
                onClick={() => {
                  cambiarTipo(t);
                  setMenu(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                  bloque.t === t && "bg-primary/5 font-semibold",
                )}
              >
                <MuestraTipo t={t} />
                {bloque.t === t && <Check className="ml-auto size-3 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Cómo se ve cada forma, dibujada en vez de nombrada. */
function MuestraTipo({ t }: { t: BloqueFicha["t"] }) {
  if (t === "titulo") return <span className="text-[10px] font-bold uppercase tracking-wide text-[#7E1210]">Título</span>;
  if (t === "subtitulo") return <span className="text-xs font-semibold text-foreground">Subtítulo</span>;
  if (t === "dato")
    return (
      <span className="text-xs">
        <span className="font-semibold">Rótulo</span>
        <span className="text-muted-foreground">: valor</span>
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-[9px] text-muted-foreground">●</span> Viñeta
    </span>
  );
}

/** Campo con el rótulo dentro, arriba: ocupa una línea en vez de dos. */
/**
 * El stock, escrito a mano por operaciones.
 *
 * Acá había una etiqueta de solo lectura: decía cuántas había y no dejaba
 * corregirlo. El número salía del maestro el día de la carga y envejecía solo,
 * aunque es el que el comercial mira en el cotizador antes de prometerle una
 * entrega al cliente. Lesly lo sabe y hasta hoy tenía que pedir que alguien lo
 * tocara por detrás.
 *
 * NO DEPENDE DE NADA, que es el pedido: no cuenta series, no se descuenta al
 * vender, no lo pisa ningún proceso. Ella escribe el número y ese es.
 *
 * Vacío ≠ 0. Vacío es «no sé»; 0 es «no queda ninguna». El cotizador las dice
 * distinto —«stock s/d» y «sin stock»—, así que el campo respeta la
 * diferencia en vez de convertir el vacío en cero.
 *
 * Cuando el almacén (0117) tiene máquinas cargadas de ese modelo, el conteo
 * por serie se muestra al lado. No lo corrige ni lo pisa: son dos números que
 * responden preguntas distintas, y ver que no coinciden es justamente la
 * información útil.
 */
function CampoStock({
  valor,
  onChange,
  enAlmacen,
  ubicacion,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  enAlmacen: number | null;
  ubicacion: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative block">
        <input
          value={valor ?? ""}
          inputMode="numeric"
          placeholder="—"
          onChange={(e) => {
            const limpio = e.target.value.replace(/[^\d]/g, "");
            onChange(limpio === "" ? null : Number(limpio));
          }}
          className="h-[44px] w-24 rounded-lg border border-border bg-card px-3 pt-4 text-center font-mono text-sm outline-none transition-colors focus:border-primary"
        />
        <span className="pointer-events-none absolute left-0 right-0 top-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Stock
        </span>
      </label>
      <span className="max-w-[13rem] text-[11px] leading-tight text-muted-foreground">
        {enAlmacen !== null ? (
          <>
            El almacén tiene <strong className="text-foreground">{enAlmacen}</strong> con serie
            {enAlmacen !== valor && valor !== null && " — no coinciden"}
          </>
        ) : valor === null ? (
          "Vacío es «no sé cuántas hay». Escriba 0 si no queda ninguna."
        ) : (
          <>Lo que ve el comercial al cotizar{ubicacion ? ` · ${ubicacion}` : ""}</>
        )}
      </span>
    </div>
  );
}

function CampoFlotante({
  etiqueta,
  valor,
  onChange,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="relative block">
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm outline-none transition-colors focus:border-primary",
          mono && "font-mono",
        )}
      />
      <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </span>
    </label>
  );
}
