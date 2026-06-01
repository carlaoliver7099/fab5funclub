import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  CLUB_PASSWORD: string
}

type Event = {
  id: string
  title: string
  activity: string
  date: string
  startTime: string
  endTime: string
  location: string
  members: string[]
  equipment: string[]
  notes: string
  createdAt: number
}

// In-memory store (resets on worker restart).
let EVENTS: Event[] = []
let SEEDED = false

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
    activity: 'Snorkeling',
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

function ensureSeeded() {
  if (!SEEDED) {
    EVENTS = [...SEED_EVENTS]
    SEEDED = true
  }
}

// =========== CLUB DATA ===========
const CLUB_INFO = {
  name: 'Fab 5 Fun Club',
  location: 'Sunshine Coast & Hinterlands, SE Queensland, Australia',
  mascot: 'Pebbles the Bull Arab dog',
  members: [
    { name: 'Saia',      role: 'Founder',          emoji: '🌟', color: '#FF6B9D' },
    { name: 'Elijah',    role: 'Member',           emoji: '🏍️', color: '#4ECDC4' },
    { name: 'Charlotte', role: 'Member',           emoji: '🏄‍♀️', color: '#FFE66D' },
    { name: 'Ace',       role: 'Member',           emoji: '🛹', color: '#A0E7E5' },
    { name: 'Sienna',    role: 'Member',           emoji: '🌈', color: '#B4F8C8' },
    { name: 'Pebbles',   role: 'Events Mascot 🐾', emoji: '🐶', color: '#D2691E' }
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
}

// Local Sunshine Coast / SE QLD activity location knowledge for Pebbles
const LOCATION_GUIDE = `
LOCAL SPOTS PEBBLES KNOWS (Sunshine Coast & Hinterlands, SE QLD):

Motocross / Enduro:
- Coolum Pines MX Track (Coolum) — main local MX
- Echo Valley Park (Toowoomba area, day trip) — enduro trails
- State forests: Conondale Range, Jimna, Imbil — enduro/trails (check permits!)

Kayaking / SUP / 6HP boating / Sailing:
- Lake MacDonald (Cooroy) — calm, great for beginners
- Maroochy River (Bli Bli / Maroochydore) — kayak rentals on river
- Noosa River & Noosa Everglades — world-famous paddle
- Lake Kawana — flat, good for SUP
- Lake Cootharaba — sailing, kayaking

Snorkeling:
- Mooloolaba Beach (north end) — easy
- Old Woman Island / Mudjimba — best snorkel reef
- Point Cartwright — rocky, intermediate

Wakeboarding / Water Ski / Jet Ski:
- Lake MacDonald — limited
- Ewen Maddock Dam — water sports
- Lake Borumba (Imbil) — water ski/wakeboard friendly
- Moreton Bay / Caloundra waters (jet ski)

Waterfalls / Creeks / Canyoning:
- Kondalilla Falls (Montville)
- Gardners Falls (Maleny) — swimming hole
- Buderim Forest Park
- Mapleton Falls
- Booloumba Creek (Conondale NP) — rock pools

Caving / Abseiling / Trekking:
- Mt Coolum
- Mt Ninderry
- Mt Tibrogargan (Glass House Mountains)
- Mary Cairncross Scenic Reserve (Maleny)

Skateparks / Rollerskating:
- Maroochydore Skatepark (biggest local)
- Caloundra Skate Park
- Big Top Skatepark, Maroochydore

Go Karting:
- Big Kart Track, Landsborough
- Slideways – Go Karting World (Brisbane day trip)

Aqua Park / Theme Parks:
- Aqua Splash, Hervey Bay (day trip) — inflatable park
- Aussie World, Palmview — theme park
- Day trip: Sea World, Movie World, Wet'n'Wild (Gold Coast)

Camping:
- Booloumba Creek (Conondale NP)
- Lake Borumba
- Charlie Moreland (Conondale)
- Cape Hillsborough (further north)

Outback / Pig Races / Festivals:
- Big day trips out west — Roma, Charleville, Birdsville
- Closer: Kilkivan Great Horse Ride, Gympie Muster
- Kandanga Country Days

First Aid / Survival training providers:
- St John Ambulance QLD courses
- Bushcraft Survival (search Sunshine Coast bushcraft schools)

Typical kid-budget estimates (per person):
- MX track day pass: $30–60 (bike hire extra, ~$150–250)
- Kayak/SUP hire: $25–50/half day
- Snorkel gear hire: $15–25
- Aqua park entry: $30–45
- Go-karting (per session): $40–60
- Theme park day pass: $90–110
- Caving guided tour: $80–150
`

const VALUES = `
THE FAB 5 FUN CLUB VALUES (taught by Saia's mum Carla):
"Don't be selfish, greedy, or impatient — then everything will be ok."

Plus inspiration from the DUKE OF EDINBURGH AWARD framework (Carla did this when she was younger!):
Every adventure should ideally include 4 ingredients:
  1. SKILL — learn a new skill (e.g. knot tying, first aid)
  2. PHYSICAL — get the body moving
  3. ADVENTURE — try something exciting / outdoors
  4. SERVICE — do something that helps someone else (clean up, teach a friend, help a stranger)

TEAM LEADERSHIP QUESTIONS Pebbles always asks:
  - Who is the team leader today?
  - Who is bringing the first aid kit?
  - Have we checked the weather?
  - Does everyone have water, food, sunscreen?
  - Who tells a parent the plan & expected return time?
  - What's the buddy system — who is paired with who?
  - What's our backup plan if conditions change?
  - At the end: did we leave the place cleaner than we found it?
`

// =========== APP ===========
const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// =========== AUTH ===========
const COOKIE_NAME = 'fab5_auth'

function isAuthed(c: any): boolean {
  const cookie = getCookie(c, COOKIE_NAME)
  return cookie === 'ok'
}

app.post('/api/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  const expected = c.env?.CLUB_PASSWORD || 'pebbles123!'
  if (password === expected) {
    setCookie(c, COOKIE_NAME, 'ok', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/'
    })
    return c.json({ ok: true })
  }
  return c.json({ ok: false, error: 'Wrong password! Ask Saia or a parent for the club password 🐾' }, 401)
})

