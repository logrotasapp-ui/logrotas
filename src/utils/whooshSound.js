/** Som curto de jato passando — Web Audio API (sem arquivo externo). */
export function playWhooshSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const duration = 0.22;

    const sampleCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const envelope = Math.sin(Math.PI * t);
      data[i] = (Math.random() * 2 - 1) * envelope * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3800, t0);
    filter.frequency.exponentialRampToValueAtTime(320, t0 + duration);
    filter.Q.value = 1.4;

    const tone = ctx.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.setValueAtTime(220, t0);
    tone.frequency.exponentialRampToValueAtTime(55, t0 + duration);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, t0);
    toneGain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.018);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.1, t0 + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    noise.connect(filter);
    filter.connect(master);
    tone.connect(toneGain);
    toneGain.connect(master);
    master.connect(ctx.destination);

    noise.start(t0);
    tone.start(t0);
    noise.stop(t0 + duration);
    tone.stop(t0 + duration);
    noise.onended = () => ctx.close();
  } catch {
    /* áudio indisponível — ignorar */
  }
}
