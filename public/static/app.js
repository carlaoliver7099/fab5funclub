// ===== Fab 5 Fun Club - Frontend =====
let CLUB = null;
let EVENTS = [];
let AWARDS = [];
let GALLERY = [];
let CONCERTS = [];
let SUGGESTIONS = [];
let FAB5_WAYS_FILTER = 'All';
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
  CLUB = null; EVENTS = []; AWARDS = []; GALLERY = []; CONCERTS = []; SUGGESTIONS = []; CHAT_HISTORY = [];
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
    renderSloganOfWeek();
    renderFab5Ways();
    renderParentsFaq();
    setupForm();
    setupFlyerUpload();
    setupCalendarNav();
    setupAwardForm();
    setupGalleryForm();
    setupConcertForm();
    setupPebblesChat();
    setupSuggestionForm();
    renderBottleFund();
    setupBottleShare();
    setupBottleHeroForm();
    setupBottleAdminForms();
    renderKidProfiles();
    setupPicks();
    setupWeather();
    setupQuickPromptButtons();
    setupPlaylistForm();
    setupConcertWatchForm();
    // Wave 2 + 3 setup
    setupSpotForm();
    setupDiaryGenerator();
    setupCaptionBattleStarter();
    setupPostcardGenerator();
    setupVoicePebbles();
    setupKidProfileModal();
    setupOnboardingWizard();
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
  const [ev, aw, gal, con, sug, bf] = await Promise.all([
    api('/api/events').catch(() => ({ events: [] })),
    api('/api/awards').catch(() => ({ awards: [] })),
    api('/api/gallery').catch(() => ({ items: [] })),
    api('/api/concerts').catch(() => ({ concerts: [] })),
    api('/api/suggestions').catch(() => ({ suggestions: [] })),
    api('/api/bottle-fund').catch(() => null)
  ]);
  EVENTS = ev.events; AWARDS = aw.awards; GALLERY = gal.items; CONCERTS = con.concerts;
  SUGGESTIONS = sug.suggestions || [];
  if (bf && CLUB) CLUB.bottleFund = bf;
  renderCalendar();
  renderEventsList();
  renderRotation();
  renderAwards();
  renderGallery();
  renderConcerts();
  renderSuggestionsList();
  renderBottleFund();
  renderPlaylist();
  renderConcertWatches();
  renderDashOverview();
  // Wave 2 + 3 renderers
  renderBirthdays();
  renderHallOfFame();
  renderChallenge();
  renderAdventureMap();
  renderDiary();
  renderCaptionBattles();
  renderPostcards();
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
      avatarHtml = `<span class="member-avatar pebbles-pic" style="background:${m.color}"><img src="/static/pebbles.png?v=2" alt="Pebbles" /></span>`;
    } else if (hasAvatar) {
      avatarHtml = `<span class="member-avatar cartoon-pic" style="background:${m.color}"><img src="/static/avatars/${m.name.toLowerCase()}.png?v=2" alt="${m.name}" /></span>`;
    } else {
      avatarHtml = `<span class="member-avatar" style="background:${m.color}">${m.emoji}</span>`;
    }
    return `
      <button type="button" class="member-card ${isPebbles ? 'mascot' : ''}" data-member-name="${m.name}" style="background: linear-gradient(180deg, white 60%, ${m.color})" aria-label="Open ${m.name}'s profile">
        ${avatarHtml}
        <div class="member-name">${m.name}</div>
        <div class="member-role">${m.role}</div>
        <span class="member-tap-hint">tap to open 👉</span>
      </button>`;
  }).join('');
  // Wire click handlers
  document.querySelectorAll('.member-card[data-member-name]').forEach(card => {
    card.addEventListener('click', () => openKidProfileModal(card.dataset.memberName));
  });
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
    // Cost chip — always shows "The club's got us!" message
    const costChip = (typeof e.costPerPerson === 'number' && e.costPerPerson >= 0)
      ? `<span class="chip cost"><span class="cost-strike">$${e.costPerPerson}/kid</span><span class="cost-carla">💛 The club's got us — FREE!</span>${e.costNotes ? `<span class="cost-notes">(${escapeHtml(e.costNotes)})</span>` : ''}</span>`
      : `<span class="chip cost"><span class="cost-carla">💛 FREE — the club covers it!</span></span>`;

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

    const parentsJoiningMap = {
      yes:      { emoji: '✅', label: 'Parents welcome',       cls: 'pj-yes' },
      no:       { emoji: '🚫', label: 'Kids only',             cls: 'pj-no' },
      maybe:    { emoji: '🤔', label: 'Parents — your call',   cls: 'pj-maybe' },
      required: { emoji: '❗', label: 'A parent MUST come',    cls: 'pj-required' },
    };
    const pj = e.parentsJoining && parentsJoiningMap[e.parentsJoining];
    const parentsJoiningHtml = pj
      ? `<div class="parents-joining-badge ${pj.cls}">
           <span class="pj-icon">${pj.emoji}</span>
           <span class="pj-label">👨‍👩‍👧 ${pj.label}</span>
           ${e.parentsJoiningNote ? `<span class="pj-note">— ${escapeHtml(e.parentsJoiningNote)}</span>` : ''}
         </div>`
      : '';

    // 🛡️ Allergy safety scan — check each member in the event for allergies
    const profiles = CLUB?.kidProfiles || {};
    const allergyAlerts = (e.members || [])
      .map(m => ({ name: m, allergies: profiles[m]?.allergies }))
      .filter(x => x.allergies && x.allergies.trim());
    const allergyHtml = allergyAlerts.length
      ? `<div class="allergy-banner">
           <strong>⚠️ Allergy alert — pack snacks accordingly:</strong>
           ${allergyAlerts.map(a => `<span class="allergy-chip">${escapeHtml(a.name)}: ${escapeHtml(a.allergies)}</span>`).join('')}
         </div>`
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
          ${parentsJoiningHtml}
          ${allergyHtml}
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
            <summary>👨‍👩‍👧 Parent-Packed Essentials — what every parent sends with their kid</summary>
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
      parentsJoining: $('#evt-parents-joining')?.value || undefined,
      parentsJoiningNote: $('#evt-parents-joining-note')?.value.trim() || undefined,
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

// ---------- SLOGAN OF THE WEEK ----------
function renderSloganOfWeek() {
  const banner = document.getElementById('slogan-of-week');
  const text = document.getElementById('sotw-text');
  const cat = document.getElementById('sotw-category');
  if (!banner || !text || !CLUB?.sloganOfTheWeek) return;
  const s = CLUB.sloganOfTheWeek;
  text.innerHTML = `${s.emoji || '🌟'} <em>"${escapeHtml(s.text)}"</em>${s.star ? ' <span class="sotw-star" title="Family classic">⭐</span>' : ''}`;
  if (cat) cat.textContent = s.category ? `#${s.category}` : '';
  banner.classList.add('loaded');
  if (s.star) banner.classList.add('starred');
}

// ---------- FAB 5 WAYS (slogans grid) ----------
const SLOGAN_CATEGORIES = [
  { id: 'All',          emoji: '🌟', label: 'All' },
  { id: 'kindness',     emoji: '💛', label: 'Kindness' },
  { id: 'team',         emoji: '🤝', label: 'Team' },
  { id: 'leader',       emoji: '🎖️', label: 'Leader' },
  { id: 'self-control', emoji: '💆', label: 'Self-control' },
  { id: 'growth',       emoji: '🌱', label: 'Growth' },
  { id: 'self',         emoji: '✨', label: 'Self' },
  { id: 'fun',          emoji: '🎉', label: 'Fun' },
];

function renderFab5Ways() {
  const grid = $('#fab5-ways-grid');
  const filters = $('#fab5-ways-filters');
  if (!grid || !CLUB?.slogans) return;

  if (filters && !filters.dataset.ready) {
    const seen = new Set(CLUB.slogans.map(s => s.category));
    const cats = SLOGAN_CATEGORIES.filter(c => c.id === 'All' || seen.has(c.id));
    filters.innerHTML = cats.map(c => `
      <button class="slogan-filter ${c.id === FAB5_WAYS_FILTER ? 'active' : ''}" data-cat="${c.id}">
        ${c.emoji} ${c.label}
      </button>
    `).join('');
    filters.dataset.ready = '1';
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      FAB5_WAYS_FILTER = btn.dataset.cat;
      filters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cat === FAB5_WAYS_FILTER));
      renderFab5Ways();
    });
  }

  const list = FAB5_WAYS_FILTER === 'All'
    ? CLUB.slogans
    : CLUB.slogans.filter(s => s.category === FAB5_WAYS_FILTER);

  if (!list.length) {
    grid.innerHTML = `<div class="loading">No slogans here yet 🐾</div>`;
    return;
  }

  grid.innerHTML = list.map(s => `
    <div class="slogan-card ${s.star ? 'starred' : ''} cat-${escapeHtml(s.category || 'general')}">
      ${s.star ? '<div class="slogan-star-badge" title="Family classic — passed down to the Fab 5">⭐ Family classic</div>' : ''}
      <div class="slogan-emoji">${s.emoji || '🌟'}</div>
      <blockquote class="slogan-text">"${escapeHtml(s.text)}"</blockquote>
      <div class="slogan-cat">#${escapeHtml(s.category || 'general')}</div>
    </div>
  `).join('');
}

