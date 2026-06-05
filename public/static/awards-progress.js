// ============================================================================
// 🏅 FAB 5 — AWARDS PROGRESS (Crew Status + Pebbles Weekly Summary)
// ============================================================================
// Extends the homepage Team Progress section with:
//  - Whole-crew stacked bar chart (Physical/Skills/Service/Adventure)
//  - Toggle: 📅 Last 30 days  /  🏅 Whole Bronze journey
//  - Per-kid Bronze % mini-cards
//  - 🔴 GAP / 🟡 THIN / 🟢 ON-TRACK / 🏆 STRONG status badges per pillar
//  - "Pillars needing love" → tap to jump to backlog filtered by that pillar
//  - 🐶 Pebbles weekly summary card (auto-cached, manual refresh button)
//
// Bails silently if container elements don't exist.
// ============================================================================

(function () {
  'use strict';

  if (!document.getElementById('crew-status-host')) return;

  const STATUS_META = {
    'gap':      { emoji: '🔴', label: 'GAP',      color: '#E63946', bg: '#FDECEA' },
    'thin':     { emoji: '🟡', label: 'THIN',     color: '#E0A800', bg: '#FFF8E1' },
    'on-track': { emoji: '🟢', label: 'ON-TRACK', color: '#2D8F4E', bg: '#E8F5E9' },
    'strong':   { emoji: '🏆', label: 'STRONG',   color: '#1B5E20', bg: '#C8E6C9' },
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  let CURRENT_WINDOW = 'journey'; // 'month' | 'journey'
  let STATE = null;
  let SUMMARY = null;

  // ---------- LOAD ----------
  async function loadCrewStatus() {
    const host = document.getElementById('crew-status-host');
    if (!host) return;
    try {
      const res = await fetch('/api/dofe/crew-status?window=' + CURRENT_WINDOW, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      STATE = await res.json();
      renderCrewStatus();
    } catch (err) {
      host.innerHTML = '<div class="crew-status-error">⚠️ Couldn\'t load crew status — ' + escapeHtml(err.message) + '</div>';
    }
  }

  async function loadWeeklySummary(force) {
    const host = document.getElementById('pebbles-summary-host');
    if (!host) return;
    if (force) host.innerHTML = '<div class="pebbles-summary-loading">🐶 Pebbles is thinking…</div>';
    try {
      const res = force
        ? await fetch('/api/pebbles/weekly-summary/refresh', { method: 'POST', credentials: 'include' })
        : await fetch('/api/pebbles/weekly-summary', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SUMMARY = await res.json();
      renderWeeklySummary();
    } catch (err) {
      host.innerHTML = '<div class="crew-status-error">⚠️ Pebbles couldn\'t write the recap — ' + escapeHtml(err.message) + '</div>';
    }
  }

  // ---------- RENDER: CREW STATUS ----------
  function renderCrewStatus() {
    if (!STATE) return;
    const host = document.getElementById('crew-status-host');
    if (!host) return;

    const totalCrewBronzeTarget = STATE.crewBronzeTarget;
    const totalCrewHours = STATE.totalCrewHours;
    const totalEvents = STATE.totalEventsThisWindow;

    host.innerHTML = `
      <div class="crew-status-card">
        <div class="crew-status-header">
          <div>
            <h3 class="crew-status-title">🏅 Awards Progress</h3>
            <p class="crew-status-subtitle">${escapeHtml(STATE.windowLabel)} · ${totalEvents} event${totalEvents === 1 ? '' : 's'} · ${totalCrewHours} crew hr${totalCrewHours === 1 ? '' : 's'}</p>
          </div>
          <div class="crew-status-toggle" role="group" aria-label="Time window">
            <button class="window-btn ${CURRENT_WINDOW === 'month' ? 'active' : ''}" data-window="month">📅 Last 30 days</button>
            <button class="window-btn ${CURRENT_WINDOW === 'journey' ? 'active' : ''}" data-window="journey">🏅 Bronze journey</button>
          </div>
        </div>

        ${renderPositiveCallouts(STATE.positiveCallouts)}

        ${renderStackedBar()}

        <div class="pillar-status-grid">
          ${STATE.pillarStatus.map(renderPillarTile).join('')}
        </div>

        ${renderBiggestGapHint()}

        <h4 class="per-kid-heading">👫 Each crew member's Bronze progress</h4>
        <div class="per-kid-grid">
          ${STATE.perKid.map(renderPerKidCard).join('')}
        </div>
      </div>
    `;

    // Wire up window toggle
    host.querySelectorAll('.window-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.getAttribute('data-window');
        if (w === CURRENT_WINDOW) return;
        CURRENT_WINDOW = w;
        loadCrewStatus();
      });
    });
  }

  function renderPositiveCallouts(callouts) {
    if (!callouts || callouts.length === 0) return '';
    return `
      <div class="positive-callouts">
        ${callouts.map(c => `<div class="callout-pill">${escapeHtml(c)}</div>`).join('')}
      </div>
    `;
  }

  function renderStackedBar() {
    if (!STATE) return '';
    const totalHours = STATE.pillarStatus.reduce((s, p) => s + p.hours, 0);
    if (totalHours === 0) {
      return `
        <div class="stacked-bar-wrap">
          <div class="stacked-bar-empty">
            🌱 No hours logged in this window yet — every adventure adds to the chart!
          </div>
        </div>
      `;
    }
    return `
      <div class="stacked-bar-wrap" title="Hover each segment for details">
        <div class="stacked-bar">
          ${STATE.pillarStatus.map(p => {
            const widthPct = (p.hours / totalHours) * 100;
            if (widthPct < 0.5) return '';
            return `<div class="stacked-bar-segment" style="width:${widthPct}%;background:${p.color}" title="${escapeHtml(p.name)} — ${p.hours}h (${p.percent}% of Bronze for the crew)">
              ${widthPct > 10 ? `<span class="bar-seg-label">${p.emoji} ${p.hours}h</span>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="stacked-bar-legend">
          ${STATE.pillarStatus.map(p => `
            <span class="legend-item"><span class="legend-swatch" style="background:${p.color}"></span> ${p.emoji} ${escapeHtml(p.name.split(' ')[0])}</span>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderPillarTile(p) {
    const meta = STATUS_META[p.status];
    const widthPct = Math.min(p.percent, 100);
    return `
      <div class="pillar-tile" style="border-color:${p.color}">
        <div class="pillar-tile-header">
          <span class="pillar-emoji" style="background:${p.color}22">${p.emoji}</span>
          <div class="pillar-tile-titles">
            <div class="pillar-name">${escapeHtml(p.name.split(' ')[0])}</div>
            <div class="pillar-kidtalk">${escapeHtml(p.kidTalk)}</div>
          </div>
          <span class="pillar-status-badge" style="background:${meta.bg};color:${meta.color}">${meta.emoji} ${meta.label}</span>
        </div>
        <div class="pillar-progress-row">
          <div class="pillar-progress-bar"><div class="pillar-progress-fill" style="width:${widthPct}%;background:${p.color}"></div></div>
          <div class="pillar-progress-num">${p.percent}%</div>
        </div>
        <div class="pillar-hours-text">${p.hours} / ${p.target} crew hours</div>
      </div>
    `;
  }

  function renderBiggestGapHint() {
    if (!STATE || !STATE.biggestGap) return '';
    const g = STATE.biggestGap;
    if (g.status === 'strong' || g.status === 'on-track') {
      return `
        <div class="biggest-gap-hint gap-hint-ok">
          🎉 <strong>Crew is crushing it!</strong> Even the weakest pillar (${g.emoji} ${escapeHtml(g.name)}) is ${g.percent}% of Bronze target.
        </div>
      `;
    }
    return `
      <div class="biggest-gap-hint">
        🎯 <strong>Pillar needing love most:</strong>
        <span class="gap-target-chip" style="background:${g.color}22;color:${g.color}">${g.emoji} ${escapeHtml(g.name)} — ${g.percent}%</span>
        <a class="gap-cta-link" href="/backlog">🗳️ Pick a ${escapeHtml(g.name.split(' ')[0])} adventure →</a>
      </div>
    `;
  }

  function renderPerKidCard(k) {
    const widthPct = Math.min(k.bronzePercent, 100);
    const stageEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇', starter: '🌱' }[k.stage] || '🌱';
    const stageLabel = { bronze: 'Bronze done!', silver: 'Silver', gold: 'Gold', starter: 'Working on Bronze' }[k.stage] || 'Bronze journey';
    const ringColor = k.bronzeComplete ? '#FFD93D' : k.color;
    return `
      <div class="kid-progress-card" style="border-color:${ringColor}">
        <div class="kid-progress-header">
          <span class="kid-emoji">${escapeHtml(k.emoji)}</span>
          <div class="kid-progress-titles">
            <div class="kid-name">${escapeHtml(k.name)}</div>
            <div class="kid-stage">${stageEmoji} ${escapeHtml(stageLabel)}</div>
          </div>
          ${k.bronzeComplete ? '<span class="bronze-done-star">⭐</span>' : ''}
        </div>
        <div class="kid-progress-bar"><div class="kid-progress-fill" style="width:${widthPct}%;background:${ringColor}"></div></div>
        <div class="kid-progress-meta">
          <span class="kid-pct">${k.bronzePercent}%</span>
          <span class="kid-events">${k.eventCount} event${k.eventCount === 1 ? '' : 's'}</span>
        </div>
        <div class="kid-pillar-mini">
          ${['physical','skills','service','adventure'].map(pid => {
            const pillar = STATE.pillarStatus.find(p => p.pillarId === pid);
            const hours = k.pillarHours[pid] || 0;
            return `<span class="kid-pillar-dot" title="${escapeHtml(pillar?.name || '')} — ${hours}h" style="background:${pillar?.color || '#ccc'};opacity:${hours > 0 ? 1 : 0.25}">${pillar?.emoji || ''}<span class="kid-pillar-hours">${hours}h</span></span>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ---------- RENDER: PEBBLES WEEKLY SUMMARY ----------
  function renderWeeklySummary() {
    const host = document.getElementById('pebbles-summary-host');
    if (!host || !SUMMARY) return;
    const generatedDate = new Date(SUMMARY.generatedAt);
    const dateStr = generatedDate.toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit'
    });
    host.innerHTML = `
      <div class="pebbles-summary-card">
        <div class="pebbles-summary-header">
          <span class="pebbles-summary-emoji">🐶</span>
          <div>
            <h3 class="pebbles-summary-title">Pebbles' Weekly Recap</h3>
            <div class="pebbles-summary-meta">
              ${SUMMARY.cached ? '💾' : '✨'} ${SUMMARY.cached ? 'Cached' : 'Fresh'} · ${escapeHtml(dateStr)}
            </div>
          </div>
          <button id="pebbles-refresh-btn" class="pebbles-refresh-btn" title="Ask Pebbles for a new recap">🔄 Refresh</button>
        </div>
        <p class="pebbles-summary-body">${escapeHtml(SUMMARY.summary)}</p>
        <div class="pebbles-summary-stats">
          <span class="stat-chip">🎯 ${SUMMARY.stats.eventsLastWeek} event${SUMMARY.stats.eventsLastWeek === 1 ? '' : 's'} this week</span>
          ${SUMMARY.stats.topContributor ? `<span class="stat-chip">${escapeHtml(SUMMARY.stats.topContributor.emoji)} ${escapeHtml(SUMMARY.stats.topContributor.name)} most active</span>` : ''}
          ${SUMMARY.stats.backlogLeader ? `<span class="stat-chip">🗳️ Next: ${escapeHtml(SUMMARY.stats.backlogLeader)}</span>` : ''}
          ${SUMMARY.stats.biggestGap ? `<span class="stat-chip">🎯 Focus: ${escapeHtml(SUMMARY.stats.biggestGap)}</span>` : ''}
        </div>
      </div>
    `;
    const refreshBtn = document.getElementById('pebbles-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadWeeklySummary(true));
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', () => {
    loadCrewStatus();
    loadWeeklySummary(false);
  });

  // Expose for debugging
  window.FAB5_AWARDS_PROGRESS = {
    loadCrewStatus,
    loadWeeklySummary,
    getState: () => STATE,
    getSummary: () => SUMMARY
  };
})();
