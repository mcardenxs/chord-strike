/**
 * main.ts
 * ─────────────────────────────────────────────────────────────
 * Entry point del juego.
 * Inicializa Phaser 3 con la configuración base, controla la
 * navegación entre pantallas HTML y la interactividad de los modos
 * (Arcade, Práctica Libre y Círculo de Acordes).
 * ─────────────────────────────────────────────────────────────
 */

import Phaser from 'phaser'
import GameScene from './scenes/GameScene'
import { PitchDetectorService } from './audio/pitchDetector'
import { ChordDetectorService, translateChordName } from './audio/chordDetector'

// ──────────────────────────────────────────
// Configuración de Phaser
// ──────────────────────────────────────────

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,           // Usa WebGL si está disponible, fallback a Canvas
  width: 800,
  height: 600,
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
  }
}

// Iniciar el juego
const game = new Phaser.Game(config)
console.log('🎸 Chord Strike arrancado —', game)

// ──────────────────────────────────────────
// Navegación de Pantallas (Router HTML)
// ──────────────────────────────────────────

// ──────────────────────────────────────────
// Navegación de Pantallas (Router HTML por Hash)
// ──────────────────────────────────────────

let lastSelectedMode: 'arcade' | 'practice' = (localStorage.getItem('selectedMode') as 'arcade' | 'practice') || 'arcade'
let lastSelectedDifficulty = localStorage.getItem('selectedDifficulty') || 'beginner'
let isPhaserReady = false

interface GameOverStats {
  score: number
  notesHit: number
  accuracy: number
  bestCombo: number
}

let lastGameOverStats: GameOverStats | null = null
try {
  const stored = localStorage.getItem('lastGameOverStats')
  if (stored) {
    lastGameOverStats = JSON.parse(stored)
  }
} catch (e) {
  console.error('Error al parsear estadísticas guardadas:', e)
}

function showScreen(screenId: string) {
  const screens = document.querySelectorAll('.screen')
  screens.forEach(s => {
    if (s.id === screenId) {
      s.classList.remove('hidden')
      void (s as HTMLElement).offsetWidth // Forzar reflow para animación
      s.classList.add('active')
    } else {
      s.classList.remove('active')
      s.classList.add('hidden')
    }
  })

  // Controlar pausa/resumen de Phaser según la pantalla activa
  const gameScene = game.scene.getScene('GameScene')
  if (gameScene) {
    if (screenId === 'game-view') {
      gameScene.scene.resume()
      
      const container = document.getElementById('game-container')
      if (container) {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          game.scale.resize(container.clientWidth, container.clientHeight)
        }
        setTimeout(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            game.scale.resize(container.clientWidth, container.clientHeight)
          }
        }, 150)
        setTimeout(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            game.scale.resize(container.clientWidth, container.clientHeight)
          }
        }, 350)
      }
    } else {
      gameScene.scene.pause()
    }
  }

  // Restringir visibilidad del botón de pausa: Solo en modo Práctica Libre (practice)
  const gamePauseBtn = document.getElementById('game-pause-btn')
  if (gamePauseBtn) {
    if (lastSelectedMode === 'practice') {
      gamePauseBtn.style.display = 'inline-flex'
    } else {
      gamePauseBtn.style.display = 'none'
    }
    // Asegurar que el icono de pausa esté en su estado inicial
    gamePauseBtn.textContent = '⏸'
  }
}

// Iniciar sesión del juego en Phaser
function startGameSession() {
  game.events.emit('game-start', { mode: lastSelectedMode, difficulty: lastSelectedDifficulty })
  
  // Sincronizar el valor inicial del BPM en el footer del HUD
  let initialBpm = 60
  if (lastSelectedMode === 'practice') {
    initialBpm = 50
  } else {
    if (lastSelectedDifficulty === 'beginner') initialBpm = 60
    else if (lastSelectedDifficulty === 'intermediate') initialBpm = 100
    else if (lastSelectedDifficulty === 'advanced') initialBpm = 150
    else if (lastSelectedDifficulty === 'master') initialBpm = 200
  }
  
  const slider = document.getElementById('bpm-slider-horizontal') as HTMLInputElement
  const display = document.getElementById('bpm-val-display')
  if (slider) slider.value = initialBpm.toString()
  if (display) display.textContent = initialBpm.toString()

  // Sincronizar badge de práctica preseleccionada
  const preselected = localStorage.getItem('practice_preselected_chord')
  const targetBadge = document.getElementById('practice-target-badge')
  const targetChordText = document.getElementById('practice-target-chord')
  if (lastSelectedMode === 'practice' && preselected) {
    if (targetBadge) targetBadge.style.display = 'inline-flex'
    if (targetChordText) targetChordText.textContent = translateChord(preselected, currentNotation)
  } else {
    if (targetBadge) targetBadge.style.display = 'none'
  }
}

// Renderizar estadísticas de Game Over
function renderGameOverStats() {
  if (!lastGameOverStats) return
  
  const stats = lastGameOverStats
  const statNotes = document.getElementById('stat-notes')
  const statAccuracy = document.getElementById('stat-accuracy')
  const statCombo = document.getElementById('stat-combo')
  
  if (statNotes) statNotes.textContent = stats.notesHit.toString()
  if (statAccuracy) statAccuracy.textContent = `${stats.accuracy}%`
  if (statCombo) statCombo.textContent = stats.bestCombo.toString()
  
  const scoreStr = stats.score.toString().padStart(6, '0')
  const p1 = document.getElementById('go-score-p1')
  const p2 = document.getElementById('go-score-p2')
  const p3 = document.getElementById('go-score-p3')
  const rest = document.getElementById('go-score-rest')
  
  if (p1) p1.textContent = scoreStr[0]
  if (p2) p2.textContent = scoreStr[1]
  if (p3) p3.textContent = scoreStr[2]
  if (rest) rest.textContent = scoreStr.slice(3)
  
  // Guardar record de puntuación
  const currentRecord = parseInt(localStorage.getItem('highscore') || '0', 10)
  const recordBadge = document.getElementById('personal-record-badge')
  if (stats.score > currentRecord) {
    localStorage.setItem('highscore', stats.score.toString())
    if (recordBadge) recordBadge.classList.remove('hidden')
  } else {
    if (recordBadge) recordBadge.classList.add('hidden')
  }
}

