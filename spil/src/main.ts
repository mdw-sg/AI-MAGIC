// Phase 0: tilt test. A car on a scrolling road that steers by tilting the iPad, plus a
// turbo button with fire and lightning — enough to prove that touch, motion sensors,
// sound and fullscreen all work on the iPad before the real racing game is built.
import './style.css'
import { Tilt } from './tilt'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tilt = new Tilt()

let w = 0
let h = 0
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// ---- state ---------------------------------------------------------------

let scene: 'start' | 'drive' = 'start'
let carX = 0 // −1 … 1 across the road
let scroll = 0
let turbo = 0 // seconds of turbo left
let shake = 0
let startedAt = 0
const keys = { left: false, right: false }

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number }
const particles: Particle[] = []

type Button = { x: number; y: number; r: number }
const buttons = {
  turbo: (): Button => ({ x: w - 110, y: h - 110, r: 75 }),
  invert: (): Button => ({ x: 50, y: 50, r: 30 }),
  center: (): Button => ({ x: 120, y: 50, r: 30 }),
}
const hit = (b: Button, x: number, y: number) => Math.hypot(x - b.x, y - b.y) <= b.r + 10

// ---- input ---------------------------------------------------------------

// Starting uses `click`, not pointerdown: iOS only allows the motion-permission prompt and
// audio unlock on a completed tap.
canvas.addEventListener('click', async () => {
  if (scene !== 'start') return
  const permission = tilt.enable()
  sound.unlock()
  scene = 'drive'
  startedAt = performance.now()
  await permission
  // Give the sensor a moment to report, then treat the current hold as straight ahead.
  setTimeout(() => tilt.calibrate(), 300)
})

canvas.addEventListener('pointerdown', (e) => {
  const { clientX: x, clientY: y } = e
  if (scene !== 'drive') return
  if (hit(buttons.turbo(), x, y)) fireTurbo()
  else if (hit(buttons.invert(), x, y)) tilt.toggleInvert()
  else if (hit(buttons.center(), x, y)) tilt.calibrate()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') keys.left = true
  if (e.key === 'ArrowRight') keys.right = true
  if (e.key === ' ' && scene === 'drive') fireTurbo()
})
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false
  if (e.key === 'ArrowRight') keys.right = false
})

function fireTurbo() {
  if (turbo > 0.3) return
  turbo = 1.8
  shake = 1
  sound.whoosh()
}

// ---- sound ---------------------------------------------------------------

const sound = (() => {
  let ac: AudioContext | null = null
  let engine: OscillatorNode | null = null

  return {
    unlock() {
      if (ac) return
      ac = new AudioContext()
      void ac.resume()
      const gain = ac.createGain()
      gain.gain.value = 0.05
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 400
      engine = ac.createOscillator()
      engine.type = 'sawtooth'
      engine.frequency.value = 55
      engine.connect(filter).connect(gain).connect(ac.destination)
      engine.start()
    },
    engine(speed: number) {
      if (ac && engine) engine.frequency.setTargetAtTime(50 + speed * 40, ac.currentTime, 0.1)
    },
    whoosh() {
      if (!ac) return
      const len = ac.sampleRate * 1.2
      const buf = ac.createBuffer(1, len, ac.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = ac.createBufferSource()
      src.buffer = buf
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 1.5
      bp.frequency.setValueAtTime(300, ac.currentTime)
      bp.frequency.exponentialRampToValueAtTime(3000, ac.currentTime + 0.5)
      bp.frequency.exponentialRampToValueAtTime(500, ac.currentTime + 1.2)
      const g = ac.createGain()
      g.gain.value = 0.5
      src.connect(bp).connect(g).connect(ac.destination)
      src.start()
    },
  }
})()

// ---- update --------------------------------------------------------------

function update(dt: number) {
  if (scene !== 'drive') return
  let steer = tilt.steer
  if (keys.left) steer = -1
  if (keys.right) steer = 1

  carX += steer * dt * 1.6
  carX = Math.max(-1, Math.min(1, carX))

  const speed = turbo > 0 ? 2.6 : 1
  scroll = (scroll + dt * speed * 1.4) % 1
  turbo = Math.max(0, turbo - dt)
  shake = Math.max(0, shake - dt * 1.5)
  sound.engine(speed)

  const car = carScreen()
  if (turbo > 0) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: car.x + side * car.s * 0.28,
          y: car.y + car.s * 0.12,
          vx: (Math.random() - 0.5) * 60,
          vy: 120 + Math.random() * 160,
          life: 0,
          max: 0.35 + Math.random() * 0.25,
          size: car.s * (0.08 + Math.random() * 0.08),
          hue: 10 + Math.random() * 40,
        })
      }
    }
  }
  for (const p of particles) {
    p.life += dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life > particles[i].max) particles.splice(i, 1)
}

