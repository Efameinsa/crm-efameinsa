"use client";

import { useEffect, useState } from "react";
import { esDesfaseDeVersion } from "@/lib/desfase-de-version";

/**
 * La red de seguridad de TODO el CRM, cuando falla el marco mismo (el menú, el
 * encabezado), no solo una pantalla. `(app)/error.tsx` no alcanza ese caso:
 * Next mostraba su página por defecto, en inglés, «This page couldn't load» —
 * la que Ariana mandó al buzón el 09-10 tras entrar con otra cuenta en la misma
 * PC (ver components/crm/vigilante-de-cuenta).
 *
 * Mismo criterio que error.tsx: si es la versión vieja recarga sola UNA vez;
 * cualquier otro error dice qué hacer, en español.
 */

const MARCA_RECARGA = "crm:recarga-por-version";

function tomarElIntento(): boolean {
  try {
    if (sessionStorage.getItem(MARCA_RECARGA) === "1") return false;
    sessionStorage.setItem(MARCA_RECARGA, "1");
    return true;
  } catch {
    return true;
  }
}

export default function ErrorGeneral({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recargando] = useState(() => esDesfaseDeVersion(error) && tomarElIntento());

  useEffect(() => {
    if (recargando) window.location.reload();
  }, [recargando]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          {recargando ? (
            <p style={{ fontSize: 14 }}>Actualizando a la versión nueva…</p>
          ) : (
            <>
              <div style={{ maxWidth: 440 }}>
                <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>El CRM no se pudo abrir</h1>
                <p style={{ fontSize: 14, color: "#555", margin: 0 }}>
                  No se perdió nada de lo que ya estaba guardado. Recargue la página. Si en este navegador se entró
                  con otra cuenta, la ventana se abre con esa cuenta: para usar dos cuentas a la vez, abra la segunda
                  en otro navegador (por ejemplo, Microsoft Edge) o en otro perfil de Chrome.
                </p>
                {error.digest && (
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "#777" }}>Referencia: {error.digest}</p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    cursor: "pointer",
                    borderRadius: 6,
                    border: 0,
                    background: "#7e1210",
                    color: "#fff",
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Recargar la página
                </button>
              </div>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
