import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NombreAFicha } from "@/components/crm/nombre-a-ficha";
import { fechaLimaCorta } from "@/lib/fechas";
import { puedeVerPrecios } from "@/lib/postventa";
import { cargarFilasPorPaso, debeElPaso, DIAS_HISTORIA, type FilaTabla } from "@/lib/pedidos-por-paso";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * LA AGENDA DE POSTVENTA: LO QUE FALTA, PASO POR PASO, SOLO LO ABIERTO.
 *
 * Reunión del 13-10 (Carlos, Rubí, Ariana, Lesly y Santos). Un cliente esperó
 * del 03-10 al 13-10 su cotización porque nadie tenía mapeado qué faltaba:
 * «esto no debería votar mismo en la agenda y no estar buscando paso por
 * paso… que la agenda mismo lo ponga, lo detalle a todos los clientes». Y:
 * «que viene a ser todo el resultado de por paso, pero que solamente sea lo
 * abierto, lo que está en curso».
 *
 * Es el resultado de la tabla «Por paso» del control de pedidos, con la misma
 * regla (lib/pedidos-por-paso), puesto como lista de trabajo: cada paso con
 * sus clientes y el enlace directo a cada pedido. Primero lo que le toca
 * ahora; después lo que todavía espera un paso anterior.
 */

const PASOS: { clave: string; titulo: string; ayuda: string }[] = [
  { clave: "aprobado", titulo: "Falta aprobar el pedido", ayuda: "Postventa revisa el cierre y lo aprueba." },
  { clave: "pago", titulo: "Falta la confirmación de Finanzas", ayuda: "Finanzas confirma que el dinero está acreditado." },
  { clave: "pago_parcial", titulo: "Pago parcial: falta el saldo", ayuda: "Pagaron una parte; ubicar quién debe el saldo." },
  { clave: "prueba_sin_pedir", titulo: "Prueba y embalaje sin pedir al almacén", ayuda: "Nadie le pidió todavía al almacén que lo pruebe y embale." },
  { clave: "prueba", titulo: "Falta probar y embalar", ayuda: "Lo hace el almacén; incluye los repuestos por embalar." },
  { clave: "sin_stock", titulo: "Sin stock (máquinas sin serie)", ayuda: "Por importar, en compra local, en fabricación o sin motivo marcado." },
  { clave: "plano", titulo: "Falta enviar el plano de preinstalación", ayuda: "Va en paralelo: cuanto antes, mejor." },
  { clave: "direccion", titulo: "Falta verificar la dirección y quién recibe", ayuda: "Se llama antes de despachar." },
  { clave: "apertura", titulo: "Falta emitir la apertura", ayuda: "Sin apertura no sale nada del almacén ni el técnico." },
  { clave: "preinstalacion", titulo: "Falta la preinstalación", ayuda: "Lima: videollamada antes del despacho. Provincia: el cliente confirma con fotos." },
  { clave: "despacho", titulo: "Falta despachar", ayuda: "Pendientes por despachar o por entregar en planta." },
  { clave: "verificado", titulo: "Falta verificar el despacho", ayuda: "Revisar las fotos y la guía que subió el almacén." },
  { clave: "puesta", titulo: "Falta la puesta en marcha o el servicio", ayuda: "Incluye mantenimientos, revisiones y repuestos con instalación." },
  { clave: "informe", titulo: "Falta enviar el informe técnico al cliente", ayuda: "Marcar el envío en el pedido, con su constancia." },
  { clave: "facturar", titulo: "Falta la orden a Finanzas para facturar y cobrar", ayuda: "Pedidos a crédito o con saldo: al terminar, se le pide a Finanzas que facture." },
  { clave: "listo_cerrar", titulo: "Listos para cerrar", ayuda: "Todo hecho: solo falta cerrar el pedido." },
];

const FILTROS_SIN_PASO = new Set(["pago_parcial", "prueba_sin_pedir", "sin_stock", "listo_cerrar"]);

const MOTIVO_SIN_STOCK: Record<string, string> = {
  importacion: "por importar",
  compra_local: "compra local",
  fabricacion: "en fabricación",
  sin_motivo: "sin motivo marcado",
};