// ---------- PARENTS FAQ ----------
function renderParentsFaq() {
  const list = $('#parents-faq-list');
  if (!list || !Array.isArray(CLUB?.parentsFaq)) return;
  list.innerHTML = CLUB.parentsFaq.map((qa, i) => `
    <details class="faq-item" ${i === 0 ? 'open' : ''}>
      <summary>
        <span class="faq-q-icon">${escapeHtml(qa.emoji || '❓')}</span>
        <span class="faq-q-text">${escapeHtml(qa.q)}</span>
        <span class="faq-q-chev">▾</span>
      </summary>
      <div class="faq-answer">${escapeHtml(qa.a)}</div>
    </details>
  `).join('');
}

// ---------- SUGGESTION BOX ----------
function setupSuggestionForm() {
  const form = $('#suggestion-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      fromName: $('#sug-name').value.trim(),
      topic: $('#sug-topic').value,
      message: $('#sug-message').value.trim(),
    };
    if (!body.message) {
      flashSugMsg('Type a message first! 📝', 'error');
      return;
    }
    try {
      const res = await api('/api/suggestions', { method: 'POST', body });
      SUGGESTIONS.unshift(res.suggestion);
      renderSuggestionsList();
      form.reset();
      flashSugMsg('💛 Thank you! The Fab 5 crew will see your message.', 'success');
    } catch (err) {
      flashSugMsg('Oops: ' + err.message, 'error');
    }
  });
}

function flashSugMsg(text, type) {
  const m = $('#sug-msg'); if (!m) return;
  m.textContent = text;
  m.className = type === 'success' ? 'msg-success' : 'msg-error';
  setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 5000);
}

function renderSuggestionsList() {
  const el = $('#suggestions-list');
  if (!el) return;
  if (!SUGGESTIONS.length) {
    el.innerHTML = `<div class="loading">No suggestions yet — be the first to share an idea! 💡</div>`;
    return;
  }
  el.innerHTML = SUGGESTIONS.map(s => {
    const when = new Date(s.createdAt);
    const dateStr = when.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <article class="suggestion-card">
        <header class="suggestion-head">
          <span class="suggestion-topic">${escapeHtml(s.topic || 'General')}</span>
          <span class="suggestion-from">— ${escapeHtml(s.fromName || 'Anonymous parent')}</span>
          <span class="suggestion-date">${dateStr}</span>
          <button class="suggestion-delete" data-id="${s.id}" title="Delete">✕</button>
        </header>
        <p class="suggestion-message">${escapeHtml(s.message)}</p>
      </article>
    `;
  }).join('');
  $$('.suggestion-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this suggestion?')) return;
    try {
      await api('/api/suggestions/' + btn.dataset.id, { method: 'DELETE' });
      SUGGESTIONS = SUGGESTIONS.filter(s => s.id !== btn.dataset.id);
      renderSuggestionsList();
    } catch (e) { alert('Failed: ' + e.message); }
  }));
}

// ---------- 🎰 PEBBLES PICKS (Decision Maker) ----------
function setupPicks() {
  document.querySelectorAll('.pick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bucket = btn.dataset.bucket;
      const result = $('#pick-result');
      if (!result) return;
      result.innerHTML = `<div class="pick-spinning">🎰 Pebbles is choosing...</div>`;
      try {
        const res = await api('/api/pebbles-picks', { method: 'POST', body: { bucket } });
        const embed = res.pick?.spotifyId
          ? `<iframe class="pick-spotify" src="https://open.spotify.com/embed/track/${encodeURIComponent(res.pick.spotifyId)}?utm_source=fab5" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" loading="lazy"></iframe>`
          : '';
        result.innerHTML = `
          <div class="pick-result-card">
            <div class="pick-result-pick">${escapeHtml(res.pick.label)}</div>
            <div class="pick-result-woof">🐾 ${escapeHtml(res.woof)}</div>
            ${embed}
            <button class="btn btn-tertiary pick-again-btn" data-bucket="${escapeHtml(bucket)}">🔄 Pick again</button>
          </div>
        `;
        result.querySelector('.pick-again-btn')?.addEventListener('click', () => btn.click());
      } catch (e) {
        result.innerHTML = `<div class="error">Pebbles couldn't pick: ${escapeHtml(e.message)}</div>`;
      }
    });
  });
}

// ---------- 🌦️ WEATHER BRAIN ----------
function setupWeather() {
  const form = $('#weather-form');
  if (!form) return;
  // Default the date to next Saturday
  const dateInput = $('#weather-date');
  if (dateInput && !dateInput.value) {
    const d = new Date();
    const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSat);
    dateInput.value = d.toISOString().slice(0, 10);
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = dateInput.value;
    const location = $('#weather-location').value.trim() || 'Sunshine Coast';
    const result = $('#weather-result');
    if (!result) return;
    result.innerHTML = `<div class="loading">🔮 Pebbles is checking the sky...</div>`;
    try {
      const w = await api(`/api/weather?date=${encodeURIComponent(date)}&location=${encodeURIComponent(location)}`);
      const verdictClass = w.verdict === 'go' ? 'verdict-go' : w.verdict === 'maybe' ? 'verdict-maybe' : 'verdict-no';
      result.innerHTML = `
        <div class="weather-card ${verdictClass}">
          <div class="weather-header">
            <span class="weather-emoji">${w.condEmoji}</span>
            <div>
              <h3>${escapeHtml(w.location)}</h3>
              <p>${escapeHtml(w.date)} • ${escapeHtml(w.condDesc)}</p>
            </div>
          </div>
          <div class="weather-stats">
            <div class="weather-stat"><span>🌡️ Max</span><strong>${Math.round(w.tempMax)}°C</strong></div>
            <div class="weather-stat"><span>🌡️ Min</span><strong>${Math.round(w.tempMin)}°C</strong></div>
            <div class="weather-stat"><span>🌧️ Rain</span><strong>${w.rainMm.toFixed(1)}mm</strong></div>
            <div class="weather-stat"><span>☔ Chance</span><strong>${w.rainProb}%</strong></div>
            <div class="weather-stat"><span>💨 Wind</span><strong>${Math.round(w.wind)}km/h</strong></div>
          </div>
          <div class="weather-verdict">${escapeHtml(w.verdictMsg)}</div>
        </div>
      `;
    } catch (e) {
      result.innerHTML = `<div class="error">Weather lookup failed: ${escapeHtml(e.message)}</div>`;
    }
  });
}

// ---------- 💌 INVITE / 🏆 HERO buttons — they just open Pebbles chat with a prompt ----------
function setupQuickPromptButtons() {
  ['#invite-prompt-btn', '#hero-spot-btn'].forEach(sel => {
    const btn = $(sel);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      // Open Pebbles chat
      const chat = $('#pebbles-chat');
      const fab = $('#pebbles-fab');
      if (chat && fab) {
        chat.style.display = 'flex';
        fab.style.display = 'none';
        const input = $('#pebbles-input');
        if (input) {
          input.value = prompt;
          input.focus();
        }
        // Auto-submit
        const peblForm = $('#pebbles-form');
        if (peblForm) {
          setTimeout(() => peblForm.requestSubmit(), 200);
        }
      }
    });
  });
}

