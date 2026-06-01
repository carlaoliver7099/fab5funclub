// ===== Fab 5 Fun Club - Frontend =====
let CLUB = null;
let EVENTS = [];
let CALENDAR_DATE = new Date();
CALENDAR_DATE.setDate(1);
let CHAT_HISTORY = []; // [{role, content}]

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed: ' + res.status));
  return data;
}

// ---------- AUTH FLOW ----------
async function checkAuth() {
  try {
    const me = await api('/api/me');
    if (me.authed) {
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  $('#login-screen').style.display = 'flex';
  $('#main-app').style.display = 'none';
  setTimeout(() => $('#login-password')?.focus(), 100);
}

function showApp() {
  $('#login-screen').style.display = 'none';
  $('#main-app').style.display = 'block';
  initApp();
}

function setupLogin() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#login-password').value;
    const msg = $('#login-msg');
    msg.textContent = 'Sniffing your password... 🐾';
    msg.className = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: pw } });
      msg.textContent = '🎉 Welcome to the pack!';
      setTimeout(showApp, 400);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'error';
      $('#login-password').value = '';
    }
  });
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  CLUB = null; EVENTS = []; CHAT_HISTORY = [];
  showLogin();
}

// ---------- INITIAL APP LOAD (after auth) ----------
async function initApp() {
  try {
    const info = await api('/api/club-info');
    CLUB = info;
    renderMembers();
    renderActivities();
    fillActivityDropdown();
    fillMemberCheckboxes();
    setupForm();
    setupCalendarNav();
    setupPebblesChat();
    $('#logout-btn').addEventListener('click', logout);

    const data = await api('/api/events');
    EVENTS = data.events;
    renderCalendar();
    renderEventsList();
  } catch (e) {
    console.error('Init failed:', e);
    if (String(e.message).toLowerCase().includes('log in')) showLogin();
  }
}

// ---------- MEMBERS ----------
function renderMembers() {
  const grid = $('#members-grid');
  grid.innerHTML = CLUB.members.map(m => {
    const isPebbles = m.name === 'Pebbles';
    const emojiHtml = isPebbles
      ? `<span class="member-emoji pebbles-pic" style="background:${m.color}"><img src="/static/pebbles.png" alt="Pebbles" /></span>`
      : `<span class="member-emoji" style="background:${m.color}">${m.emoji}</span>`;
    return `
      <div class="member-card ${isPebbles ? 'mascot' : ''}" style="background: linear-gradient(180deg, white 60%, ${m.color})">
        ${emojiHtml}
        <div class="member-name">${m.name}</div>
        <div class="member-role">${m.role}</div>
      </div>
    `;
  }).join('');
}

