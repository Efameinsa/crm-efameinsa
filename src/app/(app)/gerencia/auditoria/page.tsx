import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { EntrarComoBoton } from "@/components/crm/entrar-como-boton";
import { fechaHoraLima } from "@/lib/fechas";
import { haceCuanto } from "@/lib/accesos";
import { RANURAS } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * Auditoría de cuentas (0160): todas las cuentas del CRM y un botón para
 * entrar como cada una, en una pestaña aparte, solo lectura y con registro.
 *
 * Santos, 02-09: «debe ver en algún lugar todas esas cuentas y con un click
 * poder ingresar en una ventana ya logueada para que pueda navegar
 * directamente sin necesidad de cambiar de navegador y estar buscando el
 * usuario y contraseña de cada empleado».
 */

const ETIQUETA_ROL: Record<string, string> = {
  comercial: "Comercial",
  central: "Central",
  gerencia: "Gerencia",
  operaciones: "Operaciones",
  admin: "Administrador",
};

export default async function AuditoriaPage() {
  const yo = await requerirRol(["gerencia", "admin"]);
  const supabase = await createClient();

  const [{ data: perfiles }, { data: accesos }, { data: auditorias }] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre, rol, codigo_comercial, activo, es_prueba, es_postventa, es_operaciones, email_contacto")
      .eq("activo", true)
      .eq("es_prueba", false)
      .order("rol")
      .order("codigo_comercial", { nullsFirst: false })
      .order("nombre"),
    supabase.from("accesos").select("user_id, created_at").order("created_at", { ascending: false }).limit(2000),
    supabase
      .from("auditorias_sesion")
      .select("id, ranura, abierta_at, entrada_at, auditor:perfiles!auditorias_sesion_auditor_id_fkey(nombre), auditado:perfiles!auditorias_sesion_auditado_id_fkey(nombre)")
      .order("abierta_at", { ascending: false })
      .limit(60),
  ]);

  const ultimoAcceso = new Map<string, string>();
  for (const a of accesos ?? []) if (!ultimoAcceso.has(a.user_id as string)) ultimoAcceso.set(a.user_id as string, a.created_at as string);

  type Aud = { id: string; ranura: number; abierta_at: string; entrada_at: string | null; auditor: { nombre: string } | null; auditado: { nombre: string } | null };
  const lista = (auditorias ?? []) as unknown as Aud[];
  const porRanura = new Map<number, Aud>();
  for (const a of lista) if (!porRanura.has(a.ranura)) porRanura.set(a.ranura, a);

  const cuentas = (perfiles ?? []).filter((p) => p.id !== yo.id);
  const area = (p: (typeof cuentas)[number]) =>
    p.es_operaciones ? "Operaciones" : p.es_postventa ? "Postventa" : ETIQUETA_ROL[p.rol] ?? p.rol;

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Auditoría de cuentas">
        <p className="mb-3 max-w-prose text-xs text-muted-foreground">
          «Entrar como» abre una pestaña nueva ya logueada como esa persona, en una dirección aparte (ver1 a ver5), así su
          sesión de gerencia no se toca y puede tener varias abiertas a la vez. En esa pestaña el CRM es{" "}
          <b className="text-foreground">solo lectura</b>: se navega todo lo que ella ve, no se registra nada a su nombre. Cada
          entrada queda registrada abajo. El acceso vence a los 10 minutos si no se usa.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Cuenta</th>
                <th className="px-2 py-2 font-medium">Área</th>
                <th className="px-2 py-2 font-medium">Último acceso</th>
                <th className="px-2 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((p) => {
                const ult = ultimoAcceso.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-2 py-2">
                      <span className="block font-semibold text-foreground">
                        {p.nombre}
                        {p.codigo_comercial && <span className="ml-1 font-normal text-muted-foreground">({p.codigo_comercial})</span>}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{p.email_contacto ?? "—"}</span>
                    </td>
                    <td className="px-2 py-2 text-foreground">{area(p)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{ult ? `${haceCuanto(ult)} · ${fechaHoraLima(ult)}` : "nunca"}</td>
                    <td className="px-2 py-2 text-right">
                      <EntrarComoBoton perfilId={p.id} nombre={p.nombre} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Ranuras y registro">
        <div className="mb-3 grid gap-2 sm:grid-cols-5">
          {Array.from({ length: RANURAS }, (_, i) => i + 1).map((r) => {
            const a = porRanura.get(r);
            return (
              <div key={r} className="rounded-md border border-border p-2 text-xs">
                <p className="font-mono text-[11px] text-muted-foreground">ver{r}</p>
                {a ? (
                  <>
                    <p className="font-semibold text-foreground">{a.auditado?.nombre ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.entrada_at ? `abierta ${haceCuanto(a.entrada_at)}` : "acceso sin usar"} · por {a.auditor?.nombre?.split(" ")[0] ?? "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">libre</p>
                )}
              </div>
            );
          })}
        </div>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía nadie ha entrado como otra cuenta.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {lista.slice(0, 30).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="tabular-nums">{fechaHoraLima(a.abierta_at)}</span>
                <span className="font-medium text-foreground">{a.auditor?.nombre ?? "—"}</span>
                <span>entró como</span>
                <span className="font-medium text-foreground">{a.auditado?.nombre ?? "—"}</span>
                <span className="font-mono">ver{a.ranura}</span>
                {!a.entrada_at && <span className="italic">(acceso no usado)</span>}
              </li>
            ))}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