// Función principal del enrutador
function handleRouting() {
  const hash = window.location.hash || '#start'
  
  // Detener el juego si navegamos fuera de la pantalla de juego
  if (hash !== '#play') {
    game.events.emit('game-stop')
  }

  if (hash !== '#play' && hash !== '#fast-circle-play') {
    // Clear practice preselected if navigating away
    localStorage.removeItem('practice_preselected_chord')
  }

  let screenId = 'start-screen'
  if (hash === '#start') {
    screenId = 'start-screen'
  } else if (hash === '#mode') {
    screenId = 'mode-screen'
  } else if (hash === '#difficulty') {
    screenId = 'difficulty-screen'
  } else if (hash === '#chord-circle') {
    screenId = 'chord-circle-screen'
  } else if (hash === '#fast-circle-config') {
    screenId = 'fast-circle-config-screen'
  } else if (hash === '#fast-circle-play') {
    screenId = 'fast-circle-play-screen'
  } else if (hash === '#fast-circle-results') {
    screenId = 'fast-circle-results-screen'
  } else if (hash === '#play') {
    screenId = 'game-view'
    if (isPhaserReady) {
      startGameSession()
    }
  } else if (hash === '#gameover') {
    screenId = 'game-over-screen'
  }

  showScreen(screenId)

  // Inicializar sub-pantallas si es necesario
  if (hash === '#chord-circle') {
    initChordCircleMode()
  } else if (hash === '#fast-circle-config') {
    initFastCircleConfigScreen()
  } else if (hash === '#fast-circle-play') {
    startFastCircleRound()
  } else if (hash === '#fast-circle-results') {
    renderFastCircleResults()
  } else if (hash === '#gameover') {
    renderGameOverStats()
  }
}

// Escuchar cambios de hash e inicialización
window.addEventListener('hashchange', handleRouting)

// Pausar Phaser al inicio una vez que esté listo, y activar enrutamiento
game.events.once('ready', () => {
  const gameScene = game.scene.getScene('GameScene')
  if (gameScene) {
    gameScene.scene.pause()
  }
  isPhaserReady = true
  handleRouting()
})

// Si no hay hash configurado al arrancar, poner #start por defecto
if (!window.location.hash) {
  window.location.hash = '#start'
} else {
  // Forzar enrutamiento inicial si ya existe un hash en recarga
  window.addEventListener('DOMContentLoaded', () => {
    handleRouting()
  })
}

// ── Botón Comenzar (Pantalla de Inicio) ──
const heroStartBtn = document.getElementById('hero-start-btn')
if (heroStartBtn) {
  heroStartBtn.addEventListener('click', () => {
    window.location.hash = '#mode'
  })
}

// ── Selección de Modos (Tarjetas) ──
const cardArcade = document.getElementById('card-arcade')
if (cardArcade) {
  cardArcade.addEventListener('click', () => {
    window.location.hash = '#difficulty'
  })
}

const cardCircle = document.getElementById('card-circle')
if (cardCircle) {
  cardCircle.addEventListener('click', () => {
    window.location.hash = '#chord-circle'
  })
}

const cardFastCircle = document.getElementById('card-fast-circle')
if (cardFastCircle) {
  cardFastCircle.addEventListener('click', () => {
    window.location.hash = '#fast-circle-config'
  })
}

const cardFree = document.getElementById('card-free')
if (cardFree) {
  cardFree.addEventListener('click', () => {
    lastSelectedMode = 'practice'
    localStorage.setItem('selectedMode', 'practice')
    window.location.hash = '#play'
  })
}

// ── Volver de Selección de Modos ──
const modeBackBtn = document.getElementById('mode-back-btn')
if (modeBackBtn) {
  modeBackBtn.addEventListener('click', () => {
    window.location.hash = '#start'
  })
}

// ── Selección de Dificultad (Arcade) ──
let activeDiff = localStorage.getItem('selectedDifficulty') || 'beginner'
const diffRows = document.querySelectorAll('.diff-row')

// Sincronizar UI de dificultad al arrancar
diffRows.forEach(row => {
  const d = row.getAttribute('data-diff')
  if (d === activeDiff) {
    row.classList.add('selected')
  } else {
    row.classList.remove('selected')
  }
  
  row.addEventListener('click', () => {
    diffRows.forEach(r => r.classList.remove('selected'))
    row.classList.add('selected')
    activeDiff = d || 'beginner'
    localStorage.setItem('selectedDifficulty', activeDiff)
  })
})

const diffBackBtn = document.getElementById('diff-back-btn')
if (diffBackBtn) {
  diffBackBtn.addEventListener('click', () => {
    window.location.hash = '#mode'
  })
}

const diffStartBtn = document.getElementById('diff-start-btn')
if (diffStartBtn) {
  diffStartBtn.addEventListener('click', () => {
    lastSelectedMode = 'arcade'
    lastSelectedDifficulty = activeDiff
    localStorage.setItem('selectedMode', 'arcade')
    localStorage.setItem('selectedDifficulty', activeDiff)
    window.location.hash = '#play'
  })
}

// ──────────────────────────────────────────
// Sincronización de Controles del Gameplay
// ──────────────────────────────────────────

// BPM Slider horizontal (Footer HUD)
const bpmSliderHorizontal = document.getElementById('bpm-slider-horizontal') as HTMLInputElement
const bpmValDisplay = document.getElementById('bpm-val-display')

if (bpmSliderHorizontal) {
  bpmSliderHorizontal.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10)
    if (bpmValDisplay) bpmValDisplay.textContent = val.toString()
    game.events.emit('bpm-changed', val)
  })
}

// Metrónomo Toggle (Gameplay Footer)
const gameMetronomeToggle = document.getElementById('game-metronome-toggle') as HTMLButtonElement
let gameMetronomeActive = false
if (gameMetronomeToggle) {
  gameMetronomeToggle.addEventListener('click', () => {
    gameMetronomeActive = !gameMetronomeActive
    if (gameMetronomeActive) {
      gameMetronomeToggle.classList.add('active')
      gameMetronomeToggle.textContent = '🔊'
    } else {
      gameMetronomeToggle.classList.remove('active')
      gameMetronomeToggle.textContent = '🔇'
    }
    game.events.emit('metronome-toggled', gameMetronomeActive)
  })
}

// Metrónomo beat dot flash
game.events.on('metronome-beat', () => {
  const beatDot = document.getElementById('metronome-beat-dot')
  if (beatDot) {
    beatDot.classList.add('active')
    setTimeout(() => beatDot.classList.remove('active'), 150)
  }
})

// Pause Button (Gameplay HUD)
const gamePauseBtn = document.getElementById('game-pause-btn')
if (gamePauseBtn) {
  gamePauseBtn.addEventListener('click', () => {
    if (lastSelectedMode !== 'practice') return // Evitar pausa en otros modos que no sean práctica libre
    
    const gameScene = game.scene.getScene('GameScene')
    if (gameScene) {
      if (gameScene.scene.isPaused()) {
        gameScene.scene.resume()
        gamePauseBtn.textContent = '⏸'
      } else {
        gameScene.scene.pause()
        gamePauseBtn.textContent = '▶'
      }
    }
  })
}

