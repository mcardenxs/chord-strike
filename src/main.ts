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
  width: 800,
  height: 560,
  backgroundColor: '#050510',
  parent: 'game-container',    // Monta el canvas dentro de este div del HTML
  scene: [GameScene],

  // Escala responsiva
  scale: {
    mode: Phaser.Scale.FIT,
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
// Sincronizar slider de BPM con Phaser
// ──────────────────────────────────────────
const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement
const bpmValue = document.getElementById('bpm-value')

if (bpmSlider && bpmValue) {
  bpmSlider.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value
    bpmValue.textContent = val
    // Emitir cambio de BPM a las escenas de Phaser
    game.events.emit('bpm-changed', parseInt(val, 10))
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
  if (!pitchDetector.running) {
    await pitchDetector.start((result) => {
      // Emitir el evento de nota detectada al juego de Phaser
      game.events.emit('note-detected', result.note)

      // Logear en consola la nota detectada
      console.log(
        `🎵 Nota detectada: ${result.note} | ${result.frequency.toFixed(1)} Hz | claridad: ${(result.clarity * 100).toFixed(0)}%`
      )
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
// Limpiar al cerrar la página
// ──────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  pitchDetector.stop()
  chordDetector.stop()
})
