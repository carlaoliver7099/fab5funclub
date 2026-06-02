// ===== Fab 5 Fun Club - Frontend =====
let CLUB = null;
let EVENTS = [];
let AWARDS = [];
let GALLERY = [];
let CONCERTS = [];
let CALENDAR_DATE = new Date();
CALENDAR_DATE.setDate(1);
let CHAT_HISTORY = [];

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

// ---------- AUTH ----------
async function checkAuth() {
  try {
    const me = await api('/api/me');
    if (me.authed) showApp(); else showLogin();
  } catch { showLogin(); }
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
    msg.textContent = 'Sniffing your password... 🐾'; msg.className = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: pw } });
      msg.textContent = '🎉 Welcome to the pack!';
      setTimeout(showApp, 400);
    } catch (err) {
      msg.textContent = err.message; msg.className = 'error';
      $('#login-password').value = '';
    }
  });
}
async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  CLUB = null; EVENTS = []; AWARDS = []; GALLERY = []; CONCERTS = []; CHAT_HISTORY = [];
  showLogin();
}

// ---------- INIT ----------
async function initApp() {
  try {
    const info = await api('/api/club-info');
    CLUB = info;
    renderMembers();
    renderActivities();
    fillActivityDropdown();
    fillMemberCheckboxes();
    fillBadgeDropdown();
    renderStandardDayPack();
    setupForm();
    setupFlyerUpload();
    setupCalendarNav();
    setupAwardForm();
    setupGalleryForm();
    setupConcertForm();
    setupPebblesChat();
    $('#logout-btn').addEventListener('click', logout);

    await refreshAll();
  } catch (e) {
    console.error('Init failed:', e);
    if (String(e.message).toLowerCase().includes('log in')) showLogin();
  }
}

// ---------- STANDARD DAY PACK ----------
function renderStandardDayPack() {
  const el = $('#std-pack-list');
  if (!el || !CLUB?.standardDayPack) return;
  el.innerHTML = CLUB.standardDayPack
    .map(p => `<span class="pack-item">${p.emoji} ${escapeHtml(p.item)}</span>`)
    .join('');
}

// ---------- FLYER UPLOAD ----------
let CURRENT_FLYER_DATA_URL = null;
function setupFlyerUpload() {
  const input = $('#evt-flyer');
  const previewWrap = $('#evt-flyer-preview');
  const previewImg = $('#evt-flyer-img');
  const clearBtn = $('#evt-flyer-clear');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      flashMsg('Flyer too big! Pick something under 3 MB 📸', 'error');
      input.value = '';
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      CURRENT_FLYER_DATA_URL = dataUrl;
      previewImg.src = dataUrl;
      previewWrap.style.display = 'block';
    } catch (e) {
      flashMsg('Could not read that image 🐾', 'error');
    }
  });
  clearBtn?.addEventListener('click', () => {
    CURRENT_FLYER_DATA_URL = null;
    input.value = '';
    previewImg.src = '';
    previewWrap.style.display = 'none';
  });
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function refreshAll() {
  const [ev, aw, gal, con] = await Promise.all([
    api('/api/events').catch(() => ({ events: [] })),
    api('/api/awards').catch(() => ({ awards: [] })),
    api('/api/gallery').catch(() => ({ items: [] })),
    api('/api/concerts').catch(() => ({ concerts: [] }))
  ]);
  EVENTS = ev.events; AWARDS = aw.awards; GALLERY = gal.items; CONCERTS = con.concerts;
  renderCalendar();
  renderEventsList();
  renderRotation();
  renderAwards();
  renderGallery();
  renderConcerts();
}

