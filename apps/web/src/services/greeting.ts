// Require an installed local Japanese voice: never choose a remote voice.
export function playGreeting(text: string, volume: number, onFailure: () => void): () => void {
  if (!('speechSynthesis' in window)) { onFailure(); return () => {}; }
  const synth = window.speechSynthesis;
  const voice = synth.getVoices().find(v => v.localService && v.lang.toLowerCase().startsWith('ja'));
  if (!voice) { onFailure(); return () => {}; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = 'ja-JP';
  utterance.rate = 0.85;
  utterance.volume = volume;
  utterance.onerror = event => { if (event.error !== 'canceled' && event.error !== 'interrupted') onFailure(); };
  synth.cancel();
  synth.speak(utterance);
  return () => { utterance.onerror = null; synth.cancel(); };
}
