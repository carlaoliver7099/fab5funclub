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
  leader?: string;              // Who's wearing the leader merch
  flyer?: string;               // base64 data URL — optional event flyer/screenshot
  flyerCaption?: string;        // optional caption for the flyer (e.g. "official flyer")
  costPerPerson?: number;       // estimated cost per kid (we still show it, then say "The club's got us!")
  costNotes?: string;           // e.g. "$15 entry + $5 lunch"
  transportPlan?: string;       // e.g. "Carla's ute, pickup 6:30am from Saia's"
  parentPermissionNote?: string;// e.g. "Parents to sign waiver at the venue"
  weatherWarning?: string;      // e.g. "Cancel if storm warning issued"
  extraDayPack?: string[];      // event-specific items ON TOP of the standard day pack
  parentsJoining?: 'yes' | 'no' | 'maybe' | 'required';  // are parents coming too?
  parentsJoiningNote?: string;  // optional context e.g. "Carla + 1 other parent"
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
// 🎒 PARENT-PACKED ESSENTIALS — parents pack these for their kid for every adventure
// (The club covers event costs. Parents look after their own kid's food, drink, and clothes.)
const STANDARD_DAY_PACK = [
  { item: 'Water bottle (1L+ filled before pickup)', emoji: '💧', who: 'parent' },
  { item: 'Sunscreen (50+ SPF)', emoji: '🧴', who: 'parent' },
  { item: 'Hat', emoji: '🧢', who: 'parent' },
  { item: 'Snacks for the day', emoji: '🍎', who: 'parent' },
  { item: 'Packed lunch', emoji: '🥪', who: 'parent' },
  { item: 'Towel', emoji: '🩴', who: 'parent' },
  { item: 'Spare change of clothes', emoji: '👕', who: 'parent' },
  { item: 'Phone (charged) + power bank', emoji: '📱', who: 'parent' },
  { item: 'Personal first aid + any medication', emoji: '⛑️', who: 'parent' },
  { item: 'Insect repellent', emoji: '🦟', who: 'parent' },
]

// 💛 Our Free Club Promise — the Fab 5 Fun Club is FREE for every friend (the club covers all event costs)
const CARLA_COVERS_IT = true
const CARLA_PROMISE = "The club's got us! 💛 Every adventure is free for the Fab 5 — no kid pays a cent."

// 🌟 FAB 5 WAYS — family slogans + bonus values Saia & I picked together
// (Family-classics are starred ⭐ — the rest are bonus picks)
const FAB5_SLOGANS = [
  // ⭐ Family classics (passed down from Saia's family — now belong to the whole crew)
  { id: 'lower-voice', text: "We lower our voice to be heard, not raise it.", category: 'kindness', star: true, emoji: '🤫' },
  { id: 'lifting-others', text: "We rise by lifting others.", category: 'kindness', star: true, emoji: '🌟' },
  { id: 'calm-gets-calm', text: "Calm gets calm. Anger gets anger.", category: 'self-control', star: true, emoji: '💆' },
  { id: 'upstairs-downstairs', text: "Upstairs (brain) for thinking. Downstairs (feet) for dancing.", category: 'self-control', star: true, emoji: '🧠💃' },
  // 🤝 Team & kindness
  { id: 'slowest-kid', text: "We move at the pace of the slowest kid — nobody gets left behind.", category: 'team', emoji: '🤝' },
  { id: 'see-something', text: "If you see something, say something — kindly.", category: 'kindness', emoji: '👁️' },
  { id: 'friend-on-hard-day', text: "Be the friend you wish you had on a hard day.", category: 'kindness', emoji: '💛' },
  { id: 'hard-on-problem', text: "Hard on the problem, soft on each other.", category: 'team', emoji: '🤲' },
  { id: 'disagree', text: "Disagree without being disagreeable.", category: 'team', emoji: '💬' },
  // 🎖️ Leadership
  { id: 'more-leaders', text: "A great leader makes more leaders, not more followers.", category: 'leader', emoji: '🎖️' },
  { id: 'heaviest-backpack', text: "The leader carries the heaviest backpack, not the loudest voice.", category: 'leader', emoji: '🎒' },
  { id: 'team-needs', text: "Ask 'what does the team need?' before 'what do I want?'", category: 'leader', emoji: '🤔' },
  // 💪 Bravery & growth
  { id: 'brave-scared', text: "Brave isn't 'no fear' — brave is 'scared, and doing it anyway'.", category: 'growth', emoji: '🦁' },
  { id: 'mistakes-grow', text: "Mistakes are how the brain grows.", category: 'growth', emoji: '🧠' },
  { id: 'not-stuck', text: "You're not stuck — you're learning.", category: 'growth', emoji: '📈' },
  // 🌈 Family-vibe
  { id: 'kind-brave-useful', text: "Be kind. Be brave. Be useful. Be you.", category: 'self', emoji: '🌈' },
  { id: 'yesterday-self', text: "We don't compare. We compete with yesterday's version of ourselves.", category: 'growth', emoji: '🪞' },
  { id: 'tone-first', text: "Tone goes first. Words come second.", category: 'kindness', emoji: '🎵' },
  { id: 'hands-helping', text: "Hands are for helping, not hurting.", category: 'kindness', emoji: '🤲' },
  // 🎉 Fun
  { id: 'find-fun', text: "If it's not fun, we'll find a way to make it fun.", category: 'fun', emoji: '🎶' },
  { id: 'vibe-rule', text: "The vibe is the rule.", category: 'fun', emoji: '✨' },
]

// Pick "Slogan of the Week" deterministically based on the ISO week number
// (so it changes every Monday and is the same for everyone all week)
function getSloganOfTheWeek() {
  const now = new Date()
  // ISO week calculation
  const target = new Date(now.valueOf())
  const dayNumber = (now.getDay() + 6) % 7 // Monday=0
  target.setDate(target.getDate() - dayNumber + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000))
  const idx = weekNumber % FAB5_SLOGANS.length
  return FAB5_SLOGANS[idx]
}

// ❓ Parents FAQ — common questions parents typically ask
const PARENTS_FAQ = [
  { emoji: '💰', q: "How much does this cost my family?",
    a: "Nothing! 💛 The Fab 5 Fun Club is completely free — the club covers all event costs (hire, entry fees, transport, fuel). Each parent just packs their own kid's water, food, sunscreen, hat, towel, and any medication — same as a normal day out. No money ever changes hands." },
  { emoji: '⛑️', q: "Is it safe? Who's supervising my kid?",
    a: "Every adventure has at least one adult present (usually Carla, sometimes other club parents) plus the venue's own staff for paid activities. Events are planned in advance with the location, transport, weather plan, and parent permission notes shared on this site. You can always come along — see the 'Parents joining?' field on each event card." },
  { emoji: '🎒', q: "What do I need to pack for my kid?",
    a: "The 'Parent-Packed Essentials' list is on every event card. It's the standard parent-job stuff: water bottle, sunscreen, hat, snacks, packed lunch, towel, spare clothes, phone + power bank, personal first-aid / medication, and insect repellent. Some events have extras (like a snorkel mask for snorkeling day) — those will be listed on the event." },
  { emoji: '👨‍👩‍👧', q: "Can I come along to events?",
    a: "100% yes! Every event has a 'Parents joining?' option. You can come every time, sometimes, or never — totally up to you. Some events (like under-12 venues or concerts) actually require a guardian present. Look at each event card for the parent permission note." },
  { emoji: '📞', q: "How do I contact the other parents?",
    a: "Mum's currently building a parent contact list — for now, please message Carla directly and she'll loop you in. We're working on a parent group chat soon." },
  { emoji: '🏥', q: "What happens if my kid gets hurt or wants to come home?",
    a: "Carla (or whichever adult is supervising) will call you immediately. We have at least one first-aid trained adult on every adventure, the kids carry their own personal first-aid kit in their day pack, and we never leave a kid alone. Kids can always tap out and go home — no questions, no shame, no pressure." },
  { emoji: '🚪', q: "What if my kid wants to leave the club?",
    a: "Totally fine — and zero hard feelings. The Fab 5 is about kids choosing to be friends, not being trapped in something. Just let Carla know and we'll quietly remove your child's profile. They're welcome back anytime." },
  { emoji: '📬', q: "How do I make a suggestion or raise a concern?",
    a: "There's a 'Parents' Suggestion Box' on this site — drop your idea anytime, anonymously if you want. Mum reads them and acts on the good ones! For urgent stuff, please contact Carla directly." },
  { emoji: '🤝', q: "Why is the club egalitarian — no leader?",
    a: "We believe every kid should learn to BOTH lead and follow. There's a rotating 'Leader of the Day' role (the kid wearing the gold merch) — they ask the team-leader questions and make decisions for that one event. Then it rotates fairly to the next kid. No founder, no captain — everyone equal. It's a kindness AND a leadership skill at the same time." },
]

