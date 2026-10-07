import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { listarSugerencias } from "@/lib/acciones/sugerencias";
import { ListaSugerencias } from "@/components/crm/buzon-sugerencias";
import { listarOrdenesAlAgente, listarPendientesDecision } from "@/lib/acciones/pendientes-decision";
import { PendientesDecision } from "@/components/crm/pendientes-decision";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ESTADOS_SUGERENCIA, TIPOS_SUGERENCIA } from "@/lib/sugerencias";

// OBSERVACIONES DEL SISTEMA (Santos, 06-10: «estoy en una cuenta de admin
// pero no puedo ver todos los reclamos, quejas u observaciones»). Es la misma
// bandeja del buzón (0399), pero a pantalla completa, con todas a la vista
// desde que se abre y con los números arriba. Admin la atiende; gerencia la
// sigue viendo en solo lectura, como antes. El resto escribe en /sugerencias.
export const dynamic = "force-dynamic";

export default async function ObservacionesPage() {
  const perfil = await requerirPerfil();
  if (perfil.rol !== "admin" && perfil.rol !== "gerencia") redirect("/sugerencias");
  const esAdmin = perfil.rol === "admin";
  const [sugerencias, pendientes, ordenes] = await Promise.all([listarSugerencias(), listarPendientesDecision(), listarOrdenesAlAgente()]);

  const porEstado = (e: string) => sugerencias.filter((s) => s.estado === e).length;
  const porTipo = TIPOS_SUGERENCIA.map((t) => ({ ...t, n: sugerencias.filter((s) => s.tipo === t.valor).length }));
  const personas = [...sugerencias.reduce((m, s) => m.set(s.autor_nombre, (m.get(s.autor_nombre) ?? 0) + 1), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <MessageSquareWarning className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Observaciones del sistema</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Todo lo que el personal reporta sobre el CRM desde el botón 💡: errores, mejoras, ideas y dudas, con sus capturas.
            {esAdmin
              ? " Cambie el estado y responda: la respuesta le llega a la campana de quien la dejó."
              : " Gerencia las ve todas; las atiende el administrador."}
          </p>
        </div>
      </div>

      <PendientesDecision pendientes={pendientes} ordenes={ordenes} esAdmin={esAdmin} />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Cifra etiqueta="Recibidas" valor={sugerencias.length} />
        {ESTADOS_SUGERENCIA.map((e) => (
          <Cifra key={e.valor} etiqueta={e.valor === "nueva" ? "Por atender" : e.etiqueta} valor={porEstado(e.valor)} resaltar={e.valor === "nueva"} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <SeccionPanel titulo="Todas las observaciones">
          <Suspense>
            <ListaSugerencias sugerencias={sugerencias} esAdmin={esAdmin} verTodas userId={perfil.id} filtroInicial="todas" conFiltroTipo />
          </Suspense>
        </SeccionPanel>
        <div className="space-y-5">
          <SeccionPanel titulo="Por tipo">
            <ul className="space-y-1.5 text-sm">
              {porTipo.map((t) => (
                <li key={t.valor} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="mr-1">{t.emoji}</span>
                    {t.etiqueta}
                  </span>
                  <b className="tabular-nums">{t.n}</b>
                </li>
              ))}
            </ul>
          </SeccionPanel>
          <SeccionPanel titulo="Quién las dejó">
            {personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie ha dejado observaciones todavía.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {personas.map(([nombre, n]) => (
                  <li key={nombre} className="flex items-center justify-between gap-2">
                    <span className="truncate">{nombre}</span>
                    <b className="tabular-nums">{n}</b>
                  </li>
                ))}
              </ul>
            )}
          </SeccionPanel>
        </div>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, resaltar = false }: { etiqueta: string; valor: number; resaltar?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${resaltar && valor > 0 ? "border-[#8B1510] bg-[#8B1510]/[0.05]" : "border-border bg-card"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${resaltar && valor > 0 ? "text-[#8B1510]" : "text-foreground"}`}>{valor}</p>
    </div>
  );
}