// ---------- ACTIVITIES ----------
let ACTIVITY_FILTER = 'All';
function renderActivities() {
  const cats = ['All', ...new Set(CLUB.activities.map(a => a.category))];
  $('#activity-filters').innerHTML = cats.map(c =>
    `<button class="filter-btn ${c === ACTIVITY_FILTER ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVITY_FILTER = btn.dataset.cat;
      renderActivities();
    });
  });

  const list = ACTIVITY_FILTER === 'All'
    ? CLUB.activities
    : CLUB.activities.filter(a => a.category === ACTIVITY_FILTER);

  $('#activities-grid').innerHTML = list.map(a => `
    <div class="activity-card" data-cat="${a.category}" data-name="${a.name}">
      <span class="emoji">${a.emoji}</span>
      <div class="name">${a.name}</div>
      <span class="cat">${a.category}</span>
    </div>
  `).join('');

  $$('.activity-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.name;
      $('#evt-activity').value = name;
      $('#evt-title').focus();
      $('#add-event').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function fillActivityDropdown() {
  const sel = $('#evt-activity');
  sel.innerHTML = '<option value="">— Pick an activity —</option>' +
    CLUB.activities.map(a => `<option value="${a.name}">${a.emoji} ${a.name}</option>`).join('');
}

function fillMemberCheckboxes() {
  const box = $('#members-checks');
  // Exclude Pebbles from "who's coming" (she's everywhere in spirit 🐾)
  const humanMembers = CLUB.members.filter(m => m.name !== 'Pebbles');
  box.innerHTML = humanMembers.map(m => `
    <label class="member-check" data-name="${m.name}">
      <input type="checkbox" value="${m.name}" />
      ${m.emoji} ${m.name}
    </label>
  `).join('');
  $$('.member-check').forEach(lbl => {
    const cb = lbl.querySelector('input');
    lbl.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
      lbl.classList.toggle('checked', cb.checked);
    });
  });
}

// ---------- CALENDAR ----------
function setupCalendarNav() {
  $('#prev-month').addEventListener('click', () => {
    CALENDAR_DATE.setMonth(CALENDAR_DATE.getMonth() - 1);
    renderCalendar();
  });
  $('#next-month').addEventListener('click', () => {
    CALENDAR_DATE.setMonth(CALENDAR_DATE.getMonth() + 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const year = CALENDAR_DATE.getFullYear();
  const month = CALENDAR_DATE.getMonth();
  $('#month-label').textContent = CALENDAR_DATE.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(d => `<div class="cal-header">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(year, month, d).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const evs = EVENTS.filter(e => e.date === dateStr);
    const classes = [
      'cal-cell',
      isWeekend ? 'weekend' : '',
      evs.length ? 'has-event' : '',
      dateStr === todayStr ? 'today' : ''
    ].filter(Boolean).join(' ');
    cells += `<div class="${classes}" data-date="${dateStr}">
      <span class="cal-day-num">${d}</span>
      ${evs.slice(0, 2).map(e => `<span class="cal-event-dot" title="${e.title}">${e.title.slice(0, 12)}</span>`).join('')}
      ${evs.length > 2 ? `<span class="cal-event-dot">+${evs.length - 2}</span>` : ''}
    </div>`;
  }

  $('#calendar-grid').innerHTML = headers + cells;

  $$('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const d = new Date(date + 'T12:00:00').getDay();
      if (d === 0 || d === 6) {
        $('#evt-date').value = date;
        $('#add-event').scrollIntoView({ behavior: 'smooth' });
        $('#evt-title').focus();
      } else {
        flashMsg('Pick a Saturday or Sunday — that\'s when we adventure!', 'error');
      }
    });
  });
}

// ---------- EVENTS LIST ----------
function renderEventsList() {
  const upcoming = EVENTS
    .filter(e => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!upcoming.length) {
    $('#events-list').innerHTML = `<div class="loading">No upcoming adventures yet — add one below or ask Pebbles! 🐾</div>`;
    return;
  }

  $('#events-list').innerHTML = upcoming.map(e => {
    const dt = new Date(e.date + 'T12:00:00');
    const month = dt.toLocaleString('en-AU', { month: 'short' });
    const day = dt.getDate();
    const weekday = dt.toLocaleString('en-AU', { weekday: 'short' });
    const activity = CLUB.activities.find(a => a.name === e.activity);
    const emoji = activity ? activity.emoji : '🎉';

    return `
      <div class="event-card">
        <div class="event-date-badge">
          <div class="month">${month}</div>
          <div class="day">${day}</div>
          <div class="weekday">${weekday}</div>
        </div>
        <div class="event-info">
          <h4>${emoji} ${escapeHtml(e.title)}</h4>
          <div class="meta">🎯 ${escapeHtml(e.activity)} • 🕐 ${e.startTime} - ${e.endTime} • 📍 ${escapeHtml(e.location)}</div>
          <div class="meta-chips">
            ${e.members.map(m => `<span class="chip member">👤 ${escapeHtml(m)}</span>`).join('')}
            ${e.equipment.map(eq => `<span class="chip equip">🎒 ${escapeHtml(eq)}</span>`).join('')}
            ${e.notes ? `<span class="chip notes">📝 ${escapeHtml(e.notes)}</span>` : ''}
          </div>
        </div>
        <button class="event-delete" data-id="${e.id}" title="Delete event">✕</button>
      </div>
    `;
  }).join('');

  $$('.event-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      try {
        await api('/api/events/' + btn.dataset.id, { method: 'DELETE' });
        EVENTS = EVENTS.filter(e => e.id !== btn.dataset.id);
        renderEventsList();
        renderCalendar();
      } catch (e) {
        alert('Could not delete: ' + e.message);
      }
    });
  });
}

