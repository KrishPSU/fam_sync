// Client for the read-only AI assistant. Talks to the backend over the shared
// `socket` (created in main.js) — all model calls happen server-side. Sends only
// lightweight on-screen context; the server loads the actual data under RLS.

const aiForm = document.getElementById('aiForm');
const aiInput = document.getElementById('aiInput');
const aiMessages = document.querySelector('.ai-messages');
const aiSubmitBtn = aiForm ? aiForm.querySelector('button[type="submit"]') : null;

// One conversation per page session (history is kept in-memory on the server).
const aiConversationId =
  (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());

let aiPending = false;

function aiEscape(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

// The welcome splash fills the panel; drop it once a real conversation starts.
function clearWelcome() {
  const welcome = aiMessages && aiMessages.querySelector('.ai-welcome');
  if (welcome) welcome.remove();
}

function aiScrollToBottom() {
  if (aiMessages) aiMessages.scrollTop = aiMessages.scrollHeight;
}

function appendBubble(role, text) {
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  el.innerHTML = aiEscape(text);
  aiMessages.appendChild(el);
  aiScrollToBottom();
  return el;
}

function appendLoader() {
  const el = document.createElement('div');
  el.className = 'ai-msg assistant ai-loading';
  el.innerHTML = '<span></span><span></span><span></span>';
  aiMessages.appendChild(el);
  aiScrollToBottom();
  return el;
}

function appendCitations(citations) {
  if (!citations || citations.length === 0) return;
  const names = citations.map(c => c.name).filter(Boolean);
  if (names.length === 0) return;
  const el = document.createElement('div');
  el.className = 'ai-citations';
  el.innerHTML = 'Sources: ' + names.map(aiEscape).join(', ');
  aiMessages.appendChild(el);
  aiScrollToBottom();
}

function setAiPending(pending) {
  aiPending = pending;
  if (aiInput) aiInput.disabled = pending;
  if (aiSubmitBtn) aiSubmitBtn.disabled = pending;
}

// Lightweight, non-authoritative context about what's on screen right now.
function collectClientContext() {
  let weatherText = '';
  const box = document.getElementById('weatherBox');
  if (box) {
    const t = box.textContent.trim();
    if (t && t !== 'Loading..' && t !== 'Unable to load weather.') weatherText = t;
  }
  const activeBtn = document.querySelector('.pages-buttons button.active');
  return {
    weatherText,
    activePage: activeBtn ? activeBtn.textContent.trim() : '',
    // Dark mode is a device preference (localStorage), so the server can't see
    // it — send it here so the assistant can answer "is dark mode on?".
    darkMode: document.body.classList.contains('dark-mode'),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}

if (aiForm) {
  aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (aiPending) return;
    const message = aiInput.value.trim();
    if (!message) return;

    clearWelcome();
    appendBubble('user', message);
    aiInput.value = '';
    setAiPending(true);
    aiForm._loader = appendLoader();

    socket.emit('ai:ask', {
      message,
      conversationId: aiConversationId,
      clientContext: collectClientContext(),
    });
  });
}

socket.on('ai:answer', ({ answer, citations }) => {
  if (aiForm._loader) { aiForm._loader.remove(); aiForm._loader = null; }
  appendBubble('assistant', answer);
  appendCitations(citations);
  setAiPending(false);
  if (aiInput) aiInput.focus();
});

socket.on('ai:error', ({ message }) => {
  if (aiForm._loader) { aiForm._loader.remove(); aiForm._loader = null; }
  const el = appendBubble('assistant', message || 'Something went wrong.');
  el.classList.add('ai-error');
  setAiPending(false);
});
