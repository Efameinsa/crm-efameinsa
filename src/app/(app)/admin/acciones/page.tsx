import Link from "next/link";
import { History } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { DeshacerClic } from "@/components/crm/deshacer-clic";
import { fechaHoraLima } from "@/lib/fechas";
import {
  CAMPOS_RUIDO,
  TABLAS_FILTRO,
  idsMencionados,
  nombreCampo,
  titularAccion,
  valorLegible,
  type AccionRegistrada,
} from "@/lib/registro-acciones";

export const dynamic = "force-dynamic";

/**
 * EL REGISTRO DE ACCIONES (0513). Santos, 16-10: «esas acciones de cada
 * usuario deberían estar registradas en la vista de administrador, cosa de que
 * si Ariana o Brenda cometen una acción que quieren deshacer, el administrador
 * pueda deshacerlo».
 *
 * Una tarjeta por CLIC (lo que la base hizo en una misma transacción), con lo
 * que cambió en palabras de la oficina y el botón «Deshacer este clic». Lo
 * que hacen los procesos automáticos no aparece: solo personas.
 */

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** Para una fila creada o borrada: los datos que la identifican, no los 40 campos. */
const CAMPOS_QUE_IDENTIFICAN = ["razon_social", "nombre", "serie", "modelo_texto", "tipo", "etapa", "detalle", "mensaje", "telefono", "codigo"];