// ---------- 🎵 CREW PLAYLIST ----------
function renderPlaylist() {
  const wrap = $('#playlist-tracks');
  if (!wrap || !CLUB) return;
  const tracks = (CLUB.playlist || []).slice().sort((a, b) => b.addedAt - a.addedAt);
  if (tracks.length === 0) {
    wrap.innerHTML = `<div class="loading">No songs yet — add the crew's favourites! 🎵</div>`;
    return;
  }
  wrap.innerHTML = tracks.map(t => {
    const embed = t.spotifyId
      ? `<iframe class="playlist-spotify" src="https://open.spotify.com/embed/track/${encodeURIComponent(t.spotifyId)}?utm_source=fab5" width="100%" height="80" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" loading="lazy"></iframe>`
      : `<div class="playlist-no-embed">🎧 Add a Spotify link to enable preview</div>`;
    const vibeMap = { hype: '🔥 Hype', chill: '😌 Chill', adventure: '🛶 Adventure', party: '🎉 Party' };
    const vibeChip = t.vibe && vibeMap[t.vibe] ? `<span class="vibe-chip">${vibeMap[t.vibe]}</span>` : '';
    return `
      <div class="playlist-track" data-id="${escapeHtml(t.id)}">
        <div class="playlist-track-info">
          <h4>🎵 ${escapeHtml(t.title)} <span class="playlist-artist">— ${escapeHtml(t.artist)}</span></h4>
          <div class="playlist-meta">${vibeChip} <span class="playlist-added-by">added by ${escapeHtml(t.addedBy)}</span></div>
        </div>
        ${embed}
        <button class="playlist-remove" data-track-remove="${escapeHtml(t.id)}" title="Remove">✕</button>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-track-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this song from the playlist?')) return;
      const id = btn.dataset.trackRemove;
      try {
        await api('/api/playlist/' + encodeURIComponent(id), { method: 'DELETE' });
        CLUB.playlist = CLUB.playlist.filter(t => t.id !== id);
        renderPlaylist();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupPlaylistForm() {
  const form = $('#playlist-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#track-title').value.trim();
    const artist = $('#track-artist').value.trim();
    const spotifyId = $('#track-spotify').value.trim();
    const addedBy = $('#track-by').value;
    const vibe = $('#track-vibe').value;
    const msg = $('#playlist-msg');
    if (!title || !artist) { if (msg) { msg.textContent = 'Title + artist required!'; msg.className = 'error'; } return; }
    try {
      const res = await api('/api/playlist', { method: 'POST', body: { title, artist, spotifyId, addedBy, vibe } });
      if (!CLUB.playlist) CLUB.playlist = [];
      CLUB.playlist.unshift(res.track);
      renderPlaylist();
      form.reset();
      if (msg) { msg.textContent = '🎶 Added!'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 2500);
    } catch (err) {
      if (msg) { msg.textContent = 'Failed: ' + err.message; msg.className = 'error'; }
    }
  });
}

// ---------- 🎟️ CONCERT WATCH ----------
function renderConcertWatches() {
  const wrap = $('#concert-watches-list');
  if (!wrap || !CLUB) return;
  const watches = CLUB.concertWatches || [];
  if (watches.length === 0) {
    wrap.innerHTML = `<div class="loading">Not watching any artists yet — add one below 👀</div>`;
    return;
  }
  const statusMap = {
    'watching': { emoji: '👀', label: 'Watching for tour dates', cls: 'status-watching' },
    'tour-announced': { emoji: '🎉', label: 'Tour announced!', cls: 'status-announced' },
    'tickets-on-sale': { emoji: '🚨', label: 'TICKETS ON SALE NOW!', cls: 'status-tickets' },
    'past': { emoji: '📜', label: 'Past tour', cls: 'status-past' },
  };
  wrap.innerHTML = watches.map(w => {
    const s = statusMap[w.status] || statusMap.watching;
    return `
      <div class="concert-watch-card ${s.cls}" data-artist="${escapeHtml(w.artist)}">
        <div class="cw-header">
          <h4>🎤 ${escapeHtml(w.artist)}</h4>
          <span class="cw-status">${s.emoji} ${s.label}</span>
        </div>
        ${w.notes ? `<p class="cw-notes">${escapeHtml(w.notes)}</p>` : ''}
        <button class="cw-remove" data-cw-remove="${escapeHtml(w.artist)}" title="Stop watching">✕ Stop watching</button>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-cw-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const artist = btn.dataset.cwRemove;
      if (!confirm(`Stop watching ${artist}?`)) return;
      try {
        await api('/api/concert-watch/' + encodeURIComponent(artist), { method: 'DELETE' });
        CLUB.concertWatches = CLUB.concertWatches.filter(w => w.artist !== artist);
        renderConcertWatches();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupConcertWatchForm() {
  const form = $('#concert-watch-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const artist = $('#watch-artist').value.trim();
    const addedBy = $('#watch-by').value;
    const notes = $('#watch-notes').value.trim();
    const msg = $('#watch-msg');
    if (!artist) { if (msg) { msg.textContent = 'Artist required!'; msg.className = 'error'; } return; }
    try {
      const res = await api('/api/concert-watch', { method: 'POST', body: { artist, addedBy, notes } });
      if (!CLUB.concertWatches) CLUB.concertWatches = [];
      CLUB.concertWatches.unshift(res.watch);
      renderConcertWatches();
      form.reset();
      if (msg) { msg.textContent = '👀 Now watching!'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 2500);
    } catch (err) {
      if (msg) { msg.textContent = 'Failed: ' + err.message; msg.className = 'error'; }
    }
  });
}

// ---------- 🎂 BIRTHDAY BRAIN ----------
async function renderBirthdays() {
  const el = $('#birthday-list');
  if (!el) return;
  try {
    const data = await api('/api/birthdays');
    const list = data.birthdays || [];
    if (list.length === 0) {
      el.innerHTML = `<div class="loading">Fill in birthdays in the Parents' Dashboard to light this up! 🎂</div>`;
      return;
    }
    el.innerHTML = list.map(b => {
      let label = '';
      let cls = 'birthday-card';
      if (b.daysUntil === 0) { label = '🎉 TODAY!'; cls += ' birthday-today'; }
      else if (b.daysUntil <= 7) { label = `🎈 in ${b.daysUntil} day${b.daysUntil === 1 ? '' : 's'}`; cls += ' birthday-soon'; }
      else if (b.daysUntil <= 30) { label = `📅 in ${b.daysUntil} days`; }
      else { label = `📆 in ${b.daysUntil} days`; }
      const member = (CLUB?.members || []).find(m => m.name === b.name);
      const emoji = member?.emoji || '🎂';
      const color = member?.color || '#FF6B9D';
      return `
        <div class="${cls}" style="border-color: ${color}">
          <div class="birthday-header">
            <span class="birthday-emoji">${emoji}</span>
            <div>
              <h3>${escapeHtml(b.name)}</h3>
              <p class="birthday-when">${label}</p>
            </div>
          </div>
          <p class="birthday-meta">🎂 Turning <strong>${b.turning}</strong> on <strong>${escapeHtml(b.birthday)}</strong></p>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="error">Could not load birthdays</div>`;
  }
}

// ---------- 🌟 HALL OF FAME ----------
async function renderHallOfFame() {
  const cats = $('#hof-categories');
  const stats = $('#hof-stats');
  if (!cats || !stats) return;
  try {
    const data = await api('/api/hall-of-fame');
    const trophyCard = (emoji, label, winner, statKey) => {
      if (!winner || winner[statKey] === 0) return `<div class="hof-trophy hof-trophy-empty">${emoji}<h4>${label}</h4><p>No data yet</p></div>`;
      const member = (CLUB?.members || []).find(m => m.name === winner.name);
      return `<div class="hof-trophy" style="border-color: ${member?.color || '#FFE66D'}">
        ${emoji}<h4>${label}</h4>
        <p class="hof-winner-name">${escapeHtml(winner.name)}</p>
        <p class="hof-winner-stat">${winner[statKey]}</p>
      </div>`;
    };
    cats.innerHTML = `
      ${trophyCard('🥇', 'Most adventures', data.mostAdventures, 'adventures')}
      ${trophyCard('🎖️', 'Most days as leader', data.mostLed, 'led')}
      ${trophyCard('🏆', 'Most badges earned', data.mostBadges, 'badges')}
      ${trophyCard('📸', 'Most photos shared', data.mostPhotos, 'photos')}
    `;
    stats.innerHTML = (data.stats || []).map(s => {
      const member = (CLUB?.members || []).find(m => m.name === s.name);
      return `
        <div class="hof-stat-card" style="border-color: ${member?.color || '#ccc'}">
          <div class="hof-stat-head"><span class="hof-stat-emoji">${member?.emoji || '🌟'}</span><h4>${escapeHtml(s.name)}</h4></div>
          <div class="hof-stat-grid">
            <div><span>🛶</span><strong>${s.adventures}</strong><em>adventures</em></div>
            <div><span>🎖️</span><strong>${s.led}</strong><em>led</em></div>
            <div><span>🏆</span><strong>${s.badges}</strong><em>badges</em></div>
            <div><span>📸</span><strong>${s.photos}</strong><em>photos</em></div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    cats.innerHTML = `<div class="error">Could not load Hall of Fame</div>`;
  }
}

// ---------- 🎯 CHALLENGES ----------
async function renderChallenge() {
  const curEl = $('#challenge-current');
  const histEl = $('#challenge-history');
  if (!curEl) return;
  try {
    const data = await api('/api/challenges');
    const c = data.current;
    if (!c) { curEl.innerHTML = `<div class="loading">No challenge yet</div>`; return; }
    const memberNames = (CLUB?.members || []).filter(m => m.name !== 'Pebbles').map(m => m.name);
    const completedBy = c.completedBy || [];
    curEl.innerHTML = `
      <div class="challenge-card category-${escapeHtml(c.category)}">
        <div class="challenge-header">
          <span class="challenge-emoji">${c.emoji}</span>
          <div>
            <span class="challenge-week">Week of ${escapeHtml(c.weekStart)}</span>
            <h3>${escapeHtml(c.title)}</h3>
          </div>
        </div>
        <p class="challenge-desc">${escapeHtml(c.description)}</p>
        <div class="challenge-checkin">
          <strong>✅ Completed by:</strong>
          ${memberNames.map(n => `
            <label class="challenge-check">
              <input type="checkbox" data-challenge-id="${escapeHtml(c.id)}" data-member="${escapeHtml(n)}" ${completedBy.includes(n) ? 'checked disabled' : ''} />
              <span>${escapeHtml(n)}</span>
            </label>
          `).join('')}
        </div>
        <button id="new-challenge-btn" class="btn btn-tertiary">🔄 Pick a new challenge</button>
      </div>
    `;
    // Wire checkboxes
    curEl.querySelectorAll('input[data-challenge-id]').forEach(cb => {
      cb.addEventListener('change', async () => {
        if (!cb.checked) return;
        try {
          await api(`/api/challenges/${encodeURIComponent(cb.dataset.challengeId)}/complete`, { method: 'POST', body: { member: cb.dataset.member } });
          cb.disabled = true;
          flashMsg(`🎉 ${cb.dataset.member} completed the challenge!`, 'success');
        } catch (e) { flashMsg('Failed: ' + e.message, 'error'); cb.checked = false; }
      });
    });
    $('#new-challenge-btn')?.addEventListener('click', async () => {
      if (!confirm('Pick a fresh challenge for this week?')) return;
      try {
        await api('/api/challenges/new', { method: 'POST' });
        renderChallenge();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
    // History
    if (histEl) {
      const past = (data.history || []).filter(h => h.id !== c.id).slice(0, 10);
      histEl.innerHTML = past.length === 0 ? `<p class="loading">No past challenges yet</p>` :
        past.map(h => `<div class="challenge-past"><span class="challenge-past-emoji">${h.emoji}</span><div><strong>${escapeHtml(h.title)}</strong><br><small>Week of ${escapeHtml(h.weekStart)} • completed by ${h.completedBy.length}/${(CLUB?.members||[]).filter(m=>m.name!=='Pebbles').length}</small></div></div>`).join('');
    }
  } catch (e) {
    curEl.innerHTML = `<div class="error">Could not load challenge</div>`;
  }
}

// ---------- 🗺️ ADVENTURE MAP ----------
// Roughly the SE QLD bounding box for our SVG map
const MAP_LAT_MIN = -28.2, MAP_LAT_MAX = -25.8;
const MAP_LON_MIN = 151.8, MAP_LON_MAX = 153.6;
const MAP_W = 600, MAP_H = 600;

function latLonToXY(lat, lon) {
  const x = ((lon - MAP_LON_MIN) / (MAP_LON_MAX - MAP_LON_MIN)) * MAP_W;
  const y = ((MAP_LAT_MAX - lat) / (MAP_LAT_MAX - MAP_LAT_MIN)) * MAP_H;
  return { x, y };
}

function renderAdventureMap() {
  const svgWrap = $('#adventure-map-svg');
  const listWrap = $('#adventure-spots-list');
  if (!svgWrap || !listWrap || !CLUB) return;
  const spots = CLUB.adventureSpots || [];

  // SVG map with stylised coast
  svgWrap.innerHTML = `
    <svg viewBox="0 0 ${MAP_W} ${MAP_H}" class="adv-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="oceanGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#a5d8ff"/>
          <stop offset="100%" stop-color="#74b9ff"/>
        </linearGradient>
        <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d4edda"/>
          <stop offset="100%" stop-color="#a8d5b3"/>
        </linearGradient>
      </defs>
      <rect width="${MAP_W}" height="${MAP_H}" fill="url(#oceanGrad)"/>
      <!-- Simplified SE QLD coastline (rough shape) -->
      <path d="M 0,80 Q 60,90 110,110 Q 160,130 200,160 Q 230,200 250,260 Q 270,330 295,400 Q 320,470 340,540 Q 360,600 0,600 Z"
            fill="url(#landGrad)" stroke="#8fbc8f" stroke-width="2"/>
      <!-- Brisbane river hint -->
      <path d="M 200,420 Q 240,440 280,460 Q 320,475 360,490" stroke="#74b9ff" stroke-width="3" fill="none" opacity="0.6"/>
      <!-- City labels -->
      <text x="240" y="120" font-size="13" fill="#555" font-weight="700">Noosa</text>
      <text x="180" y="260" font-size="13" fill="#555" font-weight="700">Sunshine Coast</text>
      <text x="180" y="475" font-size="13" fill="#555" font-weight="700">Brisbane</text>
      <text x="100" y="330" font-size="12" fill="#666" font-style="italic">Hinterland</text>
      ${spots.map(s => {
        const { x, y } = latLonToXY(s.lat, s.lon);
        const inside = x >= 0 && x <= MAP_W && y >= 0 && y <= MAP_H;
        if (!inside) return '';
        const color = s.status === 'visited' ? '#2ecc71' : s.status === 'planned' ? '#f39c12' : '#9b59b6';
        return `
          <g class="map-pin" data-spot-id="${escapeHtml(s.id)}" transform="translate(${x},${y})">
            <circle r="14" fill="${color}" stroke="white" stroke-width="3" opacity="0.95"/>
            <text y="5" text-anchor="middle" font-size="14">${s.emoji}</text>
            <title>${escapeHtml(s.name)} (${s.status})</title>
          </g>
        `;
      }).join('')}
    </svg>
  `;

  // List view
  listWrap.innerHTML = spots.map(s => {
    const statusEmoji = s.status === 'visited' ? '✅' : s.status === 'planned' ? '📅' : '⭐';
    return `
      <div class="spot-item" data-spot-id="${escapeHtml(s.id)}">
        <span class="spot-emoji">${s.emoji}</span>
        <div class="spot-body">
          <div class="spot-name"><strong>${escapeHtml(s.name)}</strong> <span class="spot-status">${statusEmoji} ${s.status}</span></div>
          ${s.notes ? `<div class="spot-notes">${escapeHtml(s.notes)}</div>` : ''}
        </div>
        <div class="spot-actions">
          <select class="spot-status-select" data-spot-id="${escapeHtml(s.id)}">
            <option value="wishlist" ${s.status==='wishlist'?'selected':''}>Wishlist</option>
            <option value="planned" ${s.status==='planned'?'selected':''}>Planned</option>
            <option value="visited" ${s.status==='visited'?'selected':''}>Visited</option>
          </select>
          <button class="spot-remove" data-spot-remove="${escapeHtml(s.id)}" title="Remove">✕</button>
        </div>
      </div>
    `;
  }).join('');

  listWrap.querySelectorAll('.spot-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/api/adventure-spots/${encodeURIComponent(sel.dataset.spotId)}`, { method: 'PATCH', body: { status: sel.value } });
        const spot = CLUB.adventureSpots.find(s => s.id === sel.dataset.spotId);
        if (spot) spot.status = sel.value;
        renderAdventureMap();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
  listWrap.querySelectorAll('[data-spot-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this spot?')) return;
      try {
        await api(`/api/adventure-spots/${encodeURIComponent(btn.dataset.spotRemove)}`, { method: 'DELETE' });
        CLUB.adventureSpots = CLUB.adventureSpots.filter(s => s.id !== btn.dataset.spotRemove);
        renderAdventureMap();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupSpotForm() {
  const form = $('#spot-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: $('#spot-name').value.trim(),
      emoji: $('#spot-emoji').value.trim() || '📍',
      lat: Number($('#spot-lat').value),
      lon: Number($('#spot-lon').value),
      notes: $('#spot-notes').value.trim(),
      status: $('#spot-status').value,
    };
    if (!body.name || !Number.isFinite(body.lat) || !Number.isFinite(body.lon)) {
      flashMsg('Name + valid lat/lon required!', 'error'); return;
    }
    try {
      const res = await api('/api/adventure-spots', { method: 'POST', body });
      if (!CLUB.adventureSpots) CLUB.adventureSpots = [];
      CLUB.adventureSpots.push(res.spot);
      renderAdventureMap();
      form.reset();
      flashMsg('📍 Added to the map!', 'success');
    } catch (err) { flashMsg('Failed: ' + err.message, 'error'); }
  });
}

// ---------- 📔 ADVENTURE DIARY ----------
function renderDiary() {
  const wrap = $('#diary-entries');
  const sel = $('#diary-event-select');
  if (!wrap || !CLUB) return;
  const entries = CLUB.diary || [];
  // Refresh event select
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Pick an event from your calendar...</option>` +
      EVENTS.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.date)} — ${escapeHtml(e.title)}</option>`).join('');
    sel.value = cur;
  }
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="loading">No diary entries yet — pick an event above and ask Pebbles to write it! 🐾</div>`;
    return;
  }
  wrap.innerHTML = entries.map(e => `
    <article class="diary-entry" data-id="${escapeHtml(e.id)}">
      <header class="diary-entry-head">
        <h3>📔 ${escapeHtml(e.title)}</h3>
        ${e.date ? `<span class="diary-date">${escapeHtml(e.date)}</span>` : ''}
        <button class="diary-remove" data-diary-remove="${escapeHtml(e.id)}" title="Remove">✕</button>
      </header>
      <div class="diary-story">${escapeHtml(e.story).replace(/\n/g, '<br>')}</div>
      ${e.mentionedMembers?.length ? `<footer class="diary-members">⭐ ${e.mentionedMembers.map(m => `<span class="chip member">${escapeHtml(m)}</span>`).join('')}</footer>` : ''}
    </article>
  `).join('');
  wrap.querySelectorAll('[data-diary-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this diary entry?')) return;
      try {
        await api(`/api/diary/${encodeURIComponent(btn.dataset.diaryRemove)}`, { method: 'DELETE' });
        CLUB.diary = CLUB.diary.filter(d => d.id !== btn.dataset.diaryRemove);
        renderDiary();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupDiaryGenerator() {
  const btn = $('#diary-generate-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const eventId = $('#diary-event-select').value;
    const msg = $('#diary-msg');
    if (!eventId) { if (msg) { msg.textContent = 'Pick an event first!'; msg.className = 'error'; } return; }
    if (msg) { msg.textContent = '🐾 Pebbles is writing your diary entry... (this takes 10-20 seconds)'; msg.className = ''; }
    btn.disabled = true;
    try {
      const res = await api('/api/diary/generate', { method: 'POST', body: { eventId } });
      if (!CLUB.diary) CLUB.diary = [];
      CLUB.diary.unshift(res.entry);
      renderDiary();
      if (msg) { msg.textContent = '✨ Done! Read it below.'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 4000);
    } catch (e) {
      if (msg) { msg.textContent = 'Failed: ' + e.message; msg.className = 'error'; }
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 📸 PHOTO CAPTION BATTLE ----------
function renderCaptionBattles() {
  const wrap = $('#caption-battles-list');
  const sel = $('#caption-gallery-select');
  if (!wrap || !CLUB) return;
  const battles = CLUB.captionBattles || [];

  if (sel) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Pick a photo from your gallery...</option>` +
      (GALLERY || []).filter(g => g.type === 'photo').slice(0, 30).map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.caption || 'photo from ' + new Date(g.createdAt).toLocaleDateString())}</option>`).join('');
    sel.value = cur;
  }

  if (battles.length === 0) {
    wrap.innerHTML = `<div class="loading">No caption battles yet — pick a photo above and let Pebbles cook! 🐾</div>`;
    return;
  }

  wrap.innerHTML = battles.map(b => {
    const item = (GALLERY || []).find(g => g.id === b.galleryItemId);
    const topVotes = Math.max(...b.captions.map(c => c.votes.length), 0);
    return `
      <div class="caption-battle" data-id="${escapeHtml(b.id)}">
        ${item ? `<img class="cb-photo" src="${item.dataUrl}" alt="${escapeHtml(item.caption || 'photo')}" />` : '<div class="cb-no-photo">(photo no longer available)</div>'}
        <div class="cb-captions">
          ${b.captions.map(cap => {
            const isWinner = cap.votes.length === topVotes && topVotes > 0;
            return `
              <div class="cb-caption ${isWinner ? 'cb-caption-winner' : ''}">
                <div class="cb-caption-text">${cap.author === 'pebbles' ? '🐾' : '👤'} ${escapeHtml(cap.text)}</div>
                <div class="cb-caption-meta">
                  <span class="cb-author">by ${escapeHtml(cap.author === 'pebbles' ? 'Pebbles' : cap.author)}</span>
                  <span class="cb-votes">${cap.votes.length} vote${cap.votes.length === 1 ? '' : 's'}</span>
                </div>
                <div class="cb-vote-buttons">
                  ${(CLUB?.members || []).filter(m => m.name !== 'Pebbles').map(m => {
                    const voted = cap.votes.includes(m.name);
                    return `<button class="cb-vote-btn ${voted ? 'voted' : ''}" data-vote-battle="${escapeHtml(b.id)}" data-vote-caption="${escapeHtml(cap.id)}" data-vote-voter="${escapeHtml(m.name)}" title="${escapeHtml(m.name)} votes">${m.emoji}</button>`;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <form class="cb-add-form" data-battle-id="${escapeHtml(b.id)}">
          <input type="text" class="cb-new-text" maxlength="200" placeholder="Add your own caption..." />
          <select class="cb-new-author">
            ${(CLUB?.members || []).filter(m => m.name !== 'Pebbles').map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')}
          </select>
          <button type="submit" class="btn btn-tertiary">➕ Add</button>
        </form>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.cb-vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/caption-battles/${encodeURIComponent(btn.dataset.voteBattle)}/vote`, {
          method: 'POST',
          body: { captionId: btn.dataset.voteCaption, voter: btn.dataset.voteVoter }
        });
        const idx = CLUB.captionBattles.findIndex(x => x.id === res.battle.id);
        if (idx >= 0) CLUB.captionBattles[idx] = res.battle;
        renderCaptionBattles();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
  wrap.querySelectorAll('.cb-add-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector('.cb-new-text').value.trim();
      const author = form.querySelector('.cb-new-author').value;
      if (!text) return;
      try {
        const res = await api(`/api/caption-battles/${encodeURIComponent(form.dataset.battleId)}/add-caption`, { method: 'POST', body: { text, author } });
        const idx = CLUB.captionBattles.findIndex(x => x.id === res.battle.id);
        if (idx >= 0) CLUB.captionBattles[idx] = res.battle;
        renderCaptionBattles();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupCaptionBattleStarter() {
  const btn = $('#caption-start-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const galleryItemId = $('#caption-gallery-select').value;
    const msg = $('#caption-start-msg');
    if (!galleryItemId) { if (msg) { msg.textContent = 'Pick a photo first!'; msg.className = 'error'; } return; }
    if (msg) { msg.textContent = '🐾 Pebbles is writing 3 captions... (10-20s)'; msg.className = ''; }
    btn.disabled = true;
    try {
      const res = await api('/api/caption-battles/start', { method: 'POST', body: { galleryItemId } });
      if (!CLUB.captionBattles) CLUB.captionBattles = [];
      CLUB.captionBattles.unshift(res.battle);
      renderCaptionBattles();
      if (msg) { msg.textContent = '🎬 Battle on! Scroll down to vote.'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 4000);
    } catch (e) {
      if (msg) { msg.textContent = 'Failed: ' + e.message; msg.className = 'error'; }
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 💌 POSTCARDS ----------
function renderPostcards() {
  const wrap = $('#postcards-list');
  const sel = $('#postcard-event');
  if (!wrap || !CLUB) return;
  const postcards = CLUB.postcards || [];
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">(no specific event)</option>` +
      EVENTS.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.date)} — ${escapeHtml(e.title)}</option>`).join('');
    sel.value = cur;
  }
  if (postcards.length === 0) {
    wrap.innerHTML = `<div class="loading">No postcards yet — write one when a kid misses out 💛</div>`;
    return;
  }
  wrap.innerHTML = postcards.map(p => {
    const member = (CLUB?.members || []).find(m => m.name === p.toMember);
    return `
      <div class="postcard" data-id="${escapeHtml(p.id)}" style="border-color: ${member?.color || '#FFB6C1'}">
        <div class="postcard-head">
          <span class="postcard-stamp">💌</span>
          <div>
            <div class="postcard-to">To: <strong>${escapeHtml(p.toMember)}</strong> ${member ? `<span class="postcard-emoji">${member.emoji}</span>` : ''}</div>
            ${p.fromEventTitle ? `<div class="postcard-event">re: ${escapeHtml(p.fromEventTitle)}</div>` : ''}
          </div>
          <button class="postcard-remove" data-postcard-remove="${escapeHtml(p.id)}" title="Remove">✕</button>
        </div>
        <div class="postcard-message">${escapeHtml(p.message).replace(/\n/g, '<br>')}</div>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('[data-postcard-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this postcard?')) return;
      try {
        await api(`/api/postcards/${encodeURIComponent(btn.dataset.postcardRemove)}`, { method: 'DELETE' });
        CLUB.postcards = CLUB.postcards.filter(p => p.id !== btn.dataset.postcardRemove);
        renderPostcards();
      } catch (e) { flashMsg('Failed: ' + e.message, 'error'); }
    });
  });
}

function setupPostcardGenerator() {
  const btn = $('#postcard-generate-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const toMember = $('#postcard-to').value;
    const eventId = $('#postcard-event').value;
    const msg = $('#postcard-msg');
    if (msg) { msg.textContent = '🐾 Pebbles is writing... (10-20s)'; msg.className = ''; }
    btn.disabled = true;
    try {
      const res = await api('/api/postcards/generate', { method: 'POST', body: { toMember, eventId } });
      if (!CLUB.postcards) CLUB.postcards = [];
      CLUB.postcards.unshift(res.postcard);
      renderPostcards();
      if (msg) { msg.textContent = '💌 Written! Read it below.'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 4000);
    } catch (e) {
      if (msg) { msg.textContent = 'Failed: ' + e.message; msg.className = 'error'; }
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 🎤 VOICE PEBBLES ----------
let VOICE_RECOGNITION = null;
let VOICE_IS_LISTENING = false;

function setupVoicePebbles() {
  const btn = $('#voice-pebbles-btn');
  const statusEl = $('#voice-status');
  const transcriptEl = $('#voice-transcript');
  if (!btn) return;

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    btn.disabled = true;
    if (statusEl) statusEl.textContent = '⚠️ Voice not supported on this browser. Try Chrome or Safari on a phone!';
    return;
  }

  VOICE_RECOGNITION = new SpeechRec();
  VOICE_RECOGNITION.continuous = false;
  VOICE_RECOGNITION.interimResults = false;
  VOICE_RECOGNITION.lang = 'en-AU';

  VOICE_RECOGNITION.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcriptEl) transcriptEl.innerHTML = `<div class="voice-you">👤 You: ${escapeHtml(transcript)}</div>`;
    if (statusEl) statusEl.textContent = '🐾 Pebbles is thinking...';
    // Send to Pebbles chat API
    try {
      const res = await api('/api/pebbles/chat', { method: 'POST', body: { messages: [{ role: 'user', content: transcript }], user: 'voice-user' } });
      const reply = res.message?.content || 'Woof! 🐾';
      if (transcriptEl) transcriptEl.innerHTML += `<div class="voice-pebbles">🐾 Pebbles: ${escapeHtml(reply)}</div>`;
      if (statusEl) statusEl.textContent = '🔊 Pebbles is speaking...';
      // Speak with Web Speech API
      const utterance = new SpeechSynthesisUtterance(reply.replace(/\*[^*]+\*/g, '').replace(/[🐾💛✨🌟🎉🎵🎯🌈]/gu, ''));
      utterance.lang = 'en-AU';
      utterance.rate = 1.0;
      utterance.pitch = 1.2;
      // Try to pick a female voice
      const voices = speechSynthesis.getVoices();
      const aussieFemale = voices.find(v => /en-AU/i.test(v.lang) && /female/i.test(v.name)) || voices.find(v => /en-AU/i.test(v.lang)) || voices.find(v => /en-GB/i.test(v.lang));
      if (aussieFemale) utterance.voice = aussieFemale;
      utterance.onend = () => { if (statusEl) statusEl.textContent = '✅ Click the mic to ask again!'; };
      speechSynthesis.speak(utterance);
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Failed: ' + e.message;
    }
  };

  VOICE_RECOGNITION.onerror = (e) => {
    VOICE_IS_LISTENING = false;
    btn.classList.remove('listening');
    if (statusEl) statusEl.textContent = '❌ ' + (e.error === 'not-allowed' ? 'Microphone permission denied' : 'Voice error: ' + e.error);
  };
  VOICE_RECOGNITION.onend = () => {
    VOICE_IS_LISTENING = false;
    btn.classList.remove('listening');
  };

  btn.addEventListener('click', () => {
    if (VOICE_IS_LISTENING) {
      VOICE_RECOGNITION.stop();
      return;
    }
    try {
      VOICE_RECOGNITION.start();
      VOICE_IS_LISTENING = true;
      btn.classList.add('listening');
      if (statusEl) statusEl.textContent = '🎤 Listening... speak now!';
      if (transcriptEl) transcriptEl.innerHTML = '';
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Could not start mic: ' + e.message;
    }
  });
}

// ---------- 👤 KID PROFILE MODAL (opens when a crew card is tapped) ----------
function openKidProfileModal(name) {
  const overlay = $('#kid-profile-modal');
  const content = $('#kp-modal-content');
  if (!overlay || !content || !CLUB) return;

  const member = CLUB.members.find(m => m.name === name);
  if (!member) return;

  const isPebbles = name === 'Pebbles';
  const avatarSrc = isPebbles ? '/static/pebbles.png?v=2' : `/static/avatars/${name.toLowerCase()}.png?v=2`;
  const hasAvatar = isPebbles || ['Ace', 'Charlotte', 'Elijah', 'Saia', 'Sienna'].includes(name);

  // Pull stats from existing data
  const profile = (CLUB.kidProfiles || []).find(p => p.name === name) || {};
  const ledEvents = (EVENTS || []).filter(e => e.leader === name);
  const memberEvents = (EVENTS || []).filter(e => Array.isArray(e.members) && e.members.includes(name));
  const myAwards = (AWARDS || []).filter(a => a.member === name);
  const myPhotos = (GALLERY || []).filter(g => Array.isArray(g.members) && g.members.includes(name));
  const myPostcards = (CLUB.postcards || []).filter(p => p.toMember === name);

  // Find badge details for each award
  const badgeMap = Object.fromEntries((CLUB.badges || []).map(b => [b.id, b]));

  const avatarHtml = hasAvatar
    ? `<div class="kp-modal-avatar" style="background:${member.color}"><img src="${avatarSrc}" alt="${escapeHtml(name)}" /></div>`
    : `<div class="kp-modal-avatar" style="background:${member.color}"><span style="font-size:5rem">${member.emoji}</span></div>`;

  let extraSections = '';

  if (isPebbles) {
    extraSections = `
      <div class="kp-modal-section">
        <h3>🐾 About me</h3>
        <p>G'day! I'm <strong>Pebbles</strong> — the Fab 5 Fun Club mascot. I'm a young pup with a white coat, dark ears, and a black patch over one eye. I love going on every adventure with the crew, and I'm also their AI helper! Ask me anything in the chat. 💛</p>
      </div>
      <div class="kp-modal-section">
        <h3>✨ What I'm good at</h3>
        <ul class="kp-list">
          <li>🎯 Helping pick activities and events</li>
          <li>📝 Writing diary entries from your adventures</li>
          <li>💌 Writing postcards to kids who missed out</li>
          <li>📸 Coming up with funny photo captions</li>
          <li>🌦️ Checking the weather before adventures</li>
          <li>🗳️ Deciding who leads the day (Pebbles Picks)</li>
        </ul>
      </div>
    `;
  } else {
    // Kid profile: birthday, allergies, the spark, snacks
    const fav = profile.theSpark ? `<p class="kp-fact"><strong>✨ The Spark:</strong> ${escapeHtml(profile.theSpark)}</p>` : '';
    const allergies = profile.allergies ? `<p class="kp-fact kp-allergies"><strong>⚠️ Allergies / dietary:</strong> ${escapeHtml(profile.allergies)}</p>` : '';
    const snacks = profile.favouriteSnacks ? `<p class="kp-fact"><strong>🍎 Favourite snacks:</strong> ${escapeHtml(profile.favouriteSnacks)}</p>` : '';
    const bday = profile.birthday ? `<p class="kp-fact"><strong>🎂 Birthday:</strong> ${escapeHtml(profile.birthday)}</p>` : '';

    let profileFacts = '';
    if (fav || allergies || snacks || bday) {
      profileFacts = `
        <div class="kp-modal-section">
          <h3>💛 About ${escapeHtml(name)}</h3>
          ${bday}${fav}${snacks}${allergies}
        </div>`;
    } else {
      profileFacts = `
        <div class="kp-modal-section">
          <h3>💛 About ${escapeHtml(name)}</h3>
          <p class="kp-empty">No profile info yet! A parent or grown-up can fill this in from the Parents' Dashboard. 🐾</p>
        </div>`;
    }

    // Stats grid
    const statsHtml = `
      <div class="kp-modal-section">
        <h3>🌟 ${escapeHtml(name)}'s crew stats</h3>
        <div class="kp-stats">
          <div class="kp-stat"><span>🛶</span><strong>${memberEvents.length}</strong><em>adventures</em></div>
          <div class="kp-stat"><span>🎖️</span><strong>${ledEvents.length}</strong><em>days as leader</em></div>
          <div class="kp-stat"><span>🏆</span><strong>${myAwards.length}</strong><em>badges</em></div>
          <div class="kp-stat"><span>📸</span><strong>${myPhotos.length}</strong><em>photos</em></div>
        </div>
      </div>`;

    // Badges
    const badgesHtml = myAwards.length > 0 ? `
      <div class="kp-modal-section">
        <h3>🏆 Badges earned</h3>
        <div class="kp-badges">
          ${myAwards.map(a => {
            const b = badgeMap[a.badgeId] || { emoji: '🏅', name: a.badgeId };
            return `<div class="kp-badge"><span class="kp-badge-emoji">${b.emoji}</span><div><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(a.note || '')}</small></div></div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Recent adventures (max 5)
    const advHtml = memberEvents.length > 0 ? `
      <div class="kp-modal-section">
        <h3>🛶 Recent adventures</h3>
        <ul class="kp-list">
          ${memberEvents.slice(0, 5).map(e => `<li><strong>${escapeHtml(e.date)}</strong> — ${escapeHtml(e.title)} ${e.leader === name ? '<span class="kp-led-tag">🎖️ Led</span>' : ''}</li>`).join('')}
        </ul>
      </div>` : '';

    // Postcards
    const pcHtml = myPostcards.length > 0 ? `
      <div class="kp-modal-section">
        <h3>💌 Postcards for ${escapeHtml(name)}</h3>
        <p class="kp-meta">${myPostcards.length} postcard${myPostcards.length === 1 ? '' : 's'} written by Pebbles 🐾</p>
      </div>` : '';

    extraSections = profileFacts + statsHtml + badgesHtml + advHtml + pcHtml;
  }

  content.innerHTML = `
    <div class="kp-modal-header" style="border-color:${member.color}">
      ${avatarHtml}
      <div class="kp-modal-meta">
        <h2 id="kp-modal-name">${escapeHtml(name)}</h2>
        <p class="kp-modal-role">${escapeHtml(member.role)}</p>
      </div>
    </div>
    ${extraSections}
  `;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeKidProfileModal() {
  const overlay = $('#kid-profile-modal');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function setupKidProfileModal() {
  const overlay = $('#kid-profile-modal');
  const closeBtn = $('#kp-modal-close');
  if (!overlay || !closeBtn) return;
  closeBtn.addEventListener('click', closeKidProfileModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeKidProfileModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeKidProfileModal();
  });
}

// ---------- 🪄 ONBOARDING WIZARD ----------
const WIZARD_STORAGE_KEY = 'fab5_tour_completed_v1';
let WIZARD_STEP = 0;

const WIZARD_STEPS = [
  {
    emoji: '🎉',
    title: "G'day! I'm Pebbles 🐾",
    body: `Welcome to the <strong>Fab 5 Fun Club</strong>! We're five mates plus one good dog (that's me) having the best adventures on the Sunshine Coast.<br><br>This little tour will show you around. It takes about 1 minute. Ready?`,
    img: '/static/pebbles.png?v=2',
    imgAlt: 'Pebbles the dog'
  },
  {
    emoji: '👋',
    title: 'Meet the crew',
    body: `Five legends. Each one good at their own thing. Tap any card on the homepage to open their full profile — birthday, badges, things they love, adventures they've been on.`,
    img: '/static/fab5-group.png?v=2',
    imgAlt: 'The Fab 5 crew'
  },
  {
    emoji: '🌟',
    title: 'What we DO',
    body: `We do everything fun on the Sunshine Coast. <strong>And I mean everything</strong>:`,
    activities: true
  },
  {
    emoji: '🐾',
    title: 'Ask me anything',
    body: `I'm your AI mate! Tap the floating <strong>🐾 chat button</strong> in the corner any time to ask me:<br><br>
      • What should I wear on Saturday?<br>
      • Who should lead the next adventure?<br>
      • Write me a diary about our beach day<br>
      • What's the weather like for Sunday?<br>
      • Pick a Crew Challenge for this week<br><br>
      I never get tired of helping! 💛`
  },
  {
    emoji: '🚀',
    title: "You're ready! Let's go!",
    body: `Some good places to start:`,
    quickLinks: [
      { emoji: '📅', label: 'See the calendar', href: '#calendar' },
      { emoji: '👋', label: 'Meet the crew', href: '#members' },
      { emoji: '🎯', label: 'This week\'s challenge', href: '#challenge' },
      { emoji: '🗺️', label: 'Adventure map', href: '#adventure-map' },
      { emoji: '🎤', label: 'Talk to Pebbles', href: '#voice-pebbles' }
    ]
  }
];

function renderWizardStep() {
  const content = $('#wizard-content');
  const dots = $('#wizard-dots');
  const backBtn = $('#wizard-back');
  const nextBtn = $('#wizard-next');
  if (!content || !dots) return;

  const step = WIZARD_STEPS[WIZARD_STEP];
  const isLast = WIZARD_STEP === WIZARD_STEPS.length - 1;

  // Build extras (activities grid or quick-link buttons)
  let extra = '';
  if (step.activities && CLUB?.activities) {
    extra = `<div class="wizard-activities">${CLUB.activities.map(a => `<div class="wizard-activity">${a.emoji} <span>${escapeHtml(a.name)}</span></div>`).join('')}</div>`;
  } else if (step.quickLinks) {
    extra = `<div class="wizard-quicklinks">${step.quickLinks.map(q => `<a href="${q.href}" class="wizard-quicklink" data-wizard-close>${q.emoji} ${escapeHtml(q.label)}</a>`).join('')}</div>`;
  }

  const imgHtml = step.img ? `<img class="wizard-img" src="${step.img}" alt="${escapeHtml(step.imgAlt || '')}" />` : '';

  content.innerHTML = `
    <div class="wizard-step">
      <div class="wizard-step-emoji">${step.emoji}</div>
      <h2 class="wizard-step-title">${escapeHtml(step.title)}</h2>
      ${imgHtml}
      <div class="wizard-step-body">${step.body}</div>
      ${extra}
    </div>
  `;

  // Dots
  dots.innerHTML = WIZARD_STEPS.map((_, i) => `<span class="wizard-dot ${i === WIZARD_STEP ? 'active' : ''}"></span>`).join('');

  // Buttons
  if (backBtn) backBtn.style.display = WIZARD_STEP === 0 ? 'none' : 'inline-block';
  if (nextBtn) nextBtn.textContent = isLast ? "🌟 Let's go!" : 'Next →';

  // Quick-link close handlers (close wizard when a quick link is tapped)
  content.querySelectorAll('[data-wizard-close]').forEach(el => {
    el.addEventListener('click', () => closeWizard(true));
  });
}

function openWizard(fromStart = true) {
  WIZARD_STEP = 0;
  const overlay = $('#onboarding-wizard');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderWizardStep();
}

function closeWizard(markCompleted = true) {
  const overlay = $('#onboarding-wizard');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  if (markCompleted) {
    try { localStorage.setItem(WIZARD_STORAGE_KEY, '1'); } catch (e) {}
  }
}

function setupOnboardingWizard() {
  const overlay = $('#onboarding-wizard');
  const skipBtn = $('#wizard-skip');
  const backBtn = $('#wizard-back');
  const nextBtn = $('#wizard-next');
  const tourBtn = $('#take-tour-btn');
  if (!overlay) return;

  skipBtn?.addEventListener('click', () => closeWizard(true));
  backBtn?.addEventListener('click', () => {
    if (WIZARD_STEP > 0) { WIZARD_STEP--; renderWizardStep(); }
  });
  nextBtn?.addEventListener('click', () => {
    if (WIZARD_STEP < WIZARD_STEPS.length - 1) {
      WIZARD_STEP++;
      renderWizardStep();
    } else {
      closeWizard(true);
    }
  });
  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeWizard(true);
  });
  // Topnav "Take the tour" button
  tourBtn?.addEventListener('click', () => openWizard(true));

  // Auto-open for first-time visitors
  let alreadyDone = false;
  try { alreadyDone = !!localStorage.getItem(WIZARD_STORAGE_KEY); } catch (e) {}
  if (!alreadyDone) {
    // Slight delay so the page renders first
    setTimeout(() => openWizard(true), 800);
  }
}

// ---------- KID PROFILES (Parents' Dashboard) ----------
function renderKidProfiles() {
  const grid = $('#kid-profiles-grid');
  if (!grid || !CLUB) return;
  const profiles = CLUB.kidProfiles || {};
  // Render one card per Fab 5 kid (skip Pebbles — she's the mascot)
  const kids = (CLUB.members || []).filter(m => m.name !== 'Pebbles');
  grid.innerHTML = kids.map(m => {
    const p = profiles[m.name] || { name: m.name };
    const hasData = !!(p.birthday || p.hoodieSize || p.favouriteSnack || p.allergies || p.spark || p.hypeSong);
    const completeness = [p.birthday, p.hoodieSize, p.favouriteSnack, (p.allergies !== undefined), p.spark, p.hypeSong].filter(Boolean).length;
    const completePct = Math.round((completeness / 6) * 100);
    return `
      <div class="kid-profile-card" data-name="${escapeHtml(m.name)}" style="border-color: ${m.color}">
        <div class="kid-profile-header" style="background: linear-gradient(135deg, ${m.color}40 0%, ${m.color}10 100%)">
          <span class="kid-profile-emoji">${m.emoji}</span>
          <div class="kid-profile-title">
            <h3>${escapeHtml(m.name)}</h3>
            <span class="kid-profile-completeness">${completePct}% complete</span>
          </div>
        </div>
        <form class="kid-profile-form" data-kid="${escapeHtml(m.name)}">
          <div class="kpf-row">
            <label><span>🎂 Birthday</span><input type="date" name="birthday" value="${p.birthday || ''}" /></label>
            <label><span>👕 Hoodie size</span><input type="text" name="hoodieSize" maxlength="30" value="${escapeHtml(p.hoodieSize || '')}" placeholder="e.g. Kids 12" /></label>
          </div>
          <label><span>🍎 Favourite snack</span><input type="text" name="favouriteSnack" maxlength="80" value="${escapeHtml(p.favouriteSnack || '')}" placeholder="e.g. mango, watermelon, jam sandwiches" /></label>
          <label class="kpf-allergy-label"><span>⚠️ Allergies <em>(safety — leave blank if none)</em></span><input type="text" name="allergies" maxlength="200" value="${escapeHtml(p.allergies || '')}" placeholder="e.g. peanuts, dairy — or leave blank" /></label>
          <label><span>✨ Their spark <em>(one sentence about what makes them special)</em></span><input type="text" name="spark" maxlength="200" value="${escapeHtml(p.spark || '')}" placeholder="e.g. Lights up every room she walks into" /></label>
          <div class="kpf-row">
            <label><span>🎵 Hype song title</span><input type="text" name="hypeSongTitle" maxlength="120" value="${escapeHtml(p.hypeSong?.title || '')}" placeholder="e.g. vampire" /></label>
            <label><span>🎤 Artist</span><input type="text" name="hypeSongArtist" maxlength="80" value="${escapeHtml(p.hypeSong?.artist || '')}" placeholder="e.g. Olivia Rodrigo" /></label>
          </div>
          <label><span>🔗 Spotify track ID <em>(optional — for embeds)</em></span><input type="text" name="hypeSongSpotifyId" maxlength="40" value="${escapeHtml(p.hypeSong?.spotifyId || '')}" placeholder="e.g. 1kuGVB7EU95pJObxwvfwKS" /></label>
          <button type="submit" class="btn btn-primary kpf-save">💾 Save ${escapeHtml(m.name)}'s profile</button>
          <div class="kpf-msg"></div>
        </form>
      </div>
    `;
  }).join('');

  // Wire up each form
  grid.querySelectorAll('.kid-profile-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kid = form.dataset.kid;
      const fd = new FormData(form);
      const body = {
        birthday: fd.get('birthday') || '',
        hoodieSize: fd.get('hoodieSize') || '',
        favouriteSnack: fd.get('favouriteSnack') || '',
        allergies: fd.get('allergies') || '',
        spark: fd.get('spark') || '',
        hypeSong: {
          title: fd.get('hypeSongTitle') || '',
          artist: fd.get('hypeSongArtist') || '',
          spotifyId: fd.get('hypeSongSpotifyId') || ''
        }
      };
      const msg = form.querySelector('.kpf-msg');
      try {
        const res = await api('/api/kid-profiles/' + encodeURIComponent(kid), { method: 'PATCH', body });
        if (!CLUB.kidProfiles) CLUB.kidProfiles = {};
        CLUB.kidProfiles[kid] = res.profile;
        if (msg) { msg.textContent = '✅ Saved!'; msg.className = 'kpf-msg success'; }
        // Re-render so allergy chips, completeness, and event cards update
        renderKidProfiles();
        renderEventsList();
        renderDashOverview();
        renderPlaylist();
        setTimeout(() => { const m2 = $(`.kid-profile-card[data-name="${kid}"] .kpf-msg`); if (m2) { m2.textContent = ''; m2.className = 'kpf-msg'; } }, 2500);
      } catch (err) {
        if (msg) { msg.textContent = 'Failed: ' + err.message; msg.className = 'kpf-msg error'; }
      }
    });
  });
}