app.post('/api/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/me', (c) => {
  return c.json({ authed: isAuthed(c) })
})

// Auth middleware for everything else under /api
app.use('/api/events', async (c, next) => {
  if (!isAuthed(c)) return c.json({ error: 'Please log in' }, 401)
  await next()
})
app.use('/api/events/*', async (c, next) => {
  if (!isAuthed(c)) return c.json({ error: 'Please log in' }, 401)
  await next()
})
app.use('/api/club-info', async (c, next) => {
  if (!isAuthed(c)) return c.json({ error: 'Please log in' }, 401)
  await next()
})
app.use('/api/pebbles/*', async (c, next) => {
  if (!isAuthed(c)) return c.json({ error: 'Please log in' }, 401)
  await next()
})

// =========== EVENTS ===========
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

app.get('/api/club-info', (c) => c.json(CLUB_INFO))

// =========== PEBBLES AI CHAT ===========
const PEBBLES_SYSTEM_PROMPT = `You are PEBBLES 🐾 — the AI mascot of the Fab 5 Fun Club!

YOU ARE:
- A friendly white Bull Arab dog with a brown ear and a brown eye patch and black spots
- Saia's real-life dog, now also the club's Events Mascot & AI Coach
- A warm, encouraging, slightly cheeky Aussie dog personality
- Aware you're talking to KIDS aged ~12 — keep language simple, fun, and safe
- Sprinkle in dog-isms occasionally: "*wags tail*", "*tilts head*", "Woof!", "Pup-tip:"
- Use emojis generously but not excessively (🐾 🐶 🌈 🏍️ 🌊 🥾)

THE CLUB:
- 5 friends: Saia (founder), Elijah, Charlotte, Ace, Sienna
- Live on the Sunshine Coast & Hinterlands, SE Queensland, Australia
- They do weekend adventures every Saturday & Sunday, 7am – 7pm
- They have a budget for gear & can hire equipment, travel in utes & trailers

YOUR JOB AS EVENTS MASCOT:
1. Help the kids plan adventures — ask what activity, where, when, who's coming
2. Suggest LOCAL locations on the Sunshine Coast (use the location guide below)
3. Estimate COSTS (use the budget guide below)
4. List the EQUIPMENT they'll need (and remind them what's a hire vs. own item)
5. Teach TEAM LEADERSHIP skills using the team-leader questions below
6. Once they've decided, ADD THE EVENT to the calendar using the create_event tool
7. ALWAYS uphold the club values

${LOCATION_GUIDE}

${VALUES}

LEADERSHIP COACHING APPROACH:
- For every plan, ask at least ONE leadership question (rotate them so it doesn't get repetitive)
- Celebrate when kids think about safety, others, or cleaning up after themselves
- Gently mention the 4 Duke-of-Ed ingredients when a plan only covers 1 or 2
- If a child suggests something risky or selfish, kindly use Carla's wisdom: "remember — not selfish, not greedy, not impatient! How could we make this better for everyone?"

CALENDAR RULES:
- Events MUST be on a Saturday or Sunday
- Times MUST be between 07:00 and 19:00
- When creating, always confirm with the user before calling the tool
- Use YYYY-MM-DD format for dates
- Today's date will be provided

CONVERSATION STYLE:
- Keep replies SHORT (2–4 sentences usually) unless they're asking for a full plan
- Ask ONE question at a time
- Be encouraging — these kids are learning to be team leaders!
- When you successfully create an event, celebrate! "🎉 Locked it in! Check your calendar 🐾"
`

