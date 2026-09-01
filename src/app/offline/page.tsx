/**
 * La pantalla honesta del corte de internet (plan 26, pieza 3).
 *
 * El service worker la guarda al instalarse y la muestra cuando una
 * navegación no puede llegar a la red. No tiene NI UN dato del CRM — la
 * regla de siempre: una pantalla vieja que parece actual, miente. Solo dice
 * la verdad («sin conexión») y reintenta sola cada pocos segundos.
 *
 * Vive fuera del grupo (app) y fuera del proxy de auth a propósito: el SW la
 * cachea SIN sesión, y detrás del proxy cachearía el login.
 */
export const dynamic = "force-static";

export const metadata = { title: "Sin conexión · CRM Efameinsa" };

export default function PaginaSinConexion() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#F3F1F0",
        color: "#2C2E35",
        fontFamily: '"LG Smart", Arial, "Segoe UI", sans-serif',
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "#7E1210", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, fontWeight: 700,
        }}
        aria-hidden
      >
        ⚡
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Sin conexión a internet</h1>
      <p style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: "#6B6B6B", margin: 0 }}>
        El CRM va a volver solo en cuanto regrese la conexión — esta pantalla reintenta cada pocos
        segundos. Mientras tanto, los <b>documentos del servidor de la oficina</b> siguen abriendo
        con normalidad desde su red local.
      </p>
      <p id="estado" style={{ fontSize: 12, color: "#6B6B6B", margin: 0 }}>
        Reintentando…
      </p>
      {/* Reintento sin frameworks: esta página tiene que funcionar aunque no
          cargue ni un byte más de JavaScript. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var n = 0;
              function probar() {
                n++;
                var e = document.getElementById("estado");
                if (e) e.textContent = "Reintentando… (intento " + n + ")";
                fetch("/manifest.webmanifest", { cache: "no-store" })
                  .then(function (r) { if (r.ok) location.replace("/"); })
                  .catch(function () {});
              }
              setInterval(probar, 5000);
              window.addEventListener("online", probar);
            })();
          `,
        }}
      />
    </main>
  );
}