function renderDashOverview() {
  const el = $('#dash-overview-body');
  if (!el || !CLUB) return;
  const upcomingCount = EVENTS.filter(e => new Date(e.date) >= new Date(new Date().toDateString())).length;
  const profiles = CLUB.kidProfiles || {};
  const kids = (CLUB.members || []).filter(m => m.name !== 'Pebbles');
  const profilesFilled = kids.filter(k => profiles[k.name]?.spark || profiles[k.name]?.birthday).length;
  const totalAllergies = kids.filter(k => profiles[k.name]?.allergies).length;
  const bf = CLUB.bottleFund || {};
  const goal = bf.goal || {};
  const raised = Number(goal.raisedAud) || 0;
  const target = Number(goal.targetAud) || 0;
  const pct = target > 0 ? Math.round((raised / target) * 100) : 0;

  el.innerHTML = `
    <div class="dash-stats">
      <div class="dash-stat"><span class="dash-stat-num">${EVENTS.length}</span><span class="dash-stat-label">📅 Total events</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${upcomingCount}</span><span class="dash-stat-label">🔜 Upcoming</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${AWARDS.length}</span><span class="dash-stat-label">🏆 Badges awarded</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${GALLERY.length}</span><span class="dash-stat-label">📸 Gallery items</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${CONCERTS.length}</span><span class="dash-stat-label">🎵 Concerts wishlist</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${SUGGESTIONS.length}</span><span class="dash-stat-label">💌 Suggestions</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${profilesFilled}/${kids.length}</span><span class="dash-stat-label">🧒 Profiles set up</span></div>
      <div class="dash-stat"><span class="dash-stat-num">${totalAllergies}</span><span class="dash-stat-label">⚠️ Kids with allergies</span></div>
      <div class="dash-stat"><span class="dash-stat-num">$${raised.toFixed(0)}</span><span class="dash-stat-label">🥤 Raised (${pct}% of goal)</span></div>
    </div>
  `;
}

