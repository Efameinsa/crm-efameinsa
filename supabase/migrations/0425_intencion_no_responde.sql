-- «No responde» como nivel del interés de compra (Moisés, buzón 09-10).
-- Hay prospectos que no contestan ni la llamada ni el WhatsApp, y la ficha se
-- pide calificada en su totalidad: «Bajo» diría que habló y no tiene
-- intención, y «Sin definir» que nadie lo calificó. Va después de «bajo».
alter type intencion_compra add value if not exists 'no_responde' after 'bajo';
