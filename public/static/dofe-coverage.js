// ============================================================================
// 🎯 FAB 5 — DofE COVERAGE VIEW
// ============================================================================
// Answers Saia's question: "for the DofE skills we need, which activities on
// our calendar cover them — and where are the gaps?"
//
// Renders into the /dofe-syllabus page's #dofe-coverage section. Bails silently
// if those elements don't exist (so the script is safe to include globally).
// ============================================================================

(function () {
  'use strict';

  // Bail-out: this script only does anything on the /dofe-syllabus page
  if (!document.getElementById('dofe-coverage-summary')) return;

  const GAP_BADGES = {
    'gap':       { emoji: '🔴', label: 'GAP',       color: '#E63946', bg: '#FDECEA', desc: 'Less than 25% Bronze coverage — needs attention!' },
    'thin':      { emoji: '🟡', label: 'THIN',      color: '#E0A800', bg: '#FFF8E1', desc: '25–49% Bronze coverage — could use more events.' },
    'on-track':  { emoji: '🟢', label: 'ON-TRACK',  color: '#2D8F4E', bg: '#E8F5E9', desc: '50–99% Bronze coverage — solid progress.' },
    'strong':    { emoji: '🏆', label: 'STRONG',    color: '#1B5E20', bg: '#C8E6C9', desc: '100%+ Bronze coverage — keep it up!' },
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  async function loadCoverage() {
    try {
      const res = await fetch('/api/dofe/coverage', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderSummary(data);
      renderPillars(data);
      renderEvents(data);
    } catch (err) {
      const msg = '<div class="dofe-coverage-error">⚠️ Couldn\'t load coverage data — ' + escapeHtml(err.message) + '</div>';
      ['dofe-coverage-summary', 'dofe-coverage-pillars', 'dofe-coverage-events'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = msg;
      });
    }
  }

  // ---------- SUMMARY (the "TL;DR" at the top) ----------
  function renderSummary(data) {
    const host = document.getElementById('dofe-coverage-summary');
    if (!host) return;
    const s = data.summary;
    const gapPillars = data.pillars.filter(p => s.pillarsWithGaps.includes(p.pillarId));
    const strongest  = data.pillars.find(p => p.pillarId === s.strongestPillar);
    const weakest    = data.pillars.find(p => p.pillarId === s.weakestPillar);

    let alertHtml = '';
    if (gapPillars.length === 4) {
      alertHtml = '<div class="dofe-coverage-alert alert-warn">📅 <strong>Calendar is still light.</strong> Only ' + s.totalEvents + ' event' + (s.totalEvents === 1 ? '' : 's') + ' scheduled so far — every pillar is sitting in gap/thin territory. Add a few weekend adventures from the recommendations below and the bars will fill up fast!</div>';
    } else if (gapPillars.length > 0) {
      alertHtml = '<div class="dofe-coverage-alert alert-gap">🎯 <strong>Coverage gaps detected in:</strong> ' +
        gapPillars.map(p => '<span class="alert-pillar-tag" style="background:' + p.pillarColor + '22;color:' + p.pillarColor + '">' + p.pillarEmoji + ' ' + escapeHtml(p.pillarName) + '</span>').join(' ') +
        '. Scroll down to see exactly which activities can plug each gap.</div>';
    } else {
      alertHtml = '<div class="dofe-coverage-alert alert-strong">🎉 <strong>All 4 pillars are covered!</strong> Every DofE syllabus area has at least one scheduled event building it. Now it\'s about depth — keep stacking those hours.</div>';
    }

    host.innerHTML =
      alertHtml +
      '<div class="dofe-coverage-stats">' +
        '<div class="dofe-coverage-stat">' +
          '<div class="dofe-coverage-stat-num">' + s.totalEvents + '</div>' +
          '<div class="dofe-coverage-stat-label">Total events scheduled</div>' +
        '</div>' +
        '<div class="dofe-coverage-stat">' +
          '<div class="dofe-coverage-stat-num">' + s.dofeBuildingEvents + '</div>' +
          '<div class="dofe-coverage-stat-label">Build at least one DofE pillar</div>' +
        '</div>' +
        '<div class="dofe-coverage-stat">' +
          '<div class="dofe-coverage-stat-num">' + s.dofeFreeEvents + '</div>' +
          '<div class="dofe-coverage-stat-label">Pure fun bonus (no DofE credit)</div>' +
        '</div>' +
        '<div class="dofe-coverage-stat">' +
          '<div class="dofe-coverage-stat-num">' + gapPillars.length + ' / 4</div>' +
          '<div class="dofe-coverage-stat-label">Pillars with coverage gaps</div>' +
        '</div>' +
      '</div>' +
      (strongest && weakest && strongest.pillarId !== weakest.pillarId
        ? '<p class="dofe-coverage-tldr">💪 Strongest pillar: <strong style="color:' + strongest.pillarColor + '">' + strongest.pillarEmoji + ' ' + escapeHtml(strongest.pillarName) + '</strong> (' + strongest.totalHours + 'hr scheduled)' +
          ' &nbsp;•&nbsp; ' +
          '🔻 Needs most love: <strong style="color:' + weakest.pillarColor + '">' + weakest.pillarEmoji + ' ' + escapeHtml(weakest.pillarName) + '</strong> (' + weakest.totalHours + 'hr scheduled)</p>'
        : '');
  }

  // ---------- PER-PILLAR CARDS (the main answer to Saia's question) ----------
  function renderPillars(data) {
    const host = document.getElementById('dofe-coverage-pillars');
    if (!host) return;

    host.innerHTML = data.pillars.map(p => {
      const gap = GAP_BADGES[p.gapStatus] || GAP_BADGES['gap'];
      const events = p.scheduledEvents;
      const recs = p.recommendedActivities;

      // Scheduled events block (or empty state)
      let eventsHtml = '';
      if (events.length === 0) {
        eventsHtml =
          '<div class="dofe-coverage-empty">' +
            '<strong>🚫 No events on the calendar build this pillar yet.</strong>' +
            '<p>This is the biggest gap — pick one of the recommended activities below and schedule it!</p>' +
          '</div>';
      } else {
        eventsHtml =
          '<ul class="dofe-coverage-event-list">' +
          events.map(ev => {
            const otherChips = ev.otherPillars && ev.otherPillars.length
              ? '<span class="dofe-coverage-event-bonus">also builds: ' + ev.otherPillars.join(', ') + '</span>'
              : '';
            return (
              '<li class="dofe-coverage-event' + (ev.isPast ? ' is-past' : '') + '">' +
                '<span class="dofe-coverage-event-emoji">' + escapeHtml(ev.emoji) + '</span>' +
                '<div class="dofe-coverage-event-body">' +
                  '<div class="dofe-coverage-event-title">' + escapeHtml(ev.title) + (ev.isPast ? ' <span class="dofe-coverage-past-tag">past</span>' : '') + '</div>' +
                  '<div class="dofe-coverage-event-meta">' +
                    fmtDate(ev.date) + ' • ' + escapeHtml(ev.activity) + ' • ' + ev.hours + 'hr • ' + escapeHtml(ev.location || 'TBA') +
                  '</div>' +
                  (otherChips ? '<div class="dofe-coverage-event-extra">' + otherChips + '</div>' : '') +
                '</div>' +
              '</li>'
            );
          }).join('') +
          '</ul>';
      }

      // Recommendations block (gap fillers)
      const recsHtml = recs.length === 0 ? '' :
        '<div class="dofe-coverage-recs">' +
          '<h4>💡 Activities that would build ' + p.pillarEmoji + ' ' + escapeHtml(p.pillarName) + '</h4>' +
          '<p class="dofe-coverage-recs-hint">Unscheduled ones first (gap-fillers). The more pillars an activity hits, the more efficient it is — abseiling hits 3 pillars in one weekend!</p>' +
          '<div class="dofe-coverage-recs-grid">' +
          recs.map(r => {
            const isScheduled = r.timesScheduled > 0;
            const badgeText = isScheduled
              ? ('✓ scheduled ' + r.timesScheduled + 'x')
              : '⭐ NEW pick';
            const badgeClass = isScheduled ? 'rec-scheduled' : 'rec-new';
            const efficiencyChip = r.pillars.length >= 3
              ? '<span class="rec-efficiency rec-eff-triple">🔥 hits ' + r.pillars.length + ' pillars</span>'
              : r.pillars.length === 2
                ? '<span class="rec-efficiency rec-eff-double">💎 hits 2 pillars</span>'
                : '';
            return (
              '<div class="dofe-coverage-rec ' + badgeClass + '">' +
                '<div class="dofe-coverage-rec-top">' +
                  '<span class="dofe-coverage-rec-emoji">' + escapeHtml(r.emoji) + '</span>' +
                  '<span class="dofe-coverage-rec-name">' + escapeHtml(r.name) + '</span>' +
                '</div>' +
                '<div class="dofe-coverage-rec-meta">' +
                  '<span class="dofe-coverage-rec-badge">' + badgeText + '</span>' +
                  '<span class="dofe-coverage-rec-hours">' + r.hours + 'hr</span>' +
                  efficiencyChip +
                '</div>' +
              '</div>'
            );
          }).join('') +
          '</div>' +
        '</div>';

      // Coverage bar
      const coverageWidth = Math.min(100, p.coveragePercent);

      return (
        '<div class="dofe-coverage-pillar" style="border-top: 6px solid ' + p.pillarColor + '">' +
          '<div class="dofe-coverage-pillar-head">' +
            '<div class="dofe-coverage-pillar-title">' +
              '<span class="dofe-coverage-pillar-emoji">' + p.pillarEmoji + '</span>' +
              '<div>' +
                '<h3 style="color:' + p.pillarColor + '">' + escapeHtml(p.pillarName) + '</h3>' +
                '<p class="dofe-coverage-pillar-kid">' + escapeHtml(p.pillarKidTalk) + '</p>' +
              '</div>' +
            '</div>' +
            '<span class="dofe-coverage-badge" style="background:' + gap.bg + ';color:' + gap.color + '" title="' + escapeHtml(gap.desc) + '">' +
              gap.emoji + ' ' + gap.label +
            '</span>' +
          '</div>' +

          '<div class="dofe-coverage-bar-wrap">' +
            '<div class="dofe-coverage-bar"><div class="dofe-coverage-bar-fill" style="width:' + coverageWidth + '%; background:' + p.pillarColor + '"></div></div>' +
            '<div class="dofe-coverage-bar-label">' +
              '<strong>' + p.totalHours + 'hr</strong> scheduled / ' + p.bronzeTargetHours + 'hr Bronze target → <strong>' + p.coveragePercent + '%</strong>' +
            '</div>' +
          '</div>' +

          '<div class="dofe-coverage-counts">' +
            '<span>📅 <strong>' + (events.length) + '</strong> event' + (events.length === 1 ? '' : 's') + ' scheduled (' + p.pastEventCount + ' past, ' + p.futureEventCount + ' upcoming)</span>' +
            '<span>🗺️ <strong>' + p.templateWeekCount + '</strong> of 52 template weeks build this pillar</span>' +
          '</div>' +

          '<h4 style="margin-top:1.2rem">📅 What\'s on YOUR calendar that covers this:</h4>' +
          eventsHtml +
          recsHtml +
        '</div>'
      );
    }).join('');
  }

  // ---------- ALL EVENTS TAGGED ----------
  function renderEvents(data) {
    const host = document.getElementById('dofe-coverage-events');
    if (!host) return;

    if (data.allEvents.length === 0) {
      host.innerHTML = '<div class="dofe-coverage-empty">📭 No events on the calendar yet. Add some from the homepage!</div>';
      return;
    }

    host.innerHTML =
      '<table class="dofe-coverage-events-table">' +
        '<thead><tr>' +
          '<th>Date</th>' +
          '<th>Event</th>' +
          '<th>Activity</th>' +
          '<th>Hours</th>' +
          '<th>Pillars built</th>' +
        '</tr></thead>' +
        '<tbody>' +
        data.allEvents.map(ev => {
          const pillarChips = ev.isDofEFree
            ? '<span class="dofe-coverage-event-fun">🎉 fun bonus (no DofE credit)</span>'
            : ev.pillarsDetailed.map(p =>
                '<span class="dofe-coverage-pillar-chip" style="background:' + p.color + '22;color:' + p.color + '">' + p.emoji + ' ' + escapeHtml(p.name) + '</span>'
              ).join(' ');
          return (
            '<tr class="' + (ev.isPast ? 'event-past' : 'event-upcoming') + (ev.isDofEFree ? ' event-fun' : '') + '">' +
              '<td>' + fmtDate(ev.date) + (ev.isPast ? ' <span class="dofe-coverage-past-tag">past</span>' : '') + '</td>' +
              '<td><strong>' + escapeHtml(ev.emoji) + ' ' + escapeHtml(ev.title) + '</strong></td>' +
              '<td>' + escapeHtml(ev.activity) + '</td>' +
              '<td>' + ev.hours + 'hr</td>' +
              '<td>' + pillarChips + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody>' +
      '</table>';
  }

  // Boot
  console.log('🎯 Fab 5 DofE Coverage view loading…');
  loadCoverage();

  // Expose for manual refresh
  window.FAB5_DOFE_COVERAGE = { reload: loadCoverage };
})();