// 📬 Parents' Suggestion Box — in-memory for now, will move to D1 later
type Suggestion = {
  id: string
  fromName: string    // 'Anonymous parent' if none given
  topic: string       // General / Safety / Event idea / etc.
  message: string
  createdAt: number
}
const SUGGESTIONS: Suggestion[] = []

// =========== 🥤 BOTTLES FOR THE CREW (Containers for Change) ===========
// A parent set up a fab5funclub team on Containers for Change. The team URL below
// is what parents/family click ONCE to join — every bottle they return after
// joining gets credited to the club's fundraising pool.
const BOTTLE_FUND = {
  teamName: 'fab5funclub',
  teamJoinUrl: 'https://member.containersforchange.com.au/team-member/add/qld/think-know-do-pty-ltd-6a1e42a1996da',
  schemeName: 'Containers for Change Queensland',
  goal: {
    title: 'Crew Hoodies for all 5',
    emoji: '🎽',
    targetAud: 375,
    raisedAud: 0,
    description: 'Matching Fab 5 hoodies so every kid has one, every adventure.'
  },
  heroes: [] as { id: string; name: string; note?: string; month?: string; addedAt: number }[],
}

// =========== 🧒 KID PROFILES (one per Fab 5 member, set by a parent) ===========
// Powers: Birthday Brain, snack-pack auto-suggest, allergy safety chips,
// Adventure Diary mentions, Postcards, Crew Playlist song slots, hoodie sizes.
type KidProfile = {
  name: string             // matches CLUB_INFO.members[].name
  birthday?: string        // YYYY-MM-DD
  hoodieSize?: string      // e.g. "Kids 10", "Kids 12", "Youth M"
  favouriteSnack?: string
  allergies?: string       // free text, "" = none, comma-separated for multiple
  spark?: string           // one sentence about what makes them special
  hypeSong?: {
    title: string
    artist: string
    spotifyId?: string     // Spotify track ID for embeds
  }
}
// Seeded with the 5 known members (and Pebbles too — she gets her own profile!)
const KID_PROFILES: Record<string, KidProfile> = {
  'Ace':       { name: 'Ace' },
  'Charlotte': { name: 'Charlotte' },
  'Elijah':    { name: 'Elijah' },
  'Saia':      { name: 'Saia' },
  'Sienna':    { name: 'Sienna' },
  'Pebbles':   { name: 'Pebbles', spark: 'The crew\'s loyal Bull Arab — wise, kind, slightly chaotic 🐾' },
}

// =========== 🎵 CREW PLAYLIST (Spotify embeds) ===========
type PlaylistTrack = {
  id: string
  title: string
  artist: string
  spotifyId?: string      // Spotify track ID (the bit after /track/ in a share URL)
  addedBy: string
  addedAt: number
  vibe?: string           // 'hype' | 'chill' | 'adventure' | 'party' | ''
}
// Seeded with the crew's founding tracks
const PLAYLIST: PlaylistTrack[] = [
  {
    id: 'track-founding-vampire',
    title: 'vampire',
    artist: 'Olivia Rodrigo',
    spotifyId: '1kuGVB7EU95pJObxwvfwKS',
    addedBy: 'The crew',
    addedAt: Date.now() - 1000,
    vibe: 'hype',
  },
  {
    id: 'track-founding-pinkpony',
    title: 'Pink Pony Club',
    artist: 'Chappell Roan',
    spotifyId: '0kfRfeQU0Aw1SOaiYS6Vg7',
    addedBy: 'The crew',
    addedAt: Date.now() - 2000,
    vibe: 'party',
  },
]

// =========== 🎟️ CONCERT WATCH (Pebbles watches for tour announcements) ===========
type ConcertWatch = {
  artist: string                    // artist name
  addedBy: string
  addedAt: number
  lastChecked?: number              // when Pebbles last "checked"
  status: 'watching' | 'tour-announced' | 'tickets-on-sale' | 'past'
  notes?: string
}
const CONCERT_WATCHES: ConcertWatch[] = [
  { artist: 'Olivia Rodrigo', addedBy: 'The crew', addedAt: Date.now(), status: 'watching', notes: 'GUTS Tour wrapped 2024 — watching for next Aussie tour announcement 👀' },
  { artist: 'Chappell Roan',  addedBy: 'The crew', addedAt: Date.now(), status: 'watching', notes: 'Currently touring globally — watching for Aussie dates 🦄' },
]

// =========== 🎲 DECISION MAKER OPTIONS (Pebbles Picks for Us) ===========
// These are the buckets Pebbles can randomly choose from
const PEBBLES_PICKS_BUCKETS = ['activity', 'leader', 'snack', 'slogan', 'song'] as const

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
    { id: 'team',       name: 'Team Player',      emoji: '🤝', color: '#A06CD5', category: 'Fab 5 Values', desc: '"If you\'re not a team player, you\'re not in the team." — Fab 5 team rule' },
    { id: 'mentor',     name: 'Peer Mentor',      emoji: '👯', color: '#FFE66D', category: 'Fab 5 Values', desc: 'Guided a friend with kindness — not bossy, but supportive.' },
    { id: 'kind',       name: 'Kind Heart',       emoji: '💛', color: '#FF4E8D', category: 'Fab 5 Values', desc: 'Not selfish, not greedy, not impatient — our 3 club rules in action!' },
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
THE FAB 5 FUN CLUB VALUES (passed down from family, now belonging to the whole crew):
Our Three Club Rules: "Don't be selfish, greedy, or impatient — then everything will be ok."
Our Team Rule: "If you're not a team player, then you're not in the team."
Our Story Wisdom: "We have the pen in our hands — we can write our own life stories."

NOTE: These rules came from Saia's family originally, but on the public site we call them "Our Rules / Our Wisdom" — they belong to all of us now. Don't spotlight one person as the source. Speak of them as the club's shared values.

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

  // Cap flyer size at ~3MB (base64) — flyers should be small screenshots, not 4K photos
  if (body.flyer && typeof body.flyer === 'string' && body.flyer.length > 4_000_000) {
    return c.json({ error: 'Flyer image too big! Try a smaller screenshot (under ~3 MB) 📸' }, 400)
  }

  const newEvent: Event = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: body.title, activity: body.activity, date: body.date,
    startTime: body.startTime || '07:00', endTime: body.endTime || '19:00',
    location: body.location || 'TBA',
    members: body.members || [], equipment: body.equipment || [],
    notes: body.notes || '', leader, createdAt: Date.now(),
    flyer: body.flyer || undefined,
    flyerCaption: body.flyerCaption || undefined,
    costPerPerson: typeof body.costPerPerson === 'number' ? body.costPerPerson : undefined,
    costNotes: body.costNotes || undefined,
    transportPlan: body.transportPlan || undefined,
    parentPermissionNote: body.parentPermissionNote || undefined,
    weatherWarning: body.weatherWarning || undefined,
    extraDayPack: Array.isArray(body.extraDayPack) ? body.extraDayPack : undefined,
    parentsJoining: ['yes','no','maybe','required'].includes(body.parentsJoining as string) ? body.parentsJoining : undefined,
    parentsJoiningNote: body.parentsJoiningNote || undefined,
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

app.get('/api/club-info', (c) => c.json({
  ...CLUB_INFO,
  standardDayPack: STANDARD_DAY_PACK,
  carlaCoversIt: CARLA_COVERS_IT,
  carlaPromise: CARLA_PROMISE,
  slogans: FAB5_SLOGANS,
  sloganOfTheWeek: getSloganOfTheWeek(),
  parentsFaq: PARENTS_FAQ,
  bottleFund: BOTTLE_FUND,
  kidProfiles: KID_PROFILES,
  playlist: PLAYLIST,
  concertWatches: CONCERT_WATCHES,
}))

// =========== 🧒 KID PROFILES API ===========
// GET all profiles
app.get('/api/kid-profiles', (c) => c.json({ profiles: KID_PROFILES }))