// ---------- FORM ----------
function setupForm() {
  const form = $('#event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('#evt-date').value;
    if (!date) return flashMsg('Pick a date!', 'error');
    const day = new Date(date + 'T12:00:00').getDay();
    if (day !== 0 && day !== 6) return flashMsg('Adventures only on Saturdays & Sundays! 🌞', 'error');

    const members = Array.from($$('#members-checks input:checked')).map(cb => cb.value);
    const equipment = $('#evt-equipment').value.split(',').map(s => s.trim()).filter(Boolean);

    const body = {
      title: $('#evt-title').value.trim(),
      activity: $('#evt-activity').value,
      date,
      startTime: $('#evt-start').value,
      endTime: $('#evt-end').value,
      location: $('#evt-location').value.trim() || 'TBA',
      members, equipment,
      notes: $('#evt-notes').value.trim()
    };

    try {
      const res = await api('/api/events', { method: 'POST', body });
      EVENTS.push(res.event);
      renderCalendar();
      renderEventsList();
      flashMsg('🎉 Adventure added! Get hyped!', 'success');
      form.reset();
      $$('.member-check').forEach(l => l.classList.remove('checked'));
      $('#evt-start').value = '07:00';
      $('#evt-end').value = '12:00';
      $('#calendar').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      flashMsg('Oops: ' + err.message, 'error');
    }
  });
  $('#evt-date').min = new Date().toISOString().slice(0, 10);
}

function flashMsg(text, type) {
  const m = $('#form-msg');
  m.textContent = text;
  m.className = type === 'success' ? 'msg-success' : 'msg-error';
  setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 4000);
}

// ---------- PEBBLES CHAT ----------
function setupPebblesChat() {
  const fab = $('#pebbles-fab');
  const chat = $('#pebbles-chat');
  const close = $('#pebbles-close');
  const form = $('#pebbles-form');
  const input = $('#pebbles-input');

  fab.addEventListener('click', () => {
    chat.style.display = 'flex';
    fab.style.display = 'none';
    if (CHAT_HISTORY.length === 0) {
      addBubble('assistant', `🐾 *wags tail* G'day! I'm Pebbles, the Fab 5 Fun Club mascot and your AI events coach!\n\nI can help you:\n• Plan adventures 🗺️\n• Find the best LOCAL spots on the Sunny Coast 📍\n• Tell you what GEAR you need 🎒\n• Estimate COSTS 💰\n• Teach you team-leader skills 🎖️\n• Add events straight to your calendar! 📅\n\nWho's chatting? Pick your name above 👆 and ask me anything!`);
    }
    setTimeout(() => input.focus(), 100);
  });

  close.addEventListener('click', () => {
    chat.style.display = 'none';
    fab.style.display = 'flex';
  });

  $$('#pebbles-quick button').forEach(b => {
    b.addEventListener('click', () => {
      input.value = b.dataset.prompt;
      form.dispatchEvent(new Event('submit'));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const user = $('#pebbles-user').value;
    addBubble('user', text);
    CHAT_HISTORY.push({ role: 'user', content: text });

    const thinking = addBubble('assistant', '🐾 *sniffing for ideas...*', 'thinking');

    try {
      const res = await api('/api/pebbles/chat', {
        method: 'POST',
        body: { messages: CHAT_HISTORY, user }
      });
      thinking.remove();
      const reply = res.message?.content || '*tilts head*';
      addBubble('assistant', reply);
      CHAT_HISTORY.push({ role: 'assistant', content: reply });

      // If Pebbles added an event, refresh the calendar
      if (res.eventCreated) {
        EVENTS.push(res.eventCreated);
        renderCalendar();
        renderEventsList();
      }
    } catch (err) {
      thinking.remove();
      addBubble('assistant', `*whimper* Oops: ${err.message}`);
    }
  });
}

function addBubble(role, text, extraClass = '') {
  const wrap = $('#pebbles-messages');
  const div = document.createElement('div');
  div.className = `bubble ${role} ${extraClass}`.trim();
  div.innerHTML = formatMessage(text);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function formatMessage(text) {
  // very light markdown: **bold**, line breaks
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Go!
document.addEventListener('DOMContentLoaded', () => {
  setupLogin();
  checkAuth();
});