// ---------- MEMBERS ----------
// Members with cartoon avatar files (everyone except Pebbles has an avatar PNG)
const AVATAR_MEMBERS = ['Ace', 'Charlotte', 'Elijah', 'Saia', 'Sienna'];
function renderMembers() {
  const grid = $('#members-grid');
  grid.innerHTML = CLUB.members.map(m => {
    const isPebbles = m.name === 'Pebbles';
    const hasAvatar = AVATAR_MEMBERS.includes(m.name);
    let avatarHtml;
    if (isPebbles) {
      avatarHtml = `<span class="member-avatar pebbles-pic" style="background:${m.color}"><img src="/static/pebbles.png" alt="Pebbles" /></span>`;
    } else if (hasAvatar) {
      avatarHtml = `<span class="member-avatar cartoon-pic" style="background:${m.color}"><img src="/static/avatars/${m.name.toLowerCase()}.png" alt="${m.name}" /></span>`;
    } else {
      avatarHtml = `<span class="member-avatar" style="background:${m.color}">${m.emoji}</span>`;
    }
    return `
      <div class="member-card ${isPebbles ? 'mascot' : ''}" style="background: linear-gradient(180deg, white 60%, ${m.color})">
        ${avatarHtml}
        <div class="member-name">${m.name}</div>
        <div class="member-role">${m.role}</div>
      </div>`;
  }).join('');
}