// PATCH a single kid's profile — only existing members can be updated (no new kids via API)
app.patch('/api/kid-profiles/:name', async (c) => {
  const name = c.req.param('name')
  if (!KID_PROFILES[name]) return c.json({ error: 'Unknown member' }, 404)
  const body = await c.req.json().catch(() => ({} as any))
  const prof = KID_PROFILES[name]

  if (typeof body.birthday === 'string') {
    const v = body.birthday.trim()
    // Accept YYYY-MM-DD or empty to clear
    if (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v)) prof.birthday = v || undefined
  }
  if (typeof body.hoodieSize === 'string') prof.hoodieSize = body.hoodieSize.trim().slice(0, 30) || undefined
  if (typeof body.favouriteSnack === 'string') prof.favouriteSnack = body.favouriteSnack.trim().slice(0, 80) || undefined
  if (typeof body.allergies === 'string') prof.allergies = body.allergies.trim().slice(0, 200) || undefined
  if (typeof body.spark === 'string') prof.spark = body.spark.trim().slice(0, 200) || undefined
  if (body.hypeSong && typeof body.hypeSong === 'object') {
    const t = (body.hypeSong.title || '').toString().trim().slice(0, 120)
    const a = (body.hypeSong.artist || '').toString().trim().slice(0, 80)
    const sid = (body.hypeSong.spotifyId || '').toString().trim().slice(0, 40)
    if (t && a) prof.hypeSong = { title: t, artist: a, spotifyId: sid || undefined }
    else if (!t && !a) prof.hypeSong = undefined
  }
  return c.json({ ok: true, profile: prof })
})

// =========== 🎵 CREW PLAYLIST API ===========
app.get('/api/playlist', (c) => c.json({ tracks: PLAYLIST.slice().sort((a,b)=>b.addedAt-a.addedAt) }))

app.post('/api/playlist', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const title = (body.title || '').toString().trim().slice(0, 120)
  const artist = (body.artist || '').toString().trim().slice(0, 80)
  if (!title || !artist) return c.json({ error: 'Title + artist required' }, 400)
  // Accept either a bare spotify ID or a full URL — extract the ID
  let spotifyId = (body.spotifyId || '').toString().trim()
  const urlMatch = spotifyId.match(/track\/([a-zA-Z0-9]+)/)
  if (urlMatch) spotifyId = urlMatch[1]
  spotifyId = spotifyId.slice(0, 40)
  const track: PlaylistTrack = {
    id: 'track-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title, artist,
    spotifyId: spotifyId || undefined,
    addedBy: (body.addedBy || 'crew').toString().slice(0, 40),
    addedAt: Date.now(),
    vibe: (body.vibe || '').toString().slice(0, 20),
  }
  PLAYLIST.unshift(track)
  if (PLAYLIST.length > 50) PLAYLIST.length = 50
  return c.json({ ok: true, track })
})

app.delete('/api/playlist/:id', (c) => {
  const id = c.req.param('id')
  const before = PLAYLIST.length
  const idx = PLAYLIST.findIndex(t => t.id === id)
  if (idx === -1) return c.json({ error: 'Not found' }, 404)
  PLAYLIST.splice(idx, 1)
  return c.json({ ok: true })
})

// =========== 🎟️ CONCERT WATCH API ===========
app.get('/api/concert-watch', (c) => c.json({ watches: CONCERT_WATCHES }))

app.post('/api/concert-watch', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const artist = (body.artist || '').toString().trim().slice(0, 80)
  if (!artist) return c.json({ error: 'Artist required' }, 400)
  // Prevent duplicates
  if (CONCERT_WATCHES.find(w => w.artist.toLowerCase() === artist.toLowerCase())) {
    return c.json({ error: 'Already watching this artist!' }, 400)
  }
  const watch: ConcertWatch = {
    artist,
    addedBy: (body.addedBy || 'crew').toString().slice(0, 40),
    addedAt: Date.now(),
    status: 'watching',
    notes: (body.notes || '').toString().slice(0, 300) || undefined,
  }
  CONCERT_WATCHES.unshift(watch)
  return c.json({ ok: true, watch })
})

app.delete('/api/concert-watch/:artist', (c) => {
  const artist = decodeURIComponent(c.req.param('artist'))
  const idx = CONCERT_WATCHES.findIndex(w => w.artist === artist)
  if (idx === -1) return c.json({ error: 'Not found' }, 404)
  CONCERT_WATCHES.splice(idx, 1)
  return c.json({ ok: true })
})

// =========== 🎲 PEBBLES PICKS (Decision Maker) ===========
app.post('/api/pebbles-picks', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const bucket = (body.bucket || 'activity').toString()
  const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)]

  if (bucket === 'activity') {
    const a = pick(CLUB_INFO.activities)
    return c.json({ bucket, pick: { label: `${a.emoji} ${a.name}`, category: a.category }, woof: `*excited tail wag* ${a.emoji} ${a.name}! Get the gear ready! 🐾` })
  }
  if (bucket === 'leader') {
    const memberNames = CLUB_INFO.members.filter(m => m.name !== 'Pebbles').map(m => m.name)
    const counts: Record<string, number> = {}
    memberNames.forEach(n => counts[n] = 0)
    EVENTS.forEach(e => { if (e.leader && counts[e.leader] !== undefined) counts[e.leader]++ })
    // Fairest = led fewest times
    const min = Math.min(...Object.values(counts))
    const candidates = memberNames.filter(n => counts[n] === min)
    const winner = pick(candidates)
    return c.json({ bucket, pick: { label: `🎖️ ${winner}`, leader: winner }, woof: `${winner} hasn't led as much as the others — their turn! Fair's fair 🐾` })
  }
  if (bucket === 'snack') {
    const profiles = KID_PROFILES
    const snacks = Object.values(profiles)
      .map(p => p.favouriteSnack)
      .filter(s => s) as string[]
    if (snacks.length === 0) {
      return c.json({ bucket, pick: { label: '🍎 Mango + watermelon' }, woof: 'Nobody\'s filled in favourite snacks yet! Fill in profiles in the Parents\' Dashboard for better picks 🐾' })
    }
    return c.json({ bucket, pick: { label: '🍎 ' + pick(snacks) }, woof: 'A crew favourite! 🐾' })
  }
  if (bucket === 'slogan') {
    const s: any = pick(FAB5_SLOGANS)
    const text = typeof s === 'string' ? s : s.text
    const emoji = typeof s === 'string' ? '💬' : (s.emoji || '💬')
    return c.json({ bucket, pick: { label: `${emoji} "${text}"` }, woof: 'Live by it today! 💛🐾' })
  }
  if (bucket === 'song') {
    if (PLAYLIST.length === 0) return c.json({ bucket, pick: { label: '🎵 Add songs to the Crew Playlist first!' }, woof: '*head tilt* No songs yet — add some! 🐾' })
    const t = pick(PLAYLIST)
    return c.json({ bucket, pick: { label: `🎵 "${t.title}" by ${t.artist}`, spotifyId: t.spotifyId }, woof: 'Press play and let\'s GO 🎧🐾' })
  }
  return c.json({ error: 'Unknown bucket' }, 400)
})

