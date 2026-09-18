// Phase 1.1 proof-of-concept: browser-native TTS/STT widget.
// Opt-in per element via <div class="voice-widget" data-text="..." data-lang="en-US">.
// No build step, no server round-trip — uses the Web Speech API directly.
(function () {
  function speak(text, lang, onStatus) {
    if (!('speechSynthesis' in window)) {
      onStatus('(text-to-speech not supported in this browser)');
      return;
    }
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      onStatus('(no speech voices available in this browser — 0 from speechSynthesis.getVoices())');
    }
    const utter = new SpeechSynthesisUtterance(text);
    if (lang) utter.lang = lang;
    utter.onstart = () => onStatus('speaking…');
    utter.onend = () => onStatus('done.');
    utter.onerror = (e) => onStatus('(tts error: ' + e.error + ')');
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  }

  function listen(lang, onResult) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onResult('(speech-to-text not supported in this browser — try Chrome or Edge)');
      return;
    }
    const rec = new SR();
    rec.lang = lang || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onResult(e.results[0][0].transcript);
    rec.onerror = (e) => onResult('(error: ' + e.error + ')');
    rec.start();
  }

  function init() {
    document.querySelectorAll('.voice-widget').forEach((el) => {
      if (el.dataset.voiceInit) return;
      el.dataset.voiceInit = '1';

      const text = el.dataset.text || el.textContent.trim();
      const lang = el.dataset.lang || 'en-US';

      const bar = document.createElement('div');
      bar.className = 'voice-widget-bar';

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.textContent = '🔊 Listen';
      playBtn.onclick = () => speak(text, lang, (msg) => { result.textContent = msg; });

      const recBtn = document.createElement('button');
      recBtn.type = 'button';
      recBtn.textContent = '🎙️ Try it';

      const result = document.createElement('span');
      result.className = 'voice-widget-result';

      recBtn.onclick = () => {
        result.textContent = 'Listening…';
        listen(lang, (transcript) => {
          result.textContent = 'You said: ' + transcript;
        });
      };

      bar.appendChild(playBtn);
      bar.appendChild(recBtn);
      bar.appendChild(result);
      el.appendChild(bar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
