// ============================================================================
// 🗳️ FAB 5 — ADVENTURE BACKLOG (Sprint Picker)
// ============================================================================
// Kid-friendly weekend voting:
//  - See ALL Bronze/Silver/Gold-eligible activities
//  - 1 vote per kid (uses "Who am I?" picker from app.js)
//  - Auto-resets every Monday 5am Brisbane time
//  - Shows which pillar gaps each activity fills
//  - Crew favourites (done 2+ times) get a ⭐ badge
//  - Lock in the winner → pre-fills the Add Event form for an adult to confirm
// ============================================================================

(function () {
  'use strict';

  // Bail-out: only run on /backlog page
  if (!document.getElementById('backlog-cards')) return;

  // ---------- Constants & helpers ----------
  const PILLAR_META = {
    physical:  { emoji: '💪', label: 'Physical',  color: '#E63946', bg: '#FDECEA' },
    skills:    { emoji: '🎯', label: 'Skills',    color: '#5B47BF', bg: '#EEEAFB' },
    service:   { emoji: '💚', label: 'Service',   color: '#2D8F4E', bg: '#E8F5E9' },
    adventure: { emoji: '🧗', label: 'Adventure', color: '#E07A1F', bg: '#FFF1E5' },
  };

  const CREW_USER_KEY = 'fab5_crew_user_v1';

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function getCurrentCrewUser() {
    try { return localStorage.getItem(CREW_USER_KEY) || null; } catch { return null; }
  }

  function fmtCountdown(hours) {
    if (hours <= 0) return 'Sprint ended — new one rolls Monday 5am! ⏰';
    if (hours < 24) return `⏰ ${hours} hour${hours === 1 ? '' : 's'} left to vote!`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `⏰ ${days} day${days === 1 ? '' : 's'}${remHours > 0 ? ` ${remHours}h` : ''} left to vote!`;
  }

  function fmtFullDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ---------- State ----------
  let STATE = null;
  let CURRENT_FILTER = 'all'; // 'all' | 'physical' | 'skills' | 'service' | 'adventure' | 'gaps' | 'faves' | 'new'

  // ---------- Load ----------
  async function load() {
    try {
      const res = await fetch('/api/backlog', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      STATE = await res.json();
      render();
    } catch (err) {
      const container = document.getElementById('backlog-cards');
      if (container) {
        container.innerHTML = '<div class="backlog-error">⚠️ Couldn\'t load the backlog — ' + escapeHtml(err.message) + '. Try refreshing? 🔄</div>';
      }
    }
  }

  // ---------- Render ----------
  function render() {
    if (!STATE) return;
    renderSprintBanner();
    renderWhoAmIBanner();
    renderLeaderboard();
    renderFilterPills();
    renderCards();
    renderLockedWinner();
    renderGapHint();
  }

  function renderSprintBanner() {
    const el = document.getElementById('backlog-sprint-banner');
    if (!el) return;
    const s = STATE.sprint;
    const endDate = new Date(s.endIso);
    const endStr = endDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
    el.innerHTML = `
      <div class="sprint-banner-inner">
        <div class="sprint-emoji">🏃‍♂️</div>
        <div class="sprint-text">
          <div class="sprint-title">This week's sprint!</div>
          <div class="sprint-countdown">${escapeHtml(fmtCountdown(s.hoursRemaining))}</div>
          <div class="sprint-ends">Voting closes ${escapeHtml(endStr)} 5am ✨</div>
        </div>
      </div>
    `;
  }

  function renderWhoAmIBanner() {
    const el = document.getElementById('backlog-whoami-banner');
    if (!el) return;
    const me = getCurrentCrewUser();
    if (!me) {
      el.innerHTML = `
        <div class="whoami-banner whoami-banner-empty">
          <span class="whoami-emoji">👋</span>
          <div>
            <strong>Who are you?</strong> Tap the <em>Who am I?</em> button up top so we know who's voting!
          </div>
        </div>
      `;
    } else {
      // Did this user vote?
      const myVote = STATE.voterMap && STATE.voterMap[me];
      el.innerHTML = `
        <div class="whoami-banner whoami-banner-active">
          <span class="whoami-emoji">${myVote ? '✅' : '🗳️'}</span>
          <div>
            <strong>Hey ${escapeHtml(me)}!</strong>
            ${myVote
              ? `You voted for <strong>${escapeHtml(myVote)}</strong>. Change your mind? Tap a different card!`
              : `Pick the adventure you want to do this weekend 👇`}
          </div>
          ${myVote ? `<button class="btn-clear-vote" id="btn-clear-my-vote">Clear my vote</button>` : ''}
        </div>
      `;
      const clearBtn = document.getElementById('btn-clear-my-vote');
      if (clearBtn) clearBtn.addEventListener('click', () => clearMyVote(me));
    }
  }

  function renderLeaderboard() {
    const el = document.getElementById('backlog-leaderboard');
    if (!el) return;
    const lb = STATE.leaderboard || [];
    if (lb.length === 0) {
      el.innerHTML = `
        <div class="leaderboard-empty">
          <span class="lb-empty-emoji">🦗</span>
          <div>No votes yet! Be the first to pick an adventure 🎯</div>
        </div>
      `;
      return;
    }
    const top3 = lb.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = `
      <h2 class="leaderboard-title">📊 Current Vote Tally</h2>
      <div class="leaderboard-grid">
        ${top3.map((c, i) => `
          <div class="leaderboard-card ${i === 0 ? 'leader' : ''}">
            <div class="lb-medal">${medals[i]}</div>
            <div class="lb-emoji">${escapeHtml(c.emoji)}</div>
            <div class="lb-name">${escapeHtml(c.activityName)}</div>
            <div class="lb-votes">
              <span class="lb-vote-count">${c.voteCount}</span>
              <span class="lb-vote-label">vote${c.voteCount === 1 ? '' : 's'}</span>
            </div>
            <div class="lb-voters">${c.voters.map(v => `<span class="lb-voter-chip">${escapeHtml(v)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderFilterPills() {
    const el = document.getElementById('backlog-filters');
    if (!el) return;
    const filters = [
      { id: 'all',       label: '🌈 Show all',     count: STATE.cards.length },
      { id: 'gaps',      label: '🔴 Fills a gap',  count: STATE.cards.filter(c => c.fillsGap).length },
      { id: 'new',       label: '✨ Never done',   count: STATE.cards.filter(c => c.isNew).length },
      { id: 'faves',     label: '⭐ Crew faves',   count: STATE.cards.filter(c => c.isFave).length },
      { id: 'physical',  label: '💪 Physical',     count: STATE.cards.filter(c => c.pillars.includes('physical')).length },
      { id: 'skills',    label: '🎯 Skills',       count: STATE.cards.filter(c => c.pillars.includes('skills')).length },
      { id: 'service',   label: '💚 Service',      count: STATE.cards.filter(c => c.pillars.includes('service')).length },
      { id: 'adventure', label: '🧗 Adventure',    count: STATE.cards.filter(c => c.pillars.includes('adventure')).length },
    ];
    el.innerHTML = filters.map(f => `
      <button class="filter-pill ${CURRENT_FILTER === f.id ? 'active' : ''}" data-filter="${f.id}">
        ${escapeHtml(f.label)} <span class="filter-pill-count">${f.count}</span>
      </button>
    `).join('');
    el.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        CURRENT_FILTER = btn.getAttribute('data-filter');
        renderFilterPills();
        renderCards();
        document.getElementById('backlog-cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function applyFilter(cards) {
    if (CURRENT_FILTER === 'all') return cards;
    if (CURRENT_FILTER === 'gaps')  return cards.filter(c => c.fillsGap);
    if (CURRENT_FILTER === 'new')   return cards.filter(c => c.isNew);
    if (CURRENT_FILTER === 'faves') return cards.filter(c => c.isFave);
    return cards.filter(c => c.pillars.includes(CURRENT_FILTER));
  }

  function sortCards(cards) {
    // Sort: votes desc, then fillsGap, then new, then alphabetical
    return [...cards].sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      if (a.fillsGap !== b.fillsGap) return a.fillsGap ? -1 : 1;
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return a.activityName.localeCompare(b.activityName);
    });
  }

  function renderCards() {
    const host = document.getElementById('backlog-cards');
    if (!host) return;
    const me = getCurrentCrewUser();
    const myVote = (me && STATE.voterMap && STATE.voterMap[me]) || null;

    const cards = sortCards(applyFilter(STATE.cards));

    if (cards.length === 0) {
      host.innerHTML = `
        <div class="cards-empty">
          <span style="font-size:3rem;display:block;">🤷</span>
          <strong>No activities match this filter.</strong><br/>
          Try a different one 👆
        </div>
      `;
      return;
    }

    host.innerHTML = cards.map(c => renderCard(c, me, myVote)).join('');

    // Attach vote listeners
    host.querySelectorAll('[data-vote-activity]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const activityName = btn.getAttribute('data-vote-activity');
        const me2 = getCurrentCrewUser();
        if (!me2) {
          alert('👋 Who are you? Tap the "Who am I?" button at the top first!');
          return;
        }
        castVote(me2, activityName, btn);
      });
    });
  }

  function renderCard(c, me, myVote) {
    const isMyVote = myVote === c.activityName;
    const canVote = !!me;
    const pillarChips = c.pillars.map(p => {
      const meta = PILLAR_META[p];
      return meta ? `<span class="card-pillar-chip" style="background:${meta.bg};color:${meta.color}">${meta.emoji} ${escapeHtml(meta.label)}</span>` : '';
    }).join('');

    const badges = [];
    if (c.tripleThreat) badges.push('<span class="card-badge badge-triple">🔥 Triple threat</span>');
    if (c.fillsGap) badges.push('<span class="card-badge badge-gap">🎯 Fills a gap!</span>');
    if (c.isFave) badges.push(`<span class="card-badge badge-fave">⭐ Crew fave (${c.timesDone}×)</span>`);
    if (c.isNew) badges.push('<span class="card-badge badge-new">✨ Never done!</span>');

    const skillsList = c.skillsYouGet.map(s => `<li>${escapeHtml(s)}</li>`).join('');

    const voterChips = c.voters.length
      ? `<div class="card-voters">${c.voters.map(v => `<span class="card-voter-chip">${escapeHtml(v)}</span>`).join('')}</div>`
      : '';

    return `
      <article class="backlog-card ${isMyVote ? 'my-vote' : ''} ${c.voteCount > 0 ? 'has-votes' : ''}">
        <div class="card-header">
          <div class="card-emoji">${escapeHtml(c.emoji)}</div>
          <div class="card-titles">
            <h3 class="card-title">${escapeHtml(c.activityName)}</h3>
            <div class="card-meta">
              <span class="card-category">${escapeHtml(c.category)}</span>
              <span class="card-duration">${escapeHtml(c.durationLabel)}</span>
            </div>
          </div>
        </div>

        ${badges.length ? `<div class="card-badges">${badges.join('')}</div>` : ''}

        <div class="card-pillars">${pillarChips}</div>

        <div class="card-skills-box">
          <div class="card-skills-title">🎁 What you'll gain:</div>
          <ul class="card-skills-list">${skillsList}</ul>
        </div>

        <div class="card-vote-row">
          <div class="card-vote-info">
            <span class="card-vote-count">${c.voteCount}</span>
            <span class="card-vote-label">vote${c.voteCount === 1 ? '' : 's'}</span>
          </div>
          <button
            class="card-vote-btn ${isMyVote ? 'voted' : ''}"
            data-vote-activity="${escapeHtml(c.activityName)}"
            ${canVote ? '' : 'disabled'}
            title="${canVote ? (isMyVote ? 'You voted for this!' : 'Vote for this activity') : 'Set who you are first!'}"
          >
            ${isMyVote ? '✅ My pick!' : (canVote ? '🗳️ Vote for this!' : '👋 Who are you?')}
          </button>
        </div>

        ${voterChips}
      </article>
    `;
  }

  function renderLockedWinner() {
    const el = document.getElementById('backlog-locked-winner');
    const lockSection = document.getElementById('backlog-lock-section');
    if (!el || !lockSection) return;

    const lw = STATE.lockedWinner;
    const lb = STATE.leaderboard || [];
    const topLeader = lb[0];

    if (lw) {
      el.innerHTML = `
        <div class="locked-winner-card">
          <div class="locked-emoji">🏆</div>
          <div class="locked-info">
            <div class="locked-eyebrow">🔒 Locked in for the sprint!</div>
            <h2 class="locked-name">${escapeHtml(lw.activityName)}</h2>
            <p class="locked-by">Picked by <strong>${escapeHtml(lw.lockedBy)}</strong> on ${escapeHtml(new Date(lw.lockedAt).toLocaleDateString('en-AU', { day:'numeric', month:'short' }))}</p>
            <div class="locked-actions">
              <a href="/#add-event" class="btn-pre-fill">📝 Add to Calendar →</a>
              <button class="btn-unlock" id="btn-unlock-winner">Undo lock</button>
            </div>
          </div>
        </div>
      `;
      const unlockBtn = document.getElementById('btn-unlock-winner');
      if (unlockBtn) unlockBtn.addEventListener('click', clearLock);
      lockSection.style.display = 'none'; // hide the lock-in CTA since we already have a winner
    } else {
      el.innerHTML = '';
      if (topLeader && topLeader.voteCount > 0) {
        lockSection.style.display = 'block';
        lockSection.innerHTML = `
          <div class="lock-cta-inner">
            <div class="lock-cta-emoji">${escapeHtml(topLeader.emoji)}</div>
            <div class="lock-cta-text">
              <h3>Ready to lock in <strong>${escapeHtml(topLeader.activityName)}</strong>?</h3>
              <p>It's leading with <strong>${topLeader.voteCount} vote${topLeader.voteCount === 1 ? '' : 's'}</strong>. Lock it in and we'll pre-fill the Add Event form so a grown-up can confirm the date & location!</p>
            </div>
            <button class="btn-lock-winner" id="btn-lock-winner">🔒 Lock in winner!</button>
          </div>
        `;
        const lockBtn = document.getElementById('btn-lock-winner');
        if (lockBtn) lockBtn.addEventListener('click', () => lockWinner());
      } else {
        lockSection.style.display = 'none';
      }
    }
  }

  function renderGapHint() {
    const el = document.getElementById('backlog-gap-hint');
    if (!el) return;
    const gaps = STATE.coverageGaps || [];
    if (gaps.length === 0) {
      el.innerHTML = `
        <div class="gap-hint gap-hint-ok">
          🎉 <strong>All four pillars look strong!</strong> Pick anything that sparks joy this weekend ✨
        </div>
      `;
      return;
    }
    const gapList = gaps.map(p => {
      const meta = PILLAR_META[p];
      return meta ? `<span class="gap-chip" style="background:${meta.bg};color:${meta.color}">${meta.emoji} ${escapeHtml(meta.label)}</span>` : '';
    }).join('');
    el.innerHTML = `
      <div class="gap-hint">
        🎯 <strong>Pillars needing love right now:</strong> ${gapList}
        <span class="gap-hint-tip">→ Cards with the <span class="badge-gap-inline">🎯 Fills a gap!</span> badge help balance our Bronze progress.</span>
      </div>
    `;
  }

  // ---------- Actions ----------
  async function castVote(voter, activityName, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = '⏳ Voting...';
    }
    try {
      const res = await fetch('/api/backlog/vote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter, activityName }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      STATE = data;
      celebrate();
      render();
    } catch (err) {
      alert('Couldn\'t save your vote: ' + err.message);
      load();
    }
  }

  async function clearMyVote(voter) {
    try {
      const res = await fetch('/api/backlog/vote/clear', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      STATE = await res.json();
      render();
    } catch (err) {
      alert('Couldn\'t clear vote: ' + err.message);
    }
  }

  async function lockWinner() {
    const me = getCurrentCrewUser() || 'Anonymous';
    try {
      const res = await fetch('/api/backlog/lock-winner', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockedBy: me }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      STATE = data;
      celebrate(true);

      // Stash pre-fill data in sessionStorage for the homepage Add Event form
      if (data.lockedWinner) {
        try {
          sessionStorage.setItem('fab5_event_prefill', JSON.stringify({
            title: data.suggestedTitle || ('🎉 ' + data.lockedWinner.activityName + ' weekend!'),
            activityName: data.lockedWinner.activityName,
            date: data.suggestedDate || '',
            lockedBy: data.lockedWinner.lockedBy,
          }));
        } catch {}
      }
      render();
    } catch (err) {
      alert('Couldn\'t lock in winner: ' + err.message);
    }
  }

  async function clearLock() {
    if (!confirm('Undo the locked-in winner? The vote tally stays as-is.')) return;
    try {
      const res = await fetch('/api/backlog/lock-winner/clear', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      STATE = await res.json();
      render();
    } catch (err) {
      alert('Couldn\'t undo lock: ' + err.message);
    }
  }

  // ---------- Confetti! 🎉 ----------
  function celebrate(big = false) {
    const count = big ? 80 : 30;
    const emojis = big ? ['🎉','✨','🌟','🏆','🎊','💫','🎈'] : ['🎉','✨','🌟','💫'];
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      piece.style.fontSize = (1.2 + Math.random() * 1.8) + 'rem';
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3500);
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', load);
  // Re-render the who-am-I banner if the user changes identity without reload
  window.addEventListener('storage', (e) => {
    if (e.key === CREW_USER_KEY && STATE) render();
  });

  // Expose for debugging
  window.FAB5_BACKLOG = { load, getState: () => STATE };
})();