// Back Button (Gameplay HUD)
const gameBackBtn = document.getElementById('game-back-btn')
if (gameBackBtn) {
  gameBackBtn.addEventListener('click', () => {
    if (lastSelectedMode === 'arcade') {
      window.location.hash = '#difficulty'
    } else {
      window.location.hash = '#mode'
    }
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia de Cifrado (Do/Re/Mi vs C/D/E)
// ──────────────────────────────────────────
const gameNotationToggle = document.getElementById('game-notation-toggle') as HTMLButtonElement
let currentNotation: 'latin' | 'american' = (localStorage.getItem('notation') as 'latin' | 'american') || 'latin'

function applyNotation(notation: 'latin' | 'american') {
  currentNotation = notation
  localStorage.setItem('notation', notation)
  
  PitchDetectorService.setNotation(notation)
  ChordDetectorService.setNotation(notation)
  
  if (gameNotationToggle) {
    gameNotationToggle.innerHTML = `CIFRADO: <span class="notation-active">${notation === 'latin' ? 'DO RE MI' : 'C D E'}</span>`
  }
  
  // También actualizar el selector de tonalidad del Círculo de Acordes si está activo
  updateKeyPills()
  
  game.events.emit('notation-changed', notation)
}

if (gameNotationToggle) {
  gameNotationToggle.addEventListener('click', () => {
    const nextNotation = currentNotation === 'latin' ? 'american' : 'latin'
    applyNotation(nextNotation)
    
    // Re-renderizar círculo de acordes con la nueva notación si la pantalla está visible
    const circleScreen = document.getElementById('chord-circle-screen')
    if (circleScreen && !circleScreen.classList.contains('hidden')) {
      const chords = generateDiatonicChords(chordCircleKey, currentNotation)
      renderCircleChords(chords)
      renderSequenceStrip(chords)
      updateCircleVisuals()
    }
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia de Modo Claro/Oscuro
// ──────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement
const gameThemeToggle = document.getElementById('game-theme-toggle') as HTMLButtonElement
let currentTheme = localStorage.getItem('theme') || 'dark'

function applyTheme(theme: string) {
  currentTheme = theme
  localStorage.setItem('theme', theme)
  
  const updateToggleText = (el: HTMLButtonElement | null) => {
    if (el) {
      el.textContent = theme === 'light' ? '☀️' : '🌙'
      el.title = theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'
    }
  }

  if (theme === 'light') {
    document.body.classList.add('light-theme')
  } else {
    document.body.classList.remove('light-theme')
  }
  
  updateToggleText(themeToggle)
  updateToggleText(gameThemeToggle)
  
  game.events.emit('theme-changed', theme)
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light'
    applyTheme(nextTheme)
  })
}

if (gameThemeToggle) {
  gameThemeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light'
    applyTheme(nextTheme)
  })
}

// Inicializar preferencias al arrancar
applyNotation(currentNotation)
applyTheme(currentTheme)

// ──────────────────────────────────────────
// Iniciar Detectores de Audio (Microphone)
// ──────────────────────────────────────────

const pitchDetector = new PitchDetectorService()
const chordDetector = new ChordDetectorService()

// Reanudar el AudioContext de Phaser ante cualquier interacción del usuario para que se escuche el metrónomo
function resumePhaserAudio() {
  if (game && game.sound && (game.sound as any).context) {
    const ctx = (game.sound as any).context as AudioContext
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('🔊 Phaser AudioContext reanudado con éxito')
      }).catch((err: any) => {
        console.warn('⚠️ No se pudo reanudar el AudioContext de Phaser:', err)
      })
    }
  }
}
window.addEventListener('click', resumePhaserAudio)
window.addEventListener('touchstart', resumePhaserAudio)

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

      // ── Actualizar Afinador Horizontal HUD permanente ──
      const tunerBarNote = document.getElementById('tuner-bar-note')
      const tunerBarCents = document.getElementById('tuner-bar-cents')
      const tunerBarPin = document.getElementById('tuner-bar-pin')

      if (tunerBarNote) tunerBarNote.textContent = result.note
      
      const midiNote = Math.round(12 * Math.log2(result.frequency / 440) + 69)
      const idealHz = 440 * Math.pow(2, (midiNote - 69) / 12)
      const centsDeviation = Math.round(1200 * Math.log2(result.frequency / idealHz))
      fcLastPitchCents = centsDeviation
      
      if (tunerBarCents) {
        const sign = centsDeviation >= 0 ? '+' : ''
        tunerBarCents.textContent = `${sign}${centsDeviation}c`
        
        if (Math.abs(centsDeviation) <= 10) {
          tunerBarCents.style.color = 'var(--green)'
        } else {
          tunerBarCents.style.color = 'var(--yellow)'
        }
      }
      
      if (tunerBarPin) {
        const percentage = Math.max(0, Math.min(100, 50 + (centsDeviation / 50) * 50))
        tunerBarPin.style.left = `${percentage}%`
        
        if (Math.abs(centsDeviation) <= 10) {
          tunerBarPin.style.backgroundColor = 'var(--green)'
          tunerBarPin.style.boxShadow = '0 0 8px var(--green)'
        } else {
          tunerBarPin.style.backgroundColor = 'var(--yellow)'
          tunerBarPin.style.boxShadow = '0 0 8px var(--yellow)'
        }
      }
    })
  }

  if (!chordDetector.running) {
    await chordDetector.start((chordName) => {
      // Emitir acorde a Phaser
      game.events.emit('chord-detected', chordName)
      
      // Controlar el modo Círculo de Acordes si está activo y guiado
      if (guideActive && chordName) {
        handleChordCircleInput(chordName)
      }

      // Controlar el modo Círculo Veloz si la ronda está activa
      if (fcRoundActive) {
        handleFastCircleInput(chordName)
      }
    })
  }
}, { once: true })

// ──────────────────────────────────────────
// Lógica del Modo Círculo de Acordes
// ──────────────────────────────────────────

let chordCircleKey = 'Do'
let guideActive = false
let targetChordIndex = 0

const ES_TO_EN_KEY: Record<string, string> = { 'Do': 'C', 'Re': 'D', 'Mi': 'E', 'Fa': 'F', 'Sol': 'G', 'La': 'A', 'Si': 'B' }

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
const CHORD_SUFFIXES = ['', 'm', 'm', '', '', 'm', 'dim']

function generateDiatonicChords(key: string, notation: 'latin' | 'american'): string[] {
  const latinRoots = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
  const englishRoots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  
  let rootIdx = latinRoots.indexOf(key)
  if (rootIdx === -1) rootIdx = englishRoots.indexOf(key)
  if (rootIdx === -1) rootIdx = 0
  
  const chords: string[] = []
  for (let i = 0; i < 7; i++) {
    const noteIdx = (rootIdx + MAJOR_SCALE_INTERVALS[i]) % 12
    const noteName = notation === 'latin' ? latinRoots[noteIdx] : englishRoots[noteIdx]
    const suffix = CHORD_SUFFIXES[i]
    
    if (notation === 'latin' && suffix === 'm' && !noteName.endsWith('#')) {
      chords.push(`${noteName}m`)
    } else {
      chords.push(`${noteName}${suffix}`)
    }
  }
  return chords
}

function updateKeyPills() {
  const pills = document.querySelectorAll('.key-pill')
  pills.forEach(pill => {
    const key = pill.getAttribute('data-key') || 'Do'
    if (currentNotation === 'latin') {
      pill.textContent = key
    } else {
      pill.textContent = ES_TO_EN_KEY[key] || key
    }
  })
}

function initChordCircleMode() {
  updateKeyPills()
  guideActive = false
  targetChordIndex = 0
  
  const guideBtn = document.getElementById('circle-guide-btn')
  if (guideBtn) guideBtn.textContent = 'Iniciar Guía'
  
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  renderCircleChords(chords)
  renderSequenceStrip(chords)
  updateCircleVisuals()
}

