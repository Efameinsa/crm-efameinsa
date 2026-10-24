import { esTorre } from "@/lib/torres";
import { capacidadDe, modeloDeLaDescripcion } from "@/lib/protocolo-hoja";

/**
 * CADA MÁQUINA CON SU SERIE EN LA HOJA DEL PEDIDO (Facturación, 24-10, ABZUL
 * PED-0043-2026: «la orden tiene dos series donde detalla por individual la
 * lavadora con su descripción y su serie, al igual la secadora… en la imagen
 * muestra un solo detalle torre con una serie»).
 *
 * La torre se vende en un renglón (0359): la lavadora es el renglón y la
 * secadora una parte (parte_de) con su serie. En la hoja salen las dos, cada
 * una con su nombre, marca, modelo, código y capacidad, y su serie al lado.
 */
export type RenglonPedido = {
  id?: string;
  orden: number;
  descripcion: string;
  serie: string | null;
  parte_de?: string | null;
  parte_nombre?: string | null;
};

export type MaquinaImpresa = {
  numero: string;
  /** «LAVADORA de la torre»; null = la descripción va sola, como siempre. */
  titulo: string | null;
  /** «Marca: LG · Modelo: GIANT C MAX · Código: CWG27MDCRS · Capacidad: 13 KG». */
  ficha: string | null;
  descripcion: string;
  serie: string | null;
};

const deLavadora = (c: string) => /^.?W/.test(c);
const deSecadora = (c: string) => /^.?D/.test(c);

/** Los códigos de fábrica escritos en la descripción («(CWG27MDCRS CDG27MUCPS)»). */
export function codigosDeFabrica(descripcion: string, series: (string | null)[] = []): string[] {
  const fuera = new Set(series.filter((s): s is string => !!s).map((s) => s.toUpperCase()));
  const salida: string[] = [];
  for (const m of descripcion.toUpperCase().matchAll(/\b[A-Z]{2,5}\d{1,3}[A-Z0-9]{3,}\b/g)) {
    if (!fuera.has(m[0]) && !salida.includes(m[0])) salida.push(m[0]);
  }
  return salida;
}

function marcaDe(descripcion: string): string | null {
  const m = descripcion.toUpperCase().match(/\bMARCA\s*:?\s*([A-Z0-9][A-Z0-9 &.-]*?)(?=\s+(?:MODELO|CAPACIDAD|SERIE)\b|[\n,;]|$)/);
  return m ? m[1].trim() || null : null;
}

/** El código de cada máquina de la torre: el de lavadora (CW…, W…) o el de secadora (CD…, D…). */
function codigoPara(codigos: string[], nombre: string, posicion: number): string | null {
  if (codigos.length !== 2) return null;
  const secadora = /SECADORA/i.test(nombre);
  const porTipo = codigos.find((c) => (secadora ? deSecadora(c) && !deLavadora(c) : deLavadora(c) && !deSecadora(c)));
  return porTipo ?? codigos[posicion] ?? null;
}

const sinPrefijo = (d: string, nombre: string | null | undefined) =>
  nombre && d.startsWith(`${nombre} · `) ? d.slice(nombre.length + 3) : d;

export function maquinasParaImprimir(renglones: RenglonPedido[]): MaquinaImpresa[] {
  const ids = new Set(renglones.map((r) => r.id).filter(Boolean));
  const principales = renglones.filter((r) => !r.parte_de || !ids.has(r.parte_de));
  const salida: MaquinaImpresa[] = [];
  principales.forEach((p, k) => {
    const n = String(k + 1);
    const partes = renglones.filter((r) => r.parte_de && r.parte_de === p.id);
    const juntas = (p.serie ?? "").split("/").map((s) => s.trim()).filter(Boolean);
    const torre = esTorre(p.descripcion);
    // Antes del 0359 las dos series iban juntas en el renglón: «A / B».
    const maquinas: { nombre: string; serie: string | null }[] = partes.length
      ? [{ nombre: torre ? "Lavadora" : "", serie: p.serie }, ...partes.map((x) => ({ nombre: x.parte_nombre ?? "Otra máquina", serie: x.serie }))]
      : torre && juntas.length === 2
        ? [{ nombre: "Lavadora", serie: juntas[0] }, { nombre: "Secadora", serie: juntas[1] }]
        : [];
    if (maquinas.length === 0) {
      salida.push({ numero: n, titulo: null, ficha: null, descripcion: p.descripcion, serie: p.serie });
      return;
    }
    const codigos = codigosDeFabrica(p.descripcion, maquinas.map((m) => m.serie));
    const marca = marcaDe(p.descripcion);
    const modelo = modeloDeLaDescripcion(p.descripcion);
    maquinas.forEach((m, j) => {
      const numero = `${n}.${j + 1}`;
      if (!torre) {
        const descripcion = j === 0 ? p.descripcion : sinPrefijo(partes[j - 1].descripcion, partes[j - 1].parte_nombre);
        salida.push({ numero, titulo: m.nombre ? m.nombre.toUpperCase() : null, ficha: null, descripcion, serie: m.serie });
        return;
      }
      const codigo = codigoPara(codigos, m.nombre, j);
      const capacidad = /^(LAVADORA|SECADORA)$/i.test(m.nombre) ? capacidadDe(p.descripcion, /SECADORA/i.test(m.nombre)) : null;
      const ficha = [marca && `Marca: ${marca}`, modelo && `Modelo: ${modelo}`, codigo && `Código: ${codigo}`, capacidad && `Capacidad: ${capacidad}`]
        .filter(Boolean)
        .join(" · ");
      salida.push({
        numero,
        titulo: `${m.nombre.toUpperCase()} de la torre`,
        ficha: ficha || null,
        descripcion: j === 0 ? p.descripcion : `Va con la lavadora ${n}.1 (misma torre).`,
        serie: m.serie,
      });
    });
  });
  return salida;
}
