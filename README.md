# 🎸 Chord Strike

Un juego web 2D tipo "music shmup" donde notas musicales caen desde arriba y tú las destruyes.  
Construido con **Phaser 3 + TypeScript + Vite + Pitchy**.

---

## 🚀 Instalación y ejecución

```bash
# 1. Entra al directorio
cd chord-strike

# 2. Instala dependencias
npm install

# 3. Arranca el servidor de desarrollo
npm run dev
```

Abre tu navegador en `http://localhost:3000`

---

## 🎮 Cómo jugar (v1)

- Las notas musicales (C4, A3, E2...) caen desde arriba
- **Haz click** sobre ellas para destruirlas y sumar puntos
- Si una nota llega a la línea roja de abajo, **pierdes una vida** ♦
- Con 5 hits consecutivos, el multiplicador de puntos sube
- El juego termina cuando pierdes las 5 vidas

---

## 🎤 Detección de tono (lista para v2)

El micrófono ya está integrado. Cuando hagas click por primera vez, el navegador te pedirá permiso.

Abre la consola del navegador (F12) para ver las notas detectadas en tiempo real:
```
🎵 Nota detectada: A4 | 440.0 Hz | claridad: 97%
```

En la **v2**, tocar la nota correcta en tu guitarra/bajo/piano **disparará automáticamente** contra la nota en pantalla.

---

## 📁 Estructura del proyecto

```
/src
  /scenes
    GameScene.ts     ← Lógica del juego (spawn, physics, UI, game over)
  /audio
    pitchDetector.ts ← Captura de micrófono + detección de pitch con Pitchy
  main.ts            ← Entry point: configura Phaser + inicia PitchDetector
index.html           ← HTML base con estilos neon
vite.config.ts       ← Config de Vite
tsconfig.json        ← Config de TypeScript
```

---

## 🗺️ Roadmap

| Versión | Feature |
|---------|---------|
| ✅ v1   | Spawn de notas, click para destruir, score, HP, combo |
| 🔜 v2   | Conectar pitch detector → tocar nota = destruir enemigo |
| 🔜 v3   | Modos por instrumento (guitarra, bajo, piano) |
| 🔜 v4   | Niveles, jefes, power-ups musicales |

---

## 🛠️ Stack técnico

- **Phaser 3** — Motor de juegos 2D para web
- **TypeScript** — Tipado estático
- **Vite** — Bundler ultrarrápido
- **Pitchy** — Detección de pitch en tiempo real (algoritmo MPM)
- **Web Audio API** — Captura de micrófono nativa del navegador