export default async function RegistroAccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; dia?: string; que?: string; lote?: string }>;
}) {
  await requerirRol(["admin", "gerencia", "operaciones"]);
  const filtro = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(filtro.dia ?? "") ? filtro.dia! : hoyLima();
  const lote = /^\d+$/.test(filtro.lote ?? "") ? Number(filtro.lote) : null;

  const supabase = await createClient();
  let consulta = supabase.from("registro_acciones").select("*").order("id", { ascending: false }).limit(600);
  if (lote) consulta = consulta.eq("lote", lote);
  else consulta = consulta.gte("cuando", `${dia}T00:00:00-05:00`).lte("cuando", `${dia}T23:59:59.999-05:00`);
  if (filtro.persona) consulta = consulta.eq("quien", filtro.persona);
  if (filtro.que && TABLAS_FILTRO.some((t) => t.valor === filtro.que)) consulta = consulta.eq("tabla", filtro.que);

  const [{ data, error }, { data: personas }] = await Promise.all([
    consulta,
    supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("activo", true).order("nombre"),
  ]);
  const acciones = (data ?? []) as AccionRegistrada[];

  // Los identificadores, traducidos de una vez: personas, fichas y máquinas.
  // Con la llave de servicio porque gerencia y operaciones no ven todas las
  // fichas; la página ya pasó requerirRol.
  const ids = idsMencionados(acciones);
  const nombres = new Map<string, string>();
  for (const p of personas ?? []) nombres.set(p.id, p.nombre);
  if (ids.length) {
    const admin = createAdminClient();
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) lotes.push(ids.slice(i, i + 150));
    for (const grupo of lotes) {
      const [cu, eq, pe] = await Promise.all([
        admin.from("cuentas").select("id, razon_social").in("id", grupo),
        admin.from("equipos_instalados").select("id, serie, modelo_texto").in("id", grupo),
        admin.from("perfiles").select("id, nombre").in("id", grupo),
      ]);
      for (const c of cu.data ?? []) nombres.set(c.id, c.razon_social ?? "(ficha sin nombre)");
      for (const e of eq.data ?? []) nombres.set(e.id, [e.serie, e.modelo_texto?.split("·")[0]?.slice(0, 60)].filter(Boolean).join(" · ") || "(máquina)");
      for (const p of pe.data ?? []) nombres.set(p.id, p.nombre);
    }
  }

  // Un clic = un lote. Se conserva el orden (lo más nuevo arriba).
  const clics: { lote: number; acciones: AccionRegistrada[] }[] = [];
  const porLote = new Map<number, AccionRegistrada[]>();
  for (const a of acciones) {
    let g = porLote.get(a.lote);
    if (!g) {
      g = [];
      porLote.set(a.lote, g);
      clics.push({ lote: a.lote, acciones: g });
    }
    g.push(a);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <History className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Registro de acciones</h1>
          <p className="text-xs text-muted-foreground">
            Lo que cada persona cambió en el CRM, clic por clic. Si alguien se equivocó, aquí se deshace sin tocar la base a mano.
          </p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-xs shadow-sm">
        <label className="grid gap-1">
          <span className="text-muted-foreground">Día</span>
          <input type="date" name="dia" defaultValue={dia} className="h-8 rounded-md border border-input bg-background px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Persona</span>
          <select name="persona" defaultValue={filtro.persona ?? ""} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="">Todas</option>
            {(personas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Qué</span>
          <select name="que" defaultValue={filtro.que ?? ""} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="">Todo</option>
            {TABLAS_FILTRO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-8 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90">
          Filtrar
        </button>
        {lote && (
          <Link href="/admin/acciones" className="h-8 content-center px-1 text-primary hover:underline">
            Ver todo el día
          </Link>
        )}
      </form>

      <SeccionPanel titulo={`Clics${clics.length ? ` (${clics.length}${acciones.length === 600 ? "+" : ""})` : ""}`}>
        {error ? (
          <p className="text-sm text-destructive">No se pudo leer el registro: {error.message}</p>
        ) : clics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie cambió nada con estos filtros. El registro empezó el 16-10-2026: antes de esa fecha no hay clics anotados. Pruebe
            con otro día o con «Todas» las personas.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {clics.map((c) => {
              const primera = c.acciones[c.acciones.length - 1];
              const quien = nombres.get(primera.quien) ?? "Alguien";
              const cuentaId = c.acciones.find((a) => a.cuenta_id)?.cuenta_id ?? null;
              const deshecho = c.acciones.every((a) => a.deshecha_at);
              const esDeshacer = c.acciones.some((a) => a.revierte_lote);
              const resumen = `${c.acciones.length === 1 ? titularAccion(primera) : `${c.acciones.length} cambios`}${cuentaId ? ` en ${nombres.get(cuentaId) ?? "una ficha"}` : ""}.`;
              return (
                <li key={c.lote} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {quien}
                        <span className="font-normal text-muted-foreground"> · {fechaHoraLima(primera.cuando)}</span>
                        {esDeshacer && (
                          <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">deshizo un clic</span>
                        )}
                      </p>
                      {cuentaId && (
                        <Link href={`/comercial/cartera/${cuentaId}`} className="text-xs text-primary hover:underline">
                          {nombres.get(cuentaId) ?? "Ver la ficha"}
                        </Link>
                      )}
                    </div>
                    {deshecho ? (
                      <p className="max-w-xs text-right text-[11px] leading-snug text-muted-foreground">
                        Deshecho por {nombres.get(primera.deshecha_por ?? "") ?? "administración"} el {fechaHoraLima(primera.deshecha_at)}
                        {primera.deshecha_motivo ? ` — «${primera.deshecha_motivo}»` : ""}
                      </p>
                    ) : (
                      <DeshacerClic lote={c.lote} quien={quien} resumen={resumen} />
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {[...c.acciones].reverse().map((a) => {
                      const filas =
                        a.operacion === "cambiar"
                          ? a.campos.filter((k) => !CAMPOS_RUIDO.has(k)).map((k) => ({
                              k,
                              antes: valorLegible(a.antes?.[k], nombres),
                              despues: valorLegible(a.despues?.[k], nombres),
                            }))
                          : CAMPOS_QUE_IDENTIFICAN.filter((k) => {
                              const v = (a.despues ?? a.antes)?.[k];
                              return v !== null && v !== undefined && v !== "";
                            })
                              .slice(0, 4)
                              .map((k) => ({ k, antes: null, despues: valorLegible((a.despues ?? a.antes)?.[k], nombres) }));
                      return (
                        <li key={a.id} className="rounded-lg border border-border bg-background px-3 py-2">
                          <p className="text-xs font-semibold text-foreground">{titularAccion(a)}</p>
                          {filas.length > 0 && (
                            <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[minmax(8rem,auto)_1fr]">
                              {filas.map((f) => (
                                <div key={f.k} className="contents">
                                  <dt className="text-muted-foreground">{nombreCampo(f.k)}</dt>
                                  <dd className="min-w-0 break-words text-foreground">
                                    {f.antes !== null ? (
                                      <>
                                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{f.antes}</span>
                                        {" → "}
                                        <span>{f.despues}</span>
                                      </>
                                    ) : (
                                      f.despues
                                    )}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
