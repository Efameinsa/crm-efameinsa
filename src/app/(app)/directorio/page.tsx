import { Contact } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaDirectorio, TablaTecnicos, type PersonaDirectorio, type Tecnico } from "@/components/crm/directorio";

// EL DIRECTORIO (0410). Lesly lo entregó el 06-10 en Excel: quién es quién, con
// sus dos correos (EFAMEINSA y OPEN) y su teléfono, «para que lo tengan de
// referencia y puedan enviar un correo cuando necesiten algo de alguien». Y la
// relación de técnicos con su DNI, que sale impreso en la apertura.
//
// Lo ve todo el personal. La relación de técnicos (con DNI) solo las áreas que
// arman o atienden el servicio. Lo editan gerencia y operaciones.
export const dynamic = "force-dynamic";

export default async function DirectorioPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const puedeEditar = perfil.rol === "gerencia" || perfil.rol === "admin" || perfil.es_operaciones === true;
  const veTecnicos =
    puedeEditar ||
    perfil.rol === "finanzas" ||
    perfil.es_postventa === true ||
    perfil.es_almacen === true ||
    perfil.rol === "central";

  const [{ data: personas }, { data: tecnicos }] = await Promise.all([
    supabase
      .from("directorio")
      .select("id, orden, nombre, area, correo_efameinsa, correo_open, telefono, avisos, activo")
      .order("orden")
      .order("nombre"),
    veTecnicos
      ? supabase.from("tecnicos").select("id, orden, nombre, dni, activo").order("orden").order("nombre")
      : Promise.resolve({ data: [] }),
  ]);
  const lista = ((personas ?? []) as PersonaDirectorio[]).filter((p) => puedeEditar || p.activo);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <Contact className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Directorio</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Los correos de cada persona en las dos empresas y su teléfono. Los avisos que el CRM manda por correo salen al de la
            empresa del pedido: si el cierre es OPEN, al correo OPEN; si es EFAMEINSA, al de EFAMEINSA.
            {puedeEditar ? " Usted puede corregir un dato o marcar quién recibe cada aviso." : ""}
          </p>
        </div>
      </div>

      <SeccionPanel titulo={`Personal (${lista.filter((p) => p.activo).length})`}>
        <TablaDirectorio personas={lista} puedeEditar={puedeEditar} />
      </SeccionPanel>

      {veTecnicos && (
        <SeccionPanel titulo="Relación de técnicos">
          <p className="mb-3 text-xs text-muted-foreground">
            Al elegir el técnico en una apertura, su DNI sale impreso junto a su nombre (el cliente lo pide para dejarlo entrar).
          </p>
          <TablaTecnicos tecnicos={(tecnicos ?? []) as Tecnico[]} puedeEditar={puedeEditar} />
        </SeccionPanel>
      )}
    </div>
  );
}
