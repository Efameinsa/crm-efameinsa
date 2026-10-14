import Link from "@/components/enlace";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * LA RESPUESTA DEL ASISTENTE, CON FORMATO (14-10).
 *
 * Claude contesta en markdown y la burbuja lo mostraba crudo. Esto entiende lo
 * que el asistente usa: párrafos, títulos, listas (también anidadas y
 * numeradas), tablas, citas, separadores, **negrita**, *cursiva*, ***las dos***,
 * `código` y enlaces.
 *
 * Santos (14-10) vio una palabra con asteriscos que no salía en negrita: la
 * primera versión no entendía la cursiva de un solo asterisco ni la negrita
 * con espacios por dentro («** así **»). Las dos se leen ahora.
 *
 * No se usa una librería de markdown a propósito: lo que no se reconoce queda
 * como texto, y nada de lo que escriba el modelo se convierte en HTML.
 *
 * ENLACES: solo los internos del CRM («/nuevo/pedido/…»). Un enlace a otro
 * sitio se muestra como texto: el asistente no tiene por qué mandar a nadie
 * fuera del CRM, y si un documento adjunto se lo pidiera, no queda el clic.
 */

const ENLINEA =
  /(\*\*\*|___)(?=\S)([\s\S]+?)(?<=\S)\1|(\*\*|__)\s?([^*_][\s\S]*?)\s?\3|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  // Una expresión NUEVA en cada llamada: la negrita se lee a sí misma por
  // dentro (recursión) y una expresión /g compartida perdería su posición —la
  // página se colgaba repitiendo la misma negrita para siempre (14-10).
  const patron = new RegExp(ENLINEA.source, "g");
  while ((m = patron.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${i++}`;
    if (m[2] != null) {
      partes.push(
        <strong key={k} className="font-semibold italic text-foreground">
          {enLinea(m[2], k)}
        </strong>,
      );
    } else if (m[4] != null) {
      partes.push(
        <strong key={k} className="font-semibold text-foreground">
          {enLinea(m[4].trim(), k)}
        </strong>,
      );
    } else if (m[5] != null || m[6] != null) {
      partes.push(<em key={k}>{enLinea((m[5] ?? m[6])!, k)}</em>);
    } else if (m[7] != null) {
      partes.push(
        <code key={k} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {m[7]}
        </code>,
      );
    } else if (m[9]?.startsWith("/") && !m[9].startsWith("//")) {
      partes.push(
        <Link
          key={k}
          href={m[9]}
          className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary"
        >
          {m[8]}
        </Link>,
      );
    } else {
      partes.push(m[8]);
    }
    ultimo = m.index + m[0].length;
    // Nunca quedarse en el mismo lugar con un calce vacío.
    if (m[0].length === 0) patron.lastIndex++;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

type Item = { texto: string; hijos: Lista | null };
type Lista = { ordenada: boolean; items: Item[] };

function ListaVista({ lista, clave }: { lista: Lista; clave: string }) {
  const Etiqueta = lista.ordenada ? "ol" : "ul";
  return (
    <Etiqueta
      className={cn(
        "space-y-1 pl-5 marker:text-muted-foreground",
        lista.ordenada ? "list-decimal marker:font-semibold marker:text-primary" : "list-disc",
      )}
    >
      {lista.items.map((it, i) => (
        <li key={i} className="pl-0.5">
          {enLinea(it.texto, `${clave}-${i}`)}
          {it.hijos && (
            <div className="mt-1">
              <ListaVista lista={it.hijos} clave={`${clave}-${i}h`} />
            </div>
          )}
        </li>
      ))}
    </Etiqueta>
  );
}

const celdas = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const esSeparadorTabla = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function TextoAsistente({ texto, className }: { texto: string; className?: string }) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: ReactNode[] = [];
  let parrafo: string[] = [];
  let lista: Lista | null = null;
  // Pila de listas abiertas por sangría, para las anidadas.
  let pila: { sangria: number; lista: Lista }[] = [];

  const k = () => `b${bloques.length}`;
  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    const clave = k();
    bloques.push(
      <p key={clave}>
        {parrafo.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {enLinea(l, `${clave}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
    parrafo = [];
  };
  const cerrarLista = () => {
    if (!lista) return;
    const clave = k();
    bloques.push(<ListaVista key={clave} lista={lista} clave={clave} />);
    lista = null;
    pila = [];
  };

  for (let n = 0; n < lineas.length; n++) {
    const l = lineas[n].replace(/\s+$/, "");
    const item = /^(\s*)(?:[-*•+]|(\d+)[.)])\s+(.*)$/.exec(l);
    const titulo = /^(#{1,4})\s+(.*)$/.exec(l);

    if (!l.trim()) {
      cerrarParrafo();
      // Una línea en blanco entre ítems no corta la lista.
      const sigue = lineas.slice(n + 1).find((x) => x.trim());
      if (!sigue || !/^\s*(?:[-*•+]|\d+[.)])\s+/.test(sigue)) cerrarLista();
      continue;
    }

    // Tabla: una fila con | seguida de la línea de guiones.
    if (l.includes("|") && n + 1 < lineas.length && esSeparadorTabla(lineas[n + 1])) {
      cerrarParrafo();
      cerrarLista();
      const cabecera = celdas(l);
      const filas: string[][] = [];
      n += 2;
      while (n < lineas.length && lineas[n].includes("|") && lineas[n].trim()) {
        filas.push(celdas(lineas[n]));
        n++;
      }
      n--;
      const clave = k();
      bloques.push(
        <div key={clave} className="barra-fina -mx-1 overflow-x-auto rounded-lg border border-border/80">
          <table className="w-full border-collapse text-[0.92em]">
            <thead>
              <tr className="bg-secondary/60">
                {cabecera.map((c, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 text-left text-[0.85em] font-semibold uppercase tracking-wide text-muted-foreground">
                    {enLinea(c, `${clave}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-border/70 even:bg-secondary/20">
                  {cabecera.map((_, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      {enLinea(f[j] ?? "", `${clave}-${i}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      cerrarParrafo();
      cerrarLista();
      bloques.push(<hr key={k()} className="border-border/80" />);
      continue;
    }

    if (titulo) {
      cerrarParrafo();
      cerrarLista();
      const clave = k();
      bloques.push(
        <p
          key={clave}
          className={cn(
            "font-bold tracking-tight text-foreground",
            titulo[1].length <= 2 ? "pt-1 text-[1.08em]" : "pt-0.5 text-[1em]",
          )}
        >
          {enLinea(titulo[2].replace(/\*\*/g, ""), clave)}
        </p>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(l)) {
      cerrarParrafo();
      cerrarLista();
      const citas: string[] = [];
      while (n < lineas.length && /^\s*>\s?/.test(lineas[n])) {
        citas.push(lineas[n].replace(/^\s*>\s?/, ""));
        n++;
      }
      n--;
      const clave = k();
      bloques.push(
        <blockquote key={clave} className="rounded-r-lg border-l-[3px] border-primary/50 bg-primary/5 px-3 py-2 text-foreground/90">
          {citas.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {enLinea(c, `${clave}-${i}`)}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (item) {
      cerrarParrafo();
      const sangria = item[1].replace(/\t/g, "  ").length;
      const ordenada = item[2] != null;
      const nuevo: Item = { texto: item[3], hijos: null };
      if (!lista) {
        lista = { ordenada, items: [nuevo] };
        pila = [{ sangria, lista }];
        continue;
      }
      while (pila.length > 1 && sangria < pila[pila.length - 1].sangria) pila.pop();
      const tope = pila[pila.length - 1];
      if (sangria > tope.sangria + 1) {
        const padre = tope.lista.items[tope.lista.items.length - 1];
        padre.hijos ??= { ordenada, items: [] };
        padre.hijos.items.push(nuevo);
        pila.push({ sangria, lista: padre.hijos });
      } else {
        tope.lista.items.push(nuevo);
      }
      continue;
    }

    // Una línea suelta pegada a una lista es la continuación del último ítem.
    if (lista && /^\s{2,}\S/.test(l)) {
      const tope = pila[pila.length - 1].lista;
      tope.items[tope.items.length - 1].texto += ` ${l.trim()}`;
      continue;
    }

    cerrarLista();
    parrafo.push(l);
  }
  cerrarParrafo();
  cerrarLista();
  return <div className={cn("space-y-2.5 leading-relaxed", className)}>{bloques}</div>;
}