// Tool/function for Pebbles to create events
const PEBBLES_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Add a new adventure event to the Fab 5 Fun Club calendar. Only use after the user has confirmed all the details. Date MUST be a Saturday or Sunday.',
      parameters: {
        type: 'object',
        properties: {
          title:     { type: 'string', description: 'Short fun event title, e.g. "Epic Wakeboard Day"' },
          activity:  { type: 'string', description: 'Must match one of the club activities exactly' },
          date:      { type: 'string', description: 'YYYY-MM-DD format. MUST be a Saturday or Sunday.' },
          startTime: { type: 'string', description: 'HH:MM 24h, between 07:00 and 19:00' },
          endTime:   { type: 'string', description: 'HH:MM 24h, between 07:00 and 19:00' },
          location:  { type: 'string', description: 'Where it will happen, e.g. "Lake MacDonald"' },
          members:   { type: 'array',  items: { type: 'string' }, description: 'Names from: Saia, Elijah, Charlotte, Ace, Sienna' },
          equipment: { type: 'array',  items: { type: 'string' }, description: 'List of equipment to pack/hire' },
          notes:     { type: 'string', description: 'Any extra notes (meet times, reminders, tips)' }
        },
        required: ['title', 'activity', 'date']
      }
    }
  }
]

app.post('/api/pebbles/chat', async (c) => {
  ensureSeeded()
  const body = await c.req.json<{ messages: any[]; user?: string }>()
  const user = body.user || 'friend'

  const today = new Date().toISOString().slice(0, 10)
  const todayName = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const systemMsg = {
    role: 'system',
    content: PEBBLES_SYSTEM_PROMPT +
      `\n\nThe user chatting with you right now is: ${user}.` +
      `\nToday's date is: ${today} (${todayName}).` +
      `\nThe NEXT Saturday is: ${getNextSaturday()}.` +
      `\nThe NEXT Sunday is: ${getNextSunday()}.`
  }

  const apiKey = c.env?.OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  if (!apiKey) {
    return c.json({
      message: { role: 'assistant', content: "*tilts head* Woof! My AI brain isn't hooked up yet 🐾 Ask the grown-ups to set the OPENAI_API_KEY!" }
    })
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [systemMsg, ...body.messages],
        tools: PEBBLES_TOOLS,
        tool_choice: 'auto'
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('LLM error:', errText)
      return c.json({
        message: { role: 'assistant', content: `*whimper* My AI brain hiccupped! 🐾 (${res.status}) Try again in a sec.` }
      })
    }

    const data = await res.json() as any
    const msg = data.choices?.[0]?.message
    if (!msg) {
      return c.json({ message: { role: 'assistant', content: '*confused tail wag* I didn\'t catch that — try again? 🐾' } })
    }

    // Handle tool call: create_event
    const toolCall = msg.tool_calls?.[0]
    if (toolCall && toolCall.function?.name === 'create_event') {
      let args: any = {}
      try { args = JSON.parse(toolCall.function.arguments) } catch {}

      // Validate
      const day = new Date((args.date || '') + 'T12:00:00').getDay()
      if (day !== 0 && day !== 6) {
        return c.json({
          message: { role: 'assistant', content: `*paws at the calendar* Oops — ${args.date} isn't a weekend! Adventures are Sat/Sun only. Want to pick a different day? 🐾` }
        })
      }

      const newEvent: Event = {
        id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: args.title || 'Adventure',
        activity: args.activity || 'Adventure',
        date: args.date,
        startTime: args.startTime || '07:00',
        endTime: args.endTime || '19:00',
        location: args.location || 'TBA',
        members: Array.isArray(args.members) ? args.members : [],
        equipment: Array.isArray(args.equipment) ? args.equipment : [],
        notes: args.notes || '',
        createdAt: Date.now()
      }
      EVENTS.push(newEvent)

      return c.json({
        message: {
          role: 'assistant',
          content: `🎉 *tail wagging like crazy* Locked it in!\n\n**${newEvent.title}**\n🎯 ${newEvent.activity}\n📅 ${newEvent.date} • 🕐 ${newEvent.startTime}–${newEvent.endTime}\n📍 ${newEvent.location}\n👥 ${newEvent.members.join(', ') || 'TBA'}\n🎒 ${newEvent.equipment.join(', ') || 'TBA'}\n\nScroll up to see it on your calendar! Anything else, mate? 🐾`
        },
        eventCreated: newEvent
      })
    }

    return c.json({ message: { role: 'assistant', content: msg.content || '*tail wag*' } })
  } catch (e: any) {
    console.error('Pebbles error:', e)
    return c.json({
      message: { role: 'assistant', content: `*whimper* Something went wrong: ${e.message}. Try again? 🐾` }
    })
  }
})