// ---------- ACTIVITIES ----------
let ACTIVITY_FILTER = 'All';
function renderActivities() {
  const cats = ['All', ...new Set(CLUB.activities.map(a => a.category))];
  $('#activity-filters').innerHTML = cats.map(c =>
    `<button class="filter-btn ${c === ACTIVITY_FILTER ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
  $$('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    ACTIVITY_FILTER = btn.dataset.cat; renderActivities();
  }));
  const list = ACTIVITY_FILTER === 'All' ? CLUB.activities : CLUB.activities.filter(a => a.category === ACTIVITY_FILTER);
  $('#activities-grid').innerHTML = list.map(a => `
    <div class="activity-card" data-cat="${a.category}" data-name="${a.name}">
      <span class="emoji">${a.emoji}</span>
      <div class="name">${a.name}</div>
      <span class="cat">${a.category}</span>
    </div>`).join('');
  $$('.activity-card').forEach(card => card.addEventListener('click', () => {
    $('#evt-activity').value = card.dataset.name;
    $('#evt-title').focus();
    $('#add-event').scrollIntoView({ behavior: 'smooth' });
  }));
}

function fillActivityDropdown() {
  const sel = $('#evt-activity');
  sel.innerHTML = '<option value="">— Pick an activity —</option>' +
    CLUB.activities.map(a => `<option value="${a.name}">${a.emoji} ${a.name}</option>`).join('');
}

function fillMemberCheckboxes() {
  const humanMembers = CLUB.members.filter(m => m.name !== 'Pebbles');
  $('#members-checks').innerHTML = humanMembers.map(m => `
    <label class="member-check" data-name="${m.name}">
      <input type="checkbox" value="${m.name}" />
      ${m.emoji} ${m.name}
    </label>`).join('');
  $$('.member-check').forEach(lbl => {
    const cb = lbl.querySelector('input');
    lbl.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
      lbl.classList.toggle('checked', cb.checked);
    });
  });
}

function fillBadgeDropdown() {
  const sel = $('#awd-badge');
  sel.innerHTML = '<option value="">— Pick a badge —</option>' +
    CLUB.badges.map(b => `<option value="${b.id}">${b.emoji} ${b.name} — ${b.category}</option>`).join('');
}

// ---------- CALENDAR ----------
function setupCalendarNav() {
  $('#prev-month').addEventListener('click', () => { CALENDAR_DATE.setMonth(CALENDAR_DATE.getMonth() - 1); renderCalendar(); });
  $('#next-month').addEventListener('click', () => { CALENDAR_DATE.setMonth(CALENDAR_DATE.getMonth() + 1); renderCalendar(); });
}

function renderCalendar() {
  const year = CALENDAR_DATE.getFullYear();
  const month = CALENDAR_DATE.getMonth();
  $('#month-label').textContent = CALENDAR_DATE.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const headers = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-header">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(year, month, d).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const evs = EVENTS.filter(e => e.date === dateStr);
    const classes = ['cal-cell', isWeekend ? 'weekend' : '', evs.length ? 'has-event' : '', dateStr === todayStr ? 'today' : ''].filter(Boolean).join(' ');
    cells += `<div class="${classes}" data-date="${dateStr}">
      <span class="cal-day-num">${d}</span>
      ${evs.slice(0, 2).map(e => `<span class="cal-event-dot" title="${e.title}">${e.title.slice(0, 12)}</span>`).join('')}
      ${evs.length > 2 ? `<span class="cal-event-dot">+${evs.length - 2}</span>` : ''}
    </div>`;
  }
  $('#calendar-grid').innerHTML = headers + cells;
  $$('.cal-cell[data-date]').forEach(cell => cell.addEventListener('click', () => {
    const date = cell.dataset.date;
    const d = new Date(date + 'T12:00:00').getDay();
    if (d === 0 || d === 6) {
      $('#evt-date').value = date;
      $('#add-event').scrollIntoView({ behavior: 'smooth' });
      $('#evt-title').focus();
    } else flashMsg('Pick a Saturday or Sunday!', 'error');
  }));
}

function renderEventsList() {
  const upcoming = EVENTS
    .filter(e => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!upcoming.length) {
    $('#events-list').innerHTML = `<div class="loading">No upcoming adventures yet — ask Pebbles! 🐾</div>`;
    return;
  }
  $('#events-list').innerHTML = upcoming.map(e => {
    const dt = new Date(e.date + 'T12:00:00');
    const month = dt.toLocaleString('en-AU', { month: 'short' });
    const day = dt.getDate();
    const weekday = dt.toLocaleString('en-AU', { weekday: 'short' });
    const activity = CLUB.activities.find(a => a.name === e.activity);
    const emoji = activity ? activity.emoji : '🎉';
    const leaderHtml = e.leader
      ? `<div class="leader-badge">🎖️ Leader: ${escapeHtml(e.leader)} <button data-rotate="${e.id}" title="Rotate to next">🔄</button></div>`
      : '';
    // Cost chip — always shows "Carla covers it!" message
    const costChip = (typeof e.costPerPerson === 'number' && e.costPerPerson >= 0)
      ? `<span class="chip cost"><span class="cost-strike">$${e.costPerPerson}/kid</span><span class="cost-carla">💛 Carla's got us — FREE!</span>${e.costNotes ? `<span class="cost-notes">(${escapeHtml(e.costNotes)})</span>` : ''}</span>`
      : `<span class="chip cost"><span class="cost-carla">💛 FREE — Carla covers it!</span></span>`;

    const flyerHtml = e.flyer
      ? `<div class="event-flyer-wrap">
           <img src="${e.flyer}" alt="Event flyer" class="event-flyer-img" data-flyer="${e.id}" />
           ${e.flyerCaption ? `<div class="event-flyer-cap">📸 ${escapeHtml(e.flyerCaption)}</div>` : ''}
         </div>`
      : '';

    const transportHtml = e.transportPlan
      ? `<div class="event-detail transport-detail"><strong>🚗 Transport:</strong> ${escapeHtml(e.transportPlan)}</div>`
      : '';
    const permissionHtml = e.parentPermissionNote
      ? `<div class="event-detail permission-detail"><strong>📝 Parents:</strong> ${escapeHtml(e.parentPermissionNote)}</div>`
      : '';
    const weatherHtml = e.weatherWarning
      ? `<div class="event-detail weather-detail"><strong>🌦️ Weather plan:</strong> ${escapeHtml(e.weatherWarning)}</div>`
      : '';

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
          ${leaderHtml}
          ${flyerHtml}
          <div class="meta-chips">
            ${costChip}
            ${e.members.map(m => `<span class="chip member">👤 ${escapeHtml(m)}</span>`).join('')}
            ${e.equipment.map(eq => `<span class="chip equip">🎒 ${escapeHtml(eq)}</span>`).join('')}
          </div>
          ${transportHtml}
          ${permissionHtml}
          ${weatherHtml}
          ${e.notes ? `<div class="event-detail notes-detail"><strong>📝 Notes:</strong> ${escapeHtml(e.notes)}</div>` : ''}
          <details class="day-pack-details">
            <summary>🎒 Standard Day Pack — what every kid brings</summary>
            <div class="day-pack-items">
              ${(CLUB?.standardDayPack || []).map(p => `<span class="pack-item">${p.emoji} ${escapeHtml(p.item)}</span>`).join('')}
            </div>
          </details>
        </div>
        <button class="event-delete" data-id="${e.id}" title="Delete">✕</button>
      </div>`;
  }).join('');
  // Click flyer to view bigger (lightbox)
  $$('img.event-flyer-img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });
  $$('.event-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    try {
      await api('/api/events/' + btn.dataset.id, { method: 'DELETE' });
      EVENTS = EVENTS.filter(e => e.id !== btn.dataset.id);
      renderEventsList(); renderCalendar(); renderRotation();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
  $$('button[data-rotate]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const res = await api('/api/leader/rotate/' + btn.dataset.rotate, { method: 'POST' });
      const i = EVENTS.findIndex(x => x.id === btn.dataset.rotate);
      if (i >= 0) EVENTS[i] = res.event;
      renderEventsList(); renderRotation();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
}

// ---------- LEADER ROTATION ----------
function renderRotation() {
  const counts = {};
  ['Saia','Elijah','Charlotte','Ace','Sienna'].forEach(n => counts[n] = 0);
  EVENTS.forEach(e => { if (e.leader) counts[e.leader] = (counts[e.leader] || 0) + 1; });
  const min = Math.min(...Object.values(counts));
  $('#rotation-counts').innerHTML = Object.entries(counts).map(([name, c]) => `
    <span class="rotation-pill ${c === min ? 'next-up' : ''}">
      ${name} <span class="count">${c}×</span>
      ${c === min ? ' 🎖️' : ''}
    </span>`).join('');
}

// ---------- FORM ----------
function setupForm() {
  const form = $('#event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('#evt-date').value;
    if (!date) return flashMsg('Pick a date!', 'error');
    const day = new Date(date + 'T12:00:00').getDay();
    if (day !== 0 && day !== 6) return flashMsg('Saturdays & Sundays only! 🌞', 'error');
    const members = Array.from($$('#members-checks input:checked')).map(cb => cb.value);
    const equipment = $('#evt-equipment').value.split(',').map(s => s.trim()).filter(Boolean);
    const costRaw = $('#evt-cost')?.value;
    const body = {
      title: $('#evt-title').value.trim(),
      activity: $('#evt-activity').value,
      date,
      startTime: $('#evt-start').value,
      endTime: $('#evt-end').value,
      location: $('#evt-location').value.trim() || 'TBA',
      members, equipment,
      notes: $('#evt-notes').value.trim(),
      leader: $('#evt-leader').value || undefined,
      flyer: CURRENT_FLYER_DATA_URL || undefined,
      flyerCaption: $('#evt-flyer-caption')?.value.trim() || undefined,
      costPerPerson: costRaw ? Number(costRaw) : undefined,
      costNotes: $('#evt-cost-notes')?.value.trim() || undefined,
      transportPlan: $('#evt-transport')?.value.trim() || undefined,
      parentPermissionNote: $('#evt-permission')?.value.trim() || undefined,
      weatherWarning: $('#evt-weather')?.value.trim() || undefined,
      extraDayPack: equipment,
    };
    try {
      const res = await api('/api/events', { method: 'POST', body });
      EVENTS.push(res.event);
      renderCalendar(); renderEventsList(); renderRotation();
      flashMsg(`🎉 Adventure added! 🎖️ Leader: ${res.event.leader}`, 'success');
      form.reset();
      $$('.member-check').forEach(l => l.classList.remove('checked'));
      $('#evt-start').value = '07:00'; $('#evt-end').value = '12:00';
      // Reset flyer preview
      CURRENT_FLYER_DATA_URL = null;
      const fp = $('#evt-flyer-preview'); if (fp) fp.style.display = 'none';
      const fi = $('#evt-flyer-img'); if (fi) fi.src = '';
      $('#calendar').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { flashMsg('Oops: ' + err.message, 'error'); }
  });
  $('#evt-date').min = new Date().toISOString().slice(0, 10);
}

function flashMsg(text, type) {
  const m = $('#form-msg'); m.textContent = text;
  m.className = type === 'success' ? 'msg-success' : 'msg-error';
  setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 4000);
}

// ---------- AWARDS ----------
function setupAwardForm() {
  $('#award-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      awardedBy: $('#awd-by').value,
      member: $('#awd-to').value,
      badgeId: $('#awd-badge').value,
      reason: $('#awd-reason').value.trim()
    };
    if (!body.badgeId) {
      $('#awd-msg').textContent = 'Pick a badge!'; $('#awd-msg').className = 'msg-error'; return;
    }
    if (body.awardedBy === body.member) {
      $('#awd-msg').textContent = "You can't award yourself! Peer feedback only 🐾";
      $('#awd-msg').className = 'msg-error'; return;
    }
    try {
      const res = await api('/api/awards', { method: 'POST', body });
      AWARDS.unshift(res.award);
      renderAwards();
      $('#awd-msg').textContent = '🎉 Badge awarded!'; $('#awd-msg').className = 'msg-success';
      $('#award-form').reset();
      setTimeout(() => { $('#awd-msg').textContent = ''; }, 4000);
    } catch (err) {
      $('#awd-msg').textContent = err.message; $('#awd-msg').className = 'msg-error';
    }
  });
}

function renderAwards() {
  const byMember = {};
  ['Saia','Elijah','Charlotte','Ace','Sienna'].forEach(n => byMember[n] = []);
  AWARDS.forEach(a => { if (byMember[a.member]) byMember[a.member].push(a); });
  const html = Object.entries(byMember).map(([name, list]) => {
    const items = list.map(a => {
      const b = CLUB.badges.find(x => x.id === a.badgeId);
      if (!b) return '';
      return `
        <div class="award-list-item" data-id="${a.id}">
          <span class="award-emoji">${b.emoji}</span>
          <div>
            <strong>${b.name}</strong>
            <div>${escapeHtml(a.reason || '')}</div>
            <div class="by">— from ${escapeHtml(a.awardedBy)}</div>
          </div>
          <button class="award-delete" data-id="${a.id}">✕</button>
        </div>`;
    }).join('');
    return `
      <div class="member-awards-card">
        <h4>${name} — ${list.length} badge${list.length === 1 ? '' : 's'}</h4>
        ${list.length ? items : '<p style="text-align:center;opacity:0.6;font-size:0.85rem">No badges yet — earn one!</p>'}
      </div>`;
  }).join('');
  $('#awards-by-member').innerHTML = html;
  $$('.award-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remove this badge?')) return;
    try {
      await api('/api/awards/' + btn.dataset.id, { method: 'DELETE' });
      AWARDS = AWARDS.filter(a => a.id !== btn.dataset.id);
      renderAwards();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
}

// ---------- GALLERY ----------
function setupGalleryForm() {
  $('#gallery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = $('#gal-file').files[0];
    if (!file) { $('#gal-msg').textContent = 'Pick a file!'; $('#gal-msg').className = 'msg-error'; return; }
    if (file.size > 2_000_000) {
      $('#gal-msg').textContent = `File too big (${(file.size/1024/1024).toFixed(1)}MB). Use under 2MB.`;
      $('#gal-msg').className = 'msg-error'; return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const type = file.type.startsWith('video') ? 'video' : 'image';
      try {
        $('#gal-msg').textContent = 'Uploading... 📤'; $('#gal-msg').className = '';
        const res = await api('/api/gallery', {
          method: 'POST',
          body: { dataUrl, type, caption: $('#gal-caption').value.trim(), uploadedBy: $('#gal-by').value }
        });
        GALLERY.unshift(res.item);
        renderGallery();
        $('#gal-msg').textContent = '🎉 Added to gallery!'; $('#gal-msg').className = 'msg-success';
        $('#gallery-form').reset();
        setTimeout(() => { $('#gal-msg').textContent = ''; }, 4000);
      } catch (err) {
        $('#gal-msg').textContent = err.message; $('#gal-msg').className = 'msg-error';
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderGallery() {
  if (!GALLERY.length) {
    $('#gallery-grid').innerHTML = `<div class="loading">No memories yet — upload your first one! 📸<br>"We have the pen in our hands..." ✍️</div>`;
    return;
  }
  $('#gallery-grid').innerHTML = GALLERY.map(g => {
    const media = g.type === 'video'
      ? `<video src="${g.dataUrl}" controls></video>`
      : `<img src="${g.dataUrl}" alt="${escapeHtml(g.caption)}" />`;
    return `
      <div class="gallery-item" data-id="${g.id}">
        ${media}
        <div class="gallery-caption">
          ${escapeHtml(g.caption || 'Untitled')}
          <div class="by">— ${escapeHtml(g.uploadedBy)}</div>
        </div>
        <button class="delete" data-gid="${g.id}" title="Delete">✕</button>
      </div>`;
  }).join('');
  $$('.gallery-item .delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this memory?')) return;
    try {
      await api('/api/gallery/' + btn.dataset.gid, { method: 'DELETE' });
      GALLERY = GALLERY.filter(g => g.id !== btn.dataset.gid);
      renderGallery();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
}

// ---------- CONCERTS ----------
function setupConcertForm() {
  $('#concert-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      artist: $('#con-artist').value.trim(),
      tour: $('#con-tour').value.trim(),
      city: $('#con-city').value.trim(),
      date: $('#con-date').value.trim(),
      notes: $('#con-notes').value.trim()
    };
    if (!body.artist) {
      $('#con-msg').textContent = 'Artist name required!'; $('#con-msg').className = 'msg-error'; return;
    }
    try {
      const res = await api('/api/concerts', { method: 'POST', body });
      CONCERTS.unshift(res.concert);
      renderConcerts();
      $('#con-msg').textContent = '🎉 Concert added!'; $('#con-msg').className = 'msg-success';
      $('#concert-form').reset();
      setTimeout(() => { $('#con-msg').textContent = ''; }, 4000);
    } catch (err) {
      $('#con-msg').textContent = err.message; $('#con-msg').className = 'msg-error';
    }
  });
}

function renderConcerts() {
  if (!CONCERTS.length) {
    $('#concerts-list').innerHTML = `<div class="loading">No concerts on the wishlist yet 🎵</div>`;
    return;
  }
  const members = ['Saia','Elijah','Charlotte','Ace','Sienna'];
  $('#concerts-list').innerHTML = CONCERTS.map(c => `
    <div class="concert-card" data-id="${c.id}">
      <div class="concert-emoji">🎤</div>
      <div class="concert-info">
        <h4>${escapeHtml(c.artist)}</h4>
        ${c.tour ? `<div class="tour">🎶 ${escapeHtml(c.tour)}</div>` : ''}
        <div class="where">📍 ${escapeHtml(c.city || 'TBA')} • 📅 ${escapeHtml(c.date)}</div>
        ${c.notes ? `<div class="notes">📝 ${escapeHtml(c.notes)}</div>` : ''}
        <div class="concert-interested">
          ${members.map(m => `<span class="interest-chip ${c.interested.includes(m) ? 'in' : ''}" data-con="${c.id}" data-member="${m}">${c.interested.includes(m) ? '✓ ' : ''}${m}</span>`).join('')}
        </div>
      </div>
      <button class="concert-delete" data-id="${c.id}" title="Delete">✕</button>
    </div>`).join('');
  $$('.concert-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remove this concert?')) return;
    try {
      await api('/api/concerts/' + btn.dataset.id, { method: 'DELETE' });
      CONCERTS = CONCERTS.filter(c => c.id !== btn.dataset.id);
      renderConcerts();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
  $$('.interest-chip').forEach(chip => chip.addEventListener('click', async () => {
    const id = chip.dataset.con; const m = chip.dataset.member;
    const con = CONCERTS.find(x => x.id === id);
    if (!con) return;
    const going = !con.interested.includes(m);
    try {
      const res = await api('/api/concerts/' + id + '/interested', { method: 'POST', body: { member: m, going } });
      const i = CONCERTS.findIndex(x => x.id === id);
      if (i >= 0) CONCERTS[i] = res.concert;
      renderConcerts();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
}

// ---------- PEBBLES CHAT ----------
function setupPebblesChat() {
  const fab = $('#pebbles-fab');
  const chat = $('#pebbles-chat');
  const close = $('#pebbles-close');
  const form = $('#pebbles-form');
  const input = $('#pebbles-input');

  fab.addEventListener('click', () => {
    chat.style.display = 'flex'; fab.style.display = 'none';
    if (CHAT_HISTORY.length === 0) {
      addBubble('assistant', `🐾 *wags tail* G'day! I'm Pebbles!\n\nI can help you:\n• Plan adventures 🗺️\n• Find LOCAL Sunshine Coast spots 📍\n• Tell you costs & gear 💰🎒\n• Suggest who should lead next time (fair rotation!) 🎖️\n• AWARD badges to your crew for great behavior 🏆\n• Add concerts to your wishlist 🎵\n\nWho's chatting? Pick your name above 👆`);
    }
    setTimeout(() => input.focus(), 100);
  });
  close.addEventListener('click', () => { chat.style.display = 'none'; fab.style.display = 'flex'; });

  $$('#pebbles-quick button').forEach(b => b.addEventListener('click', () => {
    input.value = b.dataset.prompt;
    form.dispatchEvent(new Event('submit'));
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    const user = $('#pebbles-user').value;
    addBubble('user', text);
    CHAT_HISTORY.push({ role: 'user', content: text });
    const thinking = addBubble('assistant', '🐾 *sniffing for ideas...*', 'thinking');
    try {
      const res = await api('/api/pebbles/chat', { method: 'POST', body: { messages: CHAT_HISTORY, user } });
      thinking.remove();
      const reply = res.message?.content || '*tilts head*';
      addBubble('assistant', reply);
      CHAT_HISTORY.push({ role: 'assistant', content: reply });
      let needsRefresh = false;
      if (res.eventsCreated?.length) { EVENTS.push(...res.eventsCreated); renderCalendar(); renderEventsList(); renderRotation(); needsRefresh = true; }
      if (res.awardsCreated?.length) { AWARDS = [...res.awardsCreated, ...AWARDS]; renderAwards(); needsRefresh = true; }
      if (res.concertsCreated?.length) { CONCERTS = [...res.concertsCreated, ...CONCERTS]; renderConcerts(); needsRefresh = true; }
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
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- LIGHTBOX (for flyers + future gallery) ----------
function openLightbox(src) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt="Full view" /><button class="lightbox-close" aria-label="Close">✕</button>';
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.classList.contains('lightbox-close')) {
        lb.style.display = 'none';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') lb.style.display = 'none';
    });
  }
  lb.querySelector('img').src = src;
  lb.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  setupLogin();
  checkAuth();
});