// ---- drawing -------------------------------------------------------------

const horizon = () => h * 0.42
const roadHalf = (y: number) => {
  const t = (y - horizon()) / (h - horizon())
  return w * (0.04 + 0.46 * t)
}
function carScreen() {
  const y = h * 0.8
  return { x: w / 2 + carX * roadHalf(y) * 0.75, y, s: Math.min(w, h) * 0.32 }
}

function draw(now: number) {
  ctx.save()
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake)

  const hz = horizon()
  const sky = ctx.createLinearGradient(0, 0, 0, hz)
  sky.addColorStop(0, '#3b2a8c')
  sky.addColorStop(1, '#ff8a5c')
  ctx.fillStyle = sky
  ctx.fillRect(-20, -20, w + 40, hz + 20)

  // Sun and hills
  ctx.fillStyle = '#ffd25c'
  ctx.beginPath()
  ctx.arc(w * 0.7, hz - h * 0.05, h * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5a3a9e'
  ctx.beginPath()
  ctx.moveTo(-20, hz)
  for (let x = -20; x <= w + 20; x += 20) ctx.lineTo(x, hz - 30 - Math.sin(x * 0.01) * 25 - Math.sin(x * 0.023) * 15)
  ctx.lineTo(w + 20, hz)
  ctx.fill()

  // Grass with scrolling bands, road, edge stripes and centre line
  const bands = 14
  for (let i = 0; i < bands; i++) {
    const p0 = ((i + scroll) / bands) ** 2
    const p1 = ((i + 1 + scroll) / bands) ** 2
    const y0 = hz + (h - hz) * p0
    const y1 = hz + (h - hz) * p1
    const even = i % 2 === 0
    ctx.fillStyle = even ? '#3fae4a' : '#359a40'
    ctx.fillRect(-20, y0, w + 40, y1 - y0 + 1)
    ctx.fillStyle = even ? '#e8384f' : '#ffffff'
    trapezoid(y0, y1, 1.12)
    ctx.fillStyle = even ? '#55555e' : '#4d4d55'
    trapezoid(y0, y1, 1)
    if (even) {
      ctx.fillStyle = '#ffffff'
      trapezoid(y0, y1, 0.03)
    }
  }

  if (scene === 'start') drawStart(now)
  else drawDrive(now)
  ctx.restore()
}

function trapezoid(y0: number, y1: number, k: number) {
  const a = roadHalf(y0) * k
  const b = roadHalf(y1) * k
  ctx.beginPath()
  ctx.moveTo(w / 2 - a, y0)
  ctx.lineTo(w / 2 + a, y0)
  ctx.lineTo(w / 2 + b, y1 + 1)
  ctx.lineTo(w / 2 - b, y1 + 1)
  ctx.fill()
}

function drawStart(now: number) {
  const pulse = 1 + Math.sin(now / 250) * 0.06
  const r = Math.min(w, h) * 0.16 * pulse
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#2ecc71'
  ctx.beginPath()
  ctx.arc(w / 2, h * 0.45, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(w / 2 - r * 0.32, h * 0.45 - r * 0.45)
  ctx.lineTo(w / 2 + r * 0.5, h * 0.45)
  ctx.lineTo(w / 2 - r * 0.32, h * 0.45 + r * 0.45)
  ctx.fill()
  drawCar(w / 2, h * 0.86, Math.min(w, h) * 0.22, 0)
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`version ${__BUILD__}`, w - 16, 24)
}

