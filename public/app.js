// Call Center AI Copilot Frontend Logic

let isElectron = false;
let ipcRenderer = null;

try {
  if (window.require) {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
    isElectron = true;
  }
} catch (e) {
  isElectron = false;
}

// DOM Elements
const bubble = document.getElementById('floating-bubble');
const chatPanel = document.getElementById('chat-panel');
const btnCollapse = document.getElementById('btn-collapse');
const btnKb = document.getElementById('btn-kb');
const btnSettings = document.getElementById('btn-settings');
const chatForm = document.getElementById('chat-form');
const queryInput = document.getElementById('query-input');
const btnClear = document.getElementById('btn-clear-input');
const chatMessages = document.getElementById('chat-messages');
const kbSummary = document.getElementById('kb-summary');
const responseMetric = document.getElementById('response-metric');
const toast = document.getElementById('toast');

// Modals
const modalKb = document.getElementById('modal-kb');
const btnCloseKb = document.getElementById('btn-close-kb');
const kbDocList = document.getElementById('kb-doc-list');
const btnAddDoc = document.getElementById('btn-add-doc');
const newDocTitle = document.getElementById('new-doc-title');
const newDocContent = document.getElementById('new-doc-content');

const modalSettings = document.getElementById('modal-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingApiKey = document.getElementById('setting-api-key');
const settingModel = document.getElementById('setting-model');
const btnSaveSettings = document.getElementById('btn-save-settings');

// State
let isExpanded = false;

// 1. WINDOW TOGGLE & DRAG HANDLING
function setExpanded(expand) {
  isExpanded = expand;
  if (expand) {
    bubble.classList.remove('visible');
    bubble.classList.add('hidden');
    chatPanel.classList.remove('hidden');
    chatPanel.classList.add('visible');
    setTimeout(() => queryInput.focus(), 150);
  } else {
    chatPanel.classList.remove('visible');
    chatPanel.classList.add('hidden');
    bubble.classList.remove('hidden');
    bubble.classList.add('visible');
  }

  if (isElectron && ipcRenderer) {
    ipcRenderer.send('set-expanded', expand);
  }
}

bubble.addEventListener('click', () => {
  setExpanded(true);
});

btnCollapse.addEventListener('click', () => {
  setExpanded(false);
});

if (isElectron && ipcRenderer) {
  ipcRenderer.on('window-mode-changed', (event, data) => {
    if (data.expanded) {
      bubble.classList.remove('visible');
      bubble.classList.add('hidden');
      chatPanel.classList.remove('hidden');
      chatPanel.classList.add('visible');
      setTimeout(() => queryInput.focus(), 150);
    } else {
      chatPanel.classList.remove('visible');
      chatPanel.classList.add('hidden');
      bubble.classList.remove('hidden');
      bubble.classList.add('visible');
    }
  });

  // Custom smooth drag for bubble
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  bubble.addEventListener('mousedown', (e) => {
    if (e.target.closest('.bubble-drag-handle') || e.button === 0) {
      isDragging = true;
      startX = e.screenX;
      startY = e.screenY;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.screenX - startX;
      const deltaY = e.screenY - startY;
      startX = e.screenX;
      startY = e.screenY;
      ipcRenderer.send('move-window', { deltaX, deltaY });
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// 2. CHAT & QUERY LOGIC
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  // Clear input
  queryInput.value = '';
  btnClear.classList.add('hidden');

  // Add User Message
  appendUserMessage(query);

  // Add Typing Indicator
  const typingElem = showTypingIndicator();

  const startTime = performance.now();

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    typingElem.remove();

    const elapsed = Math.round(performance.now() - startTime);
    responseMetric.textContent = `⚡ Latency: ${data.latencyMs || elapsed}ms (${data.usedAI ? 'Gemini AI' : 'Local KB Index'})`;

    appendBotMessage(data);
  } catch (err) {
    typingElem.remove();
    appendBotMessage({
      answer: `❌ Error querying knowledge base: ${err.message}`,
      sources: []
    });
  }
});

queryInput.addEventListener('input', () => {
  if (queryInput.value.length > 0) {
    btnClear.classList.remove('hidden');
  } else {
    btnClear.classList.add('hidden');
  }
});

btnClear.addEventListener('click', () => {
  queryInput.value = '';
  btnClear.classList.add('hidden');
  queryInput.focus();
});

// Quick suggestion chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.getAttribute('data-q');
    queryInput.value = q;
    chatForm.dispatchEvent(new Event('submit'));
  });
});

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(row);
  scrollToBottom();
}

