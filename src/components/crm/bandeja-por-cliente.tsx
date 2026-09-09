import Link from "next/link";
import { ArrowRight, Building2, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UNA FILA POR CLIENTE, NO POR CASO.
 *
 * EL PROBLEMA. La bandeja listaba un renglón por cada cosa pendiente, así que
 * el mismo cliente aparecía tres veces: «Juan José Rojas Damián» pidiendo una
 * cotización, insistiendo en esa cotización y reportando una garantía. Carlos
 * y Lesly lo vieron como duplicidad —y desde la pantalla lo parece—, pero no
 * lo era: son tres casos distintos de la misma persona. Lo que faltaba era
 * decir de quién son.
 *
 * LA IDEA DE SANTOS (07-09): que se vea UN cliente, con sus «casos activos»
 * adentro, y que al abrir uno se vaya a resolverlo. Es la misma lógica de un
 * historial médico: el paciente es uno, las consultas son varias, y ninguna se
 * entiende sin las otras.
 *
 * POR QUÉ `<details>` Y NO ESTADO EN EL NAVEGADOR. Desplegar y plegar es lo
 * único que hace falta, y el navegador ya lo sabe hacer. Con `<details>` esto
 * sigue siendo un componente de servidor: no hay hidratación que se rompa, los
 * iconos se pasan como componentes sin problema, funciona sin JavaScript y el
 * teclado lo maneja solo. Un cliente con UN solo caso no se pliega — abrir
 * algo para ver una línea es un clic regalado.
 *
 * AGRUPA POR LA CUENTA, NO POR EL NOMBRE. «Santa Elena S.A.» y «Santa Elena»
 * son la misma empresa escrita de dos formas; agrupar por texto las deja
 * separadas otra vez. Manda `cuentaId`; el nombre es solo el respaldo para lo
 * que todavía no tiene ficha.
 */

export interface CasoDeCliente {
  clave: string;
  href: string;
  icono: LucideIcon;
  /** La cuenta manda. Sin ella se agrupa por nombre, que es peor pero es algo. */
  cuentaId?: string | null;
  cliente: string;
  etiqueta: string;
  detalle: string | null;
  estado: "rojo" | "ambar" | "verde";
  /** Lo que se muestra a la derecha: el reloj, «Recién llegado», lo que sea. */
  aviso: string;
  /** Acción propia de la fila (aprobar un pedido, por ejemplo). */
  accion?: React.ReactNode;
}

const ORDEN: Record<string, number> = { rojo: 0, ambar: 1, verde: 2 };

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function Reloj({ estado, texto }: { estado: CasoDeCliente["estado"]; texto: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        estado === "rojo"
          ? "bg-destructive/10 text-destructive"
          : estado === "ambar"
            ? "bg-amber-500/15 text-amber-800"
            : "bg-secondary text-muted-foreground",
      )}
    >
      {texto}
    </span>
  );
}

function Caso({
  caso,
  sangrado = false,
  enCurso = 0,
}: {
  caso: CasoDeCliente;
  sangrado?: boolean;
  /** Otros expedientes del mismo cliente que YA se están trabajando. */
  enCurso?: number;
}) {
  const Icono = caso.icono;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border p-3",
        caso.estado === "rojo" ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
        sangrado && "ml-0 sm:ml-9",
      )}
    >
      <span
        className={cn(
          "flex size-9 flex-none items-center justify-center rounded-full",
          caso.estado === "rojo"
            ? "bg-destructive/10 text-destructive"
            : caso.estado === "ambar"
              ? "bg-amber-100 text-amber-800"
              : "bg-secondary text-foreground",
        )}
      >
        <Icono className="size-4" />
      </span>
      <Link href={caso.href} className="min-w-[200px] flex-1 hover:underline">
        {/* Dentro de un cliente el nombre ya está arriba: acá manda el caso. */}
        <p className="text-sm font-semibold text-foreground">{sangrado ? caso.etiqueta : caso.cliente}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground no-underline">
          {sangrado ? caso.detalle : `${caso.etiqueta}${caso.detalle ? ` · ${caso.detalle}` : ""}`}
        </p>
        {/* PERUBAR es el caso que mostraron en la reunión del 09-09: uno sin
            tomar y otro ya en curso del mismo cliente. Sin esta línea, quien
            gestionó el otro cree que el CRM le perdió el trabajo. */}
        {enCurso > 0 && (
          <p className="text-[11px] font-medium text-[#1E7F4F] no-underline">
            {enCurso === 1 ? "Ya hay 1 expediente en curso de este cliente" : `Ya hay ${enCurso} expedientes en curso de este cliente`}
          </p>
        )}
      </Link>
      <Reloj estado={caso.estado} texto={caso.aviso} />
      {caso.accion ?? <ArrowRight className="size-3.5 flex-none text-muted-foreground" />}
    </div>
  );
}

