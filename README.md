# 🎸 Chord Strike

Un juego interactivo de entrenamiento auditivo y musical en 2D donde las notas y acordes caen desde la parte superior y tú debes destruirlos cantando o tocando las notas correspondientes a través de tu micrófono (o mediante clicks del ratón).

Construido con **Phaser 3 + TypeScript + Vite + Pitchy (algoritmo MPM)**.

---

## 🚀 Instalación y Ejecución

```bash
# 1. Clona e ingresa al directorio
cd chord-strike

# 2. Instala las dependencias
npm install

# 3. Arranca el servidor de desarrollo
npm run dev
```

El juego estará disponible en tu navegador en: `http://localhost:3000` (o el puerto que indique Vite).

---

## 🎮 Características del Juego

### 🎨 Estética Minimalista y Calma
* **Paleta Zen**: Colores pastel suaves e integrados que sustituyen el estilo cyberpunk original por una apariencia de estudio tranquila y relajante.
* **Fondo de Pentagrama**: El área de juego cuenta con un fondo sutil que simula las 5 líneas de un pentagrama clásico.
* **Indicadores Limpios**: Barra superior con puntaje formateado en ceros, indicador de escudo mediante círculos rellenos (`●` y `○`), y una línea de peligro inferior marcada elegantemente como `— LÍMITE —`.

### ⏱️ Control de Tempo (BPM) y Metrónomo
* **Ajuste en Vivo**: Control deslizante (slider) de **10 a 250 BPM** que actualiza la velocidad de caída y frecuencia de aparición de los elementos según el tempo.
* **Metrónomo Procedimental**: Un botón de bocina (`🔇`/`🔊`) permite escuchar un click limpio sintetizado en tiempo real usando **Web Audio API** (sin necesidad de cargar archivos de sonido externos), perfectamente sincronizado con el tempo y aparición de notas.

### 🎵 Mecánica de Acordes y Arpegiado (Micrófono)
* **Spawn Híbrido**: Hay un **70%** de probabilidad de spawnear notas individuales y un **30%** de spawnear acordes diatónicos de Do Mayor (`C`, `Dm`, `Em`, `F`, `G`, `Am`).
* **Burbujas de Acordes**: Son más grandes y se representan visualmente con un doble borde elegante que muestra el nombre del acorde (ej: `Am`) y sus notas en la base (`A  C  E`).
* **Detección de Pitch Inteligente**:
  * Al cantar o tocar una nota (ej: `C`), la entrada del micrófono se valida contra las notas simples (destruyendo la que esté más abajo).
  * Si no hay notas simples que coincidan, se registra la nota en la burbuja de acorde activa más baja que la requiera.
  * La burbuja de acorde mostrará el progreso envolviendo las notas tocadas en corchetes (ej: `A  [C]  E`) y emitiendo un pulso visual de confirmación.
  * Al completar todas las notas del acorde (arpegio completo), este explota liberando partículas y otorgando una alta puntuación.
* **Soporte de Entrada Alternativa**: Puedes hacer click sobre cualquier nota o acorde con el cursor para destruirlo manualmente.

---

## 📁 Estructura del Proyecto

```
/src
  /scenes
    GameScene.ts     ← Lógica principal del juego (control de BPM, spawn, UI y colisiones)
  /audio
    pitchDetector.ts ← Captura de micrófono y detección de tono con Pitchy (MPM)
  main.ts            ← Entrada de la app, vinculación del detector con Phaser y eventos DOM
index.html           ← Interfaz de usuario (BPM slider, metrónomo, área del juego y fuentes)
vite.config.ts       ← Configuración del empaquetador Vite
tsconfig.json        ← Configuración de TypeScript
```

---

## 🛠️ Stack Técnico

* **Phaser 3** — Motor de juegos 2D.
* **Pitchy** — Detección precisa de pitch en tiempo real mediante el algoritmo McLeod Pitch Method (MPM).
* **Web Audio API** — Captura de flujo de micrófono y síntesis de osciladores procedurales para el metrónomo.
* **TypeScript & Vite** — Flujo de desarrollo rápido y estructurado.
* **Google Fonts (Outfit)** — Tipografía moderna y minimalista.
