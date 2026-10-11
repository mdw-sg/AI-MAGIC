// All sound is synthesized with Web Audio (no files to download), and speech uses the
// iPad's built-in Danish voice. `unlock()` must run inside a tap (click) on iOS.

let ac: AudioContext | null = null
let master: GainNode
let engineGain: GainNode
let engineOscs: OscillatorNode[] = []

export const audio = {
  unlock() {
    if (ac) {
      void ac.resume()
      return
    }
    ac = new AudioContext()
    void ac.resume()
    master = ac.createGain()
    master.gain.value = 0.8
    master.connect(ac.destination)

    engineGain = ac.createGain()
    engineGain.gain.value = 0
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.connect(engineGain).connect(master)
    for (const type of ['sawtooth', 'square'] as const) {
      const o = ac.createOscillator()
      o.type = type
      o.frequency.value = 50
      const g = ac.createGain()
      g.gain.value = type === 'square' ? 0.3 : 1
      o.connect(g).connect(filter)
      o.start()
      engineOscs.push(o)
    }
    // Speaking an empty phrase inside the tap unlocks speech on iOS.
    speak('')
  },

  /** Engine hum; speed 0…1.5, on=false silences it. */
  engine(speed: number, on: boolean) {
    if (!ac) return
    const t = ac.currentTime
    engineGain.gain.setTargetAtTime(on ? 0.06 : 0, t, 0.15)
    engineOscs[0].frequency.setTargetAtTime(45 + speed * 70, t, 0.1)
    engineOscs[1].frequency.setTargetAtTime(45.5 + speed * 70, t, 0.1)
  },

  whoosh() {
    if (!ac) return
    const t = ac.currentTime
    const src = ac.createBufferSource()
    src.buffer = noise(1.4)
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.5
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(3500, t + 0.5)
    bp.frequency.exponentialRampToValueAtTime(500, t + 1.4)
    const g = ac.createGain()
    g.gain.value = 0.6
    src.connect(bp).connect(g).connect(master)
    src.start()
    tone(110, 0.6, 'sawtooth', 0.12, 220)
  },

  bump() {
    if (!ac) return
    const src = ac.createBufferSource()
    src.buffer = noise(0.25)
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400
    const g = ac.createGain()
    g.gain.value = 0.7
    src.connect(lp).connect(g).connect(master)
    src.start()
  },

  /** Driving into lava: a soft "puf" of smoke. */
  puff() {
    if (!ac) return
    const src = ac.createBufferSource()
    src.buffer = noise(0.6)
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1200, ac.currentTime)
    lp.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.6)
    const g = ac.createGain()
    g.gain.value = 0.8
    src.connect(lp).connect(g).connect(master)
    src.start()
    tone(300, 0.5, 'sine', 0.2, 80)
  },

  /** Rising whistle when taking off from a ramp. */
  jump() {
    tone(300, 0.5, 'triangle', 0.18, 900)
  },

  /** Falling whistle when dropping into a hole. */
  fall() {
    tone(1000, 0.6, 'triangle', 0.18, 150)
  },

  land() {
    tone(90, 0.3, 'sine', 0.35, 45)
    audio.bump()
  },

  coin() {
    tone(988, 0.08, 'square', 0.1)
    setTimeout(() => tone(1319, 0.25, 'square', 0.1), 70)
  },

  /** The shield bouncing the car back onto the road. */
  boing() {
    tone(180, 0.35, 'sine', 0.35, 620)
  },

  /** Countdown beep: low for 3-2-1, high for go. */
  beep(go = false) {
    tone(go ? 880 : 440, go ? 0.6 : 0.25, 'square', 0.15)
  },

  ding() {
    tone(1046, 0.5, 'triangle', 0.25)
    setTimeout(() => tone(1318, 0.7, 'triangle', 0.25), 150)
  },

  fanfare() {
    const notes = [523, 659, 784, 1046, 784, 1046]
    notes.forEach((f, i) => setTimeout(() => tone(f, i === notes.length - 1 ? 0.9 : 0.2, 'square', 0.12), i * 140))
  },

  speak,
}

function speak(text: string) {
  const synth = globalThis.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'da-DK'
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('da'))
  if (voice) u.voice = voice
  u.rate = 1.05
  u.pitch = 1.1
  u.volume = text ? 1 : 0
  synth.speak(u)
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, endFreq?: number) {
  if (!ac) return
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur)
}

function noise(seconds: number) {
  const len = Math.floor(ac!.sampleRate * seconds)
  const buf = ac!.createBuffer(1, len, ac!.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  return buf
}
