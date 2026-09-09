import Link from "next/link";
import { ArrowRight, Building2, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { agruparPorCliente } from "@/lib/fichas-del-mismo-cliente";

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
 * AGRUPA POR LA CUENTA Y DESPUÉS POR EL NOMBRE. Manda `cuentaId`, que es el
 * dato duro. Pero un mismo cliente puede tener VARIAS fichas —el contacto que
 * entra sin RUC abre una nueva cada vez que el teléfono viene mal tipeado
 * (0201)— y entonces el `cuentaId` separa lo que la persona lee como uno solo.
 *
 * Es lo que reportó la señorita de postventa el 09-09: «derivaron dos veces la
 * misma solicitud». En su pantalla GRUPO SANTA ELENA salía tres veces —dos
 * fichas nuevas y la de siempre, la del RUC 20155261570— pidiendo el mismo
 * mantenimiento de la misma centrífuga. Ninguna de las tres decía que las
 * otras existían.
 *
 * Así que después de agrupar por ficha, los grupos que se llaman IGUAL se
 * juntan. «Igual» es sin tildes, sin puntuación y sin la forma societaria:
 * «GRUPO SANTA ELENA» y «GRUPO SANTA ELENA S.A.» son el mismo cliente. Lo que
 * NO se junta es lo que está escrito distinto —«NEWREST» y «NEWRESTO» siguen
 * separados—, porque adivinar un dedazo es inventar. Y cuando un grupo viene
 * de más de una ficha se dice en pantalla, con el enlace a cada una: la
 * bandeja explica por qué se veía repetido en vez de esconderlo.
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
  // La regla de cuándo dos fichas son el mismo cliente vive en
  // `fichas-del-mismo-cliente`, con sus pruebas: el riesgo no es que junte de
  // menos, es que junte de más.
  const grupos = agruparPorCliente(casos);

  // El cliente más urgente primero; con la misma urgencia, el que más casos
  // acumula: tres pendientes de la misma persona es una señal por sí sola.
  const lista = grupos.sort((a, b) => {
    const ua = Math.min(...a.casos.map((c) => ORDEN[c.estado] ?? 9));
    const ub = Math.min(...b.casos.map((c) => ORDEN[c.estado] ?? 9));
    return ua - ub || b.casos.length - a.casos.length;
  });

  return (
    <div className="space-y-2">
      {lista.map((g) => {
        // Lo que ya se trabaja de ESTE cliente, sumando TODAS sus fichas: si el
        // contacto se partió en dos, el trabajo hecho también está partido.
        const enCurso = g.fichas.reduce((n, f) => n + (enCursoPorCuenta[f.id] ?? 0), 0);

        if (g.casos.length === 1) return <Caso key={g.casos[0].clave} caso={g.casos[0]} enCurso={enCurso} />;

        const peor = g.casos.reduce((p, c) => ((ORDEN[c.estado] ?? 9) < (ORDEN[p] ?? 9) ? c.estado : p), "verde" as CasoDeCliente["estado"]);
        return (
          <details key={g.fichas[0]?.id ?? g.cliente} className="group" open>
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
              {/* POR QUÉ SE VEÍA REPETIDO. Cuando el cliente quedó partido en
                  varias fichas hay que decirlo, no taparlo: la señorita de
                  postventa vio la misma solicitud tres veces y pensó que
                  Central la había derivado tres veces. Se dice qué pasó, y
                  quién lo arregla — unir fichas es de Central (0200). */}
              {g.fichas.length > 1 && (
                <p className="ml-0 px-3 text-[11px] text-amber-800 sm:ml-9">
                  Este cliente está en {g.fichas.length} fichas distintas, así que sus casos entraron por separado. No
                  es que se haya derivado de más: es la misma empresa escrita de dos formas. Central puede unirlas
                  desde el contacto, con «Es un cliente que ya tenemos».
                </p>
              )}
              {/* La historia completa del cliente: lo que ya se le vendió, lo
                  que se le cotizó y todo lo que se le hizo antes. Sin esto la
                  agrupación solo ordena; con esto explica. */}
              {g.fichas.map((f) => (
                <Link
                  key={f.id}
                  href={`/comercial/cartera/${f.id}`}
                  className="ml-0 block rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:ml-9"
                >
                  Ver todo el historial de {f.nombre} →
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