function drawDrive(now: number) {
  // Fire particles behind the car
  for (const p of particles) {
    const t = p.life / p.max
    ctx.fillStyle = `hsla(${p.hue + t * 20}, 100%, ${60 + t * 30}%, ${1 - t})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }

  const car = carScreen()
  if (turbo > 0) drawLightning(car.x, car.y, car.s)
  drawCar(car.x, car.y, car.s, tilt.steer * 0.12)

  // Speed lines while boosting
  if (turbo > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 3
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1
      const y = Math.random() * h
      const x = side > 0 ? w - Math.random() * w * 0.15 : Math.random() * w * 0.15
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + side * 60, y)
      ctx.stroke()
    }
  }

  // Turbo button
  const tb = buttons.turbo()
  const ready = turbo <= 0.3
  ctx.fillStyle = ready ? '#ff5a1f' : '#7a4a3a'
  ctx.beginPath()
  ctx.arc(tb.x, tb.y, tb.r * (ready ? 1 + Math.sin(now / 200) * 0.04 : 1), 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.font = `${tb.r}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🔥', tb.x, tb.y + 4)

  // Small grown-up controls: flip steering direction, recentre
  for (const [b, label] of [
    [buttons.invert(), '⇄'],
    [buttons.center(), '◎'],
  ] as const) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `${b.r}px system-ui, sans-serif`
    ctx.fillText(label, b.x, b.y + 2)
  }

  // Tilt meter
  const mx = w / 2
  const mw = Math.min(300, w * 0.4)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  roundRect(mx - mw / 2, 30, mw, 20, 10)
  ctx.fillStyle = '#ffd25c'
  ctx.beginPath()
  ctx.arc(mx + (tilt.steer * mw) / 2, 40, 14, 0, Math.PI * 2)
  ctx.fill()

  // Debug readout for the grown-ups testing it
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  const sensor =
    tilt.supported ? `tilt ${tilt.raw.toFixed(2)}  styr ${tilt.steer.toFixed(2)}${tilt.invert ? '  (vendt)' : ''}`
    : now - startedAt > 1500 ? `ingen sensordata — tilladelse: ${tilt.status}`
    : 'venter på sensor…'
  ctx.fillText(sensor, w - 16, 24)
  ctx.fillText(`version ${__BUILD__}`, w - 16, 42)
}

function drawCar(x: number, y: number, s: number, lean: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, s * 0.16, s * 0.55, s * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  // Tyres
  ctx.fillStyle = '#1a1a1a'
  roundRect(-s * 0.52, -s * 0.02, s * 0.2, s * 0.2, s * 0.04)
  roundRect(s * 0.32, -s * 0.02, s * 0.2, s * 0.2, s * 0.04)
  // Body
  ctx.fillStyle = '#e8384f'
  roundRect(-s * 0.46, -s * 0.18, s * 0.92, s * 0.3, s * 0.08)
  // Cabin and rear window
  ctx.fillStyle = '#c42a3f'
  roundRect(-s * 0.3, -s * 0.38, s * 0.6, s * 0.24, s * 0.08)
  ctx.fillStyle = '#9fd8ff'
  roundRect(-s * 0.24, -s * 0.34, s * 0.48, s * 0.15, s * 0.05)
  // Spoiler
  ctx.fillStyle = '#222'
  roundRect(-s * 0.5, -s * 0.24, s, s * 0.06, s * 0.02)
  // Lights and exhausts
  ctx.fillStyle = '#ffdf5c'
  roundRect(-s * 0.42, -s * 0.1, s * 0.14, s * 0.07, s * 0.03)
  roundRect(s * 0.28, -s * 0.1, s * 0.14, s * 0.07, s * 0.03)
  ctx.fillStyle = '#888'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(side * s * 0.28, s * 0.1, s * 0.04, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawLightning(x: number, y: number, s: number) {
  ctx.save()
  ctx.strokeStyle = '#bff4ff'
  ctx.shadowColor = '#4fd2ff'
  ctx.shadowBlur = 16
  ctx.lineWidth = 3
  for (let n = 0; n < 3; n++) {
    let px = x + (Math.random() - 0.5) * s * 0.6
    let py = y + s * 0.1
    ctx.beginPath()
    ctx.moveTo(px, py)
    for (let i = 0; i < 6; i++) {
      px += (Math.random() - 0.5) * s * 0.25
      py += s * 0.07
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function roundRect(x: number, y: number, rw: number, rh: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, rw, rh, r)
  ctx.fill()
}

// ---- loop ----------------------------------------------------------------

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  update(dt)
  draw(now)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
}
