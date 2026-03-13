const rawTextInput = document.getElementById('raw-text');
const triggerInput = document.getElementById('trigger');
const ingestBtn = document.getElementById('ingest-btn');
const clearBtn = document.getElementById('clear-btn');
const themesLine = document.getElementById('themes-line');
const toneLine = document.getElementById('tone-line');
const phrasesLine = document.getElementById('phrases-line');
const statusLine = document.getElementById('status');

function setResult(result) {
  const themes = Array.isArray(result?.themes) && result.themes.length ? result.themes.join(', ') : 'none';
  const tone = result?.tone || 'unknown';
  const phrases = Array.isArray(result?.phrases) && result.phrases.length ? result.phrases.join(' | ') : 'none';

  themesLine.textContent = `✔ themes extracted: ${themes}`;
  toneLine.textContent = `✔ tone detected: ${tone}`;
  phrasesLine.textContent = `✔ phrases saved: ${phrases}`;
}

async function ingestHistoricalText(rawText, trigger) {
  if (typeof window.ingestHistoricalText === 'function') {
    return window.ingestHistoricalText(rawText, trigger);
  }

  const response = await fetch('/api/historical-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, trigger }),
  });

  if (!response.ok) {
    throw new Error(`Ingest failed (${response.status})`);
  }

  return response.json();
}

async function handleIngest() {
  const rawText = rawTextInput.value.trim();
  const trigger = triggerInput.value;

  if (!rawText) {
    statusLine.textContent = 'Please paste text before ingesting.';
    return;
  }

  statusLine.textContent = 'Ingesting...';

  try {
    const result = await ingestHistoricalText(rawText, trigger);
    setResult(result);
    statusLine.textContent = `Saved under trigger "${result.trigger || trigger}".`;
  } catch (error) {
    statusLine.textContent = error.message || 'Unable to ingest text.';
  }
}

function clearForm() {
  rawTextInput.value = '';
  triggerInput.value = 'general';
  setResult({ themes: [], tone: '', phrases: [] });
  statusLine.textContent = 'Cleared.';
}

ingestBtn.addEventListener('click', handleIngest);
clearBtn.addEventListener('click', clearForm);