// ---------- BOTTLES FOR THE CREW ----------
function bottleInviteMessage() {
  const bf = CLUB?.bottleFund;
  const joinUrl = bf?.teamJoinUrl || '';
  const goalTitle = bf?.goal?.title || 'something epic';
  const goalEmoji = bf?.goal?.emoji || '🎽';
  return (
    `Hi! The Fab 5 Fun Club (a kids' adventure crew on the Sunshine Coast 🌈) is fundraising through Containers for Change Queensland to save up for ${goalEmoji} ${goalTitle}.\n\n` +
    `It's free to join the team — every 10c bottle/can you'd normally throw out gets donated to the kids' adventures instead. No payment details, just one click to join the team "fab5funclub":\n\n` +
    `${joinUrl}\n\n` +
    `Thank you for helping the crew! 💛🥤`
  );
}

function renderBottleFund() {
  const bf = CLUB?.bottleFund;
  if (!bf) return;

  // Join button URL
  const joinBtn = $('#bottle-join-btn');
  if (joinBtn) {
    joinBtn.href = bf.teamJoinUrl;
    joinBtn.innerHTML = `🚀 Join the team "<strong>${escapeHtml(bf.teamName)}</strong>" on Containers for Change`;
  }

  // Goal text
  const goal = bf.goal || {};
  const emojiEl = $('#bottle-goal-emoji'); if (emojiEl) emojiEl.textContent = goal.emoji || '🎯';
  const titleEl = $('#bottle-goal-title'); if (titleEl) titleEl.textContent = goal.title || 'Our crew goal';
  const descEl = $('#bottle-goal-desc'); if (descEl) descEl.textContent = goal.description || '';

  // Progress bar
  const raised = Number(goal.raisedAud) || 0;
  const target = Number(goal.targetAud) || 0;
  const pct = target > 0 ? Math.min(100, Math.max(0, (raised / target) * 100)) : 0;
  const fill = $('#bottle-progress-fill');
  if (fill) fill.style.width = pct.toFixed(1) + '%';
  const raisedEl = $('#bottle-raised'); if (raisedEl) raisedEl.textContent = '$' + raised.toFixed(2);
  const targetEl = $('#bottle-target'); if (targetEl) targetEl.textContent = '$' + target.toFixed(0);
  const pctEl = $('#bottle-percent'); if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';

  // Bottles count (10c per container in QLD)
  const remaining = Math.max(0, target - raised);
  const bottlesNeeded = Math.ceil(remaining / 0.10);
  const bottlesEl = $('#bottle-bottles-count');
  if (bottlesEl) {
    if (target <= 0) {
      bottlesEl.innerHTML = `Set a goal in the admin section to track bottles! 🎯`;
    } else if (raised >= target) {
      bottlesEl.innerHTML = `🎉 <strong>We hit the goal!</strong> Time to pick a new one. 🌟`;
    } else {
      bottlesEl.innerHTML = `That's about <strong>${bottlesNeeded.toLocaleString()} bottles</strong> still to find! 🥤`;
    }
  }

  // Prefill admin forms with current values
  const gt = $('#goal-title'); if (gt && !gt.matches(':focus')) gt.value = goal.title || '';
  const ge = $('#goal-emoji'); if (ge && !ge.matches(':focus')) ge.value = goal.emoji || '';
  const gtarg = $('#goal-target'); if (gtarg && !gtarg.matches(':focus')) gtarg.value = goal.targetAud || '';
  const gd = $('#goal-desc'); if (gd && !gd.matches(':focus')) gd.value = goal.description || '';
  const ra = $('#raised-amount'); if (ra && !ra.matches(':focus')) ra.value = goal.raisedAud || '';

  // Heroes list
  renderBottleHeroes();
}

