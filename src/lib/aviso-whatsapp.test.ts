import { describe, expect, it } from "vitest";
import { avisoDeMensajeWhatsapp, tituloDePestanaWhatsapp, vistazoDelMensaje } from "./aviso-whatsapp";

describe("vistazoDelMensaje", () => {
  it("el texto va limpio y corto", () => {
    expect(vistazoDelMensaje("text", "  hola\n\n buenos días ")).toBe("hola buenos días");
    const largo = vistazoDelMensaje("text", "a".repeat(200));
    expect(largo.length).toBe(90);
    expect(largo.endsWith("…")).toBe(true);
  });
  it("sin texto dice qué mandó", () => {
    expect(vistazoDelMensaje("image", null)).toBe("📷 Foto");
    expect(vistazoDelMensaje("audio", "")).toBe("🎤 Audio");
    expect(vistazoDelMensaje("unknown", null)).toBe("Mensaje nuevo");
  });
  it("una foto con leyenda muestra la leyenda", () => {
    expect(vistazoDelMensaje("image", "esta es la máquina")).toBe("esta es la máquina");
  });
});

describe("avisoDeMensajeWhatsapp", () => {
  it("quién escribe arriba, qué dijo abajo", () => {
    expect(avisoDeMensajeWhatsapp({ quien: "Juan Pérez", tipo: "text", texto: "¿me llama?", sinResponder: 1 })).toEqual({
      titulo: "Juan Pérez",
      cuerpo: "«¿me llama?»",
    });
  });
  it("varios seguidos se cuentan en un solo aviso", () => {
    expect(avisoDeMensajeWhatsapp({ quien: "Juan", tipo: "audio", texto: null, sinResponder: 3 }).cuerpo).toBe(
      "3 mensajes sin responder · «🎤 Audio»",
    );
  });
});

describe("título de la pestaña", () => {
  it("uno dice el nombre; varios, el último y cuántos más", () => {
    expect(tituloDePestanaWhatsapp([{ titulo: "Juan" }])).toBe("💬 (1) Juan le escribió");
    expect(tituloDePestanaWhatsapp([{ titulo: "Juan" }, { titulo: "Ana" }, { titulo: "Luis" }])).toBe("💬 (3) Juan y 2 más");
  });
});