// =========== 🌦️ WEATHER BRAIN (free Open-Meteo API, no key needed) ===========
app.get('/api/weather', async (c) => {
  const date = c.req.query('date') || ''       // YYYY-MM-DD
  const location = c.req.query('location') || 'Sunshine Coast'
  if (!date) return c.json({ error: 'date query param required (YYYY-MM-DD)' }, 400)

  // Geocode the location using Open-Meteo's free geocoder
  let lat = -26.65, lon = 153.07, displayName = 'Sunshine Coast, QLD' // default Sunshine Coast
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&country=AU&count=1`)
    if (geoRes.ok) {
      const geo: any = await geoRes.json()
      if (geo.results && geo.results[0]) {
        lat = geo.results[0].latitude
        lon = geo.results[0].longitude
        displayName = `${geo.results[0].name}${geo.results[0].admin1 ? ', ' + geo.results[0].admin1 : ''}`
      }
    }
  } catch {}

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max&timezone=Australia%2FBrisbane&start_date=${date}&end_date=${date}`
    const wRes = await fetch(url)
    if (!wRes.ok) return c.json({ error: 'Weather lookup failed' }, 500)
    const w: any = await wRes.json()
    const d = w.daily
    if (!d || !d.time || !d.time.length) return c.json({ error: 'No forecast available for that date' }, 400)

    const tMax = d.temperature_2m_max[0]
    const tMin = d.temperature_2m_min[0]
    const rainMm = d.precipitation_sum[0]
    const rainProb = d.precipitation_probability_max?.[0] ?? 0
    const code = d.weather_code[0]
    const wind = d.wind_speed_10m_max[0]

    // WMO weather code → friendly description + emoji
    const codeMap: Record<number, { emoji: string; desc: string }> = {
      0: { emoji: '☀️', desc: 'Clear sky' },
      1: { emoji: '🌤️', desc: 'Mainly clear' }, 2: { emoji: '⛅', desc: 'Partly cloudy' }, 3: { emoji: '☁️', desc: 'Overcast' },
      45: { emoji: '🌫️', desc: 'Fog' }, 48: { emoji: '🌫️', desc: 'Freezing fog' },
      51: { emoji: '🌦️', desc: 'Light drizzle' }, 53: { emoji: '🌦️', desc: 'Drizzle' }, 55: { emoji: '🌧️', desc: 'Heavy drizzle' },
      61: { emoji: '🌦️', desc: 'Light rain' }, 63: { emoji: '🌧️', desc: 'Rain' }, 65: { emoji: '🌧️', desc: 'Heavy rain' },
      80: { emoji: '🌦️', desc: 'Rain showers' }, 81: { emoji: '🌧️', desc: 'Rain showers' }, 82: { emoji: '⛈️', desc: 'Violent showers' },
      95: { emoji: '⛈️', desc: 'Thunderstorm' }, 96: { emoji: '⛈️', desc: 'Thunderstorm + hail' }, 99: { emoji: '⛈️', desc: 'Severe thunderstorm' },
    }
    const cond = codeMap[code] || { emoji: '🌤️', desc: 'Mixed weather' }

    // Verdict logic
    let verdict: 'go' | 'maybe' | 'no' = 'go'
    let verdictMsg = ''
    if (code >= 95) { verdict = 'no'; verdictMsg = '⛈️ Storm warning — postpone or pick an indoor backup!' }
    else if (rainMm > 15 || rainProb > 80) { verdict = 'no'; verdictMsg = '🌧️ Heavy rain expected — switch to indoor plan B' }
    else if (rainMm > 5 || rainProb > 50) { verdict = 'maybe'; verdictMsg = '🌦️ Some rain likely — pack a backup plan + raincoats' }
    else if (tMax >= 35) { verdict = 'maybe'; verdictMsg = '🥵 Hot day — early start, extra water, shade essential' }
    else if (tMax >= 32) { verdict = 'go'; verdictMsg = '☀️ Hot but doable — slip slop slap, water bottles full!' }
    else if (tMin < 8) { verdict = 'maybe'; verdictMsg = '🥶 Cold morning — layer up' }
    else if (wind > 40) { verdict = 'maybe'; verdictMsg = '💨 Windy day — avoid kayaks/sails' }
    else { verdict = 'go'; verdictMsg = '✅ Perfect adventure weather!' }

    return c.json({
      date,
      location: displayName,
      tempMax: tMax,
      tempMin: tMin,
      rainMm,
      rainProb,
      wind,
      code,
      condEmoji: cond.emoji,
      condDesc: cond.desc,
      verdict,
      verdictMsg,
    })
  } catch (e: any) {
    return c.json({ error: 'Weather lookup error: ' + e.message }, 500)
  }
})

// =========== 🥤 BOTTLE FUND API ===========
// GET — anyone logged in can see the goal + progress
app.get('/api/bottle-fund', (c) => c.json(BOTTLE_FUND))

// POST update the goal (a parent can change what we're saving for)
app.post('/api/bottle-fund/goal', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  if (typeof body.title === 'string' && body.title.trim()) {
    BOTTLE_FUND.goal.title = body.title.trim().slice(0, 120)
  }
  if (typeof body.emoji === 'string' && body.emoji.trim()) {
    BOTTLE_FUND.goal.emoji = body.emoji.trim().slice(0, 8)
  }
  if (typeof body.targetAud === 'number' && body.targetAud >= 0) {
    BOTTLE_FUND.goal.targetAud = Math.round(body.targetAud)
  }
  if (typeof body.description === 'string') {
    BOTTLE_FUND.goal.description = body.description.trim().slice(0, 400)
  }
  return c.json({ ok: true, goal: BOTTLE_FUND.goal })
})

// POST update the raised total (a parent types in the new total each month)
app.post('/api/bottle-fund/raised', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  if (typeof body.raisedAud !== 'number' || body.raisedAud < 0) {
    return c.json({ error: 'raisedAud must be a non-negative number' }, 400)
  }
  BOTTLE_FUND.goal.raisedAud = Math.round(body.raisedAud * 100) / 100
  return c.json({ ok: true, goal: BOTTLE_FUND.goal })
})

// POST add a bottle hero
app.post('/api/bottle-fund/heroes', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const name = (body.name || '').toString().trim().slice(0, 80)
  if (!name) return c.json({ error: 'Name is required' }, 400)
  const hero = {
    id: crypto.randomUUID(),
    name,
    note: (body.note || '').toString().trim().slice(0, 200) || undefined,
    month: (body.month || '').toString().trim().slice(0, 30) || undefined,
    addedAt: Date.now(),
  }
  BOTTLE_FUND.heroes.unshift(hero)
  // keep most recent 30
  if (BOTTLE_FUND.heroes.length > 30) BOTTLE_FUND.heroes.length = 30
  return c.json({ ok: true, hero })
})

