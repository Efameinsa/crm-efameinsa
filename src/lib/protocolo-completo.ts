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
 * de la unidad (la secadora de la torre también), su N.º de protocolo, sus
 * fotos, el protocolo o informe en PDF/Word, la ficha del informe (modelo de
 * la placa, serie y técnico) y, si tiene hoja de chequeo, todas sus casillas.
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
  const falta: string[] = [];
  if (!archivos.some(esImagen)) falta.push("fotos");
  if (!repuesto && !archivos.some((a) => !esImagen(a))) falta.push("protocolo o informe (PDF o Word)");
  if (!repuesto && !guardado.modelo?.trim()) falta.push("modelo de la placa (en la ficha del informe)");
  if (!repuesto && !(guardado.serie ?? propuesta.serie ?? e.serie)?.trim()) falta.push("serie");
  if (!(tecnicoEnPantalla.trim() || guardado.tecnico?.trim())) falta.push("técnico que hizo la prueba");
  const plantilla = repuesto ? null : plantillaPara(guardado.equipo ?? propuesta.equipo);
  if (plantilla) {
    const marcas = (e.protocolo_chequeo ?? {})[maquina]?.marcas ?? {};
    const sinMarcar = renglonesConMarca(plantilla).filter((k) => !marcas[k]).length;
    if (sinMarcar > 0) falta.push(`hoja «${plantilla.titulo}»: ${sinMarcar} casilla${sinMarcar === 1 ? "" : "s"} sin marcar`);
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
  opciones: { repuesto?: boolean; clic?: LoQueVaConElClic; nombre?: string } = {},
): string[] {
  const repuesto = opciones.repuesto === true;
  const clic = opciones.clic ?? {};
  const tecnico = clic.tecnico ?? "";
  const nombre = opciones.nombre ?? "La máquina";
  const falta: string[] = [];
  if (!(clic.protocoloRef?.trim() || e.protocolo_ref?.trim())) falta.push(`${nombre}: N.º de protocolo`);

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
