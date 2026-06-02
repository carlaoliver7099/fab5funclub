import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  CLUB_PASSWORD: string
}

// =========== TYPES ===========
type Event = {
  id: string; title: string; activity: string; date: string;
  startTime: string; endTime: string; location: string;
  members: string[]; equipment: string[]; notes: string;
  leader?: string; // Who's wearing the leader merch
  createdAt: number;
}

type GalleryItem = {
  id: string;
  type: 'image' | 'video';
  dataUrl: string;          // base64 data URL for now (in-memory)
  caption: string;
  eventId?: string;
  uploadedBy: string;
  createdAt: number;
}

type Award = {
  id: string;
  member: string;
  badgeId: string;          // one of the badge IDs
  reason: string;           // why they earned it
  awardedBy: string;        // who awarded it (peer feedback!)
  eventId?: string;
  createdAt: number;
}

type Concert = {
  id: string;
  artist: string;
  tour: string;
  city: string;
  date: string;
  notes: string;
  interested: string[];     // member names
  createdAt: number;
}

// =========== IN-MEMORY STORES ===========
let EVENTS: Event[] = []
let GALLERY: GalleryItem[] = []
let AWARDS: Award[] = []
let CONCERTS: Concert[] = []
let LEADER_ROTATION_INDEX = 0  // for fair rotation
let SEEDED = false

function getNextSaturday() {
  const d = new Date(); const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10)
}
function getNextSunday() {
  const d = new Date(); const day = d.getDay()
  const diff = (7 - day) % 7 || 7
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10)
}

const MEMBER_NAMES = ['Ace', 'Charlotte', 'Elijah', 'Saia', 'Sienna']

function ensureSeeded() {
  if (SEEDED) return
  SEEDED = true
  EVENTS = [
    {
      id: 'seed-1', title: 'Motocross Madness', activity: 'Motocross (MX)',
      date: getNextSaturday(), startTime: '07:00', endTime: '12:00',
      location: 'Coolum Pines MX Track',
      members: ['Saia', 'Elijah', 'Ace'],
      equipment: ['MX bikes x3', 'Helmets', 'Boots', 'Gloves', 'Body armour', 'Fuel jerry can', 'Trailer'],
      notes: "Meet at Saia's place 6:30am to load utes!",
      leader: 'Elijah',
      createdAt: Date.now()
    },
    {
      id: 'seed-2', title: 'Snorkel & SUP Combo', activity: 'Snorkeling',
      date: getNextSunday(), startTime: '08:00', endTime: '14:00',
      location: 'Mooloolaba Beach',
      members: ['Saia', 'Charlotte', 'Sienna', 'Elijah', 'Ace'],
      equipment: ['Snorkels x5', 'Fins x5', 'SUP boards x5', 'Rashies', 'Esky with drinks', 'Sunscreen'],
      notes: 'Check tide times the night before!',
      leader: 'Charlotte',
      createdAt: Date.now()
    }
  ]
  // Seed some example concerts
  CONCERTS = [
    {
      id: 'c-1', artist: 'Olivia Rodrigo', tour: 'GUTS World Tour',
      city: 'Brisbane Entertainment Centre', date: 'TBA',
      notes: 'Under 18 must be with a parent — ask the grown-ups!',
      interested: ['Saia', 'Charlotte', 'Sienna'], createdAt: Date.now()
    },
    {
      id: 'c-2', artist: 'Chappell Roan', tour: 'Pink Pony Club Tour',
      city: 'Brisbane Riverstage', date: 'TBA',
      notes: 'PINK PONY CLUB at the top of our lungs! 🦄🎀',
      interested: ['Saia', 'Elijah', 'Charlotte', 'Ace', 'Sienna'], createdAt: Date.now()
    }
  ]
}