function renderCircleChords(chords: string[]) {
  const container = document.getElementById('circle-viz-area')
  if (!container) return
  
  const oldNodes = container.querySelectorAll('.circle-degree-node')
  oldNodes.forEach(node => node.remove())
  
  const w = container.clientWidth || 320
  const h = container.clientHeight || 480
  const centerX = w / 2
  const centerY = h / 2
  const R = Math.min(w, h) * 0.35
  
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII°']
  
  chords.forEach((chord, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7
    const x = centerX + R * Math.cos(angle)
    const y = centerY + R * Math.sin(angle)
    
    const nodeEl = document.createElement('div')
    nodeEl.className = 'circle-degree-node'
    nodeEl.id = `circle-node-${i}`
    nodeEl.style.left = `${x - 38}px`
    nodeEl.style.top = `${y - 38}px`
    
    nodeEl.innerHTML = `
      <span class="node-chord">${chord}</span>
      <span class="node-roman">${romans[i]}</span>
    `
    
    nodeEl.addEventListener('click', () => {
      if (guideActive) {
        targetChordIndex = i
        updateCircleVisuals()
      }
    })
    
    container.appendChild(nodeEl)
  })
  
  const svg = document.getElementById('circle-svg-lines')
  if (svg) {
    svg.innerHTML = ''
    chords.forEach((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7
      const x = centerX + R * Math.cos(angle)
      const y = centerY + R * Math.sin(angle)
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', centerX.toString())
      line.setAttribute('y1', centerY.toString())
      line.setAttribute('x2', x.toString())
      line.setAttribute('y2', y.toString())
      line.setAttribute('stroke', 'var(--faint)')
      line.setAttribute('stroke-width', '2')
      line.setAttribute('stroke-dasharray', '4,4')
      line.id = `circle-line-${i}`
      svg.appendChild(line)
    })
  }
}

function renderSequenceStrip(chords: string[]) {
  const strip = document.getElementById('circle-sequence-strip')
  if (!strip) return
  strip.innerHTML = ''
  
  chords.forEach((chord, i) => {
    const item = document.createElement('div')
    item.className = 'seq-item'
    item.id = `circle-seq-${i}`
    item.textContent = chord
    strip.appendChild(item)
  })
}

function updateCircleVisuals() {
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  
  chords.forEach((_, i) => {
    const nodeEl = document.getElementById(`circle-node-${i}`)
    const seqEl = document.getElementById(`circle-seq-${i}`)
    const lineEl = document.getElementById(`circle-line-${i}`)
    
    if (nodeEl) {
      nodeEl.classList.remove('pendiente', 'tocado', 'actual', 'tonica', 'dominante')
      if (guideActive) {
        if (i < targetChordIndex) {
          nodeEl.classList.add('tocado')
        } else if (i === targetChordIndex) {
          nodeEl.classList.add('actual')
        } else {
          nodeEl.classList.add('pendiente')
        }
      } else {
        if (i === 0) nodeEl.classList.add('tonica')
        else if (i === 4) nodeEl.classList.add('dominante')
        else nodeEl.classList.add('pendiente')
      }
    }
    
    if (seqEl) {
      seqEl.className = 'seq-item'
      if (guideActive) {
        if (i < targetChordIndex) {
          seqEl.classList.add('completed')
        } else if (i === targetChordIndex) {
          seqEl.classList.add('current')
        }
      }
    }
    
    if (lineEl) {
      if (guideActive) {
        if (i < targetChordIndex) {
          lineEl.setAttribute('stroke', 'var(--green)')
          lineEl.setAttribute('stroke-width', '3')
        } else if (i === targetChordIndex) {
          lineEl.setAttribute('stroke', 'var(--white)')
          lineEl.setAttribute('stroke-width', '2')
        } else {
          lineEl.setAttribute('stroke', 'var(--faint)')
          lineEl.setAttribute('stroke-width', '2')
        }
      } else {
        lineEl.setAttribute('stroke', 'var(--faint)')
        lineEl.setAttribute('stroke-width', '2')
      }
    }
  })
  
  const progressText = document.getElementById('circle-progress-text')
  const progressBar = document.getElementById('circle-progress-bar')
  if (progressText) progressText.textContent = `${targetChordIndex} / 7`
  if (progressBar) progressBar.style.width = `${(targetChordIndex / 7) * 100}%`
}

function handleChordCircleInput(detectedChord: string) {
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  const targetChord = chords[targetChordIndex]
  
  if (detectedChord.toLowerCase() === targetChord.toLowerCase()) {
    // Acertó el acorde actual
    targetChordIndex++
    
    // Efecto de parpadeo verde en el badge de micrófono para feedback inmediato
    const micStatus = document.getElementById('mic-status')
    if (micStatus) {
      micStatus.style.backgroundColor = 'var(--green-pale)'
      setTimeout(() => {
        micStatus.style.backgroundColor = ''
      }, 300)
    }
    
    if (targetChordIndex >= 7) {
      // Completó los 7 acordes diatónicos
      guideActive = false
      const guideBtn = document.getElementById('circle-guide-btn')
      if (guideBtn) guideBtn.textContent = 'Iniciar Guía'
      
      // Mostrar popup de felicitación
      setTimeout(() => {
        alert(`🎉 ¡Excelente trabajo! Has completado el círculo diatónico de ${chordCircleKey} Mayor de manera impecable.`)
        targetChordIndex = 0
        updateCircleVisuals()
      }, 300)
    } else {
      updateCircleVisuals()
    }
  }
}

// Iniciar/Detener Guía interactiva
const circleGuideBtn = document.getElementById('circle-guide-btn')
if (circleGuideBtn) {
  circleGuideBtn.addEventListener('click', () => {
    guideActive = !guideActive
    if (guideActive) {
      circleGuideBtn.textContent = 'Detener Guía'
      targetChordIndex = 0
    } else {
      circleGuideBtn.textContent = 'Iniciar Guía'
      targetChordIndex = 0
    }
    updateCircleVisuals()
  })
}

// Volver al menú
const circleBackBtn = document.getElementById('circle-back-btn')
if (circleBackBtn) {
  circleBackBtn.addEventListener('click', () => {
    guideActive = false
    showScreen('mode-screen')
  })
}

// Key selector pills click
const keyPills = document.querySelectorAll('.key-pill')
keyPills.forEach(pill => {
  pill.addEventListener('click', () => {
    keyPills.forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    
    chordCircleKey = pill.getAttribute('data-key') || 'Do'
    
    // Detener guía si estaba activa
    guideActive = false
    if (circleGuideBtn) circleGuideBtn.textContent = 'Iniciar Guía'
    targetChordIndex = 0
    
    const chords = generateDiatonicChords(chordCircleKey, currentNotation)
    renderCircleChords(chords)
    renderSequenceStrip(chords)
    updateCircleVisuals()
  })
})

// Ajustar el rendering de los nodos al cambiar de tamaño la ventana
window.addEventListener('resize', () => {
  const circleScreen = document.getElementById('chord-circle-screen')
  if (circleScreen && !circleScreen.classList.contains('hidden')) {
    const chords = generateDiatonicChords(chordCircleKey, currentNotation)
    renderCircleChords(chords)
    updateCircleVisuals()
  }
})

