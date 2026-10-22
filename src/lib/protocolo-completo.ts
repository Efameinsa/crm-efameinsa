import { esTorre } from "@/lib/torres";
import { plantillaPara, renglonesConMarca, type Chequeo } from "@/lib/protocolo-checklist";
import { propuestaDeHoja, type DatosHoja, type Maquina } from "@/lib/protocolo-hoja";

/**
 * SIN PROTOCOLO COMPLETO NO HAY «PROBADA Y EMBALADA» (Santos, 13-10, con el
 * pedido de COFACO INDUSTRIES abierto en Almacén 2: «la señorita no tiene
 * ninguna foto ni documento ahí y se puede poner probar y embalar… tiene que
 * estar todo, tanto la ficha como el informe de protocolo, y si hay que
 * modificar que pida PIN»). El PIN después de guardado ya lo pone la 0450;
 * esto es lo de antes: la máquina no se marca hasta tener, por cada máquina
 * de la unidad (la secadora de la torre también), sus
 * fotos, el protocolo o informe en PDF/Word, la ficha del informe (modelo de
 * la placa, serie y técnico) y, si tiene hoja de chequeo, que no esté vacía.
 *
 * Las casillas NO son todas obligatorias (Ariana, 14-10, con la lavadora de la
 * Beneficencia de Huancayo: «solo debe marcarse lo que uno considere, no deben
 * ser obligatorios todos los checks y las X»): basta con una marcada.
 *
 * El PDF/Word ya NO se pide a ninguna máquina (Lesly, 21-10, en Almacén: «se
 * sube la foto, se llena la ficha pero también pedía que se suba el Word»):
 * todo el protocolo se hace en el CRM —fotos, ficha del informe y, si hay
 * plantilla, la hoja de chequeo— y el informe de prueba y embalaje lo genera
 * el sistema. Subir un Word sigue pudiéndose, nunca frena (0580). Antes solo
 * se había quitado a las máquinas con hoja (13-10).
 *
 * Una fila que es un SERVICIO (embalaje, transporte, instalación…) no es una
 * máquina: el informe de prueba y embalaje lo genera el CRM con sus fotos, así
 * que pide solo fotos y técnico, como un repuesto (Lesly, 17-10, ABACHI
 * PED-0033-2026, «me pide subir Word del informe pero no debería»; 0529).
 *
 * Un ACCESORIO que acompaña a la máquina principal del mismo pedido (la
 * plancha del calderín, un kit de mangueras, la base…) no lleva protocolo:
 * basta con sus fotos (Almacén, 21-10, VITALIAN PED con el calderín SIDI
 * BR-8: «para los accesorios complementarios al producto primario no se
 * considere la ficha de protocolo, solo considerar para poder subir fotos»).
 * La hoja de chequeo sigue a mano en el informe, pero no frena.
 *
 * Función pura: la usa el botón (para decir qué falta antes de pulsar) y el
 * servidor (que es quien de verdad frena).
 */

export type ArchivoProtocolo = { path?: string | null; tipo?: string | null; etiqueta?: string | null } | null;

export type MaquinaParaProbar = {
  id: string;
  descripcion: string;
  serie: string | null;
  sin_serie?: boolean | null;
  parte_nombre?: string | null;
  protocolo_ref: string | null;
  protocolo_fotos: unknown;
  protocolo_datos?: Record<string, DatosHoja> | null;
  protocolo_chequeo?: Record<string, Partial<Chequeo>> | null;
};

/** Lo que todavía no está en la base pero va con el mismo clic (lo escrito y lo elegido en pantalla). */
export type LoQueVaConElClic = {
  protocoloRef?: string;
  tecnico?: string;
  /** Archivos por subir: de la máquina del renglón, de la secadora de la torre y de cada parte (por id). */
  principal?: ArchivoProtocolo[];
  secadora?: ArchivoProtocolo[];
  partes?: Record<string, ArchivoProtocolo[]>;
};

