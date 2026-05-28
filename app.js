const chatArea     = document.getElementById('chatArea');
const welcomeScreen= document.getElementById('welcomeScreen');
const messagesEl   = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn      = document.getElementById('sendBtn');
const attachBtn    = document.getElementById('attachBtn');
const fileInput    = document.getElementById('fileInput');
const resetBtn     = document.getElementById('resetBtn');
const resumeBanner = document.getElementById('resumeBanner');
const resumeFilename=document.getElementById('resumeFilename');
const clearResume  = document.getElementById('clearResume');
const headerTitle  = document.getElementById('headerTitle');
const headerSubtitle=document.getElementById('headerSubtitle');
const exportBtn    = document.getElementById('exportBtn');

let currentMode = 'chat';
let resumeText  = '';
let isLoading   = false;

const ATTACH_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

const modeInfo = {
  chat:   { title: 'Career Chatbot',   subtitle: 'Ask anything about your career, resume, or job search' },
  ats:    { title: 'ATS Analysis',     subtitle: 'Upload your resume to get an ATS score and optimization tips' },
  coach:  { title: 'Career Coach',     subtitle: 'Get personalized career roadmaps and professional guidance' },
  cover:  { title: 'Cover Letter',     subtitle: 'Write and improve cover letters for any job application' },
  resume: { title: 'Resume Review',    subtitle: 'Get expert feedback to strengthen your resume' },
  skills: { title: 'Skills Analysis',  subtitle: 'Identify skill gaps and build your learning roadmap' },
};

// ── NAV ──────────────────────────────────────────────
document.querySelectorAll('.nav-btn[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    const info = modeInfo[currentMode];
    headerTitle.textContent    = info.title;
    headerSubtitle.textContent = info.subtitle;
  });
});

// ── EXPORT ───────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  if (messagesEl.children.length === 0) {
    exportBtn.textContent = 'Nothing to export';
    setTimeout(() => {
      exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export`;
    }, 2000);
    return;
  }

  try {
    const res = await fetch('/api/export');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Export failed');
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="(.+?)"/);
    const filename = filenameMatch ? filenameMatch[1] : 'careermentor_chat.txt';

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    exportBtn.classList.add('success');
    exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Downloaded!`;
    setTimeout(() => {
      exportBtn.classList.remove('success');
      exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export`;
    }, 3000);
  } catch (e) {
    exportBtn.textContent = '❌ Failed';
    setTimeout(() => {
      exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export`;
    }, 2000);
  }
});

// ── RESET ─────────────────────────────────────────────
resetBtn.addEventListener('click', async () => {
  try { await fetch('/api/reset', { method: 'POST' }); } catch {}
  messagesEl.innerHTML = '';
  welcomeScreen.style.display = 'flex';
  resumeText = '';
  resumeBanner.style.display = 'none';
  attachBtn.classList.remove('has-file');
  attachBtn.innerHTML = ATTACH_ICON;
});

// ── QUICK ACTIONS ─────────────────────────────────────
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    messageInput.value = btn.dataset.msg;
    sendMessage();
  });
});

// ── FILE UPLOAD ───────────────────────────────────────
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  attachBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.text) {
      resumeText = data.text;
      resumeFilename.textContent = file.name;
      resumeBanner.style.display = 'flex';
      attachBtn.classList.add('has-file');
      attachBtn.innerHTML = ATTACH_ICON;
      addStaticMessage('bot', `✅ Resume **${file.name}** loaded! I can now analyze it. What would you like to know?`);
    } else {
      attachBtn.innerHTML = ATTACH_ICON;
      addStaticMessage('bot', `❌ Error: ${data.error || 'Could not read PDF'}`);
    }
  } catch {
    attachBtn.innerHTML = ATTACH_ICON;
    addStaticMessage('bot', '❌ Upload failed. Please try again.');
  }
  fileInput.value = '';
});

clearResume.addEventListener('click', () => {
  resumeText = '';
  resumeBanner.style.display = 'none';
  attachBtn.classList.remove('has-file');
});

// ── TEXTAREA AUTO-RESIZE ──────────────────────────────
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

// ── SEND MESSAGE (streaming) ──────────────────────────
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  welcomeScreen.style.display = 'none';
  addStaticMessage('user', text);
  messageInput.value = '';
  messageInput.style.height = 'auto';

  isLoading = true;
  sendBtn.disabled = true;

  let fullMessage = text;
  if (resumeText) fullMessage = `${text}\n\n[RESUME CONTENT]\n${resumeText}`;

  // Create bot bubble that will receive streamed text
  const { row, bubble } = createBotBubble();
  let accumulated = '';

  // Show blinking cursor while waiting for first chunk
  bubble.innerHTML = '<span class="stream-cursor"></span>';

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: fullMessage, mode: currentMode })
    });

    if (!res.ok) {
      bubble.innerHTML = formatText('❌ Server error. Please try again.');
      finishStream();
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break;
        try {
          const { chunk } = JSON.parse(raw);
          if (chunk) {
            accumulated += chunk;
            bubble.innerHTML = formatText(accumulated) + '<span class="stream-cursor"></span>';
            scrollToBottom();
          }
        } catch {}
      }
    }

    // Final render — remove cursor
    bubble.innerHTML = formatText(accumulated || '…');

  } catch (err) {
    bubble.innerHTML = formatText('❌ Network error. Please check your connection.');
  }

  finishStream();
}

function finishStream() {
  isLoading = false;
  sendBtn.disabled = false;
  messageInput.focus();
}

// ── DOM HELPERS ───────────────────────────────────────
const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;

function makeCopyBtn(getBubble) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.title = 'Copy response';
  btn.innerHTML = COPY_ICON;
  btn.addEventListener('click', () => {
    const bubble = getBubble();
    const plain = bubble.innerText || bubble.textContent || '';
    navigator.clipboard.writeText(plain).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      btn.title = 'Copy failed';
    });
  });
  return btn;
}

function createBotBubble() {
  const row = document.createElement('div');
  row.className = 'msg-row bot';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const copyBtn = makeCopyBtn(() => bubble);

  row.appendChild(avatar);
  row.appendChild(bubble);
  row.appendChild(copyBtn);
  messagesEl.appendChild(row);
  scrollToBottom();
  return { row, bubble };
}

function addStaticMessage(role, text) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'bot' ? '🤖' : 'YOU';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatText(text);

  row.appendChild(avatar);
  row.appendChild(bubble);

  if (role === 'bot') {
    const copyBtn = makeCopyBtn(() => bubble);
    row.appendChild(copyBtn);
  }

  messagesEl.appendChild(row);
  scrollToBottom();
  return row;
}

// ── FORMAT TEXT (simple markdown) ─────────────────────
function formatText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^# (.+)$/gm,   '<h3>$1</h3>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