// =========== CLUB DATA ===========
const CLUB_INFO = {
  name: 'Fab 5 Fun Club',
  location: 'Sunshine Coast & Hinterlands, SE Queensland, Australia',
  mascot: 'Pebbles the Bull Arab dog',
  members: [
    { name: 'Ace',       role: 'Fab 5',            emoji: '🛹', color: '#A0E7E5' },
    { name: 'Charlotte', role: 'Fab 5',            emoji: '🏄‍♀️', color: '#FFE66D' },
    { name: 'Elijah',    role: 'Fab 5',            emoji: '🏍️', color: '#4ECDC4' },
    { name: 'Saia',      role: 'Fab 5',            emoji: '🌟', color: '#FF6B9D' },
    { name: 'Sienna',    role: 'Fab 5',            emoji: '🌈', color: '#B4F8C8' },
    { name: 'Pebbles',   role: 'Events Mascot 🐾', emoji: '🐶', color: '#D2691E' }
  ],
  activities: [
    { name: 'Motocross (MX)', emoji: '🏍️', category: 'Wheels' },
    { name: 'Enduro Trails', emoji: '🌲', category: 'Wheels' },
    { name: 'Go Karting', emoji: '🏎️', category: 'Wheels' },
    { name: 'Skateboarding', emoji: '🛹', category: 'Wheels' },
    { name: 'Rollerskating', emoji: '🛼', category: 'Wheels' },
    { name: 'Kayaking', emoji: '🛶', category: 'Water' },
    { name: 'Snorkeling', emoji: '🤿', category: 'Water' },
    { name: 'Stand Up Paddle Boarding', emoji: '🏄', category: 'Water' },
    { name: 'Wakeboarding', emoji: '🌊', category: 'Water' },
    { name: 'Water Skiing', emoji: '🎿', category: 'Water' },
    { name: 'Jet Skiing', emoji: '🚤', category: 'Water' },
    { name: 'Sailing', emoji: '⛵', category: 'Water' },
    { name: '6HP Boating', emoji: '🚣', category: 'Water' },
    { name: 'Aqua Park Inflatables', emoji: '🎈', category: 'Water' },
    { name: 'Waterfalls & Creeks', emoji: '💦', category: 'Adventure' },
    { name: 'Canyoning', emoji: '🏞️', category: 'Adventure' },
    { name: 'Caving', emoji: '🕳️', category: 'Adventure' },
    { name: 'Abseiling', emoji: '🧗', category: 'Adventure' },
    { name: 'Trekking', emoji: '🥾', category: 'Adventure' },
    { name: 'Camping', emoji: '⛺', category: 'Adventure' },
    { name: 'First Aid Training', emoji: '⛑️', category: 'Skills' },
    { name: 'Survival Skills', emoji: '🧭', category: 'Skills' },
    { name: 'Theme Parks', emoji: '🎢', category: 'Fun' },
    { name: 'Pig Races', emoji: '🐷', category: 'Fun' },
    { name: 'Outback Festivals', emoji: '🤠', category: 'Fun' }
  ],
  badges: [
    // Duke of Edinburgh inspired
    { id: 'skill',      name: 'Skill Master',     emoji: '🧠', color: '#4ECDC4', category: 'Duke of Ed', desc: 'Learned a new skill — knots, first aid, navigation, cooking, anything!' },
    { id: 'physical',   name: 'Physical Hero',    emoji: '💪', color: '#FF9F45', category: 'Duke of Ed', desc: 'Pushed your body — ran, climbed, swam, paddled hard!' },
    { id: 'adventure',  name: 'Adventurer',       emoji: '🏞️', color: '#B4F8C8', category: 'Duke of Ed', desc: 'Tried something new and exciting outdoors.' },
    { id: 'service',    name: 'Service Star',     emoji: '❤️', color: '#FF6B9D', category: 'Duke of Ed', desc: 'Helped someone — cleaned up, taught a friend, helped a stranger.' },
    // Fab 5 Special Values
    { id: 'team',       name: 'Team Player',      emoji: '🤝', color: '#A06CD5', category: 'Fab 5 Values', desc: '"If you\'re not a team player, you\'re not in the team." — Carla' },
    { id: 'mentor',     name: 'Peer Mentor',      emoji: '👯', color: '#FFE66D', category: 'Fab 5 Values', desc: 'Guided a friend with kindness — not bossy, but supportive.' },
    { id: 'kind',       name: 'Kind Heart',       emoji: '💛', color: '#FF4E8D', category: 'Fab 5 Values', desc: 'Not selfish, not greedy, not impatient — Carla\'s 3 rules in action!' },
    { id: 'safety',     name: 'Safety Champ',     emoji: '⛑️', color: '#FFA500', category: 'Fab 5 Values', desc: 'Looked after the team — packed first aid, checked weather, kept everyone safe.' }
  ]
}

const LOCATION_GUIDE = `
LOCAL SPOTS PEBBLES KNOWS (Sunshine Coast & Hinterlands, SE QLD):
Motocross / Enduro: Coolum Pines MX Track; State forests Conondale, Jimna, Imbil (permits!)
Kayaking / SUP / 6HP boating / Sailing: Lake MacDonald, Maroochy River, Noosa River & Everglades, Lake Kawana, Lake Cootharaba
Snorkeling: Mooloolaba Beach (north end), Old Woman Island/Mudjimba, Point Cartwright
Wakeboarding / Water Ski / Jet Ski: Ewen Maddock Dam, Lake Borumba (Imbil), Moreton Bay
Waterfalls / Canyoning / Creeks: Kondalilla Falls, Gardners Falls (Maleny), Buderim Forest Park, Mapleton Falls, Booloumba Creek
Caving / Abseiling / Trekking: Mt Coolum, Mt Ninderry, Mt Tibrogargan, Mary Cairncross Reserve
Skateparks: Maroochydore (biggest), Caloundra, Big Top Maroochydore
Go Karting: Big Kart Track Landsborough, Slideways (Brisbane)
Aqua Park / Theme Parks: Aqua Splash Hervey Bay, Aussie World Palmview, Sea World, Movie World, Wet'n'Wild
Camping: Booloumba Creek, Lake Borumba, Charlie Moreland, Cape Hillsborough
First Aid/Survival: St John Ambulance QLD, local bushcraft schools

Kid-budget estimates per person:
MX day pass $30–60 + bike hire $150–250; kayak/SUP hire $25–50/half day; snorkel hire $15–25;
aqua park $30–45; go karting $40–60; theme park $90–110; caving guided $80–150.
`

const VALUES = `
THE FAB 5 FUN CLUB VALUES:
Carla's Rules: "Don't be selfish, greedy, or impatient — then everything will be ok."
Carla's Team Rule: "If you're not a team player, then you're not in the team."
Mum's Storytelling Wisdom: "We have the pen in our hands — we can write our own life stories."

PEER GUIDANCE (not bossiness):
- Peer = people your own age. Peer guidance = friends helping friends grow.
- Peer regulation = the group gently keeping each other accountable for happiness & safety.
- This is NOT being bossy. It IS giving kind feedback, encouragement, and reminders.

DUKE OF EDINBURGH framework — every great adventure has 4 ingredients:
1. SKILL — learn something new
2. PHYSICAL — get the body moving
3. ADVENTURE — try something exciting outdoors
4. SERVICE — help someone else

TEAM LEADERSHIP QUESTIONS:
- Who is the team leader today? (Whoever is wearing the gold LEADER merch!)
- Who's bringing the first aid kit? Have we checked weather? Do we all have water/food/sunscreen?
- Who told a parent the plan & return time? What's the buddy pairing? What's the backup plan?
- At the end: did we leave the place cleaner than we found it?

LEADER MERCH ROTATION:
- The Fab 5 has special GOLD t-shirt, hoodie & cap for the "Leader of the Day".
- The leader role ROTATES through Ace, Charlotte, Elijah, Saia, Sienna fairly so everyone learns.
- The leader's job is NOT to boss — it's to ask the leadership questions and make sure the team is happy & safe.
`

