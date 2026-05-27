/**
 * main.ts
 * ─────────────────────────────────────────────────────────────
 * Entry point del juego.
 * Inicializa Phaser 3 con la configuración base y arranca
 * el PitchDetectorService en background (listo para v2).
 * ─────────────────────────────────────────────────────────────
 */

import Phaser from 'phaser'
import GameScene from './scenes/GameScene'
import { PitchDetectorService } from './audio/pitchDetector'
import { ChordDetectorService } from './audio/chordDetector'

// ──────────────────────────────────────────
// Configuración de Phaser
// ──────────────────────────────────────────

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,           // Usa WebGL si está disponible, fallback a Canvas
  width: '100%',
  height: '100%',
  backgroundColor: '#0a0a12',
  parent: 'game-container',    // Monta el canvas dentro de este div del HTML
  scene: [GameScene],

  // Escala responsiva
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  // Sin gravedad — la manejamos manualmente en GameScene.update()
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },

  input: {
  }
}

// ──────────────────────────────────────────
// Iniciar el juego
// ──────────────────────────────────────────

const game = new Phaser.Game(config)
console.log('🎸 Chord Strike arrancado —', game)

// ──────────────────────────────────────────
// Sincronizar controles de BPM con Phaser
// ──────────────────────────────────────────
const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement
const bpmInput = document.getElementById('bpm-input') as HTMLInputElement
const bpmMinus = document.getElementById('bpm-minus') as HTMLButtonElement
const bpmPlus = document.getElementById('bpm-plus') as HTMLButtonElement

function updateBpm(value: number) {
  // Asegurar límites [10..250]
  const cleanValue = Math.max(10, Math.min(250, value))
  
  if (bpmSlider) bpmSlider.value = cleanValue.toString()
  if (bpmInput) bpmInput.value = cleanValue.toString()
  
  // Emitir cambio de BPM a las escenas de Phaser
  game.events.emit('bpm-changed', cleanValue)
}

if (bpmSlider) {
  bpmSlider.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10)
    updateBpm(val)
  })
}

if (bpmInput) {
  bpmInput.addEventListener('change', (e) => {
    let val = parseInt((e.target as HTMLInputElement).value, 10)
    if (isNaN(val)) val = 60
    updateBpm(val)
  })
  bpmInput.addEventListener('keyup', () => {
    const val = parseInt(bpmInput.value, 10)
    if (!isNaN(val) && val >= 10 && val <= 250) {
      updateBpm(val)
    }
  })
}

if (bpmMinus) {
  bpmMinus.addEventListener('click', () => {
    const currentVal = parseInt(bpmInput ? bpmInput.value : (bpmSlider ? bpmSlider.value : '60'), 10)
    updateBpm(currentVal - 1)
  })
}

