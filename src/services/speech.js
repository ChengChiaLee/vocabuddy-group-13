export function speechAvailable(scope = globalThis) {
  return Boolean(scope?.speechSynthesis && typeof scope.SpeechSynthesisUtterance === 'function');
}
export function selectEnglishVoice(voices = []) {
  if (!Array.isArray(voices)) return null;
  return (
    voices.find((voice) => /^en[-_]US$/i.test(voice.lang)) ||
    voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.lang)) ||
    null
  );
}
export function createSpeechController({ scope = globalThis, startTimeoutMs = 6000 } = {}) {
  let current = 0,
    timer;
  function cancel() {
    current++;
    clearTimeout(timer);
    try {
      if (speechAvailable(scope)) scope.speechSynthesis.cancel();
    } catch {
      /* Speech may be unavailable at the operating-system level. */
    }
  }
  function play(text, { rate = 0.85, onError = () => {}, onStatus = () => {} } = {}) {
    cancel();
    if (!speechAvailable(scope)) {
      onError('這個瀏覽器不支援英文語音，請改用拼字或四選一測驗。');
      return false;
    }
    const token = current;
    let utterance;
    try {
      utterance = new scope.SpeechSynthesisUtterance(text);
    } catch {
      onError('裝置暫時無法啟動英文語音，請改用其他測驗。');
      return false;
    }
    utterance.lang = 'en-US';
    utterance.rate = Math.min(1.5, Math.max(0.5, rate));
    let voices = [];
    try {
      voices = scope.speechSynthesis.getVoices();
    } catch {
      /* Fall back to the browser voice. */
    }
    const voice = selectEnglishVoice(voices);
    if (voice) utterance.voice = voice;
    else onStatus('未找到英文語音，先使用瀏覽器預設語音；若無聲音，可切換其他測驗。');
    utterance.onstart = () => {
      if (token === current) {
        clearTimeout(timer);
        onStatus('正在播放英文…');
      }
    };
    utterance.onend = () => {
      if (token === current) {
        clearTimeout(timer);
        onStatus('播放完成，可以再聽一次。');
      }
    };
    utterance.onerror = (event) => {
      if (token === current) {
        clearTimeout(timer);
        onError(
          ['canceled', 'interrupted'].includes(event.error)
            ? '播放已中斷，可以重新播放。'
            : '目前無法播放英文，請確認裝置語音設定，或改用其他測驗。',
        );
      }
    };
    timer = setTimeout(() => {
      if (token === current) {
        cancel();
        onError('語音尚未開始播放。請重新播放，或切換其他測驗。');
      }
    }, startTimeoutMs);
    try {
      scope.speechSynthesis.speak(utterance);
      return true;
    } catch {
      clearTimeout(timer);
      onError('目前無法播放英文，請改用其他測驗。');
      return false;
    }
  }
  return { play, cancel, available: () => speechAvailable(scope) };
}
export const speech = createSpeechController();
