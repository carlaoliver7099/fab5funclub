import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'

type Event = {
  id: string
  title: string
  activity: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  location: string
  members: string[]
  equipment: string[]
  notes: string
  createdAt: number
}

// In-memory store (resets on worker restart). For permanent storage we'd add Cloudflare D1.
let EVENTS: Event[] = []
let SEEDED = false

const SEED_EVENTS: Event[] = [
  {
    id: 'seed-1',
    title: 'Motocross Madness',
    activity: 'Motocross (MX)',
    date: getNextSaturday(),
    startTime: '07:00',
    endTime: '12:00',
    location: 'Coolum Pines MX Track',
    members: ['Saia', 'Elijah', 'Ace'],
    equipment: ['MX bikes x3', 'Helmets', 'Boots', 'Gloves', 'Body armour', 'Fuel jerry can', 'Trailer'],
    notes: 'Meet at Saia\'s place 6:30am to load utes!',
    createdAt: Date.now()
  },
  {
    id: 'seed-2',
    title: 'Snorkel & SUP Combo',
    activity: 'Snorkeling + Stand Up Paddle Boarding',
    date: getNextSunday(),
    startTime: '08:00',
    endTime: '14:00',
    location: 'Mooloolaba Beach',
    members: ['Saia', 'Charlotte', 'Sienna', 'Elijah', 'Ace'],
    equipment: ['Snorkels x5', 'Fins x5', 'SUP boards x5', 'Rashies', 'Esky with drinks', 'Sunscreen'],
    notes: 'Check tide times the night before!',
    createdAt: Date.now()
  }
]

function getNextSaturday() {
  const d = new Date()
  const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}
function getNextSunday() {
  const d = new Date()
  const day = d.getDay()
  const diff = (7 - day) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function ensureSeeded() {
  if (!SEEDED) {
    EVENTS = [...SEED_EVENTS]
    SEEDED = true
  }
}

const app = new Hono()

app.use('/api/*', cors())
app.use(renderer)

// ============ API ROUTES ============

app.get('/api/events', (c) => {
  ensureSeeded()
  return c.json({ events: EVENTS.sort((a, b) => a.date.localeCompare(b.date)) })
})

app.post('/api/events', async (c) => {
  ensureSeeded()
  const body = await c.req.json<Partial<Event>>()
  if (!body.title || !body.date || !body.activity) {
    return c.json({ error: 'title, date and activity are required' }, 400)
  }
  // Validate day is Sat or Sun
  const day = new Date(body.date + 'T12:00:00').getDay()
  if (day !== 0 && day !== 6) {
    return c.json({ error: 'Events must be on Saturday or Sunday!' }, 400)
  }
  const newEvent: Event = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: body.title,
    activity: body.activity,
    date: body.date,
    startTime: body.startTime || '07:00',
    endTime: body.endTime || '19:00',
    location: body.location || 'TBA',
    members: body.members || [],
    equipment: body.equipment || [],
    notes: body.notes || '',
    createdAt: Date.now()
  }
  EVENTS.push(newEvent)
  return c.json({ event: newEvent }, 201)
})

