"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * LOS FORMULARIOS DE LA PROPUESTA NO GUARDAN, PERO NO SE ROMPEN (24-09).
 *
 * Santos, en central_test: «no encuentro la manera de registrar un contacto…
 * esto debe ser más amigable». Las cuentas de demostración son de solo
 * lectura: el proxy rechaza todo envío, y un formulario que se enviaba
 * terminaba en la pantalla de error, perdiendo lo escrito.
 *
 * Ahora, antes de que el envío salga, se lo detiene acá y se avisa con un
 * mensaje corto: se puede llenar cualquier formulario para ver cómo es, y
 * nada cambia en la base. Los formularios de búsqueda y filtros (los que
 * navegan con una dirección en `action`) siguen funcionando.
 */
export function GuardaDemo() {
  useEffect(() => {
    const alEnviar = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      // Filtros y buscadores: un GET a otra dirección, no guardan nada.
      const accion = form.getAttribute("action");
      if (accion && !accion.startsWith("javascript:")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const boton = (e.submitter?.textContent ?? "").replace(/\s+/g, " ").trim();
      toast.info("En la propuesta no se guarda nada", {
        description: `${boton ? `«${boton}» funcionaría así en el CRM de siempre. ` : ""}Puede llenar el formulario para verlo: los datos reales no cambian.`,
      });
    };
    // En captura y sobre window: corre antes que React y que el propio formulario.
    window.addEventListener("submit", alEnviar, true);
    return () => window.removeEventListener("submit", alEnviar, true);
  }, []);
  return null;
}
