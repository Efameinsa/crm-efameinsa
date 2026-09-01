# 27 · Que la campanada SUENE y el CRM viva en segundo plano

**Por qué existe:** Santos, 31-08, ronda de instalación — la push llegó con el
CRM cerrado pero **muda**. El CRM ya pide sonido explícito (`silent: false` en
el service worker); si no suena, el mudo está en la configuración de Windows o
del navegador **de esa máquina**. Esta lista se pasa UNA vez por computadora
(~1 minuto) y es delicada de verdad: «recibir un lead y no atenderlo».

## A · Windows: el sonido por aplicación (la causa más común)

1. `Win + I` → **Sistema → Notificaciones**.
2. Verificar arriba: **Notificaciones: Activado** y **No molestar: Desactivado**.
3. En la lista de aplicaciones, buscar **Google Chrome** (o **Microsoft
   Edge**, y si aparece, también la entrada **CRM Efameinsa**) → clic para
   abrir sus opciones → activar **«Reproducir un sonido cuando llegue una
   notificación»**.
4. Ahí mismo: **Mostrar banners** activado (si solo va al centro de
   notificaciones, aparece sin avisar).

## B · Windows: que «No molestar» no se prenda solo

`Sistema → Notificaciones → Activar «No molestar» automáticamente` → revisar
que no esté programado en horario laboral (Windows lo trae con reglas por
defecto, p. ej. al duplicar pantalla).

## C · El navegador debe seguir vivo con las ventanas cerradas

Sin esto, cerrar la última ventana del navegador corta las push hasta abrirlo
de nuevo.

- **Chrome:** `chrome://settings/system` → activar **«Seguir ejecutando
  aplicaciones en segundo plano al cerrar Google Chrome»**.
- **Edge:** `edge://settings/system` → activar **«Continuar ejecutando las
  extensiones y aplicaciones en segundo plano cuando Microsoft Edge esté
  cerrado»** (y de paso «Aceleración de inicio»).

## D · El volumen de siempre

Parece obvio y es la mitad de los casos: volumen de Windows arriba y sin
silencio; en el mezclador (clic derecho al parlante → Mezclador de volumen),
que el navegador no esté silenciado individualmente.

## E · La prueba que cierra cada máquina

1. Activar notificaciones en el CRM con la cuenta de esa persona (un clic).
2. Cerrar o minimizar el CRM.
3. Pedir la campanada de prueba (`scripts/push-de-prueba.mjs <correo>`).
4. Debe VERSE **y SONAR**. Si se ve y no suena → repasar A y D. Si ni se ve →
   repasar B y C.

## Nota honesta

El sonido de una push en segundo plano lo pone el SISTEMA, no la página: el
CRM lo pide (`silent: false`), pero Windows tiene la última palabra por
aplicación. Por eso esta lista es por máquina y no un arreglo de código. La
campanada DENTRO del CRM abierto (la de la ventanita, 25-08) es aparte y esa
sí la controla el CRM.
