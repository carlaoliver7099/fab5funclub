// ============================================================================
// 💚 FAB 5 CLUB — FUNDRAISING HUB (Containers for Change)
// ============================================================================
// Self-contained module. Only activates if the /fundraising page elements exist.
// Handles: CforC dashboard snapshot, savings goals + progress bars, donation log,
// adult-mode unlock, donation logging, pace simulator slider, printable poster.
// ============================================================================
(function () {
  'use strict';

  // Bail out if we're not on the fundraising page
  if (!document.getElementById('fund-goals-grid')) return;

  // ============================================================================
  // STATE
  // ============================================================================
  const MEMBER_NUMBER = 'C11761772';
  const TEAM_JOIN_URL = 'https://member.containersforchange.com.au/team-member/add/qld/think-know-do-pty-ltd-6a1e42a1996da';
  const CFORC_DASHBOARD_URL = 'https://member.containersforchange.com.au/';
  const REFUND_PER_CONTAINER = 0.10; // 10c per container in QLD

  // Adult-mode session token (the CforC member number); kept in memory only,
  // re-prompted next visit. Never persisted to localStorage.
  let ADULT_UNLOCK_CODE = null;

  let STATE = null; // { stats, goals, donations, ... } from API

  // Pace simulator default: Saia's $150/month challenge
  let PACE_MONTHLY = 150;

  // ============================================================================
  // HELPERS
  // ============================================================================
  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function fmtMoney(n) {
    if (n === undefined || n === null || isNaN(n)) return '$0';
    const num = Number(n);
    if (Number.isInteger(num)) return '$' + num.toLocaleString('en-AU');
    return '$' + num.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMoneyShort(n) {
    if (n === undefined || n === null || isNaN(n)) return '$0';
    const num = Math.round(Number(n));
    return '$' + num.toLocaleString('en-AU');
  }

  function fmtDate(input) {
    if (!input) return '—';
    const d = typeof input === 'string' ? new Date(input + 'T00:00:00') : new Date(input);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtRelative(ts) {
    if (!ts) return 'never';
    const sec = Math.round((Date.now() - ts) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec/60) + ' min ago';
    if (sec < 86400) return Math.floor(sec/3600) + ' hr ago';
    const d = Math.floor(sec/86400);
    if (d < 7) return d + ' day' + (d===1?'':'s') + ' ago';
    return fmtDate(ts);
  }

  function addMonthsLabel(months) {
    if (!isFinite(months) || months <= 0) return 'Now! 🎉';
    if (months > 600) return 'Way too far away ⏳';
    const d = new Date();
    d.setMonth(d.getMonth() + Math.ceil(months));
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }

  async function api(method, path, body) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || ('HTTP ' + res.status));
      }
      return await res.json();
    } catch (e) {
      console.error('💚 API error:', method, path, e);
      throw e;
    }
  }

  function toast(msg, type) {
    type = type || 'success';
    const el = document.createElement('div');
    el.className = 'fund-toast fund-toast-' + type;
    el.innerHTML = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3500);
  }

  function qrUrl(text, size) {
    size = size || 220;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(text) + '&margin=2';
  }

  function adultMode() {
    return !!ADULT_UNLOCK_CODE;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function confetti() {
    // Lightweight emoji confetti burst
    const burst = ['🎉','💚','🥤','💰','✨','🌱','🎊','🐾'];
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('span');
      el.className = 'fund-confetti';
      el.textContent = burst[Math.floor(Math.random()*burst.length)];
      el.style.left = (Math.random()*100) + 'vw';
      el.style.animationDelay = (Math.random()*0.4) + 's';
      el.style.animationDuration = (1.6 + Math.random()*1.2) + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }
  }

  // ============================================================================
  // ADULT UNLOCK
  // ============================================================================
  function showUnlockModal() {
    const m = $('#fund-unlock-modal');
    m.innerHTML = (
      '<div class="fund-modal" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>🔑 Adult unlock</h2>' +
        '<p>To LOG donations or update totals, enter the club\'s <strong>Containers for Change member number</strong>.</p>' +
        '<p class="fund-modal-hint">It\'s the C-number on your CforC member card. (Ask Saia\'s mum if you don\'t have it!)</p>' +
        '<form class="fund-form" id="fund-unlock-form">' +
          '<label>Member number<br>' +
            '<input type="text" name="unlockCode" required autocomplete="off" autocapitalize="characters" placeholder="C11761772" pattern="[Cc][0-9]{6,10}"/>' +
          '</label>' +
          '<div class="fund-form-actions">' +
            '<button type="button" class="fund-btn fund-btn-ghost" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="fund-btn fund-btn-primary">🔓 Unlock</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    m.style.display = 'flex';

    $('#fund-unlock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = e.target.unlockCode.value.trim().toUpperCase();
      try {
        await api('POST', '/api/fundraising/unlock', { unlockCode: code });
        ADULT_UNLOCK_CODE = code;
        m.style.display = 'none';
        toast('🔓 Adult mode unlocked!', 'success');
        applyAdultMode();
      } catch (err) {
        toast('🚫 ' + err.message, 'error');
      }
    });
  }

  function applyAdultMode() {
    const on = adultMode();
    document.querySelectorAll('.fund-adult-only').forEach((el) => {
      el.style.display = on ? '' : 'none';
    });
    const notice = $('#fund-adult-notice');
    if (notice) notice.style.display = on ? 'none' : '';
    document.body.classList.toggle('fund-adult-on', on);
  }

  // ============================================================================
  // LOAD & RENDER
  // ============================================================================
  async function load() {
    try {
      STATE = await api('GET', '/api/fundraising');
      renderStats();
      renderGoals();
      renderDonations();
      renderPaceSimulator();
      applyAdultMode();
    } catch (e) {
      const grid = $('#fund-goals-grid');
      if (grid) grid.innerHTML = '<div class="fund-empty">⚠️ Couldn\'t load fundraising data. Refresh?</div>';
    }
  }

  function renderStats() {
    if (!STATE || !STATE.stats) return;
    const s = STATE.stats;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('stat-in-pocket', fmtMoney(s.inPocketAud));
    setText('stat-containers', Number(s.containersSavedFromLandfill || 0).toLocaleString('en-AU'));
    setText('stat-donated', fmtMoney(s.donatedToCauseAud));
    setText('stat-lifetime', fmtMoney(s.lifetimeRaisedAud));
    const sync = $('#fund-synced');
    if (sync) {
      const who = s.syncedBy ? (' by ' + escapeHtml(s.syncedBy)) : '';
      sync.textContent = 'Synced: ' + fmtRelative(s.syncedAt) + who;
    }
  }

  // ============================================================================
  // GOALS GRID
  // ============================================================================
  function renderGoals() {
    const grid = $('#fund-goals-grid');
    if (!grid) return;
    const goals = (STATE && STATE.goals) || [];

    if (goals.length === 0) {
      grid.innerHTML = (
        '<div class="fund-empty">' +
          '<div class="fund-empty-emoji">🎯</div>' +
          '<h3>No savings goals yet</h3>' +
          '<p>Adults can add what the club is saving for (use 🔑 unlock above).</p>' +
        '</div>'
      );
      return;
    }

    grid.innerHTML = goals.map(renderGoalCard).join('');
  }

  function renderGoalCard(g) {
    const pct = Math.min(100, Math.round((g.allocatedAud / g.targetAud) * 100));
    const remaining = Math.max(0, g.targetAud - g.allocatedAud);
    const monthsAtPace = (PACE_MONTHLY > 0 && remaining > 0) ? (remaining / PACE_MONTHLY) : 0;
    const containersAtPace = Math.ceil(remaining / REFUND_PER_CONTAINER);
    const achieved = !!g.achievedAt;
    const projectedDate = remaining > 0 ? addMonthsLabel(monthsAtPace) : '🎉 Done!';

    // Show projected ghost bar — where you'll be after 1 month at current pace
    const projectedPct = Math.min(100, Math.round(((g.allocatedAud + PACE_MONTHLY) / g.targetAud) * 100));
    const projectedDelta = Math.max(0, projectedPct - pct);

    const priorityBadge =
      g.priority === 1 ? '<span class="fund-goal-priority fund-goal-priority-1">🥇 TOP PICK</span>' :
      g.priority === 2 ? '<span class="fund-goal-priority fund-goal-priority-2">🥈 NEXT</span>' :
      g.priority === 3 ? '<span class="fund-goal-priority fund-goal-priority-3">🥉 DREAM</span>' :
                          '<span class="fund-goal-priority">#' + g.priority + '</span>';

    return (
      '<div class="fund-goal-card' + (achieved ? ' fund-goal-card-achieved' : '') + '" data-id="' + escapeHtml(g.id) + '">' +
        '<div class="fund-goal-top">' +
          priorityBadge +
          '<div class="fund-goal-emoji">' + (g.emoji || '🎯') + '</div>' +
        '</div>' +
        '<h3 class="fund-goal-title">' + escapeHtml(g.title) + '</h3>' +
        (g.description ? '<p class="fund-goal-desc">' + escapeHtml(g.description) + '</p>' : '') +

        '<div class="fund-goal-progress-wrap">' +
          '<div class="fund-goal-progress">' +
            '<div class="fund-goal-progress-fill" style="width:' + pct + '%"></div>' +
            (!achieved && projectedDelta > 0 ? '<div class="fund-goal-progress-projected" style="left:' + pct + '%;width:' + projectedDelta + '%" title="Where we\'ll be after 1 month at this pace"></div>' : '') +
          '</div>' +
          '<div class="fund-goal-progress-labels">' +
            '<span><strong>' + fmtMoney(g.allocatedAud) + '</strong> raised</span>' +
            '<span>' + pct + '%</span>' +
            '<span><strong>' + fmtMoney(g.targetAud) + '</strong> goal</span>' +
          '</div>' +
        '</div>' +

        (achieved
          ? '<div class="fund-goal-achieved-banner">🎉 Goal smashed! Cha-ching! 💰</div>'
          : '<div class="fund-goal-pace">' +
              '<div class="fund-goal-pace-row">' +
                '<span>💸 Still need:</span>' +
                '<strong>' + fmtMoney(remaining) + '</strong>' +
              '</div>' +
              '<div class="fund-goal-pace-row">' +
                '<span>🥤 Containers to go:</span>' +
                '<strong>' + containersAtPace.toLocaleString('en-AU') + '</strong>' +
              '</div>' +
              '<div class="fund-goal-pace-row fund-goal-pace-eta">' +
                '<span>🎯 At ' + fmtMoneyShort(PACE_MONTHLY) + '/month:</span>' +
                '<strong>' + projectedDate + '</strong>' +
              '</div>' +
            '</div>'
        ) +

        '<div class="fund-goal-actions">' +
          '<button class="fund-btn fund-btn-ghost fund-adult-only" data-action="edit-goal" data-id="' + escapeHtml(g.id) + '" style="display:none">✏️ Edit</button>' +
          '<button class="fund-btn fund-btn-primary fund-adult-only" data-action="add-donation" data-goal-id="' + escapeHtml(g.id) + '" style="display:none">💰 Log donation</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ============================================================================
  // PACE SIMULATOR (the interactive slider!)
  // ============================================================================
  function renderPaceSimulator() {
    let host = $('#fund-pace-simulator');
    if (!host) {
      // Inject it just above the goals section
      const goalsSection = document.querySelector('.fund-goals-section');
      if (!goalsSection) return;
      host = document.createElement('section');
      host.id = 'fund-pace-simulator';
      host.className = 'fund-pace-section';
      goalsSection.parentNode.insertBefore(host, goalsSection);
    }

    const goals = (STATE && STATE.goals) || [];
    const totalRemaining = goals.reduce((s, g) => s + Math.max(0, g.targetAud - g.allocatedAud), 0);
    const monthsAll = (PACE_MONTHLY > 0 && totalRemaining > 0) ? (totalRemaining / PACE_MONTHLY) : 0;
    const allDoneDate = totalRemaining > 0 ? addMonthsLabel(monthsAll) : 'All goals done! 🏆';
    const containersPerMonth = Math.ceil(PACE_MONTHLY / REFUND_PER_CONTAINER);
    const containersPerDay = Math.ceil(containersPerMonth / 30);

    const vibe =
      PACE_MONTHLY === 0  ? { label: '😴 No saving',     color: '#94a3b8', tip: 'Drag the slider to start!' } :
      PACE_MONTHLY < 50   ? { label: '🐢 Tiny steps',    color: '#94a3b8', tip: 'Every bit helps — but we\'ll be saving a while.' } :
      PACE_MONTHLY < 100  ? { label: '🚶 Steady saver',  color: '#10b981', tip: 'Solid! About ' + containersPerDay + ' cans/day from the whole crew.' } :
      PACE_MONTHLY < 200  ? { label: '🎯 On target!',    color: '#16a34a', tip: 'This is Saia\'s $150 challenge zone — totally doable!' } :
      PACE_MONTHLY < 400  ? { label: '🚀 Crushing it',   color: '#059669', tip: 'Ambitious! Get all the parents + grandparents in on it.' } :
      PACE_MONTHLY < 700  ? { label: '🔥 On fire',       color: '#0d9488', tip: 'Big numbers! Maybe a community drive?' } :
                            { label: '👑 Fab 5 dynasty', color: '#0f766e', tip: 'Legendary! Hosting a school can drive territory.' };

    host.innerHTML = (
      '<div class="fund-pace-card">' +
        '<div class="fund-pace-header">' +
          '<div>' +
            '<h2>🎚️ Savings Pace Simulator</h2>' +
            '<p class="fund-pace-sub">Slide to see how fast we hit each goal at different monthly fundraising paces.</p>' +
          '</div>' +
        '</div>' +

        '<div class="fund-pace-controls">' +
          '<label for="fund-pace-slider" class="fund-pace-label">' +
            '<span>If we raise...</span>' +
            '<span class="fund-pace-amount" style="color:' + vibe.color + '">' + fmtMoneyShort(PACE_MONTHLY) + '/month</span>' +
          '</label>' +
          '<input type="range" id="fund-pace-slider" min="0" max="1000" step="10" value="' + PACE_MONTHLY + '" class="fund-pace-slider"/>' +
          '<div class="fund-pace-ticks">' +
            '<button type="button" class="fund-pace-tick" data-pace="50">$50</button>' +
            '<button type="button" class="fund-pace-tick' + (PACE_MONTHLY === 150 ? ' fund-pace-tick-active' : '') + '" data-pace="150">$150 🎯</button>' +
            '<button type="button" class="fund-pace-tick" data-pace="300">$300</button>' +
            '<button type="button" class="fund-pace-tick" data-pace="500">$500</button>' +
            '<button type="button" class="fund-pace-tick" data-pace="1000">$1000</button>' +
          '</div>' +
        '</div>' +

        '<div class="fund-pace-vibe" style="background:' + vibe.color + '20;border-left:4px solid ' + vibe.color + '">' +
          '<div class="fund-pace-vibe-label" style="color:' + vibe.color + '">' + vibe.label + '</div>' +
          '<div class="fund-pace-vibe-tip">' + vibe.tip + '</div>' +
        '</div>' +

        '<div class="fund-pace-breakdown">' +
          '<div class="fund-pace-stat">' +
            '<div class="fund-pace-stat-emoji">🥤</div>' +
            '<div class="fund-pace-stat-value">' + containersPerMonth.toLocaleString('en-AU') + '</div>' +
            '<div class="fund-pace-stat-label">containers/month</div>' +
          '</div>' +
          '<div class="fund-pace-stat">' +
            '<div class="fund-pace-stat-emoji">📅</div>' +
            '<div class="fund-pace-stat-value">' + containersPerDay + '</div>' +
            '<div class="fund-pace-stat-label">containers/day</div>' +
          '</div>' +
          '<div class="fund-pace-stat">' +
            '<div class="fund-pace-stat-emoji">💰</div>' +
            '<div class="fund-pace-stat-value">' + fmtMoneyShort(PACE_MONTHLY * 12) + '</div>' +
            '<div class="fund-pace-stat-label">per year</div>' +
          '</div>' +
          '<div class="fund-pace-stat fund-pace-stat-hero">' +
            '<div class="fund-pace-stat-emoji">🏆</div>' +
            '<div class="fund-pace-stat-value">' + allDoneDate + '</div>' +
            '<div class="fund-pace-stat-label">ALL goals done by</div>' +
          '</div>' +
        '</div>' +

        '<div class="fund-pace-goals-mini">' +
          goals.map((g) => {
            const remaining = Math.max(0, g.targetAud - g.allocatedAud);
            const months = (PACE_MONTHLY > 0 && remaining > 0) ? (remaining / PACE_MONTHLY) : 0;
            const date = remaining > 0 ? addMonthsLabel(months) : '🎉 Done!';
            const mWord = months <= 0 ? 'now' : (months < 1 ? '< 1 mo' : (Math.ceil(months) + ' mo' + (Math.ceil(months)===1?'':'s')));
            return (
              '<div class="fund-pace-goal-mini">' +
                '<div class="fund-pace-goal-mini-emoji">' + (g.emoji || '🎯') + '</div>' +
                '<div class="fund-pace-goal-mini-text">' +
                  '<div class="fund-pace-goal-mini-title">' + escapeHtml(g.title) + '</div>' +
                  '<div class="fund-pace-goal-mini-meta">' + fmtMoney(remaining) + ' to go → ' + mWord + ' → ' + escapeHtml(date) + '</div>' +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</div>'
    );

    // Wire up slider events
    const slider = $('#fund-pace-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        PACE_MONTHLY = clamp(parseInt(e.target.value, 10) || 0, 0, 1000);
        renderPaceSimulator();
        // Live-update goal cards too (the per-card ETA labels)
        renderGoals();
        applyAdultMode();
      });
    }
    host.querySelectorAll('.fund-pace-tick').forEach((btn) => {
      btn.addEventListener('click', () => {
        PACE_MONTHLY = parseInt(btn.dataset.pace, 10) || 0;
        renderPaceSimulator();
        renderGoals();
        applyAdultMode();
      });
    });
  }

  // ============================================================================
  // DONATION LOG
  // ============================================================================
  function renderDonations() {
    const list = $('#fund-donations-list');
    if (!list) return;
    const donations = (STATE && STATE.donations) || [];
    const goalsById = {};
    ((STATE && STATE.goals) || []).forEach(g => { goalsById[g.id] = g; });

    if (donations.length === 0) {
      list.innerHTML = (
        '<div class="fund-empty">' +
          '<div class="fund-empty-emoji">📋</div>' +
          '<h3>No donations logged yet</h3>' +
          '<p>Once someone drops containers at a refund point quoting <code>C11761772</code>, an adult can log it here so the goals fill up!</p>' +
        '</div>'
      );
      return;
    }

    list.innerHTML = (
      '<div class="fund-donations-table">' +
        '<div class="fund-donations-row fund-donations-row-header">' +
          '<div>Date</div>' +
          '<div>Amount</div>' +
          '<div class="fund-hide-mobile">🥤 Cans</div>' +
          '<div>From</div>' +
          '<div>Goal</div>' +
          '<div class="fund-donations-row-actions"></div>' +
        '</div>' +
        donations.map((d) => {
          const goal = d.goalId ? goalsById[d.goalId] : null;
          const goalLabel = goal ? (goal.emoji + ' ' + escapeHtml(goal.title)) : '<span class="muted">General fund</span>';
          return (
            '<div class="fund-donations-row" data-id="' + escapeHtml(d.id) + '">' +
              '<div>' + escapeHtml(fmtDate(d.date)) + '</div>' +
              '<div><strong>' + fmtMoney(d.amountAud) + '</strong></div>' +
              '<div class="fund-hide-mobile">' + (d.containers || '—') + '</div>' +
              '<div>' + (d.source ? escapeHtml(d.source) : '<span class="muted">—</span>') + '</div>' +
              '<div>' + goalLabel + '</div>' +
              '<div class="fund-donations-row-actions">' +
                '<button class="fund-icon-btn fund-adult-only" data-action="edit-donation" data-id="' + escapeHtml(d.id) + '" title="Re-allocate" style="display:none">✏️</button>' +
                '<button class="fund-icon-btn fund-adult-only fund-icon-btn-danger" data-action="delete-donation" data-id="' + escapeHtml(d.id) + '" title="Delete" style="display:none">🗑️</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  // ============================================================================
  // SYNC SNAPSHOT MODAL (adult pastes from CforC dashboard)
  // ============================================================================
  function showSyncModal() {
    if (!adultMode()) return showUnlockModal();
    const s = (STATE && STATE.stats) || {};
    const m = $('#fund-sync-modal');
    m.innerHTML = (
      '<div class="fund-modal" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>🔄 Update from CforC dashboard</h2>' +
        '<p>Open <a href="' + CFORC_DASHBOARD_URL + '" target="_blank" rel="noopener">the CforC dashboard ↗</a>, switch to the <strong>fab5funclub</strong> tab, then paste the 3 numbers here:</p>' +
        '<form class="fund-form" id="fund-sync-form">' +
          '<div class="fund-form-row">' +
            '<label>💰 In our pocket<br>' +
              '<input type="number" step="0.01" min="0" name="inPocketAud" value="' + (s.inPocketAud || 0) + '" required/>' +
            '</label>' +
            '<label>🥤 Containers saved<br>' +
              '<input type="number" step="1" min="0" name="containersSaved" value="' + (s.containersSavedFromLandfill || 0) + '" required/>' +
            '</label>' +
          '</div>' +
          '<label>💚 Donated to a good cause<br>' +
            '<input type="number" step="0.01" min="0" name="donatedAud" value="' + (s.donatedToCauseAud || 0) + '"/>' +
          '</label>' +
          '<label>Your name (optional)<br>' +
            '<input type="text" name="syncedBy" placeholder="e.g. Carla" maxlength="50" value="' + escapeHtml(s.syncedBy || '') + '"/>' +
          '</label>' +
          '<div class="fund-form-actions">' +
            '<button type="button" class="fund-btn fund-btn-ghost" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="fund-btn fund-btn-primary">💾 Save snapshot</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    m.style.display = 'flex';

    $('#fund-sync-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('POST', '/api/fundraising/sync', {
          unlockCode: ADULT_UNLOCK_CODE,
          inPocketAud: parseFloat(fd.get('inPocketAud')) || 0,
          containersSaved: parseInt(fd.get('containersSaved'), 10) || 0,
          donatedAud: parseFloat(fd.get('donatedAud')) || 0,
          syncedBy: fd.get('syncedBy') || '',
        });
        m.style.display = 'none';
        toast('✅ Dashboard snapshot updated!', 'success');
        load();
      } catch (err) {
        toast('🚫 ' + err.message, 'error');
      }
    });
  }

  // ============================================================================
  // DONATION MODAL
  // ============================================================================
  function showDonationModal(preselectGoalId) {
    if (!adultMode()) return showUnlockModal();
    const goals = (STATE && STATE.goals) || [];
    const today = new Date().toISOString().slice(0, 10);
    const m = $('#fund-donation-modal');
    m.innerHTML = (
      '<div class="fund-modal" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>💰 Log a donation</h2>' +
        '<p>Record a CforC refund that came in for fab5funclub.</p>' +
        '<form class="fund-form" id="fund-donation-form">' +
          '<div class="fund-form-row">' +
            '<label>Date<br>' +
              '<input type="date" name="date" value="' + today + '" required/>' +
            '</label>' +
            '<label>Amount (AUD)<br>' +
              '<input type="number" step="0.01" min="0.10" name="amountAud" required placeholder="e.g. 7.10"/>' +
            '</label>' +
          '</div>' +
          '<label># of containers<br>' +
            '<input type="number" step="1" min="0" name="containers" placeholder="e.g. 71"/>' +
          '</label>' +
          '<label>From (who dropped them)<br>' +
            '<input type="text" name="source" maxlength="80" placeholder="e.g. Nan & Pop, the Fab 5 crew, school drive"/>' +
          '</label>' +
          '<label>Allocate to goal<br>' +
            '<select name="goalId">' +
              '<option value="">💰 General fund (allocate later)</option>' +
              goals.map(g => '<option value="' + escapeHtml(g.id) + '"' + (preselectGoalId === g.id ? ' selected' : '') + '>' + (g.emoji || '🎯') + ' ' + escapeHtml(g.title) + '</option>').join('') +
            '</select>' +
          '</label>' +
          '<label>Notes (optional)<br>' +
            '<textarea name="notes" maxlength="300" rows="2" placeholder="e.g. Christmas cans haul"></textarea>' +
          '</label>' +
          '<label>Logged by (optional)<br>' +
            '<input type="text" name="loggedBy" maxlength="50" placeholder="e.g. Carla"/>' +
          '</label>' +
          '<div class="fund-form-actions">' +
            '<button type="button" class="fund-btn fund-btn-ghost" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="fund-btn fund-btn-primary">💚 Log donation</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    m.style.display = 'flex';

    $('#fund-donation-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const before = (STATE && STATE.goals) || [];
        const result = await api('POST', '/api/fundraising/donations', {
          unlockCode: ADULT_UNLOCK_CODE,
          date: fd.get('date'),
          amountAud: parseFloat(fd.get('amountAud')),
          containers: parseInt(fd.get('containers') || '0', 10),
          source: fd.get('source') || '',
          goalId: fd.get('goalId') || undefined,
          notes: fd.get('notes') || '',
          loggedBy: fd.get('loggedBy') || '',
        });
        m.style.display = 'none';
        toast('💚 +' + fmtMoney(result.donation.amountAud) + ' logged!', 'success');
        // Check if any goal was just achieved
        const newlyAchieved = (result.goals || []).find((g) => {
          const old = before.find(o => o.id === g.id);
          return g.achievedAt && !(old && old.achievedAt);
        });
        if (newlyAchieved) {
          setTimeout(() => {
            confetti();
            toast('🎉 GOAL SMASHED: ' + newlyAchieved.emoji + ' ' + escapeHtml(newlyAchieved.title) + '! 🎊', 'success');
          }, 400);
        }
        load();
      } catch (err) {
        toast('🚫 ' + err.message, 'error');
      }
    });
  }

  // ============================================================================
  // GOAL MODAL (edit / add)
  // ============================================================================
  function showGoalModal(goalId) {
    if (!adultMode()) return showUnlockModal();
    const isEdit = !!goalId;
    const g = isEdit ? (STATE.goals || []).find(x => x.id === goalId) : { emoji: '🎯', title: '', description: '', targetAud: 100, priority: (STATE.goals?.length || 0) + 1 };
    if (isEdit && !g) return toast('Goal not found', 'error');
    const m = $('#fund-goal-modal');
    m.innerHTML = (
      '<div class="fund-modal" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>' + (isEdit ? '✏️ Edit goal' : '➕ Add new savings goal') + '</h2>' +
        '<form class="fund-form" id="fund-goal-form">' +
          '<div class="fund-form-row">' +
            '<label>Emoji<br>' +
              '<input type="text" name="emoji" maxlength="4" value="' + escapeHtml(g.emoji || '🎯') + '" required/>' +
            '</label>' +
            '<label>Priority (1 = top focus)<br>' +
              '<input type="number" min="1" max="99" name="priority" value="' + (g.priority || 1) + '" required/>' +
            '</label>' +
          '</div>' +
          '<label>Title<br>' +
            '<input type="text" name="title" maxlength="80" value="' + escapeHtml(g.title || '') + '" required placeholder="e.g. Crew Merch Print Run"/>' +
          '</label>' +
          '<label>Description (optional)<br>' +
            '<textarea name="description" maxlength="300" rows="2">' + escapeHtml(g.description || '') + '</textarea>' +
          '</label>' +
          '<label>Target amount (AUD)<br>' +
            '<input type="number" step="1" min="1" name="targetAud" value="' + (g.targetAud || 100) + '" required/>' +
          '</label>' +
          '<div class="fund-form-actions">' +
            (isEdit ? '<button type="button" class="fund-btn fund-btn-danger" data-action="delete-goal" data-id="' + escapeHtml(g.id) + '">🗑️ Delete</button>' : '') +
            '<button type="button" class="fund-btn fund-btn-ghost" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="fund-btn fund-btn-primary">' + (isEdit ? '💾 Save' : '➕ Add goal') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    m.style.display = 'flex';

    $('#fund-goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        unlockCode: ADULT_UNLOCK_CODE,
        emoji: fd.get('emoji') || '🎯',
        title: fd.get('title') || '',
        description: fd.get('description') || '',
        targetAud: parseFloat(fd.get('targetAud')) || 0,
        priority: parseInt(fd.get('priority'), 10) || 1,
      };
      try {
        if (isEdit) {
          await api('PATCH', '/api/fundraising/goals/' + encodeURIComponent(goalId), payload);
          toast('💾 Goal saved!', 'success');
        } else {
          await api('POST', '/api/fundraising/goals', payload);
          toast('✨ New goal added!', 'success');
        }
        m.style.display = 'none';
        load();
      } catch (err) {
        toast('🚫 ' + err.message, 'error');
      }
    });
  }

  async function deleteGoal(goalId) {
    if (!adultMode()) return showUnlockModal();
    if (!confirm('Delete this goal? Donations stay in the log but become "general fund" again.')) return;
    try {
      await api('DELETE', '/api/fundraising/goals/' + encodeURIComponent(goalId), { unlockCode: ADULT_UNLOCK_CODE });
      $('#fund-goal-modal').style.display = 'none';
      toast('🗑️ Goal deleted', 'success');
      load();
    } catch (err) {
      toast('🚫 ' + err.message, 'error');
    }
  }

  async function deleteDonation(donationId) {
    if (!adultMode()) return showUnlockModal();
    if (!confirm('Delete this donation entry? (Won\'t affect the CforC dashboard snapshot.)')) return;
    try {
      await api('DELETE', '/api/fundraising/donations/' + encodeURIComponent(donationId), { unlockCode: ADULT_UNLOCK_CODE });
      toast('🗑️ Donation removed', 'success');
      load();
    } catch (err) {
      toast('🚫 ' + err.message, 'error');
    }
  }

  function showEditDonationModal(donationId) {
    if (!adultMode()) return showUnlockModal();
    const d = (STATE.donations || []).find(x => x.id === donationId);
    if (!d) return toast('Donation not found', 'error');
    const goals = STATE.goals || [];
    const m = $('#fund-donation-modal');
    m.innerHTML = (
      '<div class="fund-modal" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>✏️ Re-allocate donation</h2>' +
        '<p>' + fmtMoney(d.amountAud) + ' from ' + escapeHtml(d.date) + (d.source ? ' (' + escapeHtml(d.source) + ')' : '') + '</p>' +
        '<form class="fund-form" id="fund-donation-edit-form">' +
          '<label>Allocate to goal<br>' +
            '<select name="goalId">' +
              '<option value="">💰 General fund</option>' +
              goals.map(g => '<option value="' + escapeHtml(g.id) + '"' + (d.goalId === g.id ? ' selected' : '') + '>' + (g.emoji || '🎯') + ' ' + escapeHtml(g.title) + '</option>').join('') +
            '</select>' +
          '</label>' +
          '<label>Notes<br>' +
            '<textarea name="notes" maxlength="300" rows="2">' + escapeHtml(d.notes || '') + '</textarea>' +
          '</label>' +
          '<div class="fund-form-actions">' +
            '<button type="button" class="fund-btn fund-btn-ghost" data-action="close-modal">Cancel</button>' +
            '<button type="submit" class="fund-btn fund-btn-primary">💾 Save</button>' +
          '</div>' +
        '</form>' +
      '</div>'
    );
    m.style.display = 'flex';

    $('#fund-donation-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('PATCH', '/api/fundraising/donations/' + encodeURIComponent(donationId), {
          unlockCode: ADULT_UNLOCK_CODE,
          goalId: fd.get('goalId') || null,
          notes: fd.get('notes') || '',
        });
        m.style.display = 'none';
        toast('💾 Donation updated', 'success');
        load();
      } catch (err) {
        toast('🚫 ' + err.message, 'error');
      }
    });
  }

  // ============================================================================
  // QR MODAL
  // ============================================================================
  function showQrModal() {
    const m = $('#fund-qr-modal');
    m.innerHTML = (
      '<div class="fund-modal fund-modal-qr" role="dialog" aria-modal="true">' +
        '<button class="fund-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
        '<h2>📱 Scan to join fab5funclub team</h2>' +
        '<p>Friends + family scan this with their phone camera — it opens the CforC join page and adds them to our team. Their refunds → straight to us!</p>' +
        '<div class="fund-qr-display">' +
          '<img src="' + qrUrl(TEAM_JOIN_URL, 320) + '" alt="QR code to join fab5funclub team" width="320" height="320"/>' +
        '</div>' +
        '<p class="fund-qr-link"><strong>Or share:</strong><br><a href="' + TEAM_JOIN_URL + '" target="_blank" rel="noopener" class="fund-qr-url">' + TEAM_JOIN_URL + '</a></p>' +
        '<div class="fund-form-actions">' +
          '<button type="button" class="fund-btn fund-btn-secondary" data-action="copy-team-link">📋 Copy link</button>' +
          '<button type="button" class="fund-btn fund-btn-primary" data-action="close-modal">Done</button>' +
        '</div>' +
      '</div>'
    );
    m.style.display = 'flex';
  }

  // ============================================================================
  // PRINT POSTER
  // ============================================================================
  function printPoster() {
    const w = window.open('', '_blank', 'width=800,height=1100');
    if (!w) return toast('Pop-up blocked — please allow pop-ups for printing', 'error');
    const html = (
      '<!doctype html><html><head><meta charset="utf-8"><title>Fab 5 Fundraising Poster</title>' +
      '<style>' +
        '@page { size: A4; margin: 1.5cm; }' +
        'body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; color: #064e3b; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }' +
        '.poster { padding: 1cm; max-width: 21cm; margin: 0 auto; }' +
        '.banner { text-align: center; padding: 1cm 0.5cm; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(16,185,129,0.15); }' +
        'h1 { font-size: 48px; margin: 0 0 8px; color: #047857; }' +
        '.sub { font-size: 22px; color: #065f46; margin: 0 0 24px; }' +
        '.member { font-size: 68px; color: #10b981; font-weight: 800; letter-spacing: 4px; margin: 16px 0; font-family: "Courier New", monospace; }' +
        '.member-label { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; }' +
        '.qr { margin: 24px auto; padding: 16px; background: white; border: 3px dashed #10b981; border-radius: 12px; width: fit-content; }' +
        '.qr img { display: block; }' +
        '.steps { background: white; border-radius: 16px; padding: 24px; margin: 24px 0; }' +
        '.steps h2 { color: #047857; margin: 0 0 16px; font-size: 26px; }' +
        '.step { display: flex; gap: 16px; margin: 16px 0; align-items: flex-start; }' +
        '.step-num { background: #10b981; color: white; font-weight: bold; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }' +
        '.step-body { font-size: 16px; line-height: 1.5; }' +
        '.step-body strong { color: #047857; font-size: 18px; }' +
        '.footer { text-align: center; margin-top: 24px; padding: 16px; background: #d1fae5; border-radius: 12px; font-size: 14px; color: #065f46; }' +
        '.emoji { font-size: 1.4em; }' +
        '@media print { body { background: white !important; } .banner, .steps, .footer { box-shadow: none !important; } }' +
      '</style></head>' +
      '<body><div class="poster">' +
        '<div class="banner">' +
          '<div style="font-size: 64px; line-height: 1">🐾💚🥤</div>' +
          '<h1>Help the Fab 5 Fun Club!</h1>' +
          '<p class="sub">Donate your drink containers — we get 10¢ each! 🎉</p>' +
          '<div class="member-label">Our Containers for Change member number</div>' +
          '<div class="member">' + MEMBER_NUMBER + '</div>' +
          '<div class="qr">' +
            '<img src="' + qrUrl(TEAM_JOIN_URL, 280) + '" width="280" height="280" alt="QR code"/>' +
          '</div>' +
          '<p style="font-size: 14px; color: #6b7280">📱 Scan to join the fab5funclub team in the CforC app</p>' +
        '</div>' +

        '<div class="steps">' +
          '<h2>📘 How to donate (super easy!)</h2>' +
          '<div class="step"><div class="step-num">1</div><div class="step-body"><strong>📱 Get the app</strong><br>Download "Containers for Change QLD" on your phone.</div></div>' +
          '<div class="step"><div class="step-num">2</div><div class="step-body"><strong>🤝 Join our team</strong><br>Scan the QR code above OR search for <em>fab5funclub</em> in the app.</div></div>' +
          '<div class="step"><div class="step-num">3</div><div class="step-body"><strong>🥤 Save your containers</strong><br>Eligible: most cans, bottles, juice boxes (150ml–3L). Crush them flat to save space!</div></div>' +
          '<div class="step"><div class="step-num">4</div><div class="step-body"><strong>📍 Drop them off</strong><br>Take to any QLD refund point and quote our member number <strong>' + MEMBER_NUMBER + '</strong>.</div></div>' +
          '<div class="step"><div class="step-num">5</div><div class="step-body"><strong>🎉 BOOM — done!</strong><br>10¢ per container goes straight to the Fab 5 fundraising pool.</div></div>' +
        '</div>' +

        '<div class="footer">' +
          '<strong>🌱 Every container counts!</strong><br>' +
          'Help us raise funds for crew merch, camping trips, and concert tickets.<br>' +
          'Saving the planet AND the Fab 5 — win win! 🐾🌏💚' +
        '</div>' +
      '</div></body></html>'
    );
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 600);
  }

  // ============================================================================
  // EVENT WIRING
  // ============================================================================
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const goalId = target.dataset.goalId;

    if (action === 'close-modal') {
      document.querySelectorAll('.fund-modal-overlay').forEach(m => { m.style.display = 'none'; });
    } else if (action === 'unlock-adult') {
      showUnlockModal();
    } else if (action === 'sync-snapshot') {
      showSyncModal();
    } else if (action === 'add-donation') {
      showDonationModal(goalId);
    } else if (action === 'edit-donation') {
      showEditDonationModal(id);
    } else if (action === 'delete-donation') {
      deleteDonation(id);
    } else if (action === 'add-goal') {
      showGoalModal(null);
    } else if (action === 'edit-goal') {
      showGoalModal(id);
    } else if (action === 'delete-goal') {
      deleteGoal(id);
    } else if (action === 'show-qr') {
      showQrModal();
    } else if (action === 'print-poster') {
      printPoster();
    } else if (action === 'copy-member') {
      navigator.clipboard?.writeText(MEMBER_NUMBER).then(() => toast('📋 Copied: ' + MEMBER_NUMBER, 'success'))
        .catch(() => toast('Couldn\'t copy — please copy manually', 'error'));
    } else if (action === 'copy-team-link') {
      navigator.clipboard?.writeText(TEAM_JOIN_URL).then(() => toast('📋 Team link copied!', 'success'))
        .catch(() => toast('Couldn\'t copy', 'error'));
    }
  });

  // Click outside modal to close
  document.querySelectorAll('.fund-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.fund-modal-overlay').forEach(m => { m.style.display = 'none'; });
    }
  });

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  window.FAB5_FUNDRAISING = {
    reload: load,
    setPace: (n) => { PACE_MONTHLY = clamp(parseInt(n, 10) || 0, 0, 1000); renderPaceSimulator(); renderGoals(); applyAdultMode(); },
    getState: () => STATE,
    isAdultMode: adultMode,
  };

  console.log('💚 Fab 5 Fundraising Hub loaded');
  load();
})();
