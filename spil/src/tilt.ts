// Steering from device tilt. Uses gravity from `devicemotion`, rotated into the screen's
// horizontal axis, so it works however the iPad is held in landscape — upright like a
// steering wheel or flat on the lap.

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> }

const FULL_LOCK = 4 // m/s² of sideways gravity (≈ 25° tilt) gives full steering
const DEADZONE = 0.06
const INVERT_KEY = 'spil.tilt.invert'

export class Tilt {
  /** Gravity along the screen's x axis, m/s². */
  raw = 0
  neutral = 0
  supported = false
  invert = readInvert()

  /** Must be called from a tap — iOS only shows the permission prompt on a user gesture. */
  async enable(): Promise<boolean> {
    const api = (globalThis.DeviceMotionEvent as unknown as PermissionApi) ?? {}
    if (typeof api.requestPermission === 'function') {
      try {
        if ((await api.requestPermission()) !== 'granted') return false
      } catch {
        return false
      }
    }
    if (!('DeviceMotionEvent' in globalThis)) return false
    window.addEventListener('devicemotion', this.onMotion)
    return true
  }

  calibrate() {
    this.neutral = this.raw
  }

  toggleInvert() {
    this.invert = !this.invert
    try {
      localStorage.setItem(INVERT_KEY, this.invert ? '1' : '0')
    } catch {
      // Private mode or blocked storage: the setting just won't stick.
    }
  }

  /** Steering in −1 (left) … 1 (right). */
  get steer(): number {
    let v = (this.raw - this.neutral) / FULL_LOCK
    if (this.invert) v = -v
    if (Math.abs(v) < DEADZONE) return 0
    return Math.max(-1, Math.min(1, v))
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity
    if (!g || g.x == null || g.y == null) return
    this.supported = true
    const a = (screenAngle() * Math.PI) / 180
    const sx = g.x * Math.cos(a) + g.y * Math.sin(a)
    // Light smoothing so the car doesn't jitter.
    this.raw += (sx - this.raw) * 0.35
  }
}

function screenAngle(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle
  return Number((window as unknown as { orientation?: number }).orientation ?? 0)
}

function readInvert(): boolean {
  try {
    return localStorage.getItem(INVERT_KEY) === '1'
  } catch {
    return false
  }
}
