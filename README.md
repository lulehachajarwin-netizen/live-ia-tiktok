# Bot del live de TikTok — Tu Curso Max

Bot de IA para el chat en vivo de TikTok de **@tucursomax**.

Durante un live, el bot:

1. Se conecta al chat en vivo de TikTok con el paquete `tiktok-live-connector`.
2. Lee cada comentario del chat.
3. Responde con **Gemini** como experto en ventas del **MEGA PACK** (231 cursos
   en 16 packs), siguiendo las reglas de `system-prompt.md`.
4. Emite cada evento `{ user, comment, reply }` por **WebSocket**, para que la
   pantalla del live (página del set) muestre el comentario y lea la respuesta
   en voz alta con text-to-speech.
5. Registra todo en la consola.

## Reglas de venta (resumen)

- Cursos individuales: lista S/ 5 a S/ 15, descuentos rotativos 30%, 40% y 50%,
  precio final S/ 2.50 a S/ 10.50.
- Packs combinados: 2 drives S/ 20 de lista, 3 drives S/ 25 de lista, con
  descuento. Finales: Psicología Completo S/ 15, Libros de Psicología S/ 12.50,
  Monetización con IA S/ 10, Derecho Completo S/ 17.50, Ciberseguridad S/ 12.
- Catálogo completo S/ 200, opcional, nunca la única opción.
- WhatsApp de ventas: **+51931637348**. Todas las respuestas invitan a escribir ahí.
- NUNCA comparte enlaces de Drive ni contenido de los cursos. NUNCA inventa un
  método de pago (no Yape, Plin ni transferencia). NUNCA inventa el precio exacto
  de un curso que no esté en la lista.
- Si piden una persona real / humano / asesor, el bot dice que Jarwin atiende
  personalmente por WhatsApp al +51931637348.

El detalle completo está en `system-prompt.md`.

## Anti-spam

- Como máximo **1 respuesta cada 5 segundos**.
- Ignora comentarios vacíos y duplicados (mismo usuario + mismo texto en 60 s).
- Ignora los comentarios de la propia cuenta (@tucursomax).
- La cola guarda como máximo 10 comentarios pendientes; el resto se descarta.

## Instalación

```bash
cd live-ia-tiktok/bot
npm install
```

## Configuración

Copia `.env.example` a `.env` y completa tu clave:

```
TIKTOK_USERNAME=tucursomax
GEMINI_API_KEY=tu_clave_de_google_ai_studio
PORT=3000
```

La clave de Gemini es la de Google AI Studio (la misma que usa el chatbot de
WhatsApp). Nunca la compartas ni la subas a GitHub.

## Ejecutar en local

```bash
npm start
```

El servidor queda en `http://localhost:3000` (`/health` responde `{"status":"ok"}`)
y el WebSocket en esa misma dirección. La pantalla del live se conecta a
`ws://localhost:3000` en local, o a `wss://<tu-servicio>.onrender.com` en Render.

## Desplegar en Render (plan gratuito)

Igual que el chatbot de WhatsApp, como un servicio web normal de Node:

1. Sube estos archivos a un repositorio de GitHub (o usa el mismo repo del
   chatbot en otra carpeta/servicio).
2. En Render, crea un **Web Service** conectado a ese repo.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. En **Environment**, agrega:
   - `TIKTOK_USERNAME` = `tucursomax`
   - `GEMINI_API_KEY` = tu clave de Gemini
   - `PORT` lo pone Render solo (no hace falta agregarlo).
6. Espera a que quede **Live** y abre `https://<tu-servicio>.onrender.com/health`.

El plan gratuito de Render se duerme si no recibe visitas: abre la URL antes
del live para despertarlo.

## Cómo se usa en el live

1. La cuenta **@tucursomax** necesita tener acceso a LIVE (a Jarwin solo le
   piden **50 seguidores**; tiene 6, le faltan 44).
2. Enciende el bot (en Render o en local) **antes** de empezar el live.
3. Abre la pantalla del live (página del set) y conéctala al WebSocket del bot.
4. Empieza el live desde TikTok LIVE Studio o desde el celular.
5. El bot lee el chat, responde con Gemini y la pantalla muestra cada comentario
   con su respuesta. La pantalla debe llevar visible que el presentador es IA.

## ⚠️ No se puede probar contra un live real todavía

La cuenta necesita **50 seguidores para transmitir en vivo** y ahora tiene 6.
No hay ningún live en curso, así que el bot **no se puede probar conectado a
TikTok todavía**. Lo único que se puede verificar ahora es la sintaxis:

```bash
node --check server.js
```

Cuando la cuenta llegue a 50 seguidores y se haga el primer live de prueba,
se verá en la consola si el bot se conecta al chat y responde.

## Advertencias

- El paquete `tiktok-live-connector` es **no oficial**: usa la API interna de
  TikTok y TikTok puede cambiarla en cualquier momento. Si deja de conectar,
  hay que actualizar el paquete (`npm update tiktok-live-connector`) o buscar
  su reemplazo.
- El live debe ir **etiquetado como contenido de IA** (TikTok lo exige) y no se
  debe hacer pasar un video grabado por un live en directo.
- El bot responde en el chat solo a través de la pantalla/voz del live: no
  publica comentarios automáticos en TikTok.