export default async function PendientesPorPasoPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const todas = await cargarFilasPorPaso(supabase, puedeVerPrecios(perfil));
  const abiertas = todas.filter((f) => !f.historia);
  const historia = todas.length - abiertas.length;

  const secciones = PASOS.map((p) => {
    const filas = abiertas.filter((f) => debeElPaso(f, p.clave));
    // Primero a quién le toca ahora (el primer paso que le falta es este) o lo
    // trabado; después lo que todavía espera un paso anterior.
    const conOrden = filas.map((f) => {
      const paso = f.pasos.find((x) => x.clave === p.clave);
      const siguiente = f.pasos.find((x) => !x.hecho);
      const ahora = FILTROS_SIN_PASO.has(p.clave) || siguiente?.clave === p.clave || Boolean(paso?.trabado);
      return { f, paso, ahora };
    });
    conOrden.sort((a, b) => Number(b.ahora) - Number(a.ahora) || a.f.cliente.localeCompare(b.f.cliente, "es"));
    return { ...p, filas: conOrden, ahoraN: conOrden.filter((x) => x.ahora).length };
  }).filter((s) => s.filas.length > 0);

  return (
    <SeccionPanel
      titulo="Lo que falta, paso por paso"
      accion={
        <Link href="/postventa/control?vista=paso" className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent">
          Ver la tabla por paso
        </Link>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Solo los pedidos abiertos ({abiertas.length}). Cada paso con sus clientes: toque uno para abrir su pedido y marcar el paso. Arriba de cada lista va lo que le
        toca ahora; abajo, lo que todavía espera un paso anterior.
        {historia > 0 && ` No suman ${historia} pedidos del Excel de antes del CRM que ya salieron hace más de ${DIAS_HISTORIA} días o que nadie movió.`}
      </p>

      {secciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos abiertos con pasos pendientes.</p>
      ) : (
        <>
          {/* El resumen de un vistazo: cuántos por paso, cada uno salta a su lista. */}
          <nav className="mb-4 flex flex-wrap gap-1.5">
            {secciones.map((s) => (
              <a
                key={s.clave}
                href={`#paso-${s.clave}`}
                className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/20"
              >
                {s.titulo} ({s.filas.length})
              </a>
            ))}
          </nav>

          <div className="space-y-3">
            {secciones.map((s) => (
              <details key={s.clave} id={`paso-${s.clave}`} open={s.filas.length <= 12} className="scroll-mt-20 rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
                  <span className="text-sm font-semibold text-foreground">{s.titulo}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">{s.filas.length}</span>
                  {!FILTROS_SIN_PASO.has(s.clave) && s.ahoraN < s.filas.length && (
                    <span className="text-[11px] text-muted-foreground">
                      {s.ahoraN} le toca ahora · {s.filas.length - s.ahoraN} esperan un paso anterior
                    </span>
                  )}
                  <span className="w-full text-[11px] text-muted-foreground">{s.ayuda}</span>
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {s.filas.map(({ f, paso, ahora }) => (
                    <li key={f.id} className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2", !ahora && "opacity-70")}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          <NombreAFicha cuentaId={f.cuentaId}>{f.cliente}</NombreAFicha>
                        </span>
                        <span className="line-clamp-1 text-[11px] text-muted-foreground" title={f.equipo}>
                          {f.equipo.split("\n")[0]}
                        </span>
                        <span className="block text-[11px]">
                          {detalle(s.clave, f, paso)}
                        </span>
                      </span>
                      <Link href={`/postventa/pedidos/${f.id}`} className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent">
                        Abrir el pedido
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border px-3 py-1.5 text-[11px]">
                    <Link href={`/postventa/control?vista=paso&falta=${s.clave}`} className="text-primary hover:underline">
                      Ver estos pedidos en la tabla por paso
                    </Link>
                </p>
              </details>
            ))}
          </div>
        </>
      )}
    </SeccionPanel>
  );
}

/** Una línea de qué pasa con ese paso en ese pedido: quién lo debe, desde cuándo o qué lo traba. */
function detalle(clave: string, f: FilaTabla, paso: FilaTabla["pasos"][number] | undefined) {
  if (clave === "sin_stock") {
    const motivos = (f.sinStock ?? []).map((m) => MOTIVO_SIN_STOCK[m ?? "sin_motivo"] ?? m);
    return <span className="text-orange-800">{motivos.length} máquina{motivos.length === 1 ? "" : "s"} sin serie: {[...new Set(motivos)].join(", ")}</span>;
  }
  if (clave === "pago_parcial") {
    const pago = f.pasos.find((x) => x.clave === "pago");
    return <span className="text-amber-800">{pago?.etiqueta ?? "Pago parcial"}</span>;
  }
  if (clave === "listo_cerrar") return <span className="text-[#1E7F4F]">Todos los pasos hechos: falta cerrarlo.</span>;
  if (clave === "prueba_sin_pedir") return <span className="text-destructive">Pídaselo al almacén desde el pedido.</span>;
  if (!paso) return null;
  if (paso.trabado) return <span className="text-destructive">{paso.trabado}</span>;
  const siguiente = f.pasos.find((x) => !x.hecho);
  if (siguiente && siguiente.clave !== paso.clave) return <span className="text-muted-foreground">Antes falta: {siguiente.etiqueta.toLowerCase()}</span>;
  return (
    <span className="text-amber-800">
      {paso.etiqueta} · le toca a {paso.dueno}
      {paso.cuando && clave === "despacho" ? ` · programado ${fechaLimaCorta(paso.cuando)}` : ""}
    </span>
  );
}