const esImagen = (a: NonNullable<ArchivoProtocolo>) =>
  (a.tipo ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(a.path ?? "");

const lista = (x: unknown): NonNullable<ArchivoProtocolo>[] => (Array.isArray(x) ? x.filter((a): a is NonNullable<ArchivoProtocolo> => Boolean(a)) : []);

/** La fila es un servicio y no una máquina (mismo criterio que es_linea_de_servicio, 0404). */
export function esFilaDeServicio(e: Pick<MaquinaParaProbar, "descripcion">, partes: unknown[] = []) {
  return partes.length === 0 && /^\s*SERVICIO\s/i.test(e.descripcion ?? "");
}

/** Lo que por su nombre es un accesorio y no una máquina (PLANCHADORA sí es máquina). */
const ACCESORIO = /^\s*(PLANCHA(?!DORA)|KIT\b|MANGUERAS?\b|ACCESORIOS?\b|SOPORTES?\b|BASES?\b|PEDESTAL|CARRO|COCHE|CANASTILLAS?\b|PISTOLA|BRAZO|MESA DE PLANCHADO)/i;

/**
 * La fila es un accesorio de la máquina principal del pedido: su nombre es de
 * accesorio y en el mismo pedido va otra fila que es una máquina (no otro
 * accesorio ni un servicio). Sola en el pedido, se prueba como cualquier máquina.
 */
export function esAccesorioDelPedido(e: Pick<MaquinaParaProbar, "id" | "descripcion">, filas: Pick<MaquinaParaProbar, "id" | "descripcion">[]) {
  if (!ACCESORIO.test(e.descripcion ?? "")) return false;
  return filas.some((f) => f.id !== e.id && !ACCESORIO.test(f.descripcion ?? "") && !/^\s*SERVICIO\s/i.test(f.descripcion ?? ""));
}

/** La hoja de chequeo que el sistema llena para esta máquina (null = no hay plantilla: se sube el Word/PDF). */
export function hojaDelSistema(e: MaquinaParaProbar, maquina: Maquina, repuesto = false) {
  if (repuesto) return null;
  const guardado = (e.protocolo_datos ?? {})[maquina] ?? {};
  return plantillaPara(guardado.equipo ?? propuestaDeHoja({ descripcion: e.descripcion, serie: e.serie, parte_nombre: e.parte_nombre ?? null }, maquina, repuesto).equipo);
}

function faltaEnLaHoja(
  e: MaquinaParaProbar,
  maquina: Maquina,
  nombre: string,
  archivos: NonNullable<ArchivoProtocolo>[],
  tecnicoEnPantalla: string,
  repuesto: boolean,
): string[] {
  const guardado = (e.protocolo_datos ?? {})[maquina] ?? {};
  const propuesta = propuestaDeHoja({ descripcion: e.descripcion, serie: e.serie, parte_nombre: e.parte_nombre ?? null }, maquina, repuesto);
  const plantilla = hojaDelSistema(e, maquina, repuesto);
  const falta: string[] = [];
  if (!archivos.some(esImagen)) falta.push("fotos");
  if (!repuesto && !guardado.modelo?.trim()) falta.push("modelo de la placa (en la ficha del informe)");
  if (!repuesto && !(guardado.serie ?? propuesta.serie ?? e.serie)?.trim()) falta.push("serie");
  if (!(tecnicoEnPantalla.trim() || guardado.tecnico?.trim())) falta.push("técnico que hizo la prueba");
  if (plantilla) {
    const hoja = (e.protocolo_chequeo ?? {})[maquina];
    const marcas = hoja?.marcas ?? {};
    // Un ✓ en «CANT.» de Programación también cuenta (0534, Santos 17-10).
    const conCheckEnCant = Object.values((hoja as { prog?: Record<string, string> } | undefined)?.prog ?? {}).some((v) => v === "✓");
    if (!renglonesConMarca(plantilla).some((k) => marcas[k]) && !conCheckEnCant) falta.push(`hoja «${plantilla.titulo}»: ninguna casilla marcada`);
  }
  return falta.map((f) => `${nombre}: ${f}`);
}

/**
 * Qué falta para marcar la unidad como probada y embalada. Vacío = se puede.
 * `nombre` de la principal: «Máquina 1»; la secadora de la torre y las partes
 * se nombran por lo que son.
 */
export function faltaParaProbar(
  e: MaquinaParaProbar,
  partes: MaquinaParaProbar[],
  opciones: { repuesto?: boolean; accesorio?: boolean; clic?: LoQueVaConElClic; nombre?: string } = {},
): string[] {
  const repuesto = opciones.repuesto === true || esFilaDeServicio(e, partes);
  const clic = opciones.clic ?? {};
  const tecnico = clic.tecnico ?? "";
  const nombre = opciones.nombre ?? "La máquina";
  const falta: string[] = [];
  if (opciones.accesorio && partes.length === 0) {
    const fotos = [...lista(e.protocolo_fotos), ...lista(clic.principal)];
    return fotos.some(esImagen) ? [] : [`${nombre}: fotos`];
  }
  // El N.º de protocolo no va en el documento (Santos, 14-10, Beneficencia de Huancayo): no se exige (0480).

  const propios = [...lista(e.protocolo_fotos), ...lista(clic.principal)];
  const deSecadora = propios.filter((a) => /-secadora-/.test(a.path ?? ""));
  const torreSinParte = !repuesto && partes.length === 0 && esTorre(e.descripcion);
  falta.push(...faltaEnLaHoja(e, "principal", nombre, propios.filter((a) => !deSecadora.includes(a)), tecnico, repuesto));
  if (torreSinParte) falta.push(...faltaEnLaHoja(e, "secadora", "Secadora de la torre", [...deSecadora, ...lista(clic.secadora)], tecnico, repuesto));
  for (const p of partes) {
    falta.push(...faltaEnLaHoja(p, "principal", p.parte_nombre ?? "Otra máquina", [...lista(p.protocolo_fotos), ...lista(clic.partes?.[p.id])], tecnico, repuesto));
  }
  return falta;
}
