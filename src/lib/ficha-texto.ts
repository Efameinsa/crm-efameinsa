/**
 * La ficha técnica como texto editable, y de vuelta.
 *
 * POR QUÉ TEXTO Y NO UN FORMULARIO. La descripción que sale impresa en la
 * cotización vive en `ficha.bloques` —los 121 equipos activos imprimen desde
 * ahí— y son 42 bloques de promedio, hasta 104 en el equipo más largo. Un
 * formulario con 104 campos, cada uno con su tipo y sus flechas para mover
 * arriba y abajo, es exactamente la pantalla que nadie usa: se abre, se mira y
 * se cierra. La ficha se escribió en Word y se lee como un texto; se edita como
 * un texto.
 *
 * LA SINTAXIS ES LA QUE YA SE VE. Cuatro formas, que son las cuatro que existen:
 *
 *     # TÍTULO DE SECCIÓN        → titulo
 *     ## Subtítulo               → subtitulo
 *     - Una viñeta               → vineta
 *     Capacidad: 55 kg           → dato (rótulo y valor)
 *
 * Y ES REVERSIBLE. Convertir a texto y volver tiene que devolver exactamente
 * los mismos bloques, con los 121 equipos reales: si no, editar una ficha la
 * rompería en silencio. Eso se prueba, no se supone (ver ficha-texto.test.ts y
 * scripts/_verificar-ficha-texto.mjs).
 */

export interface BloqueFicha {
  t: "titulo" | "subtitulo" | "vineta" | "dato";
  texto?: string;
  rotulo?: string;
  valor?: string;
}

export function bloquesATexto(bloques: BloqueFicha[]): string {
  return bloques
    .map((b) => {
      if (b.t === "titulo") return `# ${b.texto ?? ""}`;
      if (b.t === "subtitulo") return `## ${b.texto ?? ""}`;
      if (b.t === "dato") return `${b.rotulo ?? ""}: ${b.valor ?? ""}`;
      return `- ${b.texto ?? ""}`;
    })
    .join("\n");
}

export function textoABloques(texto: string): BloqueFicha[] {
  const bloques: BloqueFicha[] = [];
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (!l) continue;

    // El orden importa: «##» antes que «#», y la viñeta antes que el dato —una
    // viñeta puede llevar dos puntos adentro («Tiempo continuo de trabajo: 5
    // horas» es un dato, pero «Incluye: manguera, filtro y llave» es viñeta si
    // así se escribió).
    if (l.startsWith("## ")) {
      bloques.push({ t: "subtitulo", texto: l.slice(3).trim() });
    } else if (l.startsWith("# ")) {
      bloques.push({ t: "titulo", texto: l.slice(2).trim() });
    } else if (l.startsWith("- ")) {
      bloques.push({ t: "vineta", texto: l.slice(2).trim() });
    } else {
      const corte = l.indexOf(":");
      if (corte > 0) {
        bloques.push({ t: "dato", rotulo: l.slice(0, corte).trim(), valor: l.slice(corte + 1).trim() });
      } else {
        bloques.push({ t: "vineta", texto: l });
      }
    }
  }
  return bloques;
}

/**
 * Si una ficha se puede editar como texto sin perder nada.
 *
 * Se comprueba antes de dejar editar: un bloque con una forma que la ida y
 * vuelta no reproduce —un título que empieza con guion, un dato cuyo rótulo
 * quedó vacío— se edita a mano en la base, no acá. Es preferible decir «esta no
 * se puede» a devolverla distinta.
 */
export function fichaEsEditable(bloques: BloqueFicha[]): boolean {
  const vuelta = textoABloques(bloquesATexto(bloques));
  if (vuelta.length !== bloques.length) return false;
  return bloques.every((b, i) => {
    const v = vuelta[i];
    if (v.t !== b.t) return false;
    if (b.t === "dato") return (v.rotulo ?? "") === (b.rotulo ?? "").trim() && (v.valor ?? "") === (b.valor ?? "").trim();
    return (v.texto ?? "") === (b.texto ?? "").trim();
  });
}
