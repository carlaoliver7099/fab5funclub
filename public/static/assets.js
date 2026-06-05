// ============================================================================
// 🏷️ FAB 5 CLUB — ASSET REGISTER
// ============================================================================
// Self-contained module. Only activates if the /assets page elements exist.
// Handles: grid render, search/filter, add/edit modals, borrow/return,
// QR code generation, printable sticker sheet, and member-leaving handback.
// ============================================================================
(function () {
  'use strict';

  // Bail out if we're not on the assets page
  if (!document.getElementById('assets-grid')) return;

  // ============================================================================
  // STATE
  // ============================================================================
  const MEMBERS = ['Ace', 'Charlotte', 'Elijah', 'Saia', 'Sienna'];
  const CATEGORIES = {
    watersports: { emoji: '🛶', label: 'Watersports' },
    cycling: { emoji: '🚴', label: 'Cycling' },
    camping: { emoji: '⛺', label: 'Camping' },
    climbing: { emoji: '🧗', label: 'Climbing' },
    sports: { emoji: '⚽', label: 'Sports' },
    safety: { emoji: '🦺', label: 'Safety' },
    camera: { emoji: '📷', label: 'Camera' },
    other: { emoji: '📦', label: 'Other' },
  };
  const CONDITIONS = {
    'new': { label: 'New', color: '#10b981' },
    'good': { label: 'Good', color: '#3b82f6' },
    'fair': { label: 'Fair', color: '#f59e0b' },
    'needs-repair': { label: 'Needs repair', color: '#ef4444' },
    'retired': { label: 'Retired', color: '#6b7280' },
  };
  const STATUS_LABELS = {
    'at-club': { emoji: '🏛️', label: 'At club', color: '#10b981' },
    'borrowed': { emoji: '🎈', label: 'Borrowed', color: '#3b82f6' },
    'in-repair': { emoji: '🔧', label: 'In repair', color: '#f59e0b' },
    'retired': { emoji: '📦', label: 'Retired', color: '#6b7280' },
  };
  const MEMBER_EMOJI = {
    'Ace': '🛹',
    'Charlotte': '🏄‍♀️',
    'Elijah': '🏍️',
    'Saia': '🛶',
    'Sienna': '🤿',
  };

  // Helper mode detection — read from localStorage (same key as the homepage uses)
  function isHelperMode() {
    try {
      return localStorage.getItem('fab5_helper_mode') === 'true'
          || localStorage.getItem('fab5_leader_mode') === 'true'  // legacy key
          || (window.LEADER_OVERRIDE_MODE === true);
    } catch (e) { return false; }
  }

  let ALL_ASSETS = [];
  let STATS = {};
  let FILTERED = [];

  // ============================================================================
  // HELPERS
  // ============================================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function fmtMoney(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function daysAgo(ts) {
    if (!ts) return 0;
    return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  }

  async function api(method, path, body) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error('API error:', method, path, e);
      throw e;
    }
  }

  function qrUrl(text, size) {
    size = size || 200;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10`;
  }

  function toast(msg, kind) {
    let t = document.getElementById('asset-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'asset-toast';
      t.className = 'asset-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'asset-toast asset-toast-' + (kind || 'info') + ' asset-toast-show';
    setTimeout(() => { t.className = 'asset-toast'; }, 3500);
  }

  // ============================================================================
  // FETCH + RENDER
  // ============================================================================
  async function loadAssets() {
    try {
      const data = await api('GET', '/api/assets');
      ALL_ASSETS = data.assets || [];
      STATS = data.stats || {};
      renderStats();
      applyFilters();
    } catch (e) {
      $('#assets-grid').innerHTML = `<div class="assets-empty">⚠️ Couldn't load gear: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderStats() {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('stat-total', STATS.total ?? 0);
    setText('stat-at-club', STATS.atClub ?? 0);
    setText('stat-borrowed', STATS.borrowed ?? 0);
    setText('stat-repair', STATS.inRepair ?? 0);
    setText('stat-value', fmtMoney(STATS.totalValue));
    setText('stat-overdue', STATS.overdue ?? 0);
  }

  function applyFilters() {
    const q = ($('#asset-search')?.value || '').toLowerCase().trim();
    const cat = $('#asset-filter-category')?.value || '';
    const stat = $('#asset-filter-status')?.value || '';

    FILTERED = ALL_ASSETS.filter(a => {
      if (cat && a.category !== cat) return false;
      if (stat && a.status !== stat) return false;
      if (q) {
        const hay = `${a.id} ${a.name} ${a.notes || ''} ${a.currentBorrower || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    renderGrid();
  }

  function renderGrid() {
    const grid = $('#assets-grid');
    if (!grid) return;

    if (FILTERED.length === 0) {
      const noneAtAll = ALL_ASSETS.length === 0;
      grid.innerHTML = `<div class="assets-empty">
        ${noneAtAll
          ? `<div class="assets-empty-big">🎒</div>
             <h3>No gear in the register yet!</h3>
             <p>Tap <strong>➕ Add asset</strong> above to register the club's first item.</p>
             <p class="muted">All gear is bought with club funds and tracked here for the whole crew.</p>`
          : `<div class="assets-empty-big">🔍</div>
             <h3>No gear matches your search</h3>
             <p>Try clearing the filters or search box.</p>`}
      </div>`;
      return;
    }

    grid.innerHTML = FILTERED.map(a => renderAssetCard(a)).join('');
  }

  function renderAssetCard(a) {
    const cat = CATEGORIES[a.category] || CATEGORIES.other;
    const cond = CONDITIONS[a.condition] || CONDITIONS.good;
    const stat = STATUS_LABELS[a.status] || STATUS_LABELS['at-club'];
    const borrowerEmoji = a.currentBorrower ? (MEMBER_EMOJI[a.currentBorrower] || '👤') : '';
    const overdue = a.status === 'borrowed' && a.currentBorrowedAt && daysAgo(a.currentBorrowedAt) > 30;

    return `
      <div class="asset-card ${overdue ? 'asset-card-overdue' : ''}" data-asset-id="${escapeHtml(a.id)}">
        <div class="asset-card-photo">
          ${a.photoUrl
            ? `<img src="${escapeHtml(a.photoUrl)}" alt="${escapeHtml(a.name)}" onerror="this.style.display='none';this.parentNode.classList.add('asset-card-noimg')"/>`
            : `<div class="asset-card-noimg-icon">${cat.emoji}</div>`}
          <div class="asset-card-id-badge">${escapeHtml(a.id)}</div>
        </div>
        <div class="asset-card-body">
          <div class="asset-card-cat-row">
            <span class="asset-card-cat">${cat.emoji} ${cat.label}</span>
            <span class="asset-card-cond" style="background:${cond.color}22;color:${cond.color}">${cond.label}</span>
          </div>
          <h3 class="asset-card-name">${escapeHtml(a.name)}</h3>
          <div class="asset-card-status" style="background:${stat.color}22;color:${stat.color}">
            ${stat.emoji} ${stat.label}
            ${a.currentBorrower ? ` — ${borrowerEmoji} ${escapeHtml(a.currentBorrower)}` : ''}
          </div>
          ${overdue ? `<div class="asset-card-overdue-warn">⏰ Borrowed ${daysAgo(a.currentBorrowedAt)} days ago</div>` : ''}
          ${a.purchaseCost ? `<div class="asset-card-cost">💰 ${fmtMoney(a.purchaseCost)}</div>` : ''}
          <div class="asset-card-actions">
            <button class="asset-card-btn asset-card-btn-view" data-action="view" data-id="${escapeHtml(a.id)}">👁️ View</button>
            ${a.status === 'at-club' ? `<button class="asset-card-btn asset-card-btn-borrow" data-action="borrow" data-id="${escapeHtml(a.id)}">🏠 Borrow home</button>` : ''}
            ${a.status === 'borrowed' ? `<button class="asset-card-btn asset-card-btn-return" data-action="return" data-id="${escapeHtml(a.id)}">↩️ Return</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // DETAIL VIEW MODAL (QR + history + edit/delete)
  // ============================================================================
  function showDetailModal(asset) {
    const cat = CATEGORIES[asset.category] || CATEGORIES.other;
    const cond = CONDITIONS[asset.condition] || CONDITIONS.good;
    const stat = STATUS_LABELS[asset.status] || STATUS_LABELS['at-club'];
    const helper = isHelperMode();
    const qrTarget = `${window.location.origin}/assets#${asset.id}`;

    const history = (asset.borrowHistory || []).slice().reverse();

    const overlay = $('#asset-detail-modal');
    overlay.innerHTML = `
      <div class="asset-modal asset-modal-detail">
        <button class="asset-modal-close" data-action="close-modal">✕</button>
        <div class="asset-detail-header">
          <div class="asset-detail-id">${escapeHtml(asset.id)}</div>
          <h2 class="asset-detail-name">${cat.emoji} ${escapeHtml(asset.name)}</h2>
          <div class="asset-detail-status" style="background:${stat.color}22;color:${stat.color}">
            ${stat.emoji} ${stat.label}${asset.currentBorrower ? ` — ${MEMBER_EMOJI[asset.currentBorrower] || '👤'} ${escapeHtml(asset.currentBorrower)}` : ''}
          </div>
        </div>

        <div class="asset-detail-grid">
          <div class="asset-detail-photo">
            ${asset.photoUrl
              ? `<img src="${escapeHtml(asset.photoUrl)}" alt="${escapeHtml(asset.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'asset-detail-photo-placeholder',textContent:'${cat.emoji}'}))"/>`
              : `<div class="asset-detail-photo-placeholder">${cat.emoji}</div>`}
          </div>
          <div class="asset-detail-info">
            <div class="asset-detail-row"><strong>Category:</strong> ${cat.emoji} ${cat.label}</div>
            <div class="asset-detail-row"><strong>Condition:</strong> <span style="color:${cond.color}">${cond.label}</span></div>
            ${asset.purchaseCost ? `<div class="asset-detail-row"><strong>Cost:</strong> ${fmtMoney(asset.purchaseCost)}</div>` : ''}
            ${asset.purchaseDate ? `<div class="asset-detail-row"><strong>Bought:</strong> ${escapeHtml(asset.purchaseDate)}</div>` : ''}
            ${asset.purchaseFrom ? `<div class="asset-detail-row"><strong>From:</strong> ${escapeHtml(asset.purchaseFrom)}</div>` : ''}
            ${asset.notes ? `<div class="asset-detail-row asset-detail-notes"><strong>Notes:</strong> ${escapeHtml(asset.notes)}</div>` : ''}
          </div>
        </div>

        <div class="asset-detail-qr-section">
          <h3>🏷️ Asset Sticker (QR code)</h3>
          <p class="muted">Scan this with any phone camera to open this gear's page. Print, laminate, stick on the gear!</p>
          <div class="asset-qr-card">
            <img src="${qrUrl(qrTarget, 200)}" alt="QR for ${escapeHtml(asset.id)}" class="asset-qr-img"/>
            <div class="asset-qr-meta">
              <div class="asset-qr-name">${escapeHtml(asset.name)}</div>
              <div class="asset-qr-id">${escapeHtml(asset.id)}</div>
              <div class="asset-qr-club">🐾 Fab 5 Fun Club</div>
            </div>
          </div>
          <button class="assets-btn assets-btn-secondary" data-action="print-single-sticker" data-id="${escapeHtml(asset.id)}">
            🖨️ Print this sticker
          </button>
        </div>

        <div class="asset-detail-actions">
          ${asset.status === 'at-club' ? `<button class="assets-btn assets-btn-primary" data-action="borrow" data-id="${escapeHtml(asset.id)}">🏠 Borrow home</button>` : ''}
          ${asset.status === 'borrowed' ? `<button class="assets-btn assets-btn-primary" data-action="return" data-id="${escapeHtml(asset.id)}">↩️ Return to club</button>` : ''}
          ${helper ? `
            <button class="assets-btn assets-btn-secondary" data-action="edit" data-id="${escapeHtml(asset.id)}">✏️ Edit</button>
            <button class="assets-btn assets-btn-danger" data-action="delete" data-id="${escapeHtml(asset.id)}">🗑️ Delete</button>
          ` : ''}
        </div>

        <details class="asset-detail-history">
          <summary>📜 Borrow history (${history.length})</summary>
          ${history.length === 0
            ? '<p class="muted">No borrows yet.</p>'
            : `<ul class="asset-history-list">
                ${history.map(h => `
                  <li>
                    ${MEMBER_EMOJI[h.borrower] || '👤'} <strong>${escapeHtml(h.borrower)}</strong>
                    — borrowed ${fmtDate(h.borrowedAt)}
                    ${h.returnedAt ? ` → returned ${fmtDate(h.returnedAt)}` : ' <em>(still out)</em>'}
                    ${h.borrowNote ? `<div class="asset-history-note">📝 ${escapeHtml(h.borrowNote)}</div>` : ''}
                  </li>
                `).join('')}
              </ul>`}
        </details>
      </div>
    `;
    overlay.style.display = 'flex';
  }

  // ============================================================================
  // ADD / EDIT FORM
  // ============================================================================
  function showEditModal(asset) {
    const isNew = !asset;
    const a = asset || {
      id: '(auto-generated)',
      name: '',
      category: 'other',
      condition: 'good',
      purchaseCost: '',
      purchaseDate: '',
      purchaseFrom: '',
      notes: '',
      photoUrl: '',
    };

    const overlay = $('#asset-edit-modal');
    overlay.innerHTML = `
      <div class="asset-modal asset-modal-edit">
        <button class="asset-modal-close" data-action="close-modal">✕</button>
        <h2>${isNew ? '➕ Add new asset' : '✏️ Edit ' + escapeHtml(a.id)}</h2>
        <form id="asset-form" class="asset-form">
          ${isNew ? '' : `<input type="hidden" name="id" value="${escapeHtml(a.id)}"/>`}
          <label>
            <span>📛 Name *</span>
            <input type="text" name="name" required maxlength="100" value="${escapeHtml(a.name)}" placeholder="e.g. Yellow Kayak"/>
          </label>
          <div class="asset-form-row">
            <label>
              <span>🏷️ Category</span>
              <select name="category">
                ${Object.entries(CATEGORIES).map(([k, v]) => `
                  <option value="${k}" ${a.category === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>
                `).join('')}
              </select>
            </label>
            <label>
              <span>✅ Condition</span>
              <select name="condition">
                ${Object.entries(CONDITIONS).map(([k, v]) => `
                  <option value="${k}" ${a.condition === k ? 'selected' : ''}>${v.label}</option>
                `).join('')}
              </select>
            </label>
          </div>
          <div class="asset-form-row">
            <label>
              <span>💰 Cost (AUD)</span>
              <input type="number" name="purchaseCost" min="0" step="0.01" value="${a.purchaseCost ?? ''}" placeholder="e.g. 450"/>
            </label>
            <label>
              <span>📅 Date purchased</span>
              <input type="date" name="purchaseDate" value="${escapeHtml(a.purchaseDate || '')}"/>
            </label>
          </div>
          <label>
            <span>🏪 Where bought (optional)</span>
            <input type="text" name="purchaseFrom" maxlength="100" value="${escapeHtml(a.purchaseFrom || '')}" placeholder="e.g. BCF Maroochydore"/>
          </label>
          <label>
            <span>📷 Photo URL (optional)</span>
            <input type="url" name="photoUrl" maxlength="500" value="${escapeHtml(a.photoUrl || '')}" placeholder="https://..."/>
            <small class="muted">Tip: upload a photo to Google Photos → share → paste link here</small>
          </label>
          <label>
            <span>📝 Notes (optional)</span>
            <textarea name="notes" maxlength="500" rows="3" placeholder="e.g. Small dent on left side, last serviced Jan 2026">${escapeHtml(a.notes || '')}</textarea>
          </label>
          <div class="asset-form-actions">
            <button type="button" class="assets-btn assets-btn-ghost" data-action="close-modal">Cancel</button>
            <button type="submit" class="assets-btn assets-btn-primary">${isNew ? '➕ Add to register' : '💾 Save changes'}</button>
          </div>
        </form>
      </div>
    `;
    overlay.style.display = 'flex';

    $('#asset-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = {
        name: fd.get('name'),
        category: fd.get('category'),
        condition: fd.get('condition'),
        purchaseCost: fd.get('purchaseCost') ? Number(fd.get('purchaseCost')) : undefined,
        purchaseDate: fd.get('purchaseDate') || undefined,
        purchaseFrom: fd.get('purchaseFrom') || undefined,
        photoUrl: fd.get('photoUrl') || undefined,
        notes: fd.get('notes') || undefined,
      };
      try {
        if (isNew) {
          const res = await api('POST', '/api/assets', body);
          toast(`✅ ${res.asset.id} added: ${res.asset.name}`, 'success');
        } else {
          const res = await api('PATCH', '/api/assets/' + a.id, body);
          toast(`✅ ${a.id} updated`, 'success');
        }
        closeAllModals();
        await loadAssets();
      } catch (e) {
        toast('❌ ' + e.message, 'error');
      }
    });
  }

  // ============================================================================
  // BORROW / RETURN
  // ============================================================================
  function showBorrowPrompt(asset) {
    // Try to auto-detect current kid from whoami localStorage
    let preselect = '';
    try { preselect = localStorage.getItem('fab5_whoami') || ''; } catch (e) {}

    const overlay = $('#asset-edit-modal');
    overlay.innerHTML = `
      <div class="asset-modal asset-modal-prompt">
        <button class="asset-modal-close" data-action="close-modal">✕</button>
        <h2>🏠 Borrow ${escapeHtml(asset.id)} — ${escapeHtml(asset.name)}</h2>
        <p>Who's taking this home?</p>
        <form id="asset-borrow-form" class="asset-form">
          <label>
            <span>👤 Borrower</span>
            <select name="borrower" required>
              <option value="">— Choose member —</option>
              ${MEMBERS.map(m => `<option value="${m}" ${preselect === m ? 'selected' : ''}>${MEMBER_EMOJI[m]} ${m}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>📝 Note (optional)</span>
            <input type="text" name="note" maxlength="200" placeholder="e.g. for camping trip this weekend"/>
          </label>
          <div class="asset-borrow-reminder">
            <p>🛟 <strong>Remember:</strong> this gear belongs to the club. Bring it back when you're done, and return EVERYTHING if you leave the crew. 🐾</p>
          </div>
          <div class="asset-form-actions">
            <button type="button" class="assets-btn assets-btn-ghost" data-action="close-modal">Cancel</button>
            <button type="submit" class="assets-btn assets-btn-primary">🏠 Confirm borrow</button>
          </div>
        </form>
      </div>
    `;
    overlay.style.display = 'flex';

    $('#asset-borrow-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('POST', `/api/assets/${asset.id}/borrow`, {
          borrower: fd.get('borrower'),
          note: fd.get('note'),
        });
        toast(`🏠 ${asset.id} borrowed by ${fd.get('borrower')}`, 'success');
        closeAllModals();
        await loadAssets();
      } catch (e) {
        toast('❌ ' + e.message, 'error');
      }
    });
  }

  function showReturnPrompt(asset) {
    const overlay = $('#asset-edit-modal');
    overlay.innerHTML = `
      <div class="asset-modal asset-modal-prompt">
        <button class="asset-modal-close" data-action="close-modal">✕</button>
        <h2>↩️ Return ${escapeHtml(asset.id)} — ${escapeHtml(asset.name)}</h2>
        <p>Currently with: ${MEMBER_EMOJI[asset.currentBorrower] || '👤'} <strong>${escapeHtml(asset.currentBorrower || '?')}</strong></p>
        <form id="asset-return-form" class="asset-form">
          <label>
            <span>📝 Condition note (optional)</span>
            <input type="text" name="note" maxlength="200" placeholder="e.g. All good / needs a wash / small scratch"/>
          </label>
          <div class="asset-form-actions">
            <button type="button" class="assets-btn assets-btn-ghost" data-action="close-modal">Cancel</button>
            <button type="submit" class="assets-btn assets-btn-primary">↩️ Confirm return</button>
          </div>
        </form>
      </div>
    `;
    overlay.style.display = 'flex';

    $('#asset-return-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('POST', `/api/assets/${asset.id}/return`, { note: fd.get('note') });
        toast(`↩️ ${asset.id} returned to club`, 'success');
        closeAllModals();
        await loadAssets();
      } catch (e) {
        toast('❌ ' + e.message, 'error');
      }
    });
  }

  // ============================================================================
  // DELETE
  // ============================================================================
  async function deleteAsset(asset) {
    if (!confirm(`🗑️ Delete ${asset.id} — "${asset.name}"?\n\nThis cannot be undone.`)) return;
    try {
      await api('DELETE', '/api/assets/' + asset.id);
      toast(`🗑️ ${asset.id} deleted`, 'success');
      closeAllModals();
      await loadAssets();
    } catch (e) {
      toast('❌ ' + e.message, 'error');
    }
  }

  // ============================================================================
  // HANDBACK (member leaving the club)
  // ============================================================================
  function showHandbackModal() {
    const overlay = $('#asset-handback-modal');
    overlay.innerHTML = `
      <div class="asset-modal asset-modal-handback">
        <button class="asset-modal-close" data-action="close-modal">✕</button>
        <h2>👋 Member leaving the club</h2>
        <p>Pick a member to see every item they currently have. Use this checklist when handing gear back.</p>
        <label class="asset-form-label">
          <span>Member leaving:</span>
          <select id="handback-kid-pick">
            <option value="">— Choose —</option>
            ${MEMBERS.map(m => `<option value="${m}">${MEMBER_EMOJI[m]} ${m}</option>`).join('')}
          </select>
        </label>
        <div id="handback-result" class="asset-handback-result"></div>
      </div>
    `;
    overlay.style.display = 'flex';

    $('#handback-kid-pick').addEventListener('change', async (e) => {
      const name = e.target.value;
      if (!name) {
        $('#handback-result').innerHTML = '';
        return;
      }
      try {
        const data = await api('GET', `/api/assets/handback/${encodeURIComponent(name)}`);
        renderHandbackResult(data);
      } catch (e) {
        $('#handback-result').innerHTML = `<p class="asset-empty">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    });
  }

  function renderHandbackResult(data) {
    const wrap = $('#handback-result');
    if (data.count === 0) {
      wrap.innerHTML = `
        <div class="handback-clear">
          <div class="handback-clear-icon">✅</div>
          <h3>${MEMBER_EMOJI[data.kid] || '👤'} ${escapeHtml(data.kid)} has nothing borrowed!</h3>
          <p>They're all clear to leave the club — no gear to return.</p>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="handback-header">
        <h3>${MEMBER_EMOJI[data.kid] || '👤'} ${escapeHtml(data.kid)} has ${data.count} item${data.count !== 1 ? 's' : ''} to return</h3>
        <p class="handback-total">Total club value: <strong>${fmtMoney(data.totalValue)}</strong></p>
      </div>
      <ul class="handback-checklist">
        ${data.items.map(a => {
          const cat = CATEGORIES[a.category] || CATEGORIES.other;
          return `
            <li class="handback-item">
              <label>
                <input type="checkbox" class="handback-check" data-id="${escapeHtml(a.id)}"/>
                <span class="handback-item-label">
                  <strong>${escapeHtml(a.id)}</strong> — ${cat.emoji} ${escapeHtml(a.name)}
                  ${a.purchaseCost ? ` <span class="muted">(${fmtMoney(a.purchaseCost)})</span>` : ''}
                  <div class="handback-borrowed-since muted">📅 Borrowed ${fmtDate(a.currentBorrowedAt)} (${daysAgo(a.currentBorrowedAt)} days ago)</div>
                </span>
              </label>
            </li>
          `;
        }).join('')}
      </ul>
      <div class="handback-actions">
        <button class="assets-btn assets-btn-secondary" data-action="print-handback" data-kid="${escapeHtml(data.kid)}">🖨️ Print checklist</button>
        <button class="assets-btn assets-btn-primary" data-action="mark-all-returned" data-kid="${escapeHtml(data.kid)}">↩️ Mark all returned</button>
      </div>
    `;
  }

  async function markAllReturned(kidName) {
    const items = ALL_ASSETS.filter(a => a.status === 'borrowed' && a.currentBorrower === kidName);
    if (items.length === 0) return;
    if (!confirm(`Return ALL ${items.length} item${items.length !== 1 ? 's' : ''} from ${kidName} back to the club?`)) return;

    let successCount = 0;
    for (const a of items) {
      try {
        await api('POST', `/api/assets/${a.id}/return`, { note: `Member leaving club — returned by handback flow` });
        successCount++;
      } catch (e) {
        console.error('Return failed for', a.id, e);
      }
    }
    toast(`↩️ Returned ${successCount}/${items.length} items from ${kidName}`, 'success');
    closeAllModals();
    await loadAssets();
  }

  // ============================================================================
  // PRINT — single sticker + all stickers + handback checklist
  // ============================================================================
  function printSingleSticker(asset) {
    const cat = CATEGORIES[asset.category] || CATEGORIES.other;
    const qrTarget = `${window.location.origin}/assets#${asset.id}`;
    const w = window.open('', '_blank');
    if (!w) { toast('⚠️ Allow popups to print stickers', 'error'); return; }
    w.document.write(`
      <!DOCTYPE html><html><head><title>${asset.id} — ${asset.name}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 30px; }
        .sticker { width: 88mm; padding: 12px; border: 2px solid #333; border-radius: 12px; text-align: center; background: white; }
        .sticker img { width: 60mm; height: 60mm; }
        .sticker-name { font-size: 16px; font-weight: 700; margin: 8px 0 4px; }
        .sticker-id { font-size: 14px; color: #666; font-family: monospace; }
        .sticker-club { font-size: 11px; color: #999; margin-top: 4px; }
        @media print { body { padding: 0; } .sticker { page-break-after: always; } }
      </style></head><body>
      <div class="sticker">
        <img src="${qrUrl(qrTarget, 240)}" alt="QR"/>
        <div class="sticker-name">${cat.emoji} ${escapeHtml(asset.name)}</div>
        <div class="sticker-id">${escapeHtml(asset.id)}</div>
        <div class="sticker-club">🐾 Property of Fab 5 Fun Club</div>
      </div>
      <script>window.onload = function() { window.print(); };</script>
      </body></html>
    `);
    w.document.close();
  }

  function printAllStickers() {
    if (ALL_ASSETS.length === 0) { toast('No assets to print yet — add some first!', 'info'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('⚠️ Allow popups to print stickers', 'error'); return; }
    const stickers = ALL_ASSETS.map(a => {
      const cat = CATEGORIES[a.category] || CATEGORIES.other;
      const qrTarget = `${window.location.origin}/assets#${a.id}`;
      return `
        <div class="sticker">
          <img src="${qrUrl(qrTarget, 200)}" alt="QR"/>
          <div class="sticker-name">${cat.emoji} ${escapeHtml(a.name)}</div>
          <div class="sticker-id">${escapeHtml(a.id)}</div>
          <div class="sticker-club">🐾 Fab 5 Fun Club</div>
        </div>
      `;
    }).join('');

    w.document.write(`
      <!DOCTYPE html><html><head><title>Fab 5 Asset Stickers</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 10mm; }
        .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
        .sticker { padding: 8px; border: 2px solid #333; border-radius: 10px; text-align: center; background: white; page-break-inside: avoid; }
        .sticker img { width: 70mm; height: 70mm; }
        .sticker-name { font-size: 14px; font-weight: 700; margin: 6px 0 2px; }
        .sticker-id { font-size: 12px; color: #666; font-family: monospace; }
        .sticker-club { font-size: 10px; color: #999; margin-top: 3px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1 style="font-size: 18px; margin: 0 0 12px;">🏷️ Fab 5 Fun Club — Asset Stickers (${ALL_ASSETS.length})</h1>
      <div class="sheet">${stickers}</div>
      <script>window.onload = function() { window.print(); };</script>
      </body></html>
    `);
    w.document.close();
  }

  function printHandback(kidName, items) {
    if (!items || items.length === 0) return;
    const w = window.open('', '_blank');
    if (!w) { toast('⚠️ Allow popups to print', 'error'); return; }
    const rows = items.map(a => {
      const cat = CATEGORIES[a.category] || CATEGORIES.other;
      return `<tr>
        <td><input type="checkbox"/></td>
        <td>${escapeHtml(a.id)}</td>
        <td>${cat.emoji} ${escapeHtml(a.name)}</td>
        <td>${a.purchaseCost ? fmtMoney(a.purchaseCost) : '—'}</td>
        <td>${fmtDate(a.currentBorrowedAt)}</td>
      </tr>`;
    }).join('');
    const total = items.reduce((s, a) => s + (a.purchaseCost || 0), 0);
    w.document.write(`
      <!DOCTYPE html><html><head><title>Handback — ${kidName}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 20mm; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        h2 { font-size: 14px; color: #666; font-weight: normal; margin: 0 0 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; }
        .total { margin-top: 16px; font-size: 15px; font-weight: 700; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
        .sig { margin-top: 40px; }
        .sig-line { border-bottom: 1px solid #333; width: 250px; padding-top: 30px; }
      </style></head><body>
      <h1>🏷️ Fab 5 Fun Club — Equipment Handback</h1>
      <h2>Member leaving: <strong>${escapeHtml(kidName)}</strong> &nbsp;·&nbsp; Date: ${new Date().toLocaleDateString('en-AU')}</h2>
      <table>
        <thead><tr><th></th><th>Asset ID</th><th>Item</th><th>Value</th><th>Borrowed since</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total items: ${items.length} &nbsp;·&nbsp; Total club value: ${fmtMoney(total)}</div>
      <div class="footer">
        <p>All items above are property of the Fab 5 Fun Club, purchased with club funds.</p>
      </div>
      <div class="sig">
        <div class="sig-line">Member signature</div>
        <div class="sig-line" style="margin-top: 20px">Club rep signature</div>
      </div>
      <script>window.onload = function() { window.print(); };</script>
      </body></html>
    `);
    w.document.close();
  }

  // ============================================================================
  // CLOSE MODALS
  // ============================================================================
  function closeAllModals() {
    ['#asset-detail-modal', '#asset-edit-modal', '#asset-handback-modal'].forEach(sel => {
      const el = $(sel);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
  }

  // ============================================================================
  // EVENT WIRING
  // ============================================================================
  function setupEvents() {
    // Top-level controls
    $('#asset-search')?.addEventListener('input', applyFilters);
    $('#asset-filter-category')?.addEventListener('change', applyFilters);
    $('#asset-filter-status')?.addEventListener('change', applyFilters);

    // Add button — gated by helper mode
    $('#asset-add-btn')?.addEventListener('click', () => {
      if (!isHelperMode()) {
        toast('🛟 Only parents in Helper Mode can add assets. Turn on Helper Mode from the homepage 👋 Who am I → 🛟 Grown-up helper mode.', 'info');
        return;
      }
      showEditModal(null);
    });

    // Print all stickers button
    $('#asset-print-stickers-btn')?.addEventListener('click', printAllStickers);

    // Handback link
    $('#handback-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showHandbackModal();
    });

    // Delegated click handler for grid cards + modal buttons
    document.addEventListener('click', async (e) => {
      const target = e.target;
      const actBtn = target.closest('[data-action]');
      if (!actBtn) {
        // Click on overlay background → close
        if (target.classList && target.classList.contains('asset-modal-overlay')) {
          closeAllModals();
        }
        return;
      }
      const action = actBtn.dataset.action;
      const id = actBtn.dataset.id;
      const asset = id ? ALL_ASSETS.find(a => a.id === id) : null;

      if (action === 'close-modal') {
        closeAllModals();
        return;
      }
      if (!asset && action !== 'mark-all-returned' && action !== 'print-handback') return;

      if (action === 'view') {
        showDetailModal(asset);
      } else if (action === 'borrow') {
        showBorrowPrompt(asset);
      } else if (action === 'return') {
        showReturnPrompt(asset);
      } else if (action === 'edit') {
        if (!isHelperMode()) { toast('🛟 Helper Mode needed', 'info'); return; }
        showEditModal(asset);
      } else if (action === 'delete') {
        if (!isHelperMode()) { toast('🛟 Helper Mode needed', 'info'); return; }
        await deleteAsset(asset);
      } else if (action === 'print-single-sticker') {
        printSingleSticker(asset);
      } else if (action === 'mark-all-returned') {
        await markAllReturned(actBtn.dataset.kid);
      } else if (action === 'print-handback') {
        const kid = actBtn.dataset.kid;
        const items = ALL_ASSETS.filter(a => a.status === 'borrowed' && a.currentBorrower === kid);
        printHandback(kid, items);
      }
    });

    // ESC closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });

    // Hash-based deep link: /assets#F5-001 → auto-open that asset
    if (window.location.hash) {
      const hashId = window.location.hash.replace('#', '').toUpperCase();
      // Wait for assets to load then open
      const tryOpen = setInterval(() => {
        if (ALL_ASSETS.length > 0) {
          clearInterval(tryOpen);
          const a = ALL_ASSETS.find(x => x.id === hashId);
          if (a) showDetailModal(a);
        }
      }, 300);
      setTimeout(() => clearInterval(tryOpen), 5000);  // give up after 5s
    }
  }

  // Update helper-mode notice + add button enabled state
  function refreshHelperUI() {
    const notice = $('#asset-helper-notice');
    const addBtn = $('#asset-add-btn');
    const helper = isHelperMode();
    if (notice) notice.style.display = helper ? 'none' : 'block';
    if (addBtn) {
      addBtn.disabled = !helper;
      addBtn.title = helper ? '' : 'Helper Mode needed (parents only)';
    }
  }

  // ============================================================================
  // INIT
  // ============================================================================
  setupEvents();
  refreshHelperUI();
  // Re-check helper mode periodically (in case it changes in another tab)
  setInterval(refreshHelperUI, 1000);
  loadAssets();

  // Expose a tiny API for testing
  window.FAB5_ASSETS = {
    reload: loadAssets,
    showDetail: (id) => {
      const a = ALL_ASSETS.find(x => x.id === id);
      if (a) showDetailModal(a);
    },
    isHelperMode,
    getAll: () => ALL_ASSETS,
  };

  console.log('🏷️ Fab 5 Asset Register loaded');
})();
