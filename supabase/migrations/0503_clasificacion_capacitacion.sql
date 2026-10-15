-- ============================================================
-- 0503 · «Capacitación» como clasificación en Antecedentes
--
-- Rubí (postventa, buzón 15-10): «Quiero que aparezca una opción de
-- capacitación» en el paso 2 del caso (Antecedentes), al lado de Garantía,
-- Preventivo, Correctivo, Facturable y Revisión. Es la visita en que el
-- técnico le enseña al personal del cliente a usar la máquina. No se cobra,
-- como la Revisión (0231); si se va a cobrar, se clasifica «Servicio
-- facturable». El tipo de caso «Refuerzo de capacitación» (0456) ya existía;
-- esto es el chip de quién paga, que no la tenía.
-- ============================================================

alter type clasificacion_atencion add value if not exists 'capacitacion';
