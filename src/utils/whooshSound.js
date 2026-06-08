/** Som curto de jato passando — Web Audio API (sem arquivo externo). */
export function playWhooshSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const duration = 0.7;
    const attack = 0.045;
    const toneAttack = 0.055;

    const sampleCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const envelope = Math.sin(Math.PI * t);
      data[i] = (Math.random() * 2 - 1) * envelope * envelope * 1.15;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(4200, t0);
    filter.frequency.exponentialRampToValueAtTime(280, t0 + duration);
    filter.Q.value = 1.2;

    const tone = ctx.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.setValueAtTime(260, t0);
    tone.frequency.exponentialRampToValueAtTime(48, t0 + duration);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, t0);
    toneGain.gain.exponentialRampToValueAtTime(0.048, t0 + toneAttack);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.13, t0 + attack);
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