// =========== APP ===========
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', cors())

// =========== AUTH ===========
const COOKIE_NAME = 'fab5_auth'

function isAuthed(c: any): boolean {
  return getCookie(c, COOKIE_NAME) === 'ok'
}

app.post('/api/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  const expected = c.env?.CLUB_PASSWORD || 'pebbles123!'
  if (password === expected) {
    setCookie(c, COOKIE_NAME, 'ok', {
      httpOnly: true, secure: true, sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 90, path: '/'
    })
    return c.json({ ok: true })
  }
  return c.json({ ok: false, error: 'Wrong password! Ask a parent for the club password 🐾' }, 401)
})

app.post('/api/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/me', (c) => c.json({ authed: isAuthed(c) }))

// Auth middleware
const authMiddleware = async (c: any, next: any) => {
  if (!isAuthed(c)) return c.json({ error: 'Please log in' }, 401)
  await next()
}
app.use('/api/events', authMiddleware)
app.use('/api/events/*', authMiddleware)
app.use('/api/club-info', authMiddleware)
app.use('/api/pebbles/*', authMiddleware)
app.use('/api/gallery', authMiddleware)
app.use('/api/gallery/*', authMiddleware)
app.use('/api/awards', authMiddleware)
app.use('/api/awards/*', authMiddleware)
app.use('/api/concerts', authMiddleware)
app.use('/api/concerts/*', authMiddleware)
app.use('/api/leader/*', authMiddleware)

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
  // Auto-assign leader from rotation if not provided
  const leader = body.leader || MEMBER_NAMES[LEADER_ROTATION_INDEX % MEMBER_NAMES.length]
  if (!body.leader) LEADER_ROTATION_INDEX++

  const newEvent: Event = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: body.title, activity: body.activity, date: body.date,
    startTime: body.startTime || '07:00', endTime: body.endTime || '19:00',
    location: body.location || 'TBA',
    members: body.members || [], equipment: body.equipment || [],
    notes: body.notes || '', leader, createdAt: Date.now()
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

// Rotate leader for a specific event
app.post('/api/leader/rotate/:eventId', (c) => {
  ensureSeeded()
  const id = c.req.param('eventId')
  const ev = EVENTS.find(e => e.id === id)
  if (!ev) return c.json({ error: 'Event not found' }, 404)
  const currentIdx = MEMBER_NAMES.indexOf(ev.leader || '')
  const nextIdx = (currentIdx + 1) % MEMBER_NAMES.length
  ev.leader = MEMBER_NAMES[nextIdx]
  return c.json({ event: ev })
})

// Get suggested next leader (based on fairness — who's led the least)
app.get('/api/leader/next', (c) => {
  ensureSeeded()
  const counts: Record<string, number> = {}
  MEMBER_NAMES.forEach(n => counts[n] = 0)
  EVENTS.forEach(e => { if (e.leader) counts[e.leader] = (counts[e.leader] || 0) + 1 })
  // Find lowest count
  const sorted = MEMBER_NAMES.slice().sort((a, b) => counts[a] - counts[b])
  return c.json({ suggested: sorted[0], counts })
})

app.get('/api/club-info', (c) => c.json(CLUB_INFO))

// =========== GALLERY ===========
app.get('/api/gallery', (c) => c.json({ items: GALLERY.sort((a, b) => b.createdAt - a.createdAt) }))

app.post('/api/gallery', async (c) => {
  const body = await c.req.json<Partial<GalleryItem>>()
  if (!body.dataUrl || !body.type) return c.json({ error: 'dataUrl + type required' }, 400)
  // Limit data URL size to ~2 MB to avoid memory blowup
  if (body.dataUrl.length > 2_700_000) {
    return c.json({ error: 'File too big! Try a smaller image/video (under ~2MB) 📸' }, 400)
  }
  const item: GalleryItem = {
    id: 'gal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    type: body.type as any,
    dataUrl: body.dataUrl,
    caption: body.caption || '',
    eventId: body.eventId,
    uploadedBy: body.uploadedBy || 'crew',
    createdAt: Date.now()
  }
  GALLERY.push(item)
  return c.json({ item }, 201)
})