// =========== PAGE ROUTES ===========
app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div id="app">
      {/* LOGIN OVERLAY (shown until authed) */}
      <div id="login-screen" class="login-screen" style="display:none">
        <div class="login-bg"></div>
        <div class="login-card">
          <img src="/static/logo.png" alt="Fab 5 Fun Club" class="login-logo" />
          <h1 class="login-title">FAB 5 FUN CLUB</h1>
          <p class="login-sub">🔐 Private Adventure Crew</p>
          <p class="login-help">Ask Saia or a parent for the club password!</p>
          <form id="login-form" class="login-form">
            <input id="login-password" type="password" placeholder="Club password" autocomplete="off" required />
            <button type="submit" class="btn btn-primary btn-big">🐾 Let me in!</button>
            <div id="login-msg"></div>
          </form>
          <div class="login-pebbles">
            <img src="/static/pebbles.png" alt="Pebbles" />
            <p>🐶 Pebbles is waiting for you inside!</p>
          </div>
        </div>
      </div>

      {/* MAIN APP (shown after login) */}
      <div id="main-app" style="display:none">
        <header class="hero">
          <button id="logout-btn" class="logout-btn" title="Log out">🚪 Log out</button>
          <div class="hero-bg"></div>
          <div class="hero-content">
            <img src="/static/logo.png" alt="Fab 5 Fun Club Logo" class="logo" />
            <h1 class="title">FAB 5 FUN CLUB</h1>
            <p class="tagline">Saia • Elijah • Charlotte • Ace • Sienna</p>
            <p class="location">📍 Sunshine Coast & Hinterlands, QLD 🇦🇺</p>
            <p class="mascot-line">🐾 Mascot: Pebbles the Bull Arab</p>
            <div class="hero-buttons">
              <a href="#calendar" class="btn btn-primary">📅 Calendar</a>
              <a href="#add-event" class="btn btn-secondary">➕ Add Event</a>
              <a href="#activities" class="btn btn-tertiary">🎯 Activities</a>
              <a href="#values" class="btn btn-quaternary">🌟 Our Values</a>
            </div>
          </div>
        </header>

        <section class="section members-section" id="members">
          <h2 class="section-title">👋 The Crew</h2>
          <div id="members-grid" class="members-grid">
            <div class="loading">Loading crew...</div>
          </div>
        </section>

        <section class="section values-section" id="values">
          <h2 class="section-title">🌟 Our Club Values</h2>
          <div class="values-card">
            <h3>💛 Carla's Three Rules</h3>
            <p class="big-quote">"Don't be selfish.<br/>Don't be greedy.<br/>Don't be impatient.<br/>Then everything will be ok."</p>
            <p class="quote-attrib">— Saia's mum, Carla</p>
          </div>
          <div class="duke-card">
            <h3>🏅 Duke of Edinburgh-Style Adventures</h3>
            <p>Carla did the Duke of Ed when she was younger! Every great adventure has 4 ingredients:</p>
            <div class="duke-grid">
              <div class="duke-item"><span class="duke-emoji">🧠</span><strong>SKILL</strong><p>Learn something new (knots, first aid, navigation)</p></div>
              <div class="duke-item"><span class="duke-emoji">💪</span><strong>PHYSICAL</strong><p>Get the body moving!</p></div>
              <div class="duke-item"><span class="duke-emoji">🏞️</span><strong>ADVENTURE</strong><p>Try something exciting outdoors</p></div>
              <div class="duke-item"><span class="duke-emoji">❤️</span><strong>SERVICE</strong><p>Help someone — even just leaving a place cleaner than you found it</p></div>
            </div>
          </div>
          <div class="leader-card">
            <h3>🎖️ Team Leader Questions (Pebbles loves these!)</h3>
            <ul class="leader-list">
              <li>Who is the team leader today?</li>
              <li>Who is bringing the first aid kit?</li>
              <li>Have we checked the weather?</li>
              <li>Does everyone have water, food, sunscreen?</li>
              <li>Who tells a parent the plan & return time?</li>
              <li>Who is paired with who (buddy system)?</li>
              <li>What's our backup plan?</li>
              <li>Did we leave the place cleaner than we found it?</li>
            </ul>
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
          <p class="section-subtitle">Want help? Ask Pebbles in the chat! 🐾</p>
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
          <p class="footer-pebbles">🐾 With love from Pebbles the mascot</p>
        </footer>

        {/* PEBBLES CHAT WIDGET */}
        <button id="pebbles-fab" class="pebbles-fab" title="Chat with Pebbles">
          <img src="/static/pebbles.png" alt="Pebbles" />
          <span class="pebbles-fab-badge">Ask me!</span>
        </button>

        <div id="pebbles-chat" class="pebbles-chat" style="display:none">
          <div class="pebbles-chat-header">
            <img src="/static/pebbles.png" alt="Pebbles" />
            <div>
              <h4>Pebbles 🐾</h4>
              <span>Events Mascot • online</span>
            </div>
            <button id="pebbles-close" title="Close">✕</button>
          </div>
          <div id="pebbles-messages" class="pebbles-messages"></div>
          <div class="pebbles-quick" id="pebbles-quick">
            <button data-prompt="I want to plan a kayaking adventure next weekend">🛶 Plan kayaking</button>
            <button data-prompt="Where can we go motocross riding on the Sunshine Coast?">🏍️ MX spots</button>
            <button data-prompt="How much does a wakeboarding day cost?">💰 Wakeboard cost</button>
            <button data-prompt="Help me be a good team leader for our next trip">🎖️ Team leader tips</button>
          </div>
          <form id="pebbles-form" class="pebbles-form">
            <select id="pebbles-user">
              <option>Saia</option>
              <option>Elijah</option>
              <option>Charlotte</option>
              <option>Ace</option>
              <option>Sienna</option>
            </select>
            <input id="pebbles-input" type="text" placeholder="Ask Pebbles anything..." autocomplete="off" />
            <button type="submit">📤</button>
          </form>
        </div>
      </div>
    </div>
  )
})

export default app