// ──────────────────────────────────────────
// Gestión de la Pantalla de Game Over HTML
// ──────────────────────────────────────────

game.events.on('game-over', (stats: { score: number, notesHit: number, accuracy: number, bestCombo: number }) => {
  lastGameOverStats = stats
  localStorage.setItem('lastGameOverStats', JSON.stringify(stats))
  window.location.hash = '#gameover'
})

// Reintentar desde la pantalla de Game Over
const goRetryBtn = document.getElementById('go-retry-btn')
if (goRetryBtn) {
  goRetryBtn.addEventListener('click', () => {
    window.location.hash = '#play'
  })
}

// Menú principal desde la pantalla de Game Over
const goMenuBtn = document.getElementById('go-menu-btn')
if (goMenuBtn) {
  goMenuBtn.addEventListener('click', () => {
    window.location.hash = '#start'
  })
}

// ──────────────────────────────────────────
// Estado del Modo Círculo Veloz
// ──────────────────────────────────────────
let fcSelectedKey = 'Do';
let fcSelectedDiff = 'normal'; // 'normal', 'rapido', 'extremo'
let fcCurrentRoundChords: any[] = [];
let fcCurrentTargetIndex = 0;
let fcScore = 0;
let fcStreak = 0;
let fcTimer = 0;
let fcTimerInterval: any = null;
let fcChordStartTime = 0;
let fcRoundActive = false;
let fcRoundResults: { name: string, time: number, points: number, speed: 'fast' | 'medium' | 'slow' }[] = [];
let fcConfirmTimeout: any = null;
let fcLastPitchCents = 0;

const VELOCITY_CIRCLE_SEQUENCES: Record<string, { name: string, type: string, roman: string, function: string, notes: string[] }[]> = {
  Do: [
    { name: 'Do maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Do', 'Mi', 'Sol'] },
    { name: 'Re m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Re', 'Fa', 'La'] },
    { name: 'Mi m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Mi', 'Sol', 'Si'] },
    { name: 'Fa maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Fa', 'La', 'Do'] },
    { name: 'Sol maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Sol', 'Si', 'Re'] },
    { name: 'La m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['La', 'Do', 'Mi'] },
    { name: 'Si dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Si', 'Re', 'Fa'] }
  ],
  Re: [
    { name: 'Re maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Re', 'Fa#', 'La'] },
    { name: 'Mi m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Mi', 'Sol', 'Si'] },
    { name: 'Fa# m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Fa#', 'La', 'Do#'] },
    { name: 'Sol maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Sol', 'Si', 'Re'] },
    { name: 'La maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['La', 'Do#', 'Mi'] },
    { name: 'Si m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Si', 'Re', 'Fa#'] },
    { name: 'Do# dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Do#', 'Mi', 'Sol'] }
  ],
  Mi: [
    { name: 'Mi maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Mi', 'Sol#', 'Si'] },
    { name: 'Fa# m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Fa#', 'La', 'Do#'] },
    { name: 'Sol# m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Sol#', 'Si', 'Re#'] },
    { name: 'La maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['La', 'Do#', 'Mi'] },
    { name: 'Si maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Si', 'Re#', 'Fa#'] },
    { name: 'Do# m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Do#', 'Mi', 'Sol#'] },
    { name: 'Re# dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Re#', 'Fa#', 'La'] }
  ],
  Fa: [
    { name: 'Fa maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Fa', 'La', 'Do'] },
    { name: 'Sol m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Sol', 'Sib', 'Re'] },
    { name: 'La m', type: 'menor', roman: 'III', function: 'mediante', notes: ['La', 'Do', 'Mi'] },
    { name: 'Sib maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Sib', 'Re', 'Fa'] },
    { name: 'Do maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Do', 'Mi', 'Sol'] },
    { name: 'Re m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Re', 'Fa', 'La'] },
    { name: 'Mi dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Mi', 'Sol', 'Sib'] }
  ],
  Sol: [
    { name: 'Sol maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Sol', 'Si', 'Re'] },
    { name: 'La m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['La', 'Do', 'Mi'] },
    { name: 'Si m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Si', 'Re', 'Fa#'] },
    { name: 'Do maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Do', 'Mi', 'Sol'] },
    { name: 'Re maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Re', 'Fa#', 'La'] },
    { name: 'Mi m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Mi', 'Sol', 'Si'] },
    { name: 'Fa# dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Fa#', 'La', 'Do'] }
  ],
  La: [
    { name: 'La maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['La', 'Do#', 'Mi'] },
    { name: 'Si m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Si', 'Re', 'Fa#'] },
    { name: 'Do# m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Do#', 'Mi', 'Sol#'] },
    { name: 'Re maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Re', 'Fa#', 'La'] },
    { name: 'Mi maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Mi', 'Sol#', 'Si'] },
    { name: 'Fa# m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Fa#', 'La', 'Do#'] },
    { name: 'Sol# dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['Sol#', 'Si', 'Re'] }
  ],
  Si: [
    { name: 'Si maj', type: 'mayor', roman: 'I', function: 'tónica', notes: ['Si', 'Re#', 'Fa#'] },
    { name: 'Do# m', type: 'menor', roman: 'II', function: 'supertónica', notes: ['Do#', 'Mi', 'Sol#'] },
    { name: 'Re# m', type: 'menor', roman: 'III', function: 'mediante', notes: ['Re#', 'Fa#', 'La#'] },
    { name: 'Mi maj', type: 'mayor', roman: 'IV', function: 'subdominante', notes: ['Mi', 'Sol#', 'Si'] },
    { name: 'Fa# maj', type: 'mayor', roman: 'V', function: 'dominante', notes: ['Fa#', 'La#', 'Do#'] },
    { name: 'Sol# m', type: 'menor', roman: 'VI', function: 'submediante', notes: ['Sol#', 'Si', 'Re#'] },
    { name: 'La# dim', type: 'disminuido', roman: 'VII°', function: 'sensible', notes: ['La#', 'Do#', 'Mi'] }
  ]
};

const LATIN_TO_EN_NOTES = {
  'Do': 'C', 'Re': 'D', 'Mi': 'E', 'Fa': 'F', 'Sol': 'G', 'La': 'A', 'Si': 'B'
};
const EN_TO_LATIN_NOTES = {
  'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si'
};

function translateNote(noteName: string, targetNotation: 'latin' | 'american'): string {
  if (!noteName) return '';
  const match = noteName.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)(.*)$/);
  if (!match) return noteName;
  const root = match[1];
  const rest = match[2];

  if (targetNotation === 'american') {
    let translated = (LATIN_TO_EN_NOTES as any)[root] || root;
    if (root === 'Sib') translated = 'Bb';
    if (root === 'Reb') translated = 'Db';
    if (root === 'Mib') translated = 'Eb';
    if (root === 'Solb') translated = 'Gb';
    if (root === 'Lab') translated = 'Ab';
    return translated + rest;
  } else {
    let translated = (EN_TO_LATIN_NOTES as any)[root] || root;
    if (root === 'Bb') translated = 'Sib';
    if (root === 'Db') translated = 'Reb';
    if (root === 'Eb') translated = 'Mib';
    if (root === 'Gb') translated = 'Solb';
    if (root === 'Ab') translated = 'Lab';
    return translated + rest;
  }
}

