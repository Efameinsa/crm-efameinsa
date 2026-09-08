import { Phone, Mail, MapPin, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * CON QUIÉN HABLAR, EN LA FICHA DE LA ATENCIÓN.
 *
 * «Cuando registran, no salen los datos del cliente» — la señorita de Central,
 * 08-09, mirando la ficha de una atención de SOCIEDAD HOTELERA DEL SUR.
 *
 * Tenía razón y es peor de lo que suena: la cabecera decía la razón social, el
 * RUC y la fecha, y el PASO 3 de la misma pantalla pide agendar la visita
 * —«cuándo y con quién»—. O sea que la pantalla pedía llamar al cliente sin
 * decir a qué número ni a quién. El teléfono estaba a dos pantallas de
 * distancia, en la ficha del cliente, y había que ir a buscarlo cada vez.
 *
 * QUIÉN LLAMÓ MANDA SOBRE EL CONTACTO PRINCIPAL. Arriba va la persona que
 * reportó el problema —la que Central anotó cuando entró la llamada—, porque
 * es quien sabe qué le pasa a la máquina. El contacto principal de la ficha va
 * después: sirve cuando el que reportó no contesta, pero no es a quien hay que
 * llamar primero.
 *
 * Y la DIRECCIÓN, que sin ella no se puede mandar al técnico a ningún lado.
 */

interface Contacto {
  nombre: string | null;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  es_principal: boolean | null;
}

export async function ConQuienHablar({
  cuentaId,
  oportunidadId,
}: {
  cuentaId: string | null;
  /** Para encontrar el lead con el que entró: ahí está quién llamó. */
  oportunidadId: string | null;
}) {
  if (!cuentaId && !oportunidadId) return null;
  const supabase = await createClient();

  const [{ data: cuenta }, { data: contactos }, { data: lead }] = await Promise.all([
    cuentaId
      ? supabase
          .from("cuentas")
          .select("razon_social, direccion, distrito, provincia, departamento")
          .eq("id", cuentaId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    cuentaId
      ? supabase
          .from("contactos")
          .select("nombre, cargo, telefono, email, es_principal")
          .eq("cuenta_id", cuentaId)
          .order("es_principal", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] }),
    oportunidadId
      ? supabase
          .from("leads")
          .select("nombre_contacto, telefono, email")
          .eq("oportunidad_id", oportunidadId)
          .order("recibido_at")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const quienReporto = lead?.nombre_contacto || lead?.telefono ? lead : null;
  const lista = (contactos ?? []) as Contacto[];
  // Si el que reportó es el mismo contacto principal, no se repite.
  const repetido = (c: Contacto) =>
    quienReporto != null &&
    ((c.telefono && c.telefono === quienReporto.telefono) ||
      (c.nombre && quienReporto.nombre_contacto && c.nombre.trim().toLowerCase() === quienReporto.nombre_contacto.trim().toLowerCase()));
  const otros = lista.filter((c) => !repetido(c));

  const donde = [cuenta?.direccion, cuenta?.distrito, cuenta?.provincia, cuenta?.departamento]
    .filter(Boolean)
    .join(" · ");

  if (!quienReporto && otros.length === 0 && !donde) {
    return (
      <p className="text-sm text-muted-foreground">
        Este cliente no tiene ningún teléfono cargado. Se agrega desde su ficha, y desde ahí queda para la próxima.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {quienReporto && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Quién reportó</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <User className="size-3.5 flex-none text-muted-foreground" />
              {quienReporto.nombre_contacto ?? "Sin nombre"}
            </span>
            {quienReporto.telefono && <Telefono numero={quienReporto.telefono} />}
            {quienReporto.email && <Correo direccion={quienReporto.email} />}
          </p>
        </div>
      )}

      {otros.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {quienReporto ? "Otros contactos del cliente" : "Contactos del cliente"}
          </p>
          <ul className="mt-0.5 space-y-1">
            {otros.map((c, i) => (
              <li key={`${c.nombre}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <User className="size-3.5 flex-none text-muted-foreground" />
                  {c.nombre ?? "Sin nombre"}
                  {c.cargo && <span className="text-xs text-muted-foreground">· {c.cargo}</span>}
                  {c.es_principal && (
                    <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-muted-foreground">
                      principal
                    </span>
                  )}
                </span>
                {c.telefono && <Telefono numero={c.telefono} />}
                {c.email && <Correo direccion={c.email} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {donde && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dónde está la máquina</p>
          <p className="mt-0.5 flex items-start gap-1.5 text-foreground">
            <MapPin className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
            {donde}
          </p>
        </div>
      )}
    </div>
  );
}

/** El teléfono se toca y llama: en el celular del técnico eso es el 90% del uso. */
function Telefono({ numero }: { numero: string }) {
  return (
    <a
      href={`tel:${numero.replace(/\s+/g, "")}`}
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      <Phone className="size-3.5 flex-none" />
      {numero}
    </a>
  );
}

function Correo({ direccion }: { direccion: string }) {
  return (
    <a href={`mailto:${direccion}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
      <Mail className="size-3.5 flex-none" />
      {direccion}
    </a>
  );
}
