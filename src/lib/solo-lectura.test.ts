import { describe, expect, it } from "vitest";
import { CORREO_DEMO, fetchSoloLectura, pedidoPermitido } from "@/lib/solo-lectura";

const BASE = "https://x.supabase.co";

describe("el candado de las cuentas de demostración", () => {
  it("deja leer", () => {
    expect(pedidoPermitido(`${BASE}/rest/v1/cuentas?select=*`, "GET")).toBe(true);
    expect(pedidoPermitido(`${BASE}/rest/v1/rpc/listar_clientes`, "POST")).toBe(true);
    expect(pedidoPermitido(`${BASE}/storage/v1/object/sign/adjuntos`, "POST")).toBe(true);
    expect(pedidoPermitido(`${BASE}/auth/v1/token?grant_type=refresh_token`, "POST")).toBe(true);
  });

  it("no deja escribir de ninguna forma", () => {
    expect(pedidoPermitido(`${BASE}/rest/v1/cuentas`, "POST")).toBe(false);
    expect(pedidoPermitido(`${BASE}/rest/v1/cuentas?id=eq.1`, "PATCH")).toBe(false);
    expect(pedidoPermitido(`${BASE}/rest/v1/cuentas?id=eq.1`, "DELETE")).toBe(false);
    expect(pedidoPermitido(`${BASE}/rest/v1/rpc/finanzas_confirmar_abono`, "POST")).toBe(false);
    expect(pedidoPermitido(`${BASE}/rest/v1/rpc/sembrar_equipos_del_pedido`, "POST")).toBe(false);
    expect(pedidoPermitido(`${BASE}/storage/v1/object/adjuntos/x.png`, "POST")).toBe(false);
  });

  it("no revela el código de autorización ni cierra la sesión de la persona real", () => {
    expect(pedidoPermitido(`${BASE}/rest/v1/rpc/mi_pin_supervisor`, "POST")).toBe(false);
    expect(pedidoPermitido(`${BASE}/auth/v1/logout?scope=global`, "POST")).toBe(false);
    expect(pedidoPermitido(`${BASE}/auth/v1/user`, "PUT")).toBe(false);
  });

  it("responde con un error de PostgREST sin llamar a la red", async () => {
    let llamado = false;
    const f = fetchSoloLectura(async () => {
      llamado = true;
      return new Response("{}");
    });
    const r = await f(`${BASE}/rest/v1/cuentas`, { method: "POST" });
    expect(r.status).toBe(403);
    expect(llamado).toBe(false);
    expect((await r.json()).code).toBe("DEMO");
  });

  it("reconoce solo las cuentas _test de la empresa", () => {
    expect(CORREO_DEMO.test("central_test@efameinsa.com")).toBe(true);
    expect(CORREO_DEMO.test("central@efameinsa.com")).toBe(false);
    expect(CORREO_DEMO.test("central_test@gmail.com")).toBe(false);
  });
});