function translateChord(chordName: string, targetNotation: 'latin' | 'american'): string {
  if (!chordName) return '';
  const match = chordName.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)(.*)$/);
  if (!match) return chordName;
  const root = match[1];
  const suffix = match[2] || '';

  const translatedRoot = translateNote(root, targetNotation);
  const s = suffix.trim();
  
  if (targetNotation === 'american') {
    if (s === 'maj') return translatedRoot + ' maj';
    if (s === 'm') return translatedRoot + 'm';
    if (s === 'dim') return translatedRoot + ' dim';
  } else {
    if (s === 'maj') return translatedRoot + ' maj';
    if (s === 'm') return translatedRoot + ' m';
    if (s === 'dim') return translatedRoot + ' dim';
  }
  return translatedRoot + suffix;
}

function normalizeChord(chord: string): string {
  if (!chord) return '';
  let c = chord.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
  
  c = c.replace('reb', 'do#');
  c = c.replace('mib', 're#');
  c = c.replace('solb', 'fa#');
  c = c.replace('lab', 'sol#');
  c = c.replace('sib', 'la#');
  
  c = c.replace('db', 'c#');
  c = c.replace('eb', 'd#');
  c = c.replace('gb', 'f#');
  c = c.replace('ab', 'g#');
  c = c.replace('bb', 'a#');
  
  if (c.includes('dim') || c.includes('disminuido') || c.includes('°')) {
    let root = c.replace('diminished', '').replace('disminuido', '').replace('dim', '').replace('°', '');
    return root + 'dim';
  }
  
  if (c.endsWith('menor') || c.endsWith('minor') || c.endsWith('min')) {
    let root = c.replace('menor', '').replace('minor', '').replace('min', '');
    return root + 'm';
  }
  
  c = c.replace('major', '').replace('mayor', '').replace('maj', '');
  
  if (c === 'rem' || c === 'mim' || c === 'lam' || c === 'sim' || c === 'dom' || c === 'fam' || c === 'solm') {
    return c;
  }
  
  if (c.startsWith('do#') && c.endsWith('m')) return 'do#m';
  if (c.startsWith('re#') && c.endsWith('m')) return 're#m';
  if (c.startsWith('fa#') && c.endsWith('m')) return 'fa#m';
  if (c.startsWith('sol#') && c.endsWith('m')) return 'sol#m';
  if (c.startsWith('la#') && c.endsWith('m')) return 'la#m';
  
  if (c.startsWith('c#') && c.endsWith('m')) return 'c#m';
  if (c.startsWith('d#') && c.endsWith('m')) return 'd#m';
  if (c.startsWith('f#') && c.endsWith('m')) return 'f#m';
  if (c.startsWith('g#') && c.endsWith('m')) return 'g#m';
  if (c.startsWith('a#') && c.endsWith('m')) return 'a#m';
  
  if (c.endsWith('m')) return c;
  return c;
}

