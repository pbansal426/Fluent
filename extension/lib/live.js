// Live conversation: one microphone stream kept open for the whole session, so the user can talk over
// the assistant at any moment without tapping anything. Only the detection of "the user started talking"
// lives here; speech-to-text itself is still Chrome's recogniser (speech.js).

// Pure detector: feed it a loudness reading and a time; it says once when real talking started.
//  - Loudness must stay above the threshold for `holdMs` (a click or cough is not talking).
//  - The threshold follows the room: a few times the quietest level recently heard.
//  - While the assistant is speaking, the first moments are used to learn how loud the assistant itself is
//    at the microphone (speaker echo), and the user has to be clearly louder than that.
//  - desensitize() makes it less eager after a false trigger, so no settings are needed.
export function createVoiceDetector({ holdMs = 180, minThreshold = 0.03, learnMs = 600, echoMargin = 1.7 } = {}) {
  const FACTOR = 3.5;
  let floor = 0.01;
  let since = null;
  let fired = false;
  let armedAt = null;
  let echoPeak = 0;
  let boost = 1;
  return {
    arm(now) {
      armedAt = now;
      echoPeak = 0;
      since = null;
      fired = false;
    },
    disarm() {
      armedAt = null;
      echoPeak = 0;
      since = null;
      fired = false;
    },
    desensitize() {
      boost = Math.min(boost * 1.4, 4);
    },
    // returns true once per stretch of talking, when it has lasted long enough
    feed(level, now) {
      const learning = armedAt != null && now - armedAt < learnMs;
      const threshold = Math.max(minThreshold * boost, floor * FACTOR, echoPeak * echoMargin);
      if (learning) {
        // Whatever the microphone hears now is mostly the assistant's own voice.
        echoPeak = Math.max(echoPeak, level * 0.9);
        since = null;
        return false;
      }
      if (level < threshold) {
        if (armedAt == null) floor = floor * 0.95 + level * 0.05; // follow the room's noise, slowly
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
  };
}

// Opens the mic once (with echo cancellation, so the assistant's own voice counts for less) and calls
// onVoice() when the user starts talking while armed (the assistant is speaking).
export function createLive({ onVoice } = {}) {
  let stream = null;
  let ctx = null;
  let timer = null;
  let armed = false;
  const detector = createVoiceDetector();

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
      if (armed) detector.arm(performance.now());
      else detector.disarm();
    },
    desensitize: () => detector.desensitize(),
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