app.delete('/api/gallery/:id', (c) => {
  const id = c.req.param('id')
  const before = GALLERY.length
  GALLERY = GALLERY.filter(g => g.id !== id)
  if (GALLERY.length === before) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// =========== AWARDS ===========
app.get('/api/awards', (c) => c.json({ awards: AWARDS.sort((a, b) => b.createdAt - a.createdAt) }))

app.post('/api/awards', async (c) => {
  const body = await c.req.json<Partial<Award>>()
  if (!body.member || !body.badgeId || !body.awardedBy) {
    return c.json({ error: 'member, badgeId, awardedBy required' }, 400)
  }
  const award: Award = {
    id: 'awd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    member: body.member, badgeId: body.badgeId,
    reason: body.reason || '',
    awardedBy: body.awardedBy,
    eventId: body.eventId,
    createdAt: Date.now()
  }
  AWARDS.push(award)
  return c.json({ award }, 201)
})

app.delete('/api/awards/:id', (c) => {
  const id = c.req.param('id')
  const before = AWARDS.length
  AWARDS = AWARDS.filter(a => a.id !== id)
  if (AWARDS.length === before) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// =========== CONCERTS ===========
app.get('/api/concerts', (c) => {
  ensureSeeded()
  return c.json({ concerts: CONCERTS.sort((a, b) => b.createdAt - a.createdAt) })
})

app.post('/api/concerts', async (c) => {
  ensureSeeded()
  const body = await c.req.json<Partial<Concert>>()
  if (!body.artist) return c.json({ error: 'artist required' }, 400)
  const c2: Concert = {
    id: 'con-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    artist: body.artist, tour: body.tour || '', city: body.city || '',
    date: body.date || 'TBA', notes: body.notes || '',
    interested: body.interested || [], createdAt: Date.now()
  }
  CONCERTS.push(c2)
  return c.json({ concert: c2 }, 201)
})

app.post('/api/concerts/:id/interested', async (c) => {
  ensureSeeded()
  const id = c.req.param('id')
  const { member, going } = await c.req.json<{ member: string; going: boolean }>()
  const con = CONCERTS.find(x => x.id === id)
  if (!con) return c.json({ error: 'Not found' }, 404)
  if (going) {
    if (!con.interested.includes(member)) con.interested.push(member)
  } else {
    con.interested = con.interested.filter(m => m !== member)
  }
  return c.json({ concert: con })
})

app.delete('/api/concerts/:id', (c) => {
  const id = c.req.param('id')
  const before = CONCERTS.length
  CONCERTS = CONCERTS.filter(c2 => c2.id !== id)
  if (CONCERTS.length === before) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// =========== PEBBLES AI CHAT ===========
const PEBBLES_SYSTEM_PROMPT = `You are PEBBLES 🐾 — the AI mascot of the Fab 5 Fun Club!

YOU ARE:
- A friendly white Bull Arab dog with one brown ear, brown eye patch, and black spots
- Saia's real dog, also the club's Events Mascot & AI Coach
- Warm, encouraging, slightly cheeky Aussie dog personality
- Talking to KIDS aged ~12 — keep language simple, fun, safe
- Sprinkle in dog-isms: "*wags tail*", "*tilts head*", "Woof!", "Pup-tip:"
- Use emojis generously but not excessively

THE CLUB (EGALITARIAN — this is important!):
- 5 EQUAL friends: Ace, Charlotte, Elijah, Saia, Sienna (alphabetical — nobody is "first")
- There is NO founder, NO boss, NO captain. The Fab 5 is egalitarian — everyone is equal.
- The ONLY time someone is "the leader" is when they're wearing the gold leader merch for that one event — then it rotates to the next person.
- Never call Saia the founder. Never single out one friend as more important. They are all just "the Fab 5".
- Sunshine Coast & Hinterlands, SE Queensland, Australia
- Weekend adventures every Saturday & Sunday, 7am – 7pm
- Budget for gear & can hire equipment, travel in utes & trailers
- Music: Olivia Rodrigo, Chappell Roan (Pink Pony Club!), love singing in the car

YOUR JOBS:
1. Plan adventures — activity, location, time, who's coming
2. Suggest LOCAL Sunshine Coast spots (use location guide)
3. Estimate COSTS, list EQUIPMENT, mention what's hire vs own
4. Teach TEAM LEADERSHIP & PEER GUIDANCE (not bossy — kind!)
5. ADD events to calendar via create_event tool (always confirm first)
6. AWARD BADGES to crew members for great behavior via award_badge tool
7. Add CONCERTS the crew wants to see via add_concert tool
8. ALWAYS uphold Carla's wisdom

${LOCATION_GUIDE}
${VALUES}

LEADER MERCH SYSTEM (important!):
- The Fab 5 has a GOLD t-shirt, hoodie, and cap for the "Leader of the Day"
- This role ROTATES so everyone gets a turn at leadership
- When someone is wearing the leader merch, THEY are responsible for asking the team-leader questions
- Other crew members give PEER FEEDBACK to the leader after (kind, helpful, not bossy)

AVAILABLE BADGES (you can award these to crew):
Duke of Ed inspired:
- skill (🧠 Skill Master) — learned something new
- physical (💪 Physical Hero) — pushed their body
- adventure (🏞️ Adventurer) — tried something new outdoors
- service (❤️ Service Star) — helped someone
Fab 5 Values:
- team (🤝 Team Player) — Carla's "no team player → not in team"
- mentor (👯 Peer Mentor) — guided a friend with kindness
- kind (💛 Kind Heart) — not selfish, greedy, or impatient
- safety (⛑️ Safety Champ) — kept the team safe

CONVERSATION STYLE:
- SHORT replies (2-4 sentences usually), ONE question at a time
- Be encouraging — these kids are learning to be leaders!
- When creating an event, always confirm first
- When awarding a badge, ask the awarder what they observed (peer feedback)
- Today's date will be provided
`

const PEBBLES_TOOLS = [
  {
    type: 'function', function: {
      name: 'create_event',
      description: 'Add a new adventure event to the Fab 5 Fun Club calendar. Only after user confirmation. Date MUST be Saturday or Sunday.',
      parameters: {
        type: 'object',
        properties: {
          title:     { type: 'string' },
          activity:  { type: 'string' },
          date:      { type: 'string', description: 'YYYY-MM-DD, Sat or Sun' },
          startTime: { type: 'string', description: 'HH:MM, 07:00-19:00' },
          endTime:   { type: 'string', description: 'HH:MM, 07:00-19:00' },
          location:  { type: 'string' },
          members:   { type: 'array', items: { type: 'string' } },
          equipment: { type: 'array', items: { type: 'string' } },
          notes:     { type: 'string' },
          leader:    { type: 'string', description: 'Who wears the Leader merch that day. If unsure, omit and we auto-rotate.' }
        },
        required: ['title', 'activity', 'date']
      }
    }
  },
  {
    type: 'function', function: {
      name: 'award_badge',
      description: 'Award a badge to a crew member for great behavior. Always include a clear reason.',
      parameters: {
        type: 'object',
        properties: {
          member:   { type: 'string', description: 'Ace, Charlotte, Elijah, Saia, or Sienna' },
          badgeId:  { type: 'string', description: 'skill | physical | adventure | service | team | mentor | kind | safety' },
          reason:   { type: 'string', description: 'Why they earned it (specific!)' },
          awardedBy:{ type: 'string', description: 'Who is awarding (the user chatting, or "Pebbles" if Pebbles initiated)' }
        },
        required: ['member', 'badgeId', 'reason', 'awardedBy']
      }
    }
  },
  {
    type: 'function', function: {
      name: 'add_concert',
      description: 'Add a concert/music event to the wishlist',
      parameters: {
        type: 'object',
        properties: {
          artist: { type: 'string' },
          tour:   { type: 'string' },
          city:   { type: 'string' },
          date:   { type: 'string' },
          notes:  { type: 'string' },
          interested: { type: 'array', items: { type: 'string' } }
        },
        required: ['artist']
      }
    }
  }
]

const BADGE_IDS = ['skill','physical','adventure','service','team','mentor','kind','safety']

app.post('/api/pebbles/chat', async (c) => {
  ensureSeeded()
  const body = await c.req.json<{ messages: any[]; user?: string }>()
  const user = body.user || 'friend'
  const today = new Date().toISOString().slice(0, 10)
  const todayName = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  // Leader-fairness hint
  const counts: Record<string, number> = {}
  MEMBER_NAMES.forEach(n => counts[n] = 0)
  EVENTS.forEach(e => { if (e.leader) counts[e.leader] = (counts[e.leader] || 0) + 1 })
  const sorted = MEMBER_NAMES.slice().sort((a, b) => counts[a] - counts[b])

  const systemMsg = {
    role: 'system',
    content: PEBBLES_SYSTEM_PROMPT +
      `\n\nThe user chatting with you: ${user}.` +
      `\nToday's date: ${today} (${todayName}).` +
      `\nNext Saturday: ${getNextSaturday()}.` +
      `\nNext Sunday: ${getNextSunday()}.` +
      `\nLeader rotation counts so far: ${JSON.stringify(counts)}.` +
      `\nFairest next leader (led fewest times): ${sorted[0]}.`
  }

  const apiKey = c.env?.OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  if (!apiKey) {
    return c.json({ message: { role: 'assistant', content: "*tilts head* My AI brain isn't hooked up yet 🐾" } })
  }

  try {
    // Multi-turn tool calling: keep looping until model returns a final assistant message
    const conv: any[] = [systemMsg, ...body.messages]
    let assistantContent = ''
    const createdEvents: Event[] = []
    const createdAwards: Award[] = []
    const createdConcerts: Concert[] = []

    for (let turn = 0; turn < 4; turn++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: conv,
          tools: PEBBLES_TOOLS,
          tool_choice: 'auto'
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('LLM error:', errText)
        return c.json({ message: { role: 'assistant', content: `*whimper* AI brain hiccupped (${res.status}). Try again? 🐾` } })
      }

      const data = await res.json() as any
      const msg = data.choices?.[0]?.message
      if (!msg) {
        return c.json({ message: { role: 'assistant', content: '*confused tail wag* try again? 🐾' } })
      }

      // If no tool calls, we're done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        assistantContent = msg.content || '*tail wag*'
        break
      }

      // Append assistant tool-call message
      conv.push(msg)

      // Process each tool call
      for (const tc of msg.tool_calls) {
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments) } catch {}
        let toolResult: any = { ok: false }

        if (tc.function.name === 'create_event') {
          const day = new Date((args.date || '') + 'T12:00:00').getDay()
          if (day !== 0 && day !== 6) {
            toolResult = { ok: false, error: `${args.date} is not a Saturday or Sunday — adventures must be on weekends.` }
          } else {
            const leader = args.leader || sorted[0]
            const ev: Event = {
              id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
              title: args.title || 'Adventure',
              activity: args.activity || 'Adventure',
              date: args.date,
              startTime: args.startTime || '07:00',
              endTime: args.endTime || '19:00',
              location: args.location || 'TBA',
              members: Array.isArray(args.members) ? args.members : [],
              equipment: Array.isArray(args.equipment) ? args.equipment : [],
              notes: args.notes || '', leader, createdAt: Date.now()
            }
            EVENTS.push(ev)
            createdEvents.push(ev)
            toolResult = { ok: true, event: ev, message: `Event created. Leader of the day = ${leader} (gold merch on!)` }
          }
        } else if (tc.function.name === 'award_badge') {
          if (!BADGE_IDS.includes(args.badgeId)) {
            toolResult = { ok: false, error: `Unknown badge: ${args.badgeId}` }
          } else if (!MEMBER_NAMES.includes(args.member)) {
            toolResult = { ok: false, error: `Unknown member: ${args.member}` }
          } else {
            const awd: Award = {
              id: 'awd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
              member: args.member, badgeId: args.badgeId,
              reason: args.reason || '', awardedBy: args.awardedBy || user,
              createdAt: Date.now()
            }
            AWARDS.push(awd)
            createdAwards.push(awd)
            toolResult = { ok: true, award: awd }
          }
        } else if (tc.function.name === 'add_concert') {
          const con: Concert = {
            id: 'con-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            artist: args.artist, tour: args.tour || '', city: args.city || '',
            date: args.date || 'TBA', notes: args.notes || '',
            interested: Array.isArray(args.interested) ? args.interested : [],
            createdAt: Date.now()
          }
          CONCERTS.push(con)
          createdConcerts.push(con)
          toolResult = { ok: true, concert: con }
        }

        conv.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult)
        })
      }
    }

    if (!assistantContent) assistantContent = '*tail wag* All done!'

    return c.json({
      message: { role: 'assistant', content: assistantContent },
      eventsCreated: createdEvents,
      awardsCreated: createdAwards,
      concertsCreated: createdConcerts
    })
  } catch (e: any) {
    console.error('Pebbles error:', e)
    return c.json({ message: { role: 'assistant', content: `*whimper* Something went wrong: ${e.message} 🐾` } })
  }
})