export function BandejaPorCliente({
  casos,
  enCursoPorCuenta = {},
}: {
  casos: CasoDeCliente[];
  /** Cuántos expedientes de ese cliente YA se están trabajando. Por cuenta. */
  enCursoPorCuenta?: Record<string, number>;
}) {
  const grupos = new Map<string, { cliente: string; cuentaId: string | null; casos: CasoDeCliente[] }>();
  for (const c of casos) {
    const clave = c.cuentaId ?? `nombre:${sinTildes(c.cliente)}`;
    const g = grupos.get(clave);
    if (g) g.casos.push(c);
    else grupos.set(clave, { cliente: c.cliente, cuentaId: c.cuentaId ?? null, casos: [c] });
  }

  // El cliente más urgente primero; con la misma urgencia, el que más casos
  // acumula: tres pendientes de la misma persona es una señal por sí sola.
  const lista = [...grupos.values()].sort((a, b) => {
    const ua = Math.min(...a.casos.map((c) => ORDEN[c.estado] ?? 9));
    const ub = Math.min(...b.casos.map((c) => ORDEN[c.estado] ?? 9));
    return ua - ub || b.casos.length - a.casos.length;
  });

  return (
    <div className="space-y-2">
      {lista.map((g) => {
        if (g.casos.length === 1)
          return (
            <Caso
              key={g.casos[0].clave}
              caso={g.casos[0]}
              enCurso={g.cuentaId ? (enCursoPorCuenta[g.cuentaId] ?? 0) : 0}
            />
          );

        // Lo que ya se trabaja de ESTE cliente; 0 si no se sabe la cuenta.
        const enCurso = g.cuentaId ? (enCursoPorCuenta[g.cuentaId] ?? 0) : 0;
        const peor = g.casos.reduce((p, c) => ((ORDEN[c.estado] ?? 9) < (ORDEN[p] ?? 9) ? c.estado : p), "verde" as CasoDeCliente["estado"]);
        return (
          <details key={g.cuentaId ?? g.cliente} className="group" open>
            <summary
              className={cn(
                "flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-lg border p-3",
                peor === "rojo" ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
              )}
            >
              <span
                className={cn(
                  "flex size-9 flex-none items-center justify-center rounded-full",
                  peor === "rojo" ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground",
                )}
              >
                <Building2 className="size-4" />
              </span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-sm font-semibold text-foreground">{g.cliente}</span>
                {/* DECÍA «casos activos» Y NO ERA VERDAD: son los que faltan
                    tomar. NESSUS tiene ocho expedientes abiertos y acá salían
                    «2 casos activos», así que quien ya gestionó los otros seis
                    creía que el CRM le había perdido el trabajo (reunión del
                    09-09). Ahora se dice lo que falta Y lo que ya va en curso. */}
                <span className="block text-xs text-muted-foreground">
                  {g.casos.length === 1 ? "1 sin atender" : `${g.casos.length} sin atender`}
                  {enCurso > 0 && (
                    <span className="text-[#1E7F4F]">
                      {" · "}
                      {enCurso === 1 ? "1 ya en curso" : `${enCurso} ya en curso`}
                    </span>
                  )}
                </span>
              </span>
              <Reloj estado={peor} texto={`${g.casos.length} por tomar`} />
              <ChevronDown className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="mt-2 space-y-2">
              {g.casos
                .slice()
                .sort((a, b) => (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9))
                .map((c) => (
                  <Caso key={c.clave} caso={c} sangrado />
                ))}
              {/* La historia completa del cliente: lo que ya se le vendió, lo
                  que se le cotizó y todo lo que se le hizo antes. Sin esto la
                  agrupación solo ordena; con esto explica. */}
              {g.cuentaId && (
                <Link
                  href={`/comercial/cartera/${g.cuentaId}`}
                  className="ml-0 block rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:ml-9"
                >
                  Ver todo el historial de {g.cliente} →
                </Link>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