function appendBotMessage(data) {
  const row = document.createElement('div');
  row.className = 'msg-row bot';

  const htmlAnswer = formatMarkdown(data.answer);

  row.innerHTML = `
    <div class="msg-bubble">${htmlAnswer}</div>
    <div class="msg-actions">
      <button class="btn-copy" onclick="copyToClipboard(this)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      </button>
    </div>
  `;

  chatMessages.appendChild(row);
  scrollToBottom();
}

function showTypingIndicator() {
  const elem = document.createElement('div');
  elem.className = 'typing-indicator';
  elem.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatMessages.appendChild(elem);
  scrollToBottom();
  return elem;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 3. COPY TO CLIPBOARD
window.copyToClipboard = function(button) {
  const bubble = button.closest('.msg-row').querySelector('.msg-bubble');
  const text = bubble.innerText;

  navigator.clipboard.writeText(text).then(() => {
    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span style="color:#10b981">Copied!</span>
    `;
    showToast('Copied to clipboard!');
    setTimeout(() => {
      button.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy Script</span>
      `;
    }, 2000);
  });
};

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

// 4. KNOWLEDGE BASE STATS & MANAGER
async function loadKnowledgeBase() {
  try {
    const res = await fetch('/api/knowledge');
    const data = await res.json();
    kbSummary.textContent = `${data.documents.length} Docs (${data.totalChunks} Chunks Active)`;

    // Render in modal
    kbDocList.innerHTML = '';
    if (data.documents.length === 0) {
      kbDocList.innerHTML = '<p style="color:#94a3b8; font-size:12px;">No documents yet. Add one below.</p>';
    } else {
      data.documents.forEach(doc => {
        const item = document.createElement('div');
        item.className = 'kb-doc-item';
        const sizeKb = Math.round(doc.size / 1024);
        item.innerHTML = `
          <div>
            <div class="kb-doc-title">📄 ${escapeHtml(doc.filename)}</div>
            <div style="color:#64748b; font-size:10px;">${sizeKb} KB</div>
          </div>
          <button class="btn-del-doc" onclick="deleteDoc('${escapeHtml(doc.filename)}')">Delete</button>
        `;
        kbDocList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Error loading knowledge stats:', err);
  }
}

btnKb.addEventListener('click', () => {
  loadKnowledgeBase();
  modalKb.classList.remove('hidden');
});

btnCloseKb.addEventListener('click', () => {
  modalKb.classList.add('hidden');
});

btnAddDoc.addEventListener('click', async () => {
  const title = newDocTitle.value.trim();
  const content = newDocContent.value.trim();
  if (!title || !content) {
    alert('Please enter document filename and content');
    return;
  }

  try {
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: title, content })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Document added & indexed!');
      newDocTitle.value = '';
      newDocContent.value = '';
      loadKnowledgeBase();
    }
  } catch (err) {
    alert('Failed to add document: ' + err.message);
  }
});

window.deleteDoc = async function(filename) {
  if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
  try {
    const res = await fetch(`/api/knowledge/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      showToast('Deleted document');
      loadKnowledgeBase();
    }
  } catch (err) {
    alert('Error deleting: ' + err.message);
  }
};

// 5. SETTINGS (GEMINI API KEY)
async function loadSettings() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hasApiKey) {
      settingApiKey.placeholder = `Configured: ${data.maskedKey}`;
    }
    if (data.model) {
      settingModel.value = data.model;
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

btnSettings.addEventListener('click', () => {
  loadSettings();
  modalSettings.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  modalSettings.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', async () => {
  const apiKey = settingApiKey.value.trim();
  const model = settingModel.value;

  const payload = { model };
  if (apiKey) payload.geminiApiKey = apiKey;

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved!');
      modalSettings.classList.add('hidden');
      settingApiKey.value = '';
    }
  } catch (err) {
    alert('Error saving settings: ' + err.message);
  }
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === modalKb) modalKb.classList.add('hidden');
  if (e.target === modalSettings) modalSettings.classList.add('hidden');
});

// Markdown parser helper
function formatMarkdown(text) {
  if (!text) return '';
  let md = escapeHtml(text);

  // Bold
  md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  md = md.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code inline
  md = md.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px; font-family:monospace;">$1</code>');
  // Quotes / Customer Script
  md = md.replace(/^>\s*(.*?)$/gm, '<blockquote>$1</blockquote>');
  // Bullet lists
  md = md.replace(/^[*-]\s+(.*?)$/gm, '<li>$1</li>');
  md = md.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Linebreaks
  md = md.replace(/\n\n/g, '<p></p>');
  md = md.replace(/\n/g, '<br/>');

  return md;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check Agent Mode (hides admin buttons for 500 call center agents)
function checkAgentMode() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'agent' || window.location.pathname.includes('agent')) {
    if (btnKb) btnKb.style.display = 'none';
    if (btnSettings) btnSettings.style.display = 'none';
  }
}
checkAgentMode();

// Initial load
loadKnowledgeBase();