function renderBottleHeroes() {
  const bf = CLUB?.bottleFund;
  const list = $('#bottle-heroes-list');
  if (!list || !bf) return;
  const heroes = bf.heroes || [];
  if (heroes.length === 0) {
    list.innerHTML = `<div class="loading">No heroes added yet — be the first! 🌟</div>`;
    return;
  }
  list.innerHTML = heroes.map(h => `
    <div class="bottle-hero-item" data-id="${escapeHtml(h.id)}">
      <div class="bottle-hero-icon">🌟</div>
      <div class="bottle-hero-body">
        <div class="bottle-hero-name">${escapeHtml(h.name)} ${h.month ? `<span class="bottle-hero-month">• ${escapeHtml(h.month)}</span>` : ''}</div>
        ${h.note ? `<div class="bottle-hero-note">${escapeHtml(h.note)}</div>` : ''}
      </div>
      <button class="bottle-hero-remove" data-remove-hero="${escapeHtml(h.id)}" title="Remove">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove-hero]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this hero from the list?')) return;
      const id = btn.dataset.removeHero;
      try {
        await api('/api/bottle-fund/heroes/' + encodeURIComponent(id), { method: 'DELETE' });
        CLUB.bottleFund.heroes = CLUB.bottleFund.heroes.filter(h => h.id !== id);
        renderBottleHeroes();
      } catch (e) { flashMsg('Could not remove: ' + e.message, 'error'); }
    });
  });
}

function setupBottleShare() {
  const copyBtn = $('#bottle-copy-btn');
  const wa = $('#bottle-whatsapp-btn');
  const sms = $('#bottle-sms-btn');
  const em = $('#bottle-email-btn');
  const msgEl = $('#bottle-copy-msg');

  function refreshLinks() {
    const msg = bottleInviteMessage();
    const encoded = encodeURIComponent(msg);
    if (wa) wa.href = 'https://wa.me/?text=' + encoded;
    if (sms) sms.href = 'sms:?&body=' + encoded;
    if (em) em.href = 'mailto:?subject=' + encodeURIComponent('Help the Fab 5 Fun Club — free fundraiser 🥤') + '&body=' + encoded;
  }
  refreshLinks();
  // Refresh on every render in case goal changes
  document.addEventListener('club:bottleFundUpdated', refreshLinks);

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = bottleInviteMessage();
      try {
        await navigator.clipboard.writeText(text);
        if (msgEl) { msgEl.textContent = '✅ Copied! Paste it anywhere you like.'; msgEl.className = 'bottle-copy-msg success'; }
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); if (msgEl) { msgEl.textContent = '✅ Copied!'; msgEl.className = 'bottle-copy-msg success'; } }
        catch { if (msgEl) { msgEl.textContent = 'Could not copy — long-press to copy manually.'; msgEl.className = 'bottle-copy-msg error'; } }
        document.body.removeChild(ta);
      }
      setTimeout(() => { if (msgEl) { msgEl.textContent = ''; msgEl.className = 'bottle-copy-msg'; } }, 3500);
    });
  }
}

function setupBottleHeroForm() {
  const form = $('#bottle-hero-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#hero-name').value.trim();
    const month = $('#hero-month').value.trim();
    const note = $('#hero-note').value.trim();
    const msg = $('#hero-msg');
    if (!name) { if (msg) { msg.textContent = 'Name is required!'; msg.className = 'error'; } return; }
    try {
      const res = await api('/api/bottle-fund/heroes', { method: 'POST', body: { name, month, note } });
      if (!CLUB.bottleFund.heroes) CLUB.bottleFund.heroes = [];
      CLUB.bottleFund.heroes.unshift(res.hero);
      if (CLUB.bottleFund.heroes.length > 30) CLUB.bottleFund.heroes.length = 30;
      renderBottleHeroes();
      form.reset();
      if (msg) { msg.textContent = '🌟 Hero added!'; msg.className = 'success'; }
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 2500);
    } catch (err) {
      if (msg) { msg.textContent = 'Failed: ' + err.message; msg.className = 'error'; }
    }
  });
}

function setupBottleAdminForms() {
  const goalForm = $('#bottle-goal-form');
  if (goalForm) {
    goalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#goal-title').value.trim();
      const emoji = $('#goal-emoji').value.trim();
      const targetRaw = $('#goal-target').value;
      const description = $('#goal-desc').value.trim();
      const body = {};
      if (title) body.title = title;
      if (emoji) body.emoji = emoji;
      if (targetRaw !== '') body.targetAud = Number(targetRaw);
      if (description) body.description = description;
      try {
        const res = await api('/api/bottle-fund/goal', { method: 'POST', body });
        CLUB.bottleFund.goal = res.goal;
        renderBottleFund();
        document.dispatchEvent(new Event('club:bottleFundUpdated'));
        flashMsg('🎯 Goal updated!', 'success');
      } catch (err) {
        flashMsg('Failed: ' + err.message, 'error');
      }
    });
  }

  const raisedForm = $('#bottle-raised-form');
  if (raisedForm) {
    raisedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raisedRaw = $('#raised-amount').value;
      const msg = $('#raised-msg');
      if (raisedRaw === '') { if (msg) { msg.textContent = 'Type in the total!'; msg.className = 'error'; } return; }
      try {
        const res = await api('/api/bottle-fund/raised', { method: 'POST', body: { raisedAud: Number(raisedRaw) } });
        CLUB.bottleFund.goal = res.goal;
        renderBottleFund();
        if (msg) { msg.textContent = '💰 Total updated!'; msg.className = 'success'; }
        setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = ''; } }, 2500);
      } catch (err) {
        if (msg) { msg.textContent = 'Failed: ' + err.message; msg.className = 'error'; }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupLogin();
  checkAuth();
});
