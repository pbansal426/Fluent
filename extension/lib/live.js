// Live conversation: one microphone stream kept open for the whole session, so the user can talk over
// the assistant without tapping anything. Only the detection of "the user started talking" lives here;
// speech-to-text itself is still Chrome's recogniser (speech.js).

// Pure detector: feed it a loudness reading and a time; it says when real talking started.
// Loudness must stay above the threshold for `holdMs` (so a click or cough is not talking), and the
// threshold adapts to the room: a few times the quietest level recently heard.
export function createVoiceDetector({ sensitivity = 'normal', holdMs = 260, minThreshold = 0.035 } = {}) {
  const factor = { low: 5, normal: 3.5, high: 2.5 }[sensitivity] || 3.5;
  let floor = 0.01;
  let since = null;
  let fired = false;
  return {
    // returns true once per stretch of talking, when it has lasted long enough; false otherwise
    feed(level, now) {
      const threshold = Math.max(minThreshold, floor * factor);
      if (level < threshold) {
        floor = floor * 0.95 + level * 0.05; // follow the room's noise, slowly
        since = null;
        fired = false;
        return false;
      }
      if (since == null) since = now;
      if (!fired && now - since >= holdMs) {
        fired = true;
        return true;
      }
      return false;
    },
    reset() {
      since = null;
      fired = false;
    },
  };
}

// Opens the mic once (with echo cancellation, so the assistant's own voice counts for less) and calls
// onVoice() when the user starts talking while the detector is armed.
export function createLive({ onVoice, sensitivity = 'normal' } = {}) {
  let stream = null;
  let ctx = null;
  let timer = null;
  let armed = false;
  let detector = createVoiceDetector({ sensitivity });

  async function open() {
    if (stream?.active) return true;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const level = Math.sqrt(sum / buf.length);
      // Keep learning the room's noise even while disarmed, but only act when armed.
      if (detector.feed(level, performance.now()) && armed) onVoice?.();
    }, 40);
    return true;
  }

  return {
    open,
    get active() {
      return !!stream?.active;
    },
    arm(on) {
      armed = !!on;
      detector.reset();
    },
    setSensitivity(s) {
      detector = createVoiceDetector({ sensitivity: s });
    },
    close() {
      armed = false;
      clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
