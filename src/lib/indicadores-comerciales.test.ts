import { describe, expect, it } from "vitest";
import {
  contarGestiones,
  contarVisitasYVideollamadas,
  enHorarioLaboral,
  evaluarConteo,
  evaluarWhatsapp,
  fechaDeParametro,
  mediana,
  metaDelPeriodo,
  metasDeParametros,
  minutosHabiles,
  resumirWhatsappCampania,
  ritmoEsperado,
  type MensajeChat,
} from "@/lib/indicadores-comerciales";

// Lima es UTC−5 todo el año: las 09:00 de Lima son las 14:00 UTC.
const lima = (fecha: string, hora: string) => `${fecha}T${hora}:00-05:00`;

describe("horario laboral", () => {
  it("L-V 08:30-18:00 y sábado 08:30-13:00, en hora de Lima", () => {
    expect(enHorarioLaboral(lima("2026-09-30", "08:29"))).toBe(false); // miércoles
    expect(enHorarioLaboral(lima("2026-09-30", "08:30"))).toBe(true);
    expect(enHorarioLaboral(lima("2026-09-30", "17:59"))).toBe(true);
    expect(enHorarioLaboral(lima("2026-09-30", "18:00"))).toBe(false);
    expect(enHorarioLaboral(lima("2026-10-03", "12:59"))).toBe(true); // sábado
    expect(enHorarioLaboral(lima("2026-10-03", "13:00"))).toBe(false);
    expect(enHorarioLaboral(lima("2026-10-04", "10:00"))).toBe(false); // domingo
  });

  it("el reloj solo corre con la oficina abierta", () => {
    expect(minutosHabiles(lima("2026-09-30", "09:00"), lima("2026-09-30", "09:12"))).toBe(12);
    // 17:55 del miércoles → 08:35 del jueves: 5 + 5 minutos de oficina.
    expect(minutosHabiles(lima("2026-09-30", "17:55"), lima("2026-10-01", "08:35"))).toBe(10);
    // 12:50 del sábado → 08:40 del lunes: 10 del sábado + 10 del lunes; el domingo no existe.
    expect(minutosHabiles(lima("2026-10-03", "12:50"), lima("2026-10-05", "08:40"))).toBe(20);
    expect(minutosHabiles(lima("2026-09-30", "10:00"), lima("2026-09-30", "09:00"))).toBe(0);
  });

  it("mediana", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 9])).toBe(5);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
  });
});

describe("metas", () => {
  it("lee los parámetros y cae a los de la 0353 si falta alguno", () => {
    const m = metasDeParametros([
      { clave: "meta_visitas_semana", valor: 3 },
      { clave: "metas_visitas_desde", valor: 20261019 },
    ]);
    expect(m.visitasSemana).toBe(3);
    expect(m.videollamadasSemana).toBe(5);
    expect(m.waRespuestaMin).toBe(15);
    expect(m.visitasDesde).toBe("2026-10-19");
  });

  it("la fecha se guarda como AAAAMMDD", () => {
    expect(fechaDeParametro(20261012)).toBe("2026-10-12");
    expect(fechaDeParametro(2026)).toBeNull();
    expect(fechaDeParametro(null)).toBeNull();
  });

  it("una meta semanal se escala al mes", () => {
    expect(metaDelPeriodo(2, "2026-09-28", "2026-10-03")).toBe(2);
    expect(metaDelPeriodo(2, "2026-09-01", "2026-09-30")).toBe(9);
  });
});