if (bpmPlus) {
  bpmPlus.addEventListener('click', () => {
    const currentVal = parseInt(bpmInput ? bpmInput.value : (bpmSlider ? bpmSlider.value : '60'), 10)
    updateBpm(currentVal + 1)
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia del metrónomo con Phaser
// ──────────────────────────────────────────
const metronomeToggle = document.getElementById('metronome-toggle') as HTMLButtonElement

if (metronomeToggle) {
  let metronomeActive = false
  metronomeToggle.addEventListener('click', () => {
    metronomeActive = !metronomeActive
    if (metronomeActive) {
      metronomeToggle.classList.add('active')
      metronomeToggle.textContent = '🔊'
      metronomeToggle.title = 'Desactivar metrónomo'
    } else {
      metronomeToggle.classList.remove('active')
      metronomeToggle.textContent = '🔇'
      metronomeToggle.title = 'Activar metrónomo'
    }
    // Emitir el cambio de metrónomo al juego de Phaser
    game.events.emit('metronome-toggled', metronomeActive)
  })
}

// ──────────────────────────────────────────
// Iniciar Detectores de Audio en background
// ──────────────────────────────────────────

const pitchDetector = new PitchDetectorService()
const chordDetector = new ChordDetectorService()

// Intentar iniciar el micrófono con el click de interacción
window.addEventListener('click', async () => {
  const micStatus = document.getElementById('mic-status')
  if (micStatus) {
    micStatus.classList.add('active')
    micStatus.innerHTML = '<span class="dot"></span>MIC ESCUCHANDO'
  }

  if (!pitchDetector.running) {
    await pitchDetector.start((result) => {
      // Emitir el evento de nota detectada al juego de Phaser
      game.events.emit('note-detected', result.note)

      // ── Actualizar Afinador Digital ──
      const tunerNote = document.getElementById('tuner-note')
      const tunerHz = document.getElementById('tuner-hz')
      const tunerNeedle = document.getElementById('tuner-needle')

      if (tunerNote) tunerNote.textContent = result.note
      if (tunerHz) tunerHz.textContent = `${result.frequency.toFixed(1)} Hz`
      
      if (tunerNeedle) {
        // Calcular la desviación en cents respecto al tono ideal
        const midiNote = Math.round(12 * Math.log2(result.frequency / 440) + 69)
        const idealHz = 440 * Math.pow(2, (midiNote - 69) / 12)
        const centsDeviation = 1200 * Math.log2(result.frequency / idealHz)
        
        // Rotación de -45 a +45 grados en el medidor radial
        const deg = Math.max(-45, Math.min(45, (centsDeviation / 50) * 45))
        tunerNeedle.style.transform = `rotate(${deg}deg)`
      }
    })
  }

  if (!chordDetector.running) {
    await chordDetector.start((chordName) => {
      // Emitir el evento de acorde detectado al juego de Phaser
      game.events.emit('chord-detected', chordName)
      console.log(`🎵 Acorde detectado: ${chordName}`)
    })
  }
}, { once: true })

// ──────────────────────────────────────────
// Sincronizar alternancia de Cifrado (Do/Re/Mi vs C/D/E)
// ──────────────────────────────────────────
const notationToggle = document.getElementById('notation-toggle') as HTMLButtonElement
let currentNotation: 'latin' | 'american' = (localStorage.getItem('notation') as 'latin' | 'american') || 'latin'

function applyNotation(notation: 'latin' | 'american') {
  currentNotation = notation
  localStorage.setItem('notation', notation)
  
  PitchDetectorService.setNotation(notation)
  ChordDetectorService.setNotation(notation)
  
  if (notationToggle) {
    notationToggle.innerHTML = `CIFRADO: <span class="notation-active">${notation === 'latin' ? 'DO RE MI' : 'C D E'}</span>`
  }
  
  game.events.emit('notation-changed', notation)
}

// Inicializar al arrancar
applyNotation(currentNotation);

if (notationToggle) {
  notationToggle.addEventListener('click', () => {
    const nextNotation = currentNotation === 'latin' ? 'american' : 'latin'
    applyNotation(nextNotation)
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia de Modo Claro/Oscuro
// ──────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement

// Leer tema guardado o usar default
let currentTheme = localStorage.getItem('theme') || 'dark'
if (currentTheme === 'light') {
  document.body.classList.add('light-theme')
  if (themeToggle) {
    themeToggle.textContent = '☀️'
    themeToggle.title = 'Activar modo oscuro'
  }
} else {
  document.body.classList.remove('light-theme')
  if (themeToggle) {
    themeToggle.textContent = '🌙'
    themeToggle.title = 'Activar modo claro'
  }
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    if (document.body.classList.contains('light-theme')) {
      document.body.classList.remove('light-theme')
      currentTheme = 'dark'
      themeToggle.textContent = '🌙'
      themeToggle.title = 'Activar modo claro'
    } else {
      document.body.classList.add('light-theme')
      currentTheme = 'light'
      themeToggle.textContent = '☀️'
      themeToggle.title = 'Activar modo oscuro'
    }
    localStorage.setItem('theme', currentTheme)
    // Emitir el cambio de tema a las escenas de Phaser
    game.events.emit('theme-changed', currentTheme)
  })
}

// ──────────────────────────────────────────
// Limpiar al cerrar la página
// ──────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  pitchDetector.stop()
  chordDetector.stop()
})