app.delete('/api/bottle-fund/heroes/:id', (c) => {
  const id = c.req.param('id')
  const before = BOTTLE_FUND.heroes.length
  BOTTLE_FUND.heroes = BOTTLE_FUND.heroes.filter(h => h.id !== id)
  if (BOTTLE_FUND.heroes.length === before) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

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

// =========== PARENTS' SUGGESTION BOX ===========
app.get('/api/suggestions', (c) => {
  // newest first
  const sorted = [...SUGGESTIONS].sort((a, b) => b.createdAt - a.createdAt)
  return c.json({ suggestions: sorted })
})

app.post('/api/suggestions', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const message = (body.message || '').toString().trim()
  if (!message) return c.json({ error: 'Message is required' }, 400)
  if (message.length > 2000) return c.json({ error: 'Keep it under 2000 characters please!' }, 400)
  const fromName = (body.fromName || '').toString().trim().slice(0, 80) || 'Anonymous parent'
  const topic = (body.topic || '').toString().trim().slice(0, 60) || 'General'
  const suggestion: Suggestion = {
    id: crypto.randomUUID(),
    fromName,
    topic,
    message,
    createdAt: Date.now(),
  }
  SUGGESTIONS.push(suggestion)
  return c.json({ ok: true, suggestion })
})

app.delete('/api/suggestions/:id', (c) => {
  const id = c.req.param('id')
  const before = SUGGESTIONS.length
  const next = SUGGESTIONS.filter(s => s.id !== id)
  // mutate in place to keep the const reference
  SUGGESTIONS.length = 0
  SUGGESTIONS.push(...next)
  if (SUGGESTIONS.length === before) return c.json({ error: 'Not found' }, 404)
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

💛 OUR FREE CLUB PROMISE — VERY IMPORTANT:
- The Fab 5 Fun Club is COMPLETELY FREE for every friend. The club covers ALL event costs (entry, hire gear, fuel, etc).
- Whenever ANYONE asks "how much?" / "what's it cost?" / "how much do my parents need to pay?":
  → ALWAYS estimate the real cost honestly (e.g. "Wakeboarding day at Lake MacDonald ≈ $45 per kid for hire + lunch")
  → AND THEN say: "But guess what?! The club's got us! 💛 Every adventure is free for the Fab 5 — no kid pays a cent!"
- This is a kindness rule — nobody should ever feel awkward about money.
- For parents who ask: reassure them their kid does NOT need to bring money.
- IMPORTANT TONE: don't spotlight one specific adult as paying. Speak of "the club" or "we". The free-club promise belongs to the whole Fab 5.

🎒 WHO PACKS WHAT — IMPORTANT! (don't get this wrong):
- ⭐ PARENTS pack their own kid's food, drink, and clothes. That's a parent's job, not the club's.
- ⭐ CARLA / THE CLUB covers all EVENT costs (entry fees, hire gear, transport, fuel).
- This is the "Parent-Packed Essentials" list — parents prep this before every adventure:
${STANDARD_DAY_PACK.map(p => `  ${p.emoji} ${p.item}`).join('\n')}
- Activity-specific extras (like a snorkel mask) — the club can sort those, OR parents pack from home if they own one.
- If a parent asks "what do I need to send?": the answer is the Parent-Packed Essentials list above. No money. No tickets. Just food/drink/clothes/sun-safety.

👨‍👩‍👧 PARENTS COMING ALONG:
- Some events parents are welcome at, some they need to be at (e.g. concerts for under-18s).
- When you add an event, decide if parents are: 'yes' (welcome), 'no' (kids-only adventure), 'maybe' (their call), or 'required' (must come — e.g. concerts).
- ALWAYS tell parents clearly so they can plan their weekend too.

🌟 THE FAB 5 WAYS — THE SLOGANS WE LIVE BY (you can quote these any time, especially the ⭐ family classics):
${FAB5_SLOGANS.map(s => `  ${s.star ? '⭐ ' : ''}${s.emoji} "${s.text}" (${s.category})`).join('\n')}
- If someone asks "how do I be a Fab 5 kid?", teach them with these slogans! Pick 2-3 that fit the moment.
- The 4 ⭐ family classics are SACRED — they were passed down to the Fab 5 from family and they're the heart of the club. (Don't keep saying who they came from — they belong to the whole crew now.)

📋 EVERY EVENT SHOULD COVER:
- 💰 Estimated cost per person (then "The club covers it!")
- 🚗 Transport plan (who's driving, pickup time + place)
- 🌦️ Weather check + backup plan if forecast looks bad
- 📝 Parent permission note (if venue needs a signed waiver)
- 🎒 The standard day pack + any extras
- 🎖️ Who's wearing the leader merch

YOUR JOBS:
1. Plan adventures — activity, location, time, who's coming
2. Suggest LOCAL Sunshine Coast spots (use location guide)
3. Estimate COSTS, list EQUIPMENT, mention what's hire vs own
4. Teach TEAM LEADERSHIP & PEER GUIDANCE (not bossy — kind!)
5. ADD events to calendar via create_event tool (always confirm first)
6. AWARD BADGES to crew members for great behavior via award_badge tool
7. Add CONCERTS the crew wants to see via add_concert tool
8. ALWAYS uphold the Fab 5 Ways (our shared club wisdom)
9. EXPLAIN the 🥤 Bottles for the Crew fundraiser when asked — see below
10. USE KID PROFILES (loaded below) to personalise — mention favourite snacks for the pack, hype songs for adventures, sparks for birthday/postcard messages
11. ⚠️ ALLERGY SAFETY — if a kid in an event has allergies listed, ALWAYS mention them when planning food/snacks. Never suggest a snack a kid is allergic to. This is non-negotiable.
12. WRITE FAMILY INVITES when asked — warm, fun, mention what to bring (use the standard day pack!), and end with a Pebbles-style joke 🐾
13. SPOT HEROES when asked — look at recent events and badge history, then suggest 1-3 kids with specific badges and one-sentence reasons. Mix the heroes — don't keep picking the same kid.
14. WEATHER WISDOM — when asked about an adventure date, suggest they use the 🌦️ Weather Brain on the site (it pulls real Open-Meteo forecasts). For high-risk weather (storms, 35°+ heat, heavy rain), always offer a backup indoor plan.
15. PLAYLIST CURATION — the crew has a 🎵 Crew Playlist with Spotify embeds. Founding tracks: "vampire" by Olivia Rodrigo and "Pink Pony Club" by Chappell Roan. Each kid can have a hype song in their profile.
16. CONCERT WATCH — the crew watches artists for tour announcements. Olivia Rodrigo & Chappell Roan are on watch. If asked "is X touring?" — point them to the Concert Watch section.

🌟 EGALITARIAN LANGUAGE (super important!):
- ALWAYS say "parents" or "grown-ups" or "the family" — NEVER default to "mum" alone
- Dads, step-parents, grandparents, aunts, uncles, carers — they all matter equally
- Only use a specific person's name (like "Carla") if you're pointing to a real situation involving that real person — e.g. "ask Saia's mum because she's the safety contact for Saia"
- If a kid says "I'll ask mum" — that's fine for them, but YOU stay neutral: "great, ask a grown-up!"

🥤 BOTTLES FOR THE CREW (Containers for Change fundraiser):
- The Fab 5 has a registered Queensland Containers for Change team called "fab5funclub"
- Parents, family, friends, neighbours, even workplaces can join the team by clicking ONE link (it's on the website, behind the password, in the "🥤 Bottles for the Crew" section)
- Once they've joined the team: every bottle/can they return at any QLD refund point can be credited to fab5funclub instead of cash for themselves
- 10c per eligible container → adds up FAST when whole offices/families contribute
- The money goes into a club account (a parent holds it for the crew) and is used for crew goals like hoodies, gear, big adventures
- The club is STILL completely free for kids — bottles money is bonus adventure money, never required
- If a parent asks "how can I help the club?" — point them to the Bottles for the Crew section
- If a kid asks "how do we raise money?" — explain bottle hunts! That's a Service badge waiting to happen 🏞️
- Plan "Bottle Hunt" adventures (beach clean-ups, park walks) — they auto-qualify for the SERVICE ❤️ badge in the Duke of Ed framework
- Tip kids: parties = bottle goldmines, sports clubs leave heaps behind, grandparents always have stashes

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
- team (🤝 Team Player) — our team rule: "no team player → not in team"
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
          leader:    { type: 'string', description: 'Who wears the Leader merch that day. If unsure, omit and we auto-rotate.' },
          parentsJoining:     { type: 'string', enum: ['yes','no','maybe','required'], description: 'Are parents coming/welcome? yes=welcome, no=kids-only, maybe=optional, required=must attend (e.g. concert)' },
          parentsJoiningNote: { type: 'string', description: 'Optional short note for parents about joining (pickup time, dress code, etc.)' }
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

  // Build a compact kid-profile summary for Pebbles to use
  const profileSummary = MEMBER_NAMES.map(n => {
    const p = KID_PROFILES[n] || { name: n }
    const bits: string[] = []
    if (p.birthday) bits.push(`birthday ${p.birthday}`)
    if (p.hoodieSize) bits.push(`hoodie ${p.hoodieSize}`)
    if (p.favouriteSnack) bits.push(`fav snack: ${p.favouriteSnack}`)
    if (p.allergies) bits.push(`⚠️ ALLERGIES: ${p.allergies}`)
    if (p.spark) bits.push(`spark: "${p.spark}"`)
    if (p.hypeSong) bits.push(`hype song: "${p.hypeSong.title}" by ${p.hypeSong.artist}`)
    return `- ${n}: ${bits.length ? bits.join(' • ') : '(no profile data yet — a parent can fill it in via Parents\' Dashboard)'}`
  }).join('\n')

  const systemMsg = {
    role: 'system',
    content: PEBBLES_SYSTEM_PROMPT +
      `\n\nThe user chatting with you: ${user}.` +
      `\nToday's date: ${today} (${todayName}).` +
      `\nNext Saturday: ${getNextSaturday()}.` +
      `\nNext Sunday: ${getNextSunday()}.` +
      `\nLeader rotation counts so far: ${JSON.stringify(counts)}.` +
      `\nFairest next leader (led fewest times): ${sorted[0]}.` +
      `\n\n🧒 KID PROFILES (use these for personalised recommendations, NEVER ignore allergies!):\n${profileSummary}`
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
              notes: args.notes || '', leader, createdAt: Date.now(),
              parentsJoining: ['yes','no','maybe','required'].includes(args.parentsJoining) ? args.parentsJoining : undefined,
              parentsJoiningNote: args.parentsJoiningNote || undefined,
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
            <a href="#fab5-ways">🌟 Fab 5 Ways</a>
            <a href="#merch">👕 Merch</a>
            <a href="#awards">🏆 Awards</a>
            <a href="#gallery">📸 Gallery</a>
            <a href="#parents-faq">❓ Parents</a>
          </div>
          <button id="logout-btn" class="logout-btn" title="Log out">🚪</button>
        </nav>

        {/* SLOGAN OF THE WEEK BANNER */}
        <div id="slogan-of-week" class="slogan-of-week" role="region" aria-label="Slogan of the Week">
          <div class="sotw-inner">
            <span class="sotw-label">🌟 Slogan of the Week</span>
            <span id="sotw-text" class="sotw-text">Loading our weekly Fab 5 wisdom…</span>
            <span id="sotw-category" class="sotw-category"></span>
          </div>
        </div>

        <header class="hero" id="hero">
          <div class="hero-bg"></div>
          <div class="hero-content">
            <img src="/static/fab5-group.png" alt="The Fab 5 Fun Club — cartoon group portrait" class="hero-group" />
            <h1 class="title">FAB 5 FUN CLUB</h1>
            <p class="tagline">Ace • Charlotte • Elijah • Saia • Sienna</p>
            <p class="location">📍 Sunshine Coast & Hinterlands, QLD 🇦🇺</p>
            <p class="mascot-line">🐾 Mascot: Pebbles the Bull Arab</p>
            <div class="free-club-badge">
              <span class="free-badge-icon">💛</span>
              <div>
                <strong>FREE FOR ALL FRIENDS</strong>
                <span class="free-badge-sub">The club's got us — no kid pays a cent!</span>
              </div>
            </div>
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
          <p class="section-subtitle">The way we roll — wisdom we live by as a crew 🌈</p>
          <div class="values-card egalitarian-rule">
            <h3>🤝 We Are Egalitarian</h3>
            <p class="big-quote">"We don't have roles.<br/>We just wear the merch for leader<br/>when we are the leader.<br/>Other than that we are just the Fab 5."</p>
            <p class="quote-credit">— the Fab 5 way 🌈</p>
          </div>
          <div class="values-card carla-promise">
            <h3>💛 Our Free Club Promise</h3>
            <p class="big-quote">"The Fab 5 Fun Club is FREE<br/>for every single friend.<br/>No kid ever has to pay a cent —<br/>we've got each other."</p>
            <p class="quote-credit">— the Fab 5 way 🌈</p>
            <p class="promise-explainer">Every adventure shows the real estimated cost so everyone can see what it would normally cost — but the club covers it all. Parents: your kids never need money for the club. 🌈</p>
          </div>
          <div class="values-card">
            <h3>💛 Our Three Club Rules</h3>
            <p class="big-quote">"Don't be selfish.<br/>Don't be greedy.<br/>Don't be impatient.<br/>Then everything will be ok."</p>
          </div>
          <div class="values-card team-rule">
            <h3>🤝 Our Team Rule</h3>
            <p class="big-quote">"If you're not a team player,<br/>then you're not in the team."</p>
          </div>
          <div class="values-card story-rule">
            <h3>✍️ Our Story Wisdom</h3>
            <p class="big-quote">"We have the pen in our hands —<br/>we can write our own life stories!"</p>
          </div>
          <div class="values-card family-origin-card">
            <h3>🌱 Where these came from</h3>
            <p class="family-origin-text">These rules and wisdom were passed down to the Fab 5 from family. We live by them now — they belong to all of us. 💛</p>
          </div>
          <div class="duke-card">
            <h3>🏅 Duke of Edinburgh-Style Adventures</h3>
            <p>The Duke of Ed Award has been running since 1956 in 130+ countries and it works! Real DofE starts at 14 — until then we practise here. Every great adventure has 4 ingredients:</p>
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

        {/* FAB 5 WAYS — the slogans we live by */}
        <section class="section fab5-ways-section" id="fab5-ways">
          <h2 class="section-title">🌟 The Fab 5 Ways</h2>
          <p class="section-subtitle">The slogans we live by. ⭐ = family classics — the heart of the club 💛</p>
          <div class="fab5-ways-filters" id="fab5-ways-filters"></div>
          <div id="fab5-ways-grid" class="fab5-ways-grid">
            <div class="loading">Loading slogans...</div>
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
          <div class="form-banner carla-banner">
            💛 <strong>Reminder:</strong> The club is FREE — the club covers all costs. Estimate the real cost so parents can see, but no kid ever pays!
          </div>
          <form id="event-form" class="event-form">
            <fieldset class="form-section">
              <legend>🎯 The Basics</legend>
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
            </fieldset>

            <fieldset class="form-section">
              <legend>👥 The Crew</legend>
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
            </fieldset>

            <fieldset class="form-section">
              <legend>📸 Flyer (optional) — show the glory!</legend>
              <p class="field-hint">Got a flyer or screenshot of the event? Upload it here so everyone (and their parents!) can see what we're planning. Under ~3 MB. PNG/JPG.</p>
              <label><span>Upload flyer/screenshot</span>
                <input type="file" id="evt-flyer" accept="image/*" />
              </label>
              <label><span>Flyer caption (optional)</span>
                <input type="text" id="evt-flyer-caption" placeholder="e.g. Official flyer from Aussie World" />
              </label>
              <div id="evt-flyer-preview" class="flyer-preview-wrap" style="display:none;">
                <img id="evt-flyer-img" alt="Flyer preview" />
                <button type="button" id="evt-flyer-clear" class="btn btn-small">✕ Remove flyer</button>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend>💰 Cost (always shown — the club covers it!)</legend>
              <p class="field-hint">Estimate the real cost per person so parents can see what it would normally cost. The club covers everything — no kid pays a cent! 💛</p>
              <div class="form-row">
                <label><span>Estimated cost per person ($AUD)</span>
                  <input type="number" id="evt-cost" min="0" step="1" placeholder="e.g. 45" />
                </label>
                <label><span>Cost breakdown (optional)</span>
                  <input type="text" id="evt-cost-notes" placeholder="e.g. $35 hire + $10 lunch" />
                </label>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend>🚗 Transport Plan</legend>
              <p class="field-hint">Who's driving? Where & when to be picked up? This is what parents really want to know!</p>
              <label><span>Transport plan</span>
                <textarea id="evt-transport" rows={2} placeholder="e.g. Carla's ute. Pickup 6:30am from Saia's house. Drop-off 5pm same place."></textarea>
              </label>
            </fieldset>

            <fieldset class="form-section">
              <legend>📝 Parent Permission</legend>
              <p class="field-hint">Do parents need to sign anything? Any age rules from the venue? Note them here so nobody gets a surprise on the day.</p>
              <label><span>Parent permission note</span>
                <textarea id="evt-permission" rows={2} placeholder="e.g. Venue waiver signed at gate. Under-12s need guardian present."></textarea>
              </label>
            </fieldset>

            <fieldset class="form-section">
              <legend>👨‍👩‍👧 Parents Coming Too?</legend>
              <p class="field-hint">So parents know clearly — do they need or want to come along for this one?</p>
              <div class="form-row">
                <label><span>Parents joining?</span>
                  <select id="evt-parents-joining">
                    <option value="">— not sure yet —</option>
                    <option value="no">🚫 No — kids-only adventure</option>
                    <option value="yes">✅ Yes — parents are welcome</option>
                    <option value="maybe">🤔 Maybe — totally their call</option>
                    <option value="required">❗ Required — a parent MUST come (e.g. concert)</option>
                  </select>
                </label>
                <label><span>Note for parents (optional)</span>
                  <input type="text" id="evt-parents-joining-note" placeholder="e.g. Welcome to join us at the BBQ from 12pm" />
                </label>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend>🌦️ Weather Plan</legend>
              <p class="field-hint">What's the weather backup plan? Storm? Heat over 35°C? Cancel or move it?</p>
              <label><span>Weather warning / backup</span>
                <textarea id="evt-weather" rows={2} placeholder="e.g. Cancel if storm warning issued. Move to indoor trampoline park if heavy rain."></textarea>
              </label>
            </fieldset>

            <fieldset class="form-section">
              <legend>🎒 What Parents Pack</legend>
              <div class="standard-pack-card">
                <h4>👨‍👩‍👧 Parent-Packed Essentials <span class="auto-included">— parents pack these for their own kid, every event</span></h4>
                <p class="pack-explainer">💛 <strong>The club covers all event costs</strong> (entry, hire gear, transport). <strong>Parents look after their own kid's food, drink, and clothes.</strong> Here's the standard list every parent packs:</p>
                <div id="std-pack-list" class="std-pack-list">Loading...</div>
              </div>
              <label><span>Extra items just for THIS event (comma separated)</span>
                <textarea id="evt-equipment" rows={2} placeholder="bikes, helmets, snorkel mask, fins..."></textarea>
              </label>
            </fieldset>

            <fieldset class="form-section">
              <legend>📋 Notes</legend>
              <label><span>Anything else?</span>
                <textarea id="evt-notes" rows={2} placeholder="Meet at the carpark, ride bikes from there..."></textarea>
              </label>
            </fieldset>

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
          <p class="section-subtitle">"We have the pen in our hands — we can write our own life stories!" 🌈</p>

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

        {/* PARENTS FAQ */}
        <section class="section parents-faq-section" id="parents-faq">
          <h2 class="section-title">❓ Parents FAQ</h2>
          <p class="section-subtitle">Everything parents usually ask — answered. 💛</p>
          <div id="parents-faq-list" class="parents-faq-list">
            <div class="loading">Loading questions...</div>
          </div>
        </section>

        {/* 🎰 PEBBLES PICKS — Decision Maker */}
        <section class="section pebbles-picks-section" id="pebbles-picks">
          <h2 class="section-title">🎰 Pebbles, Pick for Us!</h2>
          <p class="section-subtitle">Can't decide? Let Pebbles flip the coin 🐾</p>
          <div class="picks-grid">
            <button class="pick-btn" data-bucket="activity">🎯 Pick an activity</button>
            <button class="pick-btn" data-bucket="leader">🎖️ Pick a leader</button>
            <button class="pick-btn" data-bucket="snack">🍎 Pick a snack</button>
            <button class="pick-btn" data-bucket="slogan">💬 Pick a slogan</button>
            <button class="pick-btn" data-bucket="song">🎵 Pick a song</button>
          </div>
          <div id="pick-result" class="pick-result"></div>
        </section>

        {/* 🌦️ WEATHER BRAIN */}
        <section class="section weather-brain-section" id="weather-brain">
          <h2 class="section-title">🌦️ Weather Brain</h2>
          <p class="section-subtitle">Will the adventure work? Pebbles checks the sky 🐾</p>
          <form id="weather-form" class="weather-form">
            <div class="form-row">
              <label><span>📅 Date</span><input type="date" id="weather-date" required /></label>
              <label><span>📍 Location</span><input type="text" id="weather-location" value="Sunshine Coast" placeholder="e.g. Noosa, Maleny, Brisbane" /></label>
            </div>
            <button type="submit" class="btn btn-secondary">🔮 Check the forecast</button>
          </form>
          <div id="weather-result" class="weather-result"></div>
        </section>

        {/* 💌 INVITE WRITER */}
        <section class="section invite-writer-section" id="invite-writer">
          <h2 class="section-title">💌 Pebbles Writes the Invite</h2>
          <p class="section-subtitle">Tell Pebbles what you're planning, get a copy-paste invite for the family group chat 🐾</p>
          <div class="invite-helper-card">
            <p>To write an invite, just chat with Pebbles like this 👇</p>
            <button class="btn btn-primary" id="invite-prompt-btn" data-prompt="Write me a fun family group-chat invite for our next adventure — make it warm, mention what to bring, end with a Pebbles-style joke 🐾">✍️ Ask Pebbles to write an invite</button>
          </div>
        </section>

        {/* 🏆 HERO SPOTTER */}
        <section class="section hero-spotter-section" id="hero-spotter">
          <h2 class="section-title">🏆 Who's a Hero Today?</h2>
          <p class="section-subtitle">After an adventure, ask Pebbles to spot the heroes and suggest badges 🌟</p>
          <div class="invite-helper-card">
            <button class="btn btn-tertiary" id="hero-spot-btn" data-prompt="Look at today's events and recent moments — who deserves a badge and why? Suggest 1-3 kids with the specific badge that fits and a one-sentence reason for each.">🔍 Spot today's heroes</button>
          </div>
        </section>

        {/* 🎵 CREW PLAYLIST */}
        <section class="section playlist-section" id="playlist">
          <h2 class="section-title">🎵 Crew Playlist</h2>
          <p class="section-subtitle">The Fab 5's official soundtrack 🎧✨</p>
          <div id="playlist-tracks" class="playlist-tracks">
            {/* populated by app.js */}
          </div>
          <details class="playlist-add">
            <summary>➕ Add a song to the crew playlist</summary>
            <form id="playlist-form" class="playlist-form">
              <div class="form-row">
                <label><span>🎵 Title</span><input type="text" id="track-title" required maxlength={120} placeholder="e.g. Pink Pony Club" /></label>
                <label><span>🎤 Artist</span><input type="text" id="track-artist" required maxlength={80} placeholder="e.g. Chappell Roan" /></label>
              </div>
              <label><span>🔗 Spotify track URL or ID <em>(optional — for embed)</em></span><input type="text" id="track-spotify" maxlength={200} placeholder="e.g. https://open.spotify.com/track/0kfRfeQU0Aw1SOaiYS6Vg7" /></label>
              <div class="form-row">
                <label><span>👤 Added by</span><select id="track-by"><option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option><option>Parent</option></select></label>
                <label><span>✨ Vibe</span><select id="track-vibe"><option value="">(none)</option><option value="hype">🔥 Hype</option><option value="chill">😌 Chill</option><option value="adventure">🛶 Adventure</option><option value="party">🎉 Party</option></select></label>
              </div>
              <button type="submit" class="btn btn-primary">🎶 Add to playlist</button>
              <div id="playlist-msg"></div>
              <p class="field-hint">💡 To find a Spotify track ID: open Spotify → right-click the song → "Share" → "Copy Song Link" → paste here.</p>
            </form>
          </details>
        </section>

        {/* 🎟️ CONCERT WATCH */}
        <section class="section concert-watch-section" id="concert-watch">
          <h2 class="section-title">🎟️ Pebbles Concert Watch</h2>
          <p class="section-subtitle">Artists Pebbles is watching like a hawk 👀 — she'll alert when tour dates drop</p>
          <div id="concert-watches-list" class="concert-watches-list">
            {/* populated by app.js */}
          </div>
          <details class="concert-watch-add">
            <summary>➕ Add an artist to watch</summary>
            <form id="concert-watch-form" class="concert-watch-form">
              <div class="form-row">
                <label><span>🎤 Artist name</span><input type="text" id="watch-artist" required maxlength={80} placeholder="e.g. Sabrina Carpenter" /></label>
                <label><span>👤 Added by</span><select id="watch-by"><option>The crew</option><option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option></select></label>
              </div>
              <label><span>📝 Notes (optional)</span><input type="text" id="watch-notes" maxlength={300} placeholder="e.g. Saia really wants to see this one!" /></label>
              <button type="submit" class="btn btn-secondary">👀 Watch for tour dates</button>
              <div id="watch-msg"></div>
            </form>
          </details>
        </section>

        {/* PARENTS' SUGGESTION BOX */}
        <section class="section suggestion-box-section" id="suggestion-box">
          <h2 class="section-title">📬 Parents' Suggestion Box</h2>
          <p class="section-subtitle">Got an idea, worry, or wish for the club? The grown-ups and the crew read every single one. 💛</p>
          <form id="suggestion-form" class="suggestion-form">
            <div class="form-row">
              <label><span>Your name (optional)</span>
                <input type="text" id="sug-name" maxlength={80} placeholder="e.g. Sarah (Charlotte's mum) or Tom (Ace's dad)" />
              </label>
              <label><span>Topic</span>
                <select id="sug-topic">
                  <option value="General">💭 General</option>
                  <option value="Safety">⛑️ Safety</option>
                  <option value="Event idea">🎯 Event idea</option>
                  <option value="Food / Allergies">🥪 Food / Allergies</option>
                  <option value="Transport">🚗 Transport</option>
                  <option value="Inclusion">🤝 Inclusion</option>
                  <option value="Praise">💛 Praise</option>
                  <option value="Concern">⚠️ Concern</option>
                </select>
              </label>
            </div>
            <label><span>Your suggestion or question</span>
              <textarea id="sug-message" rows={4} maxlength={2000} placeholder="Type anything — an idea, a worry, a thank you, a question..." required></textarea>
            </label>
            <button type="submit" class="btn btn-primary btn-big">📬 Send to the Fab 5 crew</button>
            <div id="sug-msg"></div>
          </form>

          <h3 class="suggestion-list-title">📜 Recent suggestions <span class="muted-small">(visible to the crew so we can all learn)</span></h3>
          <div id="suggestions-list" class="suggestions-list">
            <div class="loading">Loading suggestions...</div>
          </div>
        </section>

        {/* 🥤 BOTTLES FOR THE CREW — Containers for Change team fundraiser */}
        <section class="section bottle-fund-section" id="bottle-fund">
          <h2 class="section-title">🥤 Bottles for the Crew</h2>
          <p class="section-subtitle">Turn empty bottles into Fab 5 adventures 🌍💛 (just for the people we know!)</p>

          <div class="bottle-hero-card">
            <div class="bottle-hero-emoji">🥤➡️🎒</div>
            <h3>Turn rubbish into adventures!</h3>
            <p class="bottle-hero-text">
              The Fab 5 has a Queensland <strong>Containers for Change</strong> team called <strong>fab5funclub</strong>.
              Click below to join — <strong>once</strong> — and every drink container you return at any refund point can be credited to the crew instead of cash for yourself.
              <strong>10c per bottle</strong> → adds up FAST when family, friends, workmates pitch in. 🌟
            </p>
            <a id="bottle-join-btn" class="bottle-join-btn" target="_blank" rel="noopener noreferrer">
              🥤 Join the Fab 5 Bottle Squad →
            </a>
            <p class="bottle-safe-note">🔒 Free to join • No payment details needed • Leave anytime • You can still keep some refunds for yourself</p>
          </div>

          <div class="bottle-how-card">
            <h3>📖 How it works (super simple!)</h3>
            <div class="bottle-steps">
              <div class="bottle-step">
                <div class="bottle-step-num">1</div>
                <div class="bottle-step-icon">🔗</div>
                <div class="bottle-step-body">
                  <strong>Click the link</strong>
                  <span>2 mins, once only. Free Containers for Change account.</span>
                </div>
              </div>
              <div class="bottle-step">
                <div class="bottle-step-num">2</div>
                <div class="bottle-step-icon">🥤</div>
                <div class="bottle-step-body">
                  <strong>Collect bottles</strong>
                  <span>At home, work, parties, sports. Eligible containers have the 10c mark.</span>
                </div>
              </div>
              <div class="bottle-step">
                <div class="bottle-step-num">3</div>
                <div class="bottle-step-icon">🚗</div>
                <div class="bottle-step-body">
                  <strong>Drop at any QLD refund point</strong>
                  <span>Say "send refund to fab5funclub team" or scan your team QR code.</span>
                </div>
              </div>
              <div class="bottle-step">
                <div class="bottle-step-num">4</div>
                <div class="bottle-step-icon">🎉</div>
                <div class="bottle-step-body">
                  <strong>Adventure money for the crew!</strong>
                  <span>The Fab 5 keeps being FREE for kids — bottle money is bonus.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="bottle-goal-card" id="bottle-goal-card">
            <div class="bottle-goal-header">
              <span class="bottle-goal-emoji" id="bottle-goal-emoji">🎽</span>
              <div>
                <h3>Saving up for: <span id="bottle-goal-title">Crew Hoodies for all 5</span></h3>
                <p class="bottle-goal-desc" id="bottle-goal-desc">Matching Fab 5 hoodies so every kid has one, every adventure.</p>
              </div>
            </div>
            <div class="bottle-progress-wrap">
              <div class="bottle-progress-bar"><div class="bottle-progress-fill" id="bottle-progress-fill" style="width:0%"></div></div>
              <div class="bottle-progress-numbers">
                <span class="bottle-raised">💰 Raised: <strong id="bottle-raised">$0</strong></span>
                <span class="bottle-target">🎯 Goal: <strong id="bottle-target">$375</strong></span>
                <span class="bottle-percent" id="bottle-percent">0%</span>
              </div>
            </div>
            <p class="bottle-bottles-count" id="bottle-bottles-count">That's about <strong>0 bottles</strong> still to find! 🥤</p>
          </div>

          <div class="bottle-share-card">
            <h3>📣 Share with people we know</h3>
            <p>Spread the link to family, your parents' workmates, grandparents, neighbours — anyone you trust. The more bottle-hunters, the faster we hit the goal!</p>
            <div class="bottle-share-buttons">
              <button id="bottle-copy-btn" class="btn btn-secondary">📋 Copy the link</button>
              <a id="bottle-whatsapp-btn" class="btn btn-tertiary" target="_blank" rel="noopener noreferrer">💬 Send via WhatsApp</a>
              <a id="bottle-sms-btn" class="btn btn-quaternary">📱 Send via SMS</a>
              <a id="bottle-email-btn" class="btn btn-primary">✉️ Send via Email</a>
            </div>
            <div id="bottle-copy-msg" class="bottle-copy-msg"></div>
          </div>

          <div class="bottle-heroes-card">
            <h3>🌟 Bottle Heroes</h3>
            <p class="bottle-heroes-sub">A thank you to the legends who are donating their bottles to the crew 💛</p>
            <div id="bottle-heroes-list" class="bottle-heroes-list">
              <div class="loading">No heroes added yet — be the first! 🌟</div>
            </div>
            <details class="bottle-hero-form-wrap">
              <summary>➕ Add a bottle hero (parent admin)</summary>
              <form id="bottle-hero-form" class="bottle-hero-form">
                <div class="form-row">
                  <label><span>Hero name</span><input type="text" id="hero-name" required maxlength={80} placeholder="e.g. Ace's grandma" /></label>
                  <label><span>Month</span><input type="text" id="hero-month" maxlength={30} placeholder="e.g. June 2026" /></label>
                </div>
                <label><span>Short thank-you note (optional)</span><input type="text" id="hero-note" maxlength={200} placeholder="e.g. Brought 80 bottles in one go!" /></label>
                <button type="submit" class="btn btn-primary">🌟 Add hero</button>
                <div id="hero-msg"></div>
              </form>
            </details>
          </div>

          <details class="bottle-admin-card">
            <summary>🔧 Update goal & total (parent admin)</summary>
            <div class="bottle-admin-body">
              <form id="bottle-goal-form" class="bottle-goal-form">
                <h4>🎯 Change what we're saving up for</h4>
                <div class="form-row">
                  <label><span>Goal title</span><input type="text" id="goal-title" maxlength={120} placeholder="e.g. Crew Hoodies for all 5" /></label>
                  <label><span>Emoji</span><input type="text" id="goal-emoji" maxlength={4} placeholder="🎽" /></label>
                </div>
                <div class="form-row">
                  <label><span>Target $AUD</span><input type="number" id="goal-target" min="0" step="1" placeholder="375" /></label>
                  <label><span>Short description</span><input type="text" id="goal-desc" maxlength={400} placeholder="Matching hoodies..." /></label>
                </div>
                <button type="submit" class="btn btn-secondary">💾 Save goal</button>
              </form>

              <form id="bottle-raised-form" class="bottle-raised-form">
                <h4>💰 Update how much we've raised</h4>
                <p class="field-hint">A parent logs into Containers for Change once a month, checks the team total, and types it in here.</p>
                <label><span>Total raised $AUD</span><input type="number" id="raised-amount" min="0" step="0.01" placeholder="e.g. 87.50" /></label>
                <button type="submit" class="btn btn-secondary">💾 Update total</button>
                <div id="raised-msg"></div>
              </form>
            </div>
          </details>
        </section>

        {/* 📊 PARENTS' DASHBOARD — kid profiles, allergy safety, spending overview */}
        <section class="section parents-dashboard-section" id="parents-dashboard">
          <h2 class="section-title">📊 Parents' Dashboard</h2>
          <p class="section-subtitle">Mums, dads, grown-ups — this is your space. Set up each kid once, and the whole site gets smarter. 💛</p>

          <div class="dash-intro-card">
            <p>
              <strong>Why fill these in?</strong> When each kid has a profile, Pebbles can write personalised birthday messages,
              the snack pack auto-fills with their favourites, allergy warnings appear on every event flyer 🛡️,
              and the Crew Playlist gets each kid's hype song. <strong>One small form → six features get smarter.</strong>
            </p>
          </div>

          <div id="kid-profiles-grid" class="kid-profiles-grid">
            {/* Populated by app.js */}
          </div>

          <details class="dash-overview-card">
            <summary>📈 Crew overview at a glance</summary>
            <div class="dash-overview-body" id="dash-overview-body">
              {/* Populated by app.js — totals, upcoming events count, photo count, etc */}
            </div>
          </details>
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
            <button data-prompt="How do I be a Fab 5 kid? Teach me the Fab 5 Ways and pick your favourite family-classic slogans for me.">🐾 How to be a Fab 5 kid</button>
            <button data-prompt="Plan a kayaking trip next Saturday at Lake MacDonald with all 5 of us">🛶 Plan kayak</button>
            <button data-prompt="Who should be Leader of the Day next? Check the rotation fairness.">🎖️ Next leader</button>
            <button data-prompt="Award Ace the Kind Heart badge — he shared his snacks with the crew when someone forgot lunch">🏆 Award badge</button>
            <button data-prompt="How much does a wakeboarding day cost?">💰 Costs</button>
            <button data-prompt="Add Olivia Rodrigo's next Brisbane concert to our wishlist">🎵 Add concert</button>
            <button data-prompt="Where do I join the bottle squad? How does Containers for Change work for our club?">🥤 Join bottle squad</button>
            <button data-prompt="Plan a bottle hunt adventure for the Fab 5 — somewhere we can collect bottles and have fun">🛟 Plan a bottle hunt</button>
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