function initFastCircleConfigScreen() {
  // Key selector Setup
  const keyPills = document.querySelectorAll('#fc-key-selector .key-pill');
  keyPills.forEach(pill => {
    const key = pill.getAttribute('data-key') || 'Do';
    if (currentNotation === 'latin') {
      pill.textContent = key;
    } else {
      pill.textContent = (ES_TO_EN_KEY as any)[key] || key;
    }
    
    if (key === fcSelectedKey) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  const freshKeyPills = document.querySelectorAll('#fc-key-selector .key-pill');
  freshKeyPills.forEach(pill => {
    // Reset listeners
    const freshPill = pill.cloneNode(true) as HTMLElement;
    pill.replaceWith(freshPill);
    freshPill.addEventListener('click', () => {
      document.querySelectorAll('#fc-key-selector .key-pill').forEach(p => (p as HTMLElement).classList.remove('active'));
      freshPill.classList.add('active');
      fcSelectedKey = freshPill.getAttribute('data-key') || 'Do';
    });
  });

  // Diff selector setup
  const diffCards = document.querySelectorAll('#fc-diff-container .fc-diff-card');
  diffCards.forEach(card => {
    const diff = card.getAttribute('data-diff') || 'normal';
    if (diff === fcSelectedDiff) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
    
    const freshCard = card.cloneNode(true) as HTMLElement;
    card.replaceWith(freshCard);
    freshCard.addEventListener('click', () => {
      document.querySelectorAll('#fc-diff-container .fc-diff-card').forEach(c => (c as HTMLElement).classList.remove('selected'));
      freshCard.classList.add('selected');
      fcSelectedDiff = freshCard.getAttribute('data-diff') || 'normal';
    });
  });
}

function startFastCircleRound() {
  fcRoundActive = true;
  fcScore = 0;
  fcStreak = 0;
  fcCurrentTargetIndex = 0;
  fcRoundResults = [];
  fcConfirmTimeout = null;
  fcChordStartTime = Date.now();
  
  fcCurrentRoundChords = VELOCITY_CIRCLE_SEQUENCES[fcSelectedKey] || VELOCITY_CIRCLE_SEQUENCES['Do'];
  
  const keyLabel = document.getElementById('fc-play-key-label');
  if (keyLabel) {
    if (currentNotation === 'latin') {
      keyLabel.textContent = fcSelectedKey;
    } else {
      keyLabel.textContent = (ES_TO_EN_KEY as any)[fcSelectedKey] || fcSelectedKey;
    }
  }
  
  const diffLabel = document.getElementById('fc-play-diff-label');
  if (diffLabel) {
    diffLabel.textContent = fcSelectedDiff === 'normal' ? 'Normal' : fcSelectedDiff === 'rapido' ? 'Rápido' : 'Extremo';
  }
  
  updateFcPlayScoreDisplay();
  initFcSequenceStrip();
  updateFcSequenceDisplay();
  updateFcPlayCard();
  
  let duration = 90;
  if (fcSelectedDiff === 'rapido') duration = 60;
  else if (fcSelectedDiff === 'extremo') duration = 30;
  
  startFcTimer(duration);
}

function startFcTimer(duration: number) {
  fcTimer = duration;
  const totalDuration = duration;
  const circumference = 188.4;
  
  const arcEl = document.getElementById('fc-timer-arc');
  const textEl = document.getElementById('fc-timer-text');
  
  if (arcEl) arcEl.setAttribute('stroke-dashoffset', '0');
  if (textEl) textEl.textContent = Math.ceil(fcTimer).toString();
  
  if (fcTimerInterval) clearInterval(fcTimerInterval);
  
  fcTimerInterval = setInterval(() => {
    fcTimer -= 0.1;
    if (fcTimer <= 0) {
      fcTimer = 0;
      clearInterval(fcTimerInterval);
      fcTimerInterval = null;
      if (arcEl) arcEl.setAttribute('stroke-dashoffset', circumference.toString());
      if (textEl) textEl.textContent = '0';
      endFastCircleRound(false);
    } else {
      if (arcEl) {
        const offset = circumference * (1 - (fcTimer / totalDuration));
        arcEl.setAttribute('stroke-dashoffset', offset.toString());
      }
      if (textEl) {
        textEl.textContent = Math.ceil(fcTimer).toString();
      }
    }
  }, 100);
}

function handleFastCircleInput(detectedChord: string) {
  if (!fcRoundActive) return;

  const targetChordData = fcCurrentRoundChords[fcCurrentTargetIndex];
  if (!targetChordData) return;
  const targetChordName = targetChordData.name;
  
  const normalizedTarget = normalizeChord(targetChordName);
  const normalizedDetected = normalizeChord(detectedChord);
  
  const detectedDisplay = document.getElementById('fc-detected-chord-display');
  const stateLabel = document.getElementById('fc-detector-state-label');
  
  if (detectedChord) {
    if (detectedDisplay) {
      detectedDisplay.textContent = translateChord(detectedChord, currentNotation);
      detectedDisplay.style.color = 'var(--yellow)';
    }
    if (stateLabel) {
      stateLabel.textContent = 'Acorde detectado';
      stateLabel.style.color = 'var(--yellow)';
    }
  } else {
    if (detectedDisplay) {
      detectedDisplay.textContent = '---';
      detectedDisplay.style.color = 'var(--muted)';
    }
    if (stateLabel) {
      stateLabel.textContent = 'Escuchando...';
      stateLabel.style.color = 'var(--muted)';
    }
  }

  if (detectedChord && normalizedDetected === normalizedTarget) {
    let tolerance = 40;
    if (fcSelectedDiff === 'extremo') {
      tolerance = 15;
    }
    
    const centsOk = Math.abs(fcLastPitchCents) <= tolerance;
    
    if (centsOk) {
      if (!fcConfirmTimeout) {
        if (stateLabel) {
          stateLabel.textContent = 'Estabilizando acorde...';
          stateLabel.style.color = 'var(--green)';
        }
        fcConfirmTimeout = setTimeout(() => {
          confirmChordSuccess();
        }, 400);
      }
    } else {
      if (fcConfirmTimeout) {
        clearTimeout(fcConfirmTimeout);
        fcConfirmTimeout = null;
      }
      if (stateLabel) {
        stateLabel.textContent = `Afinación desviada (${fcLastPitchCents > 0 ? '+' : ''}${fcLastPitchCents}c)`;
        stateLabel.style.color = 'var(--yellow)';
      }
    }
  } else {
    if (fcConfirmTimeout) {
      clearTimeout(fcConfirmTimeout);
      fcConfirmTimeout = null;
    }
    
    if (detectedChord) {
      const isDiatonic = fcCurrentRoundChords.some(chord => normalizeChord(chord.name) === normalizedDetected);
      if (isDiatonic) {
        if (fcStreak > 0) {
          fcStreak = 0;
          updateFcPlayCardStreak();
        }
      }
    }
  }
}

function confirmChordSuccess() {
  fcConfirmTimeout = null;
  
  const flash = document.getElementById('fc-confirmation-flash');
  if (flash) {
    flash.style.opacity = '1';
    setTimeout(() => {
      flash.style.opacity = '0';
    }, 200);
  }
  
  const timeSpent = (Date.now() - fcChordStartTime) / 1000;
  let points = 1000 - Math.floor(timeSpent * 10);
  points = Math.max(0, points);
  
  if (fcStreak >= 3) {
    points = Math.round(points * 1.5);
  }
  
  fcScore += points;
  
  let speed: 'fast' | 'medium' | 'slow' = 'medium';
  if (timeSpent <= 3) {
    speed = 'fast';
  } else if (timeSpent > 7) {
    speed = 'slow';
  }
  
  const targetChordData = fcCurrentRoundChords[fcCurrentTargetIndex];
  fcRoundResults.push({
    name: targetChordData.name,
    time: timeSpent,
    points: points,
    speed: speed
  });
  
  fcStreak++;
  updateFcPlayScoreDisplay();
  
  fcCurrentTargetIndex++;
  updateFcSequenceDisplay();
  
  if (fcCurrentTargetIndex >= 7) {
    endFastCircleRound(true);
  } else {
    fcChordStartTime = Date.now();
    updateFcPlayCard();
  }
}

function endFastCircleRound(completedAll: boolean) {
  fcRoundActive = false;
  
  if (fcTimerInterval) {
    clearInterval(fcTimerInterval);
    fcTimerInterval = null;
  }
  if (fcConfirmTimeout) {
    clearTimeout(fcConfirmTimeout);
    fcConfirmTimeout = null;
  }
  
  if (completedAll) {
    const bonus = Math.round(fcTimer * 50);
    fcScore += bonus;
  } else {
    // Rellenar acordes pendientes
    for (let i = fcCurrentTargetIndex; i < 7; i++) {
      const chord = fcCurrentRoundChords[i];
      fcRoundResults.push({
        name: chord.name,
        time: 0,
        points: 0,
        speed: 'slow'
      });
    }
  }
  
  window.location.hash = '#fast-circle-results';
}

function initFcSequenceStrip() {
  const strip = document.getElementById('fc-sequence-strip');
  if (!strip) return;
  strip.innerHTML = '';
  
  fcCurrentRoundChords.forEach(chord => {
    const item = document.createElement('div');
    item.className = 'fc-seq-item pending';
    item.textContent = translateChord(chord.name, currentNotation);
    strip.appendChild(item);
  });
}

function updateFcSequenceDisplay() {
  const progressText = document.getElementById('fc-progress-text');
  if (progressText) {
    progressText.textContent = `${fcCurrentTargetIndex} / 7 acordes`;
  }
  
  const strip = document.getElementById('fc-sequence-strip');
  if (!strip) return;
  
  const items = strip.children;
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HTMLElement;
    item.className = 'fc-seq-item';
    if (i < fcCurrentTargetIndex) {
      item.classList.add('completed');
    } else if (i === fcCurrentTargetIndex) {
      item.classList.add('current');
    } else {
      item.classList.add('pending');
    }
  }
}

function updateFcPlayCard() {
  const chordData = fcCurrentRoundChords[fcCurrentTargetIndex];
  if (!chordData) return;
  
  const nameEl = document.getElementById('fc-chord-name');
  const typeEl = document.getElementById('fc-chord-type-label');
  const romanEl = document.getElementById('fc-roman-function-label');
  const notesEl = document.getElementById('fc-notes-list');
  
  if (nameEl) {
    nameEl.textContent = translateChord(chordData.name, currentNotation);
  }
  if (typeEl) {
    typeEl.textContent = `Acorde ${chordData.type}`;
  }
  if (romanEl) {
    romanEl.textContent = `${chordData.roman} — ${chordData.function}`;
  }
  if (notesEl) {
    const notesList = chordData.notes.map((n: string) => translateNote(n, currentNotation));
    notesEl.textContent = notesList.join(' · ');
  }
  
  updateFcPlayCardStreak();
}

function updateFcPlayCardStreak() {
  const badge = document.getElementById('fc-streak-badge');
  if (badge) {
    if (fcStreak >= 3) {
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function updateFcPlayScoreDisplay() {
  const scoreEl = document.getElementById('fc-play-score');
  if (scoreEl) {
    scoreEl.textContent = fcScore.toString().padStart(6, '0');
  }
}

function renderFastCircleResults() {
  const scoreStr = fcScore.toString().padStart(6, '0');
  const p1 = document.getElementById('fc-res-score-p1');
  const p2 = document.getElementById('fc-res-score-p2');
  const p3 = document.getElementById('fc-res-score-p3');
  
  if (p1) p1.textContent = scoreStr.slice(0, 2);
  if (p2) p2.textContent = scoreStr.slice(2, 4);
  if (p3) p3.textContent = scoreStr.slice(4, 6);
  
  const recordKey = `${fcSelectedKey}_${fcSelectedDiff}`;
  let records: Record<string, { score: number, date: string }> = {};
  try {
    const stored = localStorage.getItem('chordCircle_records');
    if (stored) records = JSON.parse(stored);
  } catch (e) {
    console.error('Error al cargar records:', e);
  }
  
  const currentBest = records[recordKey]?.score || 0;
  const isNewRecord = fcScore > currentBest;
  
  const recordBadge = document.getElementById('fc-record-badge');
  if (recordBadge) {
    if (isNewRecord) {
      recordBadge.style.display = 'inline-block';
      records[recordKey] = {
        score: fcScore,
        date: new Date().toISOString().split('T')[0]
      };
      localStorage.setItem('chordCircle_records', JSON.stringify(records));
    } else {
      recordBadge.style.display = 'none';
    }
  }
  
  const breakdownContainer = document.getElementById('fc-results-breakdown');
  if (breakdownContainer) {
    breakdownContainer.innerHTML = '';
    
    fcRoundResults.forEach(res => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px';
      row.style.background = 'var(--bg)';
      row.style.borderRadius = '6px';
      row.style.border = '1px solid var(--faint)';
      
      const nameCol = document.createElement('span');
      nameCol.className = 'mono';
      nameCol.style.fontWeight = '700';
      nameCol.style.fontSize = '14px';
      nameCol.style.width = '80px';
      nameCol.style.color = 'var(--white)';
      nameCol.textContent = translateChord(res.name, currentNotation);
      row.appendChild(nameCol);
      
      const barWrap = document.createElement('div');
      barWrap.className = 'fc-speed-bar';
      barWrap.style.flexGrow = '1';
      barWrap.style.margin = '0 16px';
      
      const barFill = document.createElement('div');
      barFill.className = `fc-speed-fill ${res.speed}`;
      const percentage = res.time > 0 ? Math.min(100, (res.time / 10) * 100) : 0;
      barFill.style.width = `${percentage}%`;
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);
      
      const infoWrap = document.createElement('div');
      infoWrap.style.display = 'flex';
      infoWrap.style.gap = '16px';
      infoWrap.style.alignItems = 'center';
      infoWrap.style.minWidth = '140px';
      infoWrap.style.justifyContent = 'flex-end';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'mono';
      timeSpan.style.fontSize = '12px';
      timeSpan.style.color = 'var(--muted)';
      timeSpan.textContent = res.time > 0 ? `${res.time.toFixed(1)}s` : '--';
      infoWrap.appendChild(timeSpan);
      
      const pointsSpan = document.createElement('span');
      pointsSpan.className = 'mono';
      pointsSpan.style.fontSize = '13px';
      pointsSpan.style.fontWeight = '700';
      pointsSpan.style.color = 'var(--green)';
      pointsSpan.textContent = `+${res.points}`;
      infoWrap.appendChild(pointsSpan);
      
      row.appendChild(infoWrap);
      breakdownContainer.appendChild(row);
    });
  }
  
  let slowestChord = '';
  let maxTime = -1;
  fcRoundResults.forEach(res => {
    if (res.time > maxTime) {
      maxTime = res.time;
      slowestChord = res.name;
    }
  });
  
  if (!slowestChord && fcRoundResults.length > 0) {
    slowestChord = fcRoundResults[0].name;
  }
  
  const weaknessText = document.getElementById('fc-weakness-text');
  const practiceBtn = document.getElementById('fc-practice-weakness-btn');
  const weaknessBox = document.getElementById('fc-weakness-box');
  
  if (slowestChord) {
    if (weaknessBox) weaknessBox.style.display = 'flex';
    const displayWeakness = translateChord(slowestChord, currentNotation);
    if (weaknessText) {
      weaknessText.textContent = `Tu punto débil: ${displayWeakness} — practica ese`;
    }
    if (practiceBtn) {
      practiceBtn.textContent = `Practicar ${displayWeakness}`;
      
      const freshPracticeBtn = practiceBtn.cloneNode(true);
      practiceBtn.replaceWith(freshPracticeBtn);
      freshPracticeBtn.addEventListener('click', () => {
        localStorage.setItem('practice_preselected_chord', slowestChord);
        lastSelectedMode = 'practice';
        localStorage.setItem('selectedMode', 'practice');
        window.location.hash = '#play';
      });
    }
  } else {
    if (weaknessBox) weaknessBox.style.display = 'none';
  }
}

// Binds de los botones de la pantalla de configuración
const fcConfigBackBtn = document.getElementById('fc-config-back-btn');
if (fcConfigBackBtn) {
  fcConfigBackBtn.addEventListener('click', () => {
    window.location.hash = '#mode';
  });
}

const fcConfigStartBtn = document.getElementById('fc-config-start-btn');
if (fcConfigStartBtn) {
  fcConfigStartBtn.addEventListener('click', () => {
    window.location.hash = '#fast-circle-play';
  });
}

// Binds de los botones de la pantalla de resultados
const fcResultsRetryBtn = document.getElementById('fc-results-retry-btn');
if (fcResultsRetryBtn) {
  fcResultsRetryBtn.addEventListener('click', () => {
    window.location.hash = '#fast-circle-play';
  });
}

const fcResultsChangeKeyBtn = document.getElementById('fc-results-change-key-btn');
if (fcResultsChangeKeyBtn) {
  fcResultsChangeKeyBtn.addEventListener('click', () => {
    window.location.hash = '#fast-circle-config';
  });
}

const fcResultsMenuBtn = document.getElementById('fc-results-menu-btn');
if (fcResultsMenuBtn) {
  fcResultsMenuBtn.addEventListener('click', () => {
    window.location.hash = '#mode';
  });
}

const fcPlayExitBtn = document.getElementById('fc-play-exit-btn');
if (fcPlayExitBtn) {
  fcPlayExitBtn.addEventListener('click', () => {
    fcRoundActive = false;
    if (fcTimerInterval) {
      clearInterval(fcTimerInterval);
      fcTimerInterval = null;
    }
    if (fcConfirmTimeout) {
      clearTimeout(fcConfirmTimeout);
      fcConfirmTimeout = null;
    }
    window.location.hash = '#fast-circle-config';
  });
}

// ──────────────────────────────────────────
// Limpieza al cerrar
// ──────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  pitchDetector.stop()
  chordDetector.stop()
})