describe("ritmo de la semana", () => {
  const lunes = "2026-09-28";
  const sabado = "2026-10-03";
  it("el lunes no se espera nada; el jueves, 3 de 5 días hábiles; el sábado, todo", () => {
    expect(ritmoEsperado(lunes, sabado, "2026-09-28")).toBe(0);
    expect(ritmoEsperado(lunes, sabado, "2026-10-01")).toBeCloseTo(0.6);
    expect(ritmoEsperado(lunes, sabado, "2026-10-03")).toBe(1);
    expect(ritmoEsperado(lunes, sabado, "2026-10-10")).toBe(1);
  });

  it("dice el estado con palabras", () => {
    expect(evaluarConteo({ hecho: 1, meta: 5, ritmo: 0.6 })).toEqual({ estado: "atrasado", texto: "Atrasado: van 1, se esperaban 3" });
    expect(evaluarConteo({ hecho: 3, meta: 5, ritmo: 0.6 }).estado).toBe("en_camino");
    expect(evaluarConteo({ hecho: 0, meta: 2, ritmo: 0 })).toEqual({ estado: "en_camino", texto: "En camino: van 0 de 2" });
    expect(evaluarConteo({ hecho: 2, meta: 2, ritmo: 0.2 }).estado).toBe("en_meta");
    expect(evaluarConteo({ hecho: 1, meta: 2, ritmo: 1 })).toEqual({ estado: "atrasado", texto: "No llegó: 1 de 2, faltó 1" });
  });

  it("antes de la fecha de arranque no hay rojo ni ámbar", () => {
    const e = evaluarConteo({ hecho: 0, meta: 5, ritmo: 0.8, enMedicionHasta: "2026-10-12" });
    expect(e).toEqual({ estado: "en_medicion", texto: "En medición hasta el 12-10" });
    // Llegar a la meta sí se celebra.
    expect(evaluarConteo({ hecho: 5, meta: 5, ritmo: 0.8, enMedicionHasta: "2026-10-12" }).estado).toBe("en_meta");
  });
});

describe("gestiones efectivas", () => {
  it("las marcas de WhatsApp van aparte y no suman", () => {
    const r = contarGestiones([
      { tipo: "llamada", nota: "Habló con el dueño", efectiva: true, postventa: false },
      { tipo: "llamada", nota: null, efectiva: false, postventa: false },
      { tipo: "whatsapp", nota: "Por WhatsApp: el cliente está interesado.", efectiva: true, postventa: false },
      { tipo: "whatsapp", nota: "Le mandé la ficha", efectiva: true, postventa: false },
      { tipo: "email", nota: null, efectiva: true, postventa: true }, // postventa: no compite
      { tipo: "nota", nota: null, efectiva: true, postventa: false }, // sin contacto: no cuenta
    ]);
    expect(r).toEqual({ efectivas: 2, sinContacto: 1, marcasWhatsapp: 1 });
  });
});

describe("visitas y videollamadas", () => {
  const C1 = "c1";
  const C5 = "c5";
  const CENTRAL = "central";

  it("la visita a planta cuenta una vez, y para el comercial que la registró", () => {
    const r = contarVisitasYVideollamadas(
      [
        { id: "a1", tipo: "visita", realizada_por: C1, efectiva: true },
        { id: "a2", tipo: "visita", realizada_por: C1, efectiva: false }, // viaje en falso
        { id: "a3", tipo: "showroom", realizada_por: CENTRAL, efectiva: true }, // la cerró Central
        { id: "a4", tipo: "reunion_online", realizada_por: C5, efectiva: true },
        { id: "a5", tipo: "reunion_online", realizada_por: C5, efectiva: true },
        { id: "a6", tipo: "showroom", realizada_por: C5, efectiva: true }, // showroom anotado a mano
      ],
      [{ actividad_id: "a3", registrado_por: C5 }],
      [C1, C5],
    );
    expect(r.get(C1)).toEqual({ visitasCliente: 1, visitasPlanta: 0, visitas: 1, videollamadas: 0 });
    expect(r.get(C5)).toEqual({ visitasCliente: 0, visitasPlanta: 2, visitas: 2, videollamadas: 2 });
    expect(r.has(CENTRAL)).toBe(false);
  });
});