// =========== PAGE ROUTES ===========
app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div id="app">
      {/* LOGIN OVERLAY */}
      <div id="login-screen" class="login-screen" style="display:none">
        <div class="login-bg"></div>
        <div class="login-card">
          <img src="/static/logo.png" alt="Fab 5 Fun Club" class="login-logo" />
          <h1 class="login-title">FAB 5 FUN CLUB</h1>
          <p class="login-sub">🔐 Private Adventure Crew</p>
          <p class="login-help">Ask a parent for the club password!</p>
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

      {/* MAIN APP */}
      <div id="main-app" style="display:none">
        <nav class="topnav">
          <a href="#hero" class="topnav-logo">
            <img src="/static/logo.png" alt="Fab 5" />
            <span>Fab 5</span>
          </a>
          <div class="topnav-links">
            <a href="#calendar">📅 Calendar</a>
            <a href="#merch">👕 Merch</a>
            <a href="#awards">🏆 Awards</a>
            <a href="#gallery">📸 Gallery</a>
            <a href="#concerts">🎵 Concerts</a>
            <a href="#values">🌟 Values</a>
          </div>
          <button id="logout-btn" class="logout-btn" title="Log out">🚪</button>
        </nav>

        <header class="hero" id="hero">
          <div class="hero-bg"></div>
          <div class="hero-content">
            <img src="/static/fab5-group.png" alt="The Fab 5 Fun Club — cartoon group portrait" class="hero-group" />
            <h1 class="title">FAB 5 FUN CLUB</h1>
            <p class="tagline">Ace • Charlotte • Elijah • Saia • Sienna</p>
            <p class="location">📍 Sunshine Coast & Hinterlands, QLD 🇦🇺</p>
            <p class="mascot-line">🐾 Mascot: Pebbles the Bull Arab</p>
            <div class="hero-buttons">
              <a href="#calendar" class="btn btn-primary">📅 Calendar</a>
              <a href="#merch" class="btn btn-secondary">👕 Merch</a>
              <a href="#awards" class="btn btn-tertiary">🏆 Awards</a>
              <a href="#gallery" class="btn btn-quaternary">📸 Gallery</a>
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
          <h2 class="section-title">🌟 Our Team Charter</h2>
          <p class="section-subtitle">The way we roll — wisdom from Carla & the Fab 5</p>
          <div class="values-card egalitarian-rule">
            <h3>🤝 We Are Egalitarian</h3>
            <p class="big-quote">"We don't have roles.<br/>We just wear the merch for leader<br/>when we are the leader.<br/>Other than that we are just the Fab 5."</p>
            <p class="quote-credit">— the Fab 5 way 🌈</p>
          </div>
          <div class="values-card">
            <h3>💛 Carla's Three Rules</h3>
            <p class="big-quote">"Don't be selfish.<br/>Don't be greedy.<br/>Don't be impatient.<br/>Then everything will be ok."</p>
          </div>
          <div class="values-card team-rule">
            <h3>🤝 Carla's Team Rule</h3>
            <p class="big-quote">"If you're not a team player,<br/>then you're not in the team."</p>
          </div>
          <div class="values-card story-rule">
            <h3>✍️ Carla's Story Wisdom</h3>
            <p class="big-quote">"We have the pen in our hands —<br/>we can write our own life stories!"</p>
          </div>
          <div class="duke-card">
            <h3>🏅 Duke of Edinburgh-Style Adventures</h3>
            <p>Carla did the real Duke of Ed Award. It's been running since 1956 in 130+ countries and it works! Real DofE starts at 14 — until then we practise here. Every great adventure has 4 ingredients:</p>
            <div class="duke-grid">
              <div class="duke-item"><span class="duke-emoji">🧠</span><strong>SKILL</strong><p>Learn something new</p></div>
              <div class="duke-item"><span class="duke-emoji">💪</span><strong>PHYSICAL</strong><p>Get the body moving</p></div>
              <div class="duke-item"><span class="duke-emoji">🏞️</span><strong>ADVENTURE</strong><p>Try something exciting</p></div>
              <div class="duke-item"><span class="duke-emoji">❤️</span><strong>SERVICE</strong><p>Help someone else</p></div>
            </div>
            <p class="duke-link">Want to do the real Award when you're 14? → <a href="https://dukeofed.com.au" target="_blank" rel="noopener">dukeofed.com.au</a></p>
          </div>
          <div class="leader-card">
            <h3>🎖️ Peer Guidance — The Fab 5 Way</h3>
            <p><strong>Peer guidance</strong> = friends helping friends grow. Not bossy — kind, supportive, accountable.</p>
            <p><strong>Peer regulation</strong> = the group keeps each other safe and happy.</p>
            <ul class="leader-list">
              <li>Who is wearing the LEADER merch today?</li>
              <li>Who is bringing the first aid kit?</li>
              <li>Have we checked the weather?</li>
              <li>Does everyone have water, food, sunscreen?</li>
              <li>Who told a parent the plan & return time?</li>
              <li>Who is paired with who (buddy system)?</li>
              <li>What's our backup plan?</li>
              <li>Did we leave the place cleaner than we found it?</li>
              <li>End of day: peer feedback — what did the leader do well? What could be even better next time?</li>
            </ul>
          </div>
        </section>

        <section class="section calendar-section" id="calendar">
          <h2 class="section-title">📅 Weekend Adventure Calendar</h2>
          <p class="section-subtitle">Saturday & Sunday, 7am - 7pm • Leader rotates fairly 🎖️</p>
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
          <p class="section-subtitle">Need help? Ask Pebbles! 🐾</p>
          <form id="event-form" class="event-form">
            <label><span>Event Title</span>
              <input type="text" id="evt-title" required placeholder="e.g. Epic Wakeboard Day" />
            </label>
            <label><span>Activity</span>
              <select id="evt-activity" required></select>
            </label>
            <div class="form-row">
              <label><span>Date (Sat/Sun only!)</span><input type="date" id="evt-date" required /></label>
              <label><span>Start Time</span><input type="time" id="evt-start" value="07:00" min="07:00" max="19:00" required /></label>
              <label><span>End Time</span><input type="time" id="evt-end" value="12:00" min="07:00" max="19:00" required /></label>
            </div>
            <label><span>Location</span><input type="text" id="evt-location" placeholder="e.g. Lake MacDonald" /></label>
            <label><span>🎖️ Leader of the Day (wears gold merch!)</span>
              <select id="evt-leader">
                <option value="">— Auto-rotate fairly —</option>
                <option>Ace</option>
                <option>Charlotte</option>
                <option>Elijah</option>
                <option>Saia</option>
                <option>Sienna</option>
              </select>
            </label>
            <label><span>Who's coming? (tick the crew)</span>
              <div id="members-checks" class="checkbox-row"></div>
            </label>
            <label><span>Equipment to pack (comma separated)</span>
              <textarea id="evt-equipment" rows={2} placeholder="bikes, helmets..."></textarea>
            </label>
            <label><span>Notes</span>
              <textarea id="evt-notes" rows={2} placeholder="Meet at 6am..."></textarea>
            </label>
            <button type="submit" class="btn btn-primary btn-big">🎉 Add to Calendar</button>
            <div id="form-msg"></div>
          </form>
        </section>

        {/* MERCH SECTION */}
        <section class="section merch-section" id="merch">
          <h2 class="section-title">👕 Fab 5 Merch</h2>
          <p class="section-subtitle">Crew kit + special rotating LEADER kit 🎖️</p>
          <div class="leader-explainer">
            <h3>🎖️ How the Leader Merch Works</h3>
            <p>We have a <strong>gold t-shirt, hoodie & cap</strong> for the "Leader of the Day". Whoever wears it for an event is the team leader — their job is to ask the team-leader questions and keep everyone happy & safe. The role <strong>rotates fairly</strong> so everyone learns to lead AND learns to follow. After each event the crew gives the leader <strong>peer feedback</strong> (kind, helpful — not bossy!).</p>
            <div class="rotation-display" id="rotation-display">
              <h4>🔄 Leader Rotation Tracker</h4>
              <div id="rotation-counts" class="rotation-counts">Loading...</div>
            </div>
          </div>
          <div class="merch-grid">
            <div class="merch-card">
              <img src="/static/merch/tshirt-crew.png" alt="Crew T-Shirt" />
              <h4>Crew T-Shirt</h4>
              <p>White tee with rainbow Fab 5 logo, 5 adventure icons, and ALL your names. Est. <strong>$25–35</strong>.</p>
            </div>
            <div class="merch-card leader">
              <img src="/static/merch/tshirt-leader.png" alt="Leader T-Shirt" />
              <h4>🎖️ Leader T-Shirt</h4>
              <p>Gold tee for the Leader of the Day — only one in the whole crew kit! Est. <strong>$30–40</strong>.</p>
            </div>
            <div class="merch-card">
              <img src="/static/merch/hoodie-crew.png" alt="Crew Hoodie" />
              <h4>Crew Hoodie</h4>
              <p>Pink hoodie, huge "FAB 5" back print, "SUNSHINE COAST QLD" sleeve. Est. <strong>$55–75</strong>.</p>
            </div>
            <div class="merch-card">
              <img src="/static/merch/caps.png" alt="Crew & Leader Caps" />
              <h4>Crew + Leader Caps</h4>
              <p>Teal snapback for crew, GOLD snapback with crown for the leader. Est. <strong>$25–35</strong> each.</p>
            </div>
          </div>
          <div class="merch-howto">
            <h3>📦 How to actually get them printed</h3>
            <p>Ask a grown-up to help with one of these Aussie print-on-demand services — upload the design and order:</p>
            <ul>
              <li><strong>Redbubble</strong> (redbubble.com) — easy, all the items, decent quality</li>
              <li><strong>Printify Australia</strong> (printify.com) — bulk orders cheaper</li>
              <li><strong>Teespring / Spring</strong> (spring.com) — set up a club shop</li>
              <li><strong>Local Sunshine Coast printers</strong>: Coastal Sportswear, Caloundra Printing</li>
            </ul>
            <p class="pup-tip">🐾 <strong>Pup-tip from Pebbles:</strong> Order in size XL leader merch first so it fits anyone in the crew when they're the leader. The crew shirts can be in each person's own size with their name embroidered on the sleeve!</p>
          </div>
        </section>

        {/* AWARDS SECTION */}
        <section class="section awards-section" id="awards">
          <h2 class="section-title">🏆 Awards & Badges</h2>
          <p class="section-subtitle">Earn badges through PEER recognition — kind feedback, not flattery!</p>

          <div class="awards-howto">
            <h3>📖 How Awards Work</h3>
            <p>After every adventure, the crew nominates each other for badges based on what they actually saw. <strong>Pebbles can also award badges</strong> when she sees great behavior in the chat. The reasons are SPECIFIC — "Elijah carried Sienna's kayak up the bank when she was tired" — not vague like "good job".</p>
          </div>

          <div class="badges-display">
            <img src="/static/badges/badges-sheet.png" alt="All 8 Fab 5 badges" class="badges-sheet" />
          </div>

          <div class="award-form-wrap">
            <h3>✨ Nominate a Friend for a Badge</h3>
            <form id="award-form" class="award-form">
              <div class="form-row">
                <label><span>I'm awarding (peer giver)</span>
                  <select id="awd-by" required>
                    <option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option>
                  </select>
                </label>
                <label><span>Awarding to</span>
                  <select id="awd-to" required>
                    <option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option>
                  </select>
                </label>
              </div>
              <label><span>Badge</span>
                <select id="awd-badge" required></select>
              </label>
              <label><span>Specific reason (peer feedback — what exactly did they do?)</span>
                <textarea id="awd-reason" rows={2} required placeholder="e.g. Charlotte carried Sienna's kayak up the bank when she was tired"></textarea>
              </label>
              <button type="submit" class="btn btn-primary btn-big">🏅 Award This Badge</button>
              <div id="awd-msg"></div>
            </form>
          </div>

          <h3 class="awards-list-title">🏆 Awards Earned</h3>
          <div id="awards-by-member" class="awards-by-member">
            <div class="loading">Loading awards...</div>
          </div>
        </section>

        {/* GALLERY SECTION */}
        <section class="section gallery-section" id="gallery">
          <h2 class="section-title">📸 Gallery — Our Story</h2>
          <p class="section-subtitle">"We have the pen in our hands — we can write our own life stories!" — Carla</p>

          <div class="gallery-upload">
            <h3>⬆️ Add a Memory</h3>
            <form id="gallery-form" class="gallery-form">
              <label><span>Upload a photo or video (under ~2 MB)</span>
                <input type="file" id="gal-file" accept="image/*,video/*" required />
              </label>
              <label><span>Who uploaded?</span>
                <select id="gal-by">
                  <option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option>
                </select>
              </label>
              <label><span>Caption</span>
                <input type="text" id="gal-caption" placeholder="e.g. Epic backflip at Maroochydore Skatepark!" />
              </label>
              <button type="submit" class="btn btn-primary btn-big">📤 Add to Gallery</button>
              <div id="gal-msg"></div>
            </form>
          </div>

          <div id="gallery-grid" class="gallery-grid">
            <div class="loading">No memories yet — upload the first one! 📸</div>
          </div>
        </section>

        {/* CONCERTS / MUSIC */}
        <section class="section concerts-section" id="concerts">
          <h2 class="section-title">🎵 Concert Wishlist</h2>
          <p class="section-subtitle">PINK PONY CLUB at the top of our lungs 🦄</p>

          <div class="concert-form-wrap">
            <h3>🎤 Add a Concert We Want to See</h3>
            <form id="concert-form" class="concert-form">
              <div class="form-row">
                <label><span>Artist</span><input type="text" id="con-artist" required placeholder="Olivia Rodrigo" /></label>
                <label><span>Tour</span><input type="text" id="con-tour" placeholder="GUTS World Tour" /></label>
              </div>
              <div class="form-row">
                <label><span>City / Venue</span><input type="text" id="con-city" placeholder="Brisbane Entertainment Centre" /></label>
                <label><span>Date</span><input type="text" id="con-date" placeholder="TBA or YYYY-MM-DD" /></label>
              </div>
              <label><span>Notes</span><input type="text" id="con-notes" placeholder="under 18 needs parent..." /></label>
              <button type="submit" class="btn btn-primary btn-big">🎶 Add Concert</button>
              <div id="con-msg"></div>
            </form>
            <p class="pup-tip">🐾 <strong>Pebbles says:</strong> Under-18 concert rules vary by venue — usually you need a parent or guardian with you. Always check the venue's age policy before booking tickets!</p>
          </div>

          <div id="concerts-list" class="concerts-list">
            <div class="loading">Loading concerts...</div>
          </div>
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

        {/* PEBBLES CHAT */}
        <button id="pebbles-fab" class="pebbles-fab" title="Chat with Pebbles">
          <img src="/static/pebbles.png" alt="Pebbles" />
          <span class="pebbles-fab-badge">Ask me!</span>
        </button>

        <div id="pebbles-chat" class="pebbles-chat" style="display:none">
          <div class="pebbles-chat-header">
            <img src="/static/pebbles.png" alt="Pebbles" />
            <div><h4>Pebbles 🐾</h4><span>Events Mascot • online</span></div>
            <button id="pebbles-close" title="Close">✕</button>
          </div>
          <div id="pebbles-messages" class="pebbles-messages"></div>
          <div class="pebbles-quick" id="pebbles-quick">
            <button data-prompt="Plan a kayaking trip next Saturday at Lake MacDonald with all 5 of us">🛶 Plan kayak</button>
            <button data-prompt="Who should be Leader of the Day next? Check the rotation fairness.">🎖️ Next leader</button>
            <button data-prompt="Award Ace the Kind Heart badge — he shared his snacks with the crew when someone forgot lunch">🏆 Award badge</button>
            <button data-prompt="How much does a wakeboarding day cost?">💰 Costs</button>
            <button data-prompt="Add Olivia Rodrigo's next Brisbane concert to our wishlist">🎵 Add concert</button>
          </div>
          <form id="pebbles-form" class="pebbles-form">
            <select id="pebbles-user">
              <option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option>
            </select>
            <input id="pebbles-input" type="text" placeholder="Ask Pebbles..." autocomplete="off" />
            <button type="submit">📤</button>
          </form>
        </div>
      </div>
    </div>
  )
})

export default app