app.delete('/api/events/:id', (c) => {
  ensureSeeded()
  const id = c.req.param('id')
  const before = EVENTS.length
  EVENTS = EVENTS.filter(e => e.id !== id)
  if (EVENTS.length === before) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

app.get('/api/club-info', (c) => {
  return c.json({
    name: 'Fab 5 Fun Club',
    location: 'Sunshine Coast & Hinterlands, SE Queensland, Australia',
    members: [
      { name: 'Saia',      role: 'Founder',  emoji: '🌟', color: '#FF6B9D' },
      { name: 'Elijah',    role: 'Member',   emoji: '🏍️', color: '#4ECDC4' },
      { name: 'Charlotte', role: 'Member',   emoji: '🏄‍♀️', color: '#FFE66D' },
      { name: 'Ace',       role: 'Member',   emoji: '🛹', color: '#A0E7E5' },
      { name: 'Sienna',    role: 'Member',   emoji: '🌈', color: '#B4F8C8' }
    ],
    activities: [
      { name: 'Motocross (MX)',           emoji: '🏍️', category: 'Wheels' },
      { name: 'Enduro Trails',            emoji: '🌲', category: 'Wheels' },
      { name: 'Go Karting',               emoji: '🏎️', category: 'Wheels' },
      { name: 'Skateboarding',            emoji: '🛹', category: 'Wheels' },
      { name: 'Rollerskating',            emoji: '🛼', category: 'Wheels' },
      { name: 'Kayaking',                 emoji: '🛶', category: 'Water' },
      { name: 'Snorkeling',               emoji: '🤿', category: 'Water' },
      { name: 'Stand Up Paddle Boarding', emoji: '🏄', category: 'Water' },
      { name: 'Wakeboarding',             emoji: '🌊', category: 'Water' },
      { name: 'Water Skiing',             emoji: '🎿', category: 'Water' },
      { name: 'Jet Skiing',               emoji: '🚤', category: 'Water' },
      { name: 'Sailing',                  emoji: '⛵', category: 'Water' },
      { name: '6HP Boating',              emoji: '🚣', category: 'Water' },
      { name: 'Aqua Park Inflatables',    emoji: '🎈', category: 'Water' },
      { name: 'Waterfalls & Creeks',      emoji: '💦', category: 'Adventure' },
      { name: 'Canyoning',                emoji: '🏞️', category: 'Adventure' },
      { name: 'Caving',                   emoji: '🕳️', category: 'Adventure' },
      { name: 'Abseiling',                emoji: '🧗', category: 'Adventure' },
      { name: 'Trekking',                 emoji: '🥾', category: 'Adventure' },
      { name: 'Camping',                  emoji: '⛺', category: 'Adventure' },
      { name: 'First Aid Training',       emoji: '⛑️', category: 'Skills' },
      { name: 'Survival Skills',          emoji: '🧭', category: 'Skills' },
      { name: 'Theme Parks',              emoji: '🎢', category: 'Fun' },
      { name: 'Pig Races',                emoji: '🐷', category: 'Fun' },
      { name: 'Outback Festivals',        emoji: '🤠', category: 'Fun' }
    ]
  })
})

// ============ PAGE ROUTES ============

app.get('/', (c) => {
  return c.render(
    <div id="app">
      <header class="hero">
        <div class="hero-bg"></div>
        <div class="hero-content">
          <img src="/static/logo.png" alt="Fab 5 Fun Club Logo" class="logo" />
          <h1 class="title">FAB 5 FUN CLUB</h1>
          <p class="tagline">Saia • Elijah • Charlotte • Ace • Sienna</p>
          <p class="location">📍 Sunshine Coast & Hinterlands, QLD 🇦🇺</p>
          <div class="hero-buttons">
            <a href="#calendar" class="btn btn-primary">📅 See Calendar</a>
            <a href="#add-event" class="btn btn-secondary">➕ Add Event</a>
            <a href="#activities" class="btn btn-tertiary">🎯 Activities</a>
          </div>
        </div>
      </header>

      <section class="section members-section" id="members">
        <h2 class="section-title">👋 The Crew</h2>
        <div id="members-grid" class="members-grid">
          <div class="loading">Loading crew...</div>
        </div>
      </section>

      <section class="section calendar-section" id="calendar">
        <h2 class="section-title">📅 Weekend Adventure Calendar</h2>
        <p class="section-subtitle">Every Saturday & Sunday, 7am - 7pm</p>
        <div class="calendar-controls">
          <button id="prev-month" class="btn btn-small">◀</button>
          <h3 id="month-label">Loading...</h3>
          <button id="next-month" class="btn btn-small">▶</button>
        </div>
        <div id="calendar-grid" class="calendar-grid"></div>
        <h3 class="upcoming-title">🚀 Upcoming Adventures</h3>
        <div id="events-list" class="events-list">
          <div class="loading">Loading events...</div>
        </div>
      </section>

      <section class="section add-event-section" id="add-event">
        <h2 class="section-title">➕ Plan a New Adventure</h2>
        <form id="event-form" class="event-form">
          <label>
            <span>Event Title</span>
            <input type="text" id="evt-title" required placeholder="e.g. Epic Wakeboard Day" />
          </label>
          <label>
            <span>Activity</span>
            <select id="evt-activity" required></select>
          </label>
          <div class="form-row">
            <label>
              <span>Date (Sat/Sun only!)</span>
              <input type="date" id="evt-date" required />
            </label>
            <label>
              <span>Start Time</span>
              <input type="time" id="evt-start" value="07:00" min="07:00" max="19:00" required />
            </label>
            <label>
              <span>End Time</span>
              <input type="time" id="evt-end" value="12:00" min="07:00" max="19:00" required />
            </label>
          </div>
          <label>
            <span>Location</span>
            <input type="text" id="evt-location" placeholder="e.g. Lake MacDonald, Noosa" />
          </label>
          <label>
            <span>Who's coming? (tick the crew)</span>
            <div id="members-checks" class="checkbox-row"></div>
          </label>
          <label>
            <span>Equipment to pack (comma separated)</span>
            <textarea id="evt-equipment" rows={2} placeholder="MX bikes, helmets, boots, esky..."></textarea>
          </label>
          <label>
            <span>Notes</span>
            <textarea id="evt-notes" rows={2} placeholder="Meet at 6am, bring snacks..."></textarea>
          </label>
          <button type="submit" class="btn btn-primary btn-big">🎉 Add to Calendar</button>
          <div id="form-msg"></div>
        </form>
      </section>

      <section class="section activities-section" id="activities">
        <h2 class="section-title">🎯 Our Epic Activities</h2>
        <div class="activity-filters" id="activity-filters"></div>
        <div id="activities-grid" class="activities-grid"></div>
      </section>

      <footer class="footer">
        <p>Made with 🌈 for the Fab 5 Fun Club</p>
        <p>Sunshine Coast & Hinterlands • SE Queensland 🇦🇺</p>
      </footer>
    </div>
  )
})

export default app