describe("WhatsApp de campaña", () => {
  const C2 = "c2";
  const dia = "2026-09-30";
  const msg = (conversacion_id: string, direccion: string, hora: string, enviado_por: string | null = null, estado = "leido"): MensajeChat => ({
    conversacion_id,
    direccion,
    enviado_por,
    estado,
    momento: new Date(lima(dia, hora)).toISOString(),
  });

  it("mide la primera respuesta de una persona, no el acuse automático", () => {
    const chats = [
      { id: "w1", asignado_a: C2, lead_id: "l1", anuncio_at: new Date(lima(dia, "10:00")).toISOString() },
      { id: "w2", asignado_a: C2, lead_id: "l2", anuncio_at: new Date(lima(dia, "11:00")).toISOString() },
      { id: "w3", asignado_a: C2, lead_id: "l3", anuncio_at: new Date(lima(dia, "20:00")).toISOString() }, // fuera de horario
      { id: "w4", asignado_a: C2, lead_id: "l4", anuncio_at: new Date(lima(dia, "12:00")).toISOString() }, // nadie respondió
    ];
    const mensajes = [
      msg("w1", "entrante", "10:00"),
      msg("w1", "saliente", "10:00"), // acuse automático (enviado_por null)
      msg("w1", "saliente", "10:08", C2),
      msg("w2", "entrante", "11:00"),
      msg("w2", "saliente", "11:05", C2, "fallido"), // no salió
      msg("w2", "saliente", "11:30", C2),
      msg("w3", "entrante", "20:00"),
      msg("w3", "saliente", "20:10", C2),
      msg("w4", "entrante", "12:00"),
    ];
    const tips = [
      { lead_id: "l1", estado: "interesado", registrado_at: new Date(lima(dia, "10:20")).toISOString() },
      { lead_id: "l2", estado: "cotizado", registrado_at: new Date(lima("2026-10-01", "09:00")).toISOString() }, // al día siguiente
      { lead_id: "l4", estado: "sin_respuesta", registrado_at: new Date(lima("2026-09-20", "09:00")).toISOString() }, // de antes del anuncio
    ];
    const r = resumirWhatsappCampania(chats, mensajes, tips, [C2]).get(C2)!;
    expect(r.chats).toBe(4);
    // w1: 8 min; w2: 30 min (el fallido no cuenta); w3: llegó y se respondió
    // de noche, con la oficina cerrada: 0 min de oficina. w4 no entra sin `ahora`.
    expect(r.medidos).toBe(3);
    expect(r.medianaRespuestaMin).toBe(8);
    expect(r.fueraDeHorario).toBe(1);
    expect(r.sinResponder).toBe(1);
    expect(r.calificados).toBe(2);
    expect(r.calificadosMismoDia).toBe(1);
    expect(r.interesados).toBe(2);
    expect(r.cotizados).toBe(1);

    const metas = { waCalificadosPct: 100, waRespuestaMin: 15 };
    expect(evaluarWhatsapp(r, metas, false)).toEqual({
      estado: "atrasado",
      texto: "Atrasado: calificó 1 de 4 el mismo día; 1 sin responder",
    });

    // Con la hora de la consulta, el que nadie respondió entra con lo que lleva
    // esperando (12:00 → 12:40): si no, dejar chats sin contestar mejoraría la mediana.
    const conAhora = resumirWhatsappCampania(chats, mensajes, tips, [C2], new Date(lima(dia, "12:40")).toISOString()).get(C2)!;
    expect(conAhora.medidos).toBe(4);
    expect(conAhora.medianaRespuestaMin).toBe(19); // 0, 8, 30, 40
    expect(evaluarWhatsapp(conAhora, metas, false)?.texto).toBe(
      "Atrasado: calificó 1 de 4 el mismo día; responde en 19 min (meta 15); 1 sin responder",
    );
  });

  it("el que escribe de madrugada empieza a esperar cuando abre la oficina", () => {
    const chats = [{ id: "w9", asignado_a: C2, lead_id: null, anuncio_at: new Date(lima(dia, "05:44")).toISOString() }];
    const r = resumirWhatsappCampania(chats, [msg("w9", "entrante", "05:44"), msg("w9", "saliente", "08:42", C2)], [], [C2]).get(C2)!;
    expect(r.medianaRespuestaMin).toBe(12);
    expect(r.fueraDeHorario).toBe(1);
  });

  it("sin chats de anuncio no hay estado: nadie en rojo porque no le llegaron", () => {
    const r = resumirWhatsappCampania([], [], [], [C2]).get(C2)!;
    expect(evaluarWhatsapp(r, { waCalificadosPct: 100, waRespuestaMin: 15 }, true)).toBeNull();
  });
});
