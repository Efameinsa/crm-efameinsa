import { Suspense } from "react";
import { Lightbulb } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { listarSugerencias } from "@/lib/acciones/sugerencias";
import { FormularioSugerencia, ListaSugerencias } from "@/components/crm/buzon-sugerencias";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// BUZÓN DE SUGERENCIAS (0399, Santos 05-10). Cualquiera escribe a la
// izquierda y ve sus sugerencias con la respuesta a la derecha. Admin y
// gerencia ven la bandeja de todos; solo admin cambia el estado y responde.
export const dynamic = "force-dynamic";

export default async function SugerenciasPage() {
  const perfil = await requerirPerfil();
  const sugerencias = await listarSugerencias();
  const esAdmin = perfil.rol === "admin";
  const verTodas = esAdmin || perfil.rol === "gerencia";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <Lightbulb className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Buzón de sugerencias</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            ¿Algo falla, algo podría ser más fácil o se le ocurre una herramienta que le ayude a vender? Escríbalo aquí con
            capturas de pantalla. Cada sugerencia se lee, y la respuesta le llega a la campana.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SeccionPanel titulo="Nueva sugerencia">
          <Suspense>
            <FormularioSugerencia userId={perfil.id} />
          </Suspense>
        </SeccionPanel>
        <SeccionPanel titulo={verTodas ? "Bandeja de sugerencias" : "Mis sugerencias"}>
          <Suspense>
            <ListaSugerencias sugerencias={sugerencias} esAdmin={esAdmin} verTodas={verTodas} userId={perfil.id} />
          </Suspense>
        </SeccionPanel>
      </div>
    </div>
  );
}
