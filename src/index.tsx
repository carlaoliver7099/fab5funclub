import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  CLUB_PASSWORD: string
  PROFILES_KV: KVNamespace
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
  // ----- FUN FACTS (added per Saia's request) -----
  favouriteColour?: string         // friendly name e.g. "Hot Pink"
  favouriteColourHex?: string      // e.g. "#FF6B9D" for the swatch
  favouriteFood?: string           // e.g. "Margherita pizza"
  favouriteAnimal?: string         // e.g. "Sea turtle"
  favouriteMovie?: string          // e.g. "Lilo & Stitch"
  favouriteSport?: string          // e.g. "Wakeboarding"
  superpower?: string              // pretend superpower e.g. "Bouncing back from anything"
  dreamHoliday?: string            // e.g. "Hawaii to swim with turtles"
}
// Seeded with the 5 known members (and Pebbles too — she gets her own profile!)
// Fun facts are PLAYFUL PLACEHOLDERS — Saia & crew can update them anytime
const KID_PROFILES: Record<string, KidProfile> = {
  'Ace': {
    name: 'Ace',
    favouriteColour: 'Ocean Aqua',
    favouriteColourHex: '#A0E7E5',
    favouriteFood: 'Cheeseburger with extra pickles',
    favouriteAnimal: 'Sea turtle 🐢',
    favouriteMovie: 'Surf\'s Up',
    favouriteSport: 'Skateboarding 🛹',
    superpower: 'Landing tricks first try',
    dreamHoliday: 'Hawaii — surfing all day',
    hypeSong: { title: 'Pump It', artist: 'Black Eyed Peas' },
  },
  'Charlotte': {
    name: 'Charlotte',
    favouriteColour: 'Sunshine Yellow',
    favouriteColourHex: '#FFE66D',
    favouriteFood: 'Mango smoothie bowl',
    favouriteAnimal: 'Dolphin 🐬',
    favouriteMovie: 'Moana',
    favouriteSport: 'Surfing 🏄‍♀️',
    superpower: 'Riding the BIG waves without flinching',
    dreamHoliday: 'Fiji to chase waves',
    hypeSong: { title: 'How Far I\'ll Go', artist: 'Auliʻi Cravalho' },
  },
  'Elijah': {
    name: 'Elijah',
    favouriteColour: 'Turquoise',
    favouriteColourHex: '#4ECDC4',
    favouriteFood: 'Spaghetti bolognese',
    favouriteAnimal: 'Cheetah 🐆',
    favouriteMovie: 'Cars',
    favouriteSport: 'Motocross 🏍️',
    superpower: 'Going FULL throttle then stopping on a dime',
    dreamHoliday: 'Outback dirt-bike camp',
    hypeSong: { title: 'Thunderstruck', artist: 'AC/DC' },
  },
  'Saia': {
    name: 'Saia',
    favouriteColour: 'Hot Pink',
    favouriteColourHex: '#FF6B9D',
    favouriteFood: 'Sushi rolls 🍣',
    favouriteAnimal: 'Pebbles obviously 🐾',
    favouriteMovie: 'Pets 2',
    favouriteSport: 'Kayaking 🛶',
    superpower: 'Leading the crew with kindness',
    dreamHoliday: 'A road trip with all the crew + Pebbles',
    hypeSong: { title: 'Pink Pony Club', artist: 'Chappell Roan', spotifyId: '0kfRfeQU0Aw1SOaiYS6Vg7' },
  },
  'Sienna': {
    name: 'Sienna',
    favouriteColour: 'Mint Lime',
    favouriteColourHex: '#B4F8C8',
    favouriteFood: 'Strawberry pancakes',
    favouriteAnimal: 'Unicorn 🦄 (close second: koala)',
    favouriteMovie: 'Trolls',
    favouriteSport: 'Snorkeling 🤿',
    superpower: 'Spotting rainbows even when it\'s not raining',
    dreamHoliday: 'Great Barrier Reef snorkel trip',
    hypeSong: { title: 'vampire', artist: 'Olivia Rodrigo', spotifyId: '1kuGVB7EU95pJObxwvfwKS' },
  },
  'Pebbles': {
    name: 'Pebbles',
    spark: 'The crew\'s loyal Bull Arab — wise, kind, slightly chaotic 🐾',
    favouriteColour: 'Bull Arab Brown',
    favouriteColourHex: '#D2691E',
    favouriteFood: 'Roast chicken (any time, any day)',
    favouriteAnimal: 'Other dogs — especially fluffy ones',
    favouriteMovie: 'Bluey (if cartoons count)',
    favouriteSport: 'Beach sprints + zoomies',
    superpower: 'Knowing exactly which kid needs a cuddle',
    dreamHoliday: 'A beach with no leash rule and infinite sticks',
  },
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

// =========== 📔 ADVENTURE DIARY (Pebbles writes story-style memories) ===========
type DiaryEntry = {
  id: string
  eventId?: string           // optional link back to the event
  title: string              // "The Lake MacDonald Kayak Day"
  story: string              // Pebbles-written 2-3 paragraph story
  mentionedMembers: string[]
  createdAt: number
  date?: string              // when the adventure happened
}
const DIARY: DiaryEntry[] = []

// =========== 🗺️ ADVENTURE MAP (SE QLD pins) ===========
type AdventureSpot = {
  id: string
  name: string                                 // "Lake MacDonald", "Maleny Botanic Gardens"
  emoji: string
  lat: number
  lon: number
  status: 'visited' | 'planned' | 'wishlist'
  notes?: string
  addedAt: number
  visitedCount?: number                        // how many adventures here
}
// Seeded with some classic SE QLD adventure spots
const ADVENTURE_SPOTS: AdventureSpot[] = [
  { id: 'spot-lake-macdonald', name: 'Lake MacDonald', emoji: '🛶', lat: -26.3833, lon: 152.9667, status: 'wishlist', notes: 'Kayaking paradise', addedAt: Date.now() },
  { id: 'spot-noosa-main',     name: 'Noosa Main Beach', emoji: '🏖️', lat: -26.3833, lon: 153.0900, status: 'wishlist', notes: 'Swim + ice cream day', addedAt: Date.now() },
  { id: 'spot-maleny',         name: 'Maleny Botanic Gardens', emoji: '🌳', lat: -26.7567, lon: 152.8542, status: 'wishlist', notes: 'Bird walk + picnic', addedAt: Date.now() },
  { id: 'spot-eumundi',        name: 'Eumundi Markets', emoji: '🎪', lat: -26.4769, lon: 152.9494, status: 'wishlist', notes: 'Wednesday/Saturday markets', addedAt: Date.now() },
  { id: 'spot-glasshouse',     name: 'Glass House Mountains', emoji: '⛰️', lat: -26.9000, lon: 152.9500, status: 'wishlist', notes: 'Hiking + lookouts', addedAt: Date.now() },
  { id: 'spot-mooloolaba',     name: 'Mooloolaba Beach', emoji: '🌊', lat: -26.6817, lon: 153.1192, status: 'wishlist', notes: 'Sealife centre + boardwalk', addedAt: Date.now() },
]

// =========== 🎯 CREW CHALLENGES OF THE WEEK ===========
type Challenge = {
  id: string
  weekStart: string          // YYYY-MM-DD of Monday
  title: string
  description: string
  emoji: string
  category: 'kindness' | 'nature' | 'creativity' | 'team' | 'skill'
  completedBy: string[]      // member names who completed it
  createdAt: number
}
const CHALLENGES: Challenge[] = []
// Bank of challenges Pebbles rotates through
const CHALLENGE_BANK: Omit<Challenge, 'id'|'weekStart'|'completedBy'|'createdAt'>[] = [
  { title: 'Catch a sunrise together', description: 'Wake up early one morning and watch the sun come up as a crew. Bring hot chocolate.', emoji: '🌅', category: 'team' },
  { title: 'Teach each other one new word', description: 'Every kid picks a cool word and teaches the others what it means. Bonus points for big ones!', emoji: '📚', category: 'creativity' },
  { title: 'Do something kind for someone outside the crew', description: 'A neighbour, a teacher, a stranger. No selfies — just kindness.', emoji: '💛', category: 'kindness' },
  { title: 'Build something together', description: 'A sandcastle, a cubby, a Lego masterpiece. Build it together, no leader.', emoji: '🏗️', category: 'team' },
  { title: 'Try a food none of you have tried', description: 'Adventurous taste buds! Vote on which was the best.', emoji: '🍽️', category: 'skill' },
  { title: 'Make a TikTok with a kindness message', description: 'Use your platform for good vibes only.', emoji: '📱', category: 'kindness' },
  { title: 'Pick up 10 pieces of rubbish on a walk', description: 'Bonus: count how many are bottles for the bottle fund!', emoji: '🌍', category: 'nature' },
  { title: 'Write a letter to someone you appreciate', description: 'Old-school paper, real envelope, real stamp. Make their day.', emoji: '💌', category: 'kindness' },
  { title: 'Spend 30 minutes outside with no phones', description: 'Find a tree, lie under it, talk about anything. Phones in pockets.', emoji: '🌳', category: 'nature' },
  { title: 'Compliment three people you don\'t know well', description: 'Specific compliments only — "I like your shoes" doesn\'t count unless you mean it!', emoji: '🌟', category: 'kindness' },
  { title: 'Cook a meal together', description: 'Each kid does one part. Take a photo of the result.', emoji: '👨‍🍳', category: 'skill' },
  { title: 'Learn each other\'s favourite song lyrics', description: 'Sing-along on the next adventure mandatory.', emoji: '🎵', category: 'creativity' },
]

// =========== 📸 PHOTO CAPTION BATTLE ===========
type CaptionBattle = {
  id: string
  galleryItemId: string        // links to GALLERY item
  captions: { id: string; text: string; author: 'pebbles' | string; votes: string[] }[]
  status: 'voting' | 'closed'
  createdAt: number
}
const CAPTION_BATTLES: CaptionBattle[] = []

// =========== 💌 PEBBLES POSTCARDS (for kids who missed) ===========
type Postcard = {
  id: string
  toMember: string             // kid who missed
  fromEventId?: string         // event they missed
  fromEventTitle?: string
  message: string              // Pebbles-written warm message
  createdAt: number
}
const POSTCARDS: Postcard[] = []

// =========== 🌟 HALL OF FAME (computed live, no store needed but cache) ===========
// (No store — computed from EVENTS + AWARDS + GALLERY on demand)

// =========== 🎂 BIRTHDAY BRAIN (computed from KID_PROFILES) ===========
// (No store — computed from KID_PROFILES.birthday on demand)

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
    // pillars = which DofE sections this counts toward. Hours = typical duration.
    // Pillars: 'physical' | 'skills' | 'service' | 'adventure'
    { name: 'Motocross (MX)', emoji: '🏍️', category: 'Wheels', pillars: ['physical', 'skills'], hours: 3 },
    { name: 'Enduro Trails', emoji: '🌲', category: 'Wheels', pillars: ['physical', 'adventure'], hours: 3 },
    { name: 'Go Karting', emoji: '🏎️', category: 'Wheels', pillars: ['skills'], hours: 2 },
    { name: 'Skateboarding', emoji: '🛹', category: 'Wheels', pillars: ['physical', 'skills'], hours: 2 },
    { name: 'Rollerskating', emoji: '🛼', category: 'Wheels', pillars: ['physical'], hours: 2 },
    { name: 'Kayaking', emoji: '🛶', category: 'Water', pillars: ['physical', 'adventure'], hours: 3 },
    { name: 'Snorkeling', emoji: '🤿', category: 'Water', pillars: ['physical', 'adventure'], hours: 2 },
    { name: 'Stand Up Paddle Boarding', emoji: '🏄', category: 'Water', pillars: ['physical'], hours: 2 },
    { name: 'Wakeboarding', emoji: '🌊', category: 'Water', pillars: ['physical', 'skills'], hours: 2 },
    { name: 'Water Skiing', emoji: '🎿', category: 'Water', pillars: ['physical', 'skills'], hours: 2 },
    { name: 'Jet Skiing', emoji: '🚤', category: 'Water', pillars: ['skills'], hours: 2 },
    { name: 'Sailing', emoji: '⛵', category: 'Water', pillars: ['skills', 'adventure'], hours: 3 },
    { name: '6HP Boating', emoji: '🚣', category: 'Water', pillars: ['skills'], hours: 3 },
    { name: 'Aqua Park Inflatables', emoji: '🎈', category: 'Water', pillars: ['physical'], hours: 2 },
    { name: 'Waterfalls & Creeks', emoji: '💦', category: 'Adventure', pillars: ['physical', 'adventure'], hours: 4 },
    { name: 'Canyoning', emoji: '🏞️', category: 'Adventure', pillars: ['physical', 'adventure'], hours: 5 },
    { name: 'Caving', emoji: '🕳️', category: 'Adventure', pillars: ['adventure', 'skills'], hours: 4 },
    { name: 'Abseiling', emoji: '🧗', category: 'Adventure', pillars: ['physical', 'skills', 'adventure'], hours: 3 },
    { name: 'Trekking', emoji: '🥾', category: 'Adventure', pillars: ['physical', 'adventure'], hours: 4 },
    { name: 'Camping', emoji: '⛺', category: 'Adventure', pillars: ['skills', 'adventure'], hours: 12 },
    { name: 'First Aid Training', emoji: '⛑️', category: 'Skills', pillars: ['skills', 'service'], hours: 2 },
    { name: 'Survival Skills', emoji: '🧭', category: 'Skills', pillars: ['skills', 'adventure'], hours: 3 },
    { name: 'Theme Parks', emoji: '🎢', category: 'Fun', pillars: [], hours: 6 },
    { name: 'Pig Races', emoji: '🐷', category: 'Fun', pillars: [], hours: 3 },
    { name: 'Outback Festivals', emoji: '🤠', category: 'Fun', pillars: ['skills'], hours: 4 },
    // NEW DofE-aligned activities so we can fill every weekend
    { name: 'Beach Cleanup', emoji: '🏖️', category: 'Service', pillars: ['service'], hours: 2 },
    { name: 'Helping at Animal Shelter', emoji: '🐶', category: 'Service', pillars: ['service'], hours: 2 },
    { name: 'Cooking a Family Meal', emoji: '🍳', category: 'Skills', pillars: ['skills', 'service'], hours: 2 },
    { name: 'Photography Walk', emoji: '📸', category: 'Skills', pillars: ['skills'], hours: 2 },
    { name: 'Bushwalking', emoji: '🌳', category: 'Adventure', pillars: ['physical', 'adventure'], hours: 3 },
    { name: 'Surfing Lesson', emoji: '🏄‍♀️', category: 'Water', pillars: ['physical', 'skills'], hours: 2 },
    { name: 'Rock Climbing', emoji: '🧗‍♀️', category: 'Adventure', pillars: ['physical', 'skills'], hours: 2 },
    { name: 'Bike Riding', emoji: '🚴', category: 'Physical', pillars: ['physical'], hours: 2 },
    { name: 'Yoga / Stretching', emoji: '🧘', category: 'Physical', pillars: ['physical'], hours: 1 },
    { name: 'Helping Elderly Neighbour', emoji: '👵', category: 'Service', pillars: ['service'], hours: 1 },
    { name: 'Tutoring Younger Kid', emoji: '📚', category: 'Service', pillars: ['service', 'skills'], hours: 1 },
    { name: 'Learning Knots', emoji: '🪢', category: 'Skills', pillars: ['skills'], hours: 1 },
    { name: 'Map & Compass Navigation', emoji: '🗺️', category: 'Skills', pillars: ['skills', 'adventure'], hours: 2 },
    { name: 'Overnight Hike Expedition', emoji: '⛺', category: 'Adventure', pillars: ['physical', 'skills', 'adventure'], hours: 14 }
  ],
  badges: [
    // Fab 5 Special Values (the 4 Duke-of-Ed-style badges were removed since
    // we now have a dedicated DofE pillar tracking system instead)
    { id: 'team',       name: 'Team Player',      emoji: '🤝', color: '#A06CD5', category: 'Fab 5 Values', desc: '"If you\'re not a team player, you\'re not in the team." — Fab 5 team rule' },
    { id: 'mentor',     name: 'Peer Mentor',      emoji: '👯', color: '#FFE66D', category: 'Fab 5 Values', desc: 'Guided a friend with kindness — not bossy, but supportive.' },
    { id: 'kind',       name: 'Kind Heart',       emoji: '💛', color: '#FF4E8D', category: 'Fab 5 Values', desc: 'Not selfish, not greedy, not impatient — our 3 club rules in action!' },
    { id: 'safety',     name: 'Safety Champ',     emoji: '⛑️', color: '#FFA500', category: 'Fab 5 Values', desc: 'Looked after the team — packed first aid, checked weather, kept everyone safe.' }
  ]
}

// =========== 🏅 DUKE OF EDINBURGH SYLLABUS ===========
// Official DofE Australia framework (as of 2026):
// - Bronze (14+): min 13 weeks per section, ~1hr/week avg, Adventurous Journey 2d/1n @6hr/day
// - Silver  (15+): min 26 weeks per section, ~1hr/week, AJ 3d/2n @7hr/day
// - Gold    (16+): min 52 weeks per section, ~1hr/week, AJ 4d/3n @8hr/day + Gold Residential Project 5d/4n
// 4 Sections (we call them "Pillars"): Voluntary Service, Skills, Physical Recreation, Adventurous Journey
//
// The Fab 5 are 12 (Saia's age) so officially we're "DofE-prep" — building the habit early so when
// each kid hits 14 they have a head start. Same syllabus, same pillars, just kid-friendly framing.
const DOFE_PILLARS = [
  { id: 'physical', name: 'Physical Recreation', emoji: '💪', color: '#FF6B9D', kidTalk: 'Getting fit & moving your body', desc: 'Improve in a physical activity — sport, dance, fitness, anything that gets your heart pumping.' },
  { id: 'skills',   name: 'Skills',              emoji: '🎓', color: '#4ECDC4', kidTalk: 'Learning cool new skills',         desc: 'Develop a personal interest, practical or social skill — cooking, music, photography, first aid, navigation, etc.' },
  { id: 'service',  name: 'Voluntary Service',   emoji: '💛', color: '#FFE66D', kidTalk: 'Helping our community',            desc: 'Help people, animals or the environment without being paid — beach cleanups, tutoring, helping elderly neighbours.' },
  { id: 'adventure',name: 'Adventurous Journey', emoji: '🏔️', color: '#A06CD5', kidTalk: 'Outdoor adventures & expeditions', desc: 'Plan, train for and complete a self-reliant team journey in unfamiliar wild country.' }
] as const

const DOFE_SYLLABUS = {
  bronze: {
    name: 'Bronze',
    emoji: '🥉',
    color: '#CD7F32',
    minAge: 14,
    minWeeksPerSection: 13,
    hoursPerWeekTarget: 1,
    sectionTargetHours: 13,         // 13 weeks × 1 hr (the entry minimum)
    aj: { days: 2, nights: 1, hoursPerDay: 6, totalHours: 12, env: 'Familiar rural area' },
    kidTalk: 'Zero-to-Hero starter — 3 months of consistent effort. You\'ve got this!',
    parentTalk: 'Entry level. ~13 weeks per section + a 2-day/1-night Adventurous Journey in a familiar rural area.'
  },
  silver: {
    name: 'Silver',
    emoji: '🥈',
    color: '#C0C0C0',
    minAge: 15,
    minWeeksPerSection: 26,
    hoursPerWeekTarget: 1,
    sectionTargetHours: 26,
    aj: { days: 3, nights: 2, hoursPerDay: 7, totalHours: 21, env: 'Open country' },
    kidTalk: 'Halfway hero — 6 months of building real depth in your interests.',
    parentTalk: '~26 weeks per section + a 3-day/2-night AJ in open countryside. Builds genuine mastery.'
  },
  gold: {
    name: 'Gold',
    emoji: '🥇',
    color: '#FFD700',
    minAge: 16,
    minWeeksPerSection: 52,
    hoursPerWeekTarget: 1,
    sectionTargetHours: 52,
    aj: { days: 4, nights: 3, hoursPerDay: 8, totalHours: 32, env: 'Wild country' },
    residentialProject: { days: 5, nights: 4, desc: 'Live & work with people you don\'t know on a shared project' },
    kidTalk: 'Legend mode — a full year of leadership, expedition planning and a 5-day residential project.',
    parentTalk: '~52 weeks per section + a 4-day/3-night wild-country AJ + a 5-day/4-night Residential Project. Internationally recognised qualification.'
  }
} as const

// =========== 📅 52-WEEK PROGRESSIVE PLAN — "Zero to Hero" ===========
// Each weekend is mapped to a primary activity + the pillars it builds.
// Bronze foundation (weeks 1-20): light 1-3hr activities, sampling each pillar.
// Silver depth     (weeks 21-40): longer 3-5hr activities, building mastery.
// Gold expedition  (weeks 41-52): overnight hikes, leadership, Gold Project prep.
type WeekPlan = {
  week: number;             // 1-52
  stage: 'bronze' | 'silver' | 'gold';
  activity: string;         // must match an entry in clubData.activities
  pillars: ('physical' | 'skills' | 'service' | 'adventure')[];
  hours: number;
  kidWhy: string;           // kid-language explanation (for Pebbles)
  parentWhy: string;        // syllabus mapping for parents
}

const DOFE_52_WEEK_PLAN: WeekPlan[] = [
  // ───── BRONZE FOUNDATION (weeks 1-20) — sample every pillar, build the habit ─────
  { week: 1,  stage: 'bronze', activity: 'Beach Cleanup',             pillars: ['service'],                          hours: 2, kidWhy: 'Easy win — pick up rubbish at the beach and help our coast stay beautiful!',                       parentWhy: 'Voluntary Service intro — first hour toward Bronze Service requirement.' },
  { week: 2,  stage: 'bronze', activity: 'Bushwalking',               pillars: ['physical','adventure'],             hours: 3, kidWhy: 'Walking in the bush is sneaky exercise AND it gets you used to being outdoors.',                  parentWhy: 'Physical + Adventure pillars. Builds endurance baseline for future Adventurous Journeys.' },
  { week: 3,  stage: 'bronze', activity: 'Cooking a Family Meal',     pillars: ['skills','service'],                 hours: 2, kidWhy: 'Cooking is a life skill AND helping family counts as service. Two-for-one!',                       parentWhy: 'Skills section start + service hours. Kitchen safety, planning, nutrition.' },
  { week: 4,  stage: 'bronze', activity: 'Bike Riding',               pillars: ['physical'],                          hours: 2, kidWhy: 'Cycling builds the leg strength you\'ll need for big hikes later.',                                parentWhy: 'Physical Recreation — cardio base. Helmet & road safety reinforcement.' },
  { week: 5,  stage: 'bronze', activity: 'Learning Knots',            pillars: ['skills'],                            hours: 1, kidWhy: 'Knots look small but they save lives on real expeditions. Bowline, clove hitch, reef knot!',         parentWhy: 'Skills + future Adventurous Journey prep — knots are core bushcraft.' },
  { week: 6,  stage: 'bronze', activity: 'Helping Elderly Neighbour', pillars: ['service'],                           hours: 1, kidWhy: 'Mow a lawn, bring in bins, have a chat — older neighbours LOVE this.',                            parentWhy: 'Voluntary Service hour + community connection.' },
  { week: 7,  stage: 'bronze', activity: 'Kayaking',                  pillars: ['physical','adventure'],              hours: 3, kidWhy: 'Paddling the Maroochy River = arms workout + adventure points!',                                parentWhy: 'Physical + Adventure. Water safety, PFD use, river awareness.' },
  { week: 8,  stage: 'bronze', activity: 'Photography Walk',          pillars: ['skills'],                            hours: 2, kidWhy: 'Slow down and notice the world. Bring a phone and capture 10 cool photos.',                       parentWhy: 'Skills section — visual literacy, composition, observation.' },
  { week: 9,  stage: 'bronze', activity: 'Yoga / Stretching',         pillars: ['physical'],                          hours: 1, kidWhy: 'Flexibility = fewer injuries on big adventures. Plus it feels good!',                             parentWhy: 'Physical pillar diversification — mobility, recovery, mindfulness.' },
  { week: 10, stage: 'bronze', activity: 'Helping at Animal Shelter', pillars: ['service'],                           hours: 2, kidWhy: 'Walk dogs, clean cat enclosures, cuddle puppies. Pebbles approves! 🐾',                          parentWhy: 'Voluntary Service — empathy, responsibility, working with animals.' },
  { week: 11, stage: 'bronze', activity: 'First Aid Training',        pillars: ['skills','service'],                  hours: 2, kidWhy: 'Learn how to actually help if someone gets hurt. Real superhero stuff.',                          parentWhy: 'Skills + Service. Foundation for all future outdoor activities.' },
  { week: 12, stage: 'bronze', activity: 'Skateboarding',             pillars: ['physical','skills'],                 hours: 2, kidWhy: 'Balance + persistence. You\'ll fall — and getting back up IS the skill.',                          parentWhy: 'Physical + Skills. Helmet/pads emphasis. Resilience training.' },
  { week: 13, stage: 'bronze', activity: 'Tutoring Younger Kid',      pillars: ['service','skills'],                  hours: 1, kidWhy: 'Helping a younger kid with reading or maths — you teach AND learn.',                              parentWhy: 'Service hour + leadership/communication skill. 🎯 Bronze Service threshold often hit this week.' },
  { week: 14, stage: 'bronze', activity: 'Map & Compass Navigation',  pillars: ['skills','adventure'],                hours: 2, kidWhy: 'GPS dies but a compass NEVER does. Old-school navigation = adventure unlock.',                    parentWhy: 'Skills + Adventure prep. Essential for any future expedition.' },
  { week: 15, stage: 'bronze', activity: 'Snorkeling',                pillars: ['physical','adventure'],              hours: 2, kidWhy: 'Mooloolaba reef is RIGHT THERE. Fish, turtles, maybe an octopus!',                                parentWhy: 'Physical + Adventure. Ocean awareness, breathing technique.' },
  { week: 16, stage: 'bronze', activity: 'Surfing Lesson',            pillars: ['physical','skills'],                 hours: 2, kidWhy: 'Living on the Sunny Coast and NOT surfing? Crime. Time to fix that.',                             parentWhy: 'Physical + Skills. Surf safety, rip awareness, board control.' },
  { week: 17, stage: 'bronze', activity: 'Rock Climbing',             pillars: ['physical','skills'],                 hours: 2, kidWhy: 'Indoor walls or Mt Tibrogargan — climbing builds grip + bravery.',                                parentWhy: 'Physical + Skills. Belay technique, harness check, risk management.' },
  { week: 18, stage: 'bronze', activity: 'Survival Skills',           pillars: ['skills','adventure'],                hours: 3, kidWhy: 'Build a fire, set up a tarp, find north. Real bush-kid stuff.',                                  parentWhy: 'Skills + Adventure. Critical AJ prerequisite knowledge.' },
  { week: 19, stage: 'bronze', activity: 'Trekking',                  pillars: ['physical','adventure'],              hours: 4, kidWhy: 'A proper day-walk — 10km+ on real trails. Your AJ is getting close!',                            parentWhy: 'Physical + Adventure. Pre-AJ conditioning, pack weight practice.' },
  { week: 20, stage: 'bronze', activity: 'Camping',                   pillars: ['skills','adventure'],                hours: 12, kidWhy: 'BRONZE ADVENTUROUS JOURNEY! 2 days, 1 night, 6hrs/day of walking. You did it! 🥉',                  parentWhy: '🥉 BRONZE AJ COMPLETE — 2d/1n in familiar rural area. Bronze qualification milestone.' },

  // ───── SILVER DEPTH (weeks 21-40) — go deeper, longer, more skilled ─────
  { week: 21, stage: 'silver', activity: 'Bushwalking',               pillars: ['physical','adventure'],              hours: 4, kidWhy: 'Now we go FURTHER. Same trails, longer distance. Silver wants endurance.',                       parentWhy: 'Silver Physical block begins — building 26-week consistency.' },
  { week: 22, stage: 'silver', activity: 'Cooking a Family Meal',     pillars: ['skills','service'],                  hours: 3, kidWhy: 'Plan + shop + cook a whole meal for the family. You\'re the chef tonight!',                       parentWhy: 'Silver Skills — moving from following recipes to meal planning autonomy.' },
  { week: 23, stage: 'silver', activity: 'Abseiling',                 pillars: ['physical','skills','adventure'],     hours: 3, kidWhy: 'Walking DOWN a cliff backwards on a rope. Yes, really. Yes, you\'ll love it.',                    parentWhy: 'Triple-pillar — Physical + Skills + Adventure. Advanced rope work.' },
  { week: 24, stage: 'silver', activity: 'Beach Cleanup',             pillars: ['service'],                           hours: 3, kidWhy: 'Lead a beach cleanup this time — invite friends, bring bags, document it!',                       parentWhy: 'Silver Service — leadership element added. Community organising practice.' },
  { week: 25, stage: 'silver', activity: 'Sailing',                   pillars: ['skills','adventure'],                hours: 3, kidWhy: 'Wind power!! Learn to read wind, tack, gybe. Pure problem-solving.',                              parentWhy: 'Skills + Adventure. Lake Cootharaba sailing — wind awareness, capsize drill.' },
  { week: 26, stage: 'silver', activity: 'Mountain Biking',           pillars: ['physical','adventure'],              hours: 3, kidWhy: 'Trail riding > road riding. Roots, rocks, drops — bike handling levels up.',                       parentWhy: 'Physical + Adventure. Helmet/gloves/elbow-knee pads non-negotiable.' },
  { week: 27, stage: 'silver', activity: 'Photography Walk',          pillars: ['skills'],                            hours: 3, kidWhy: 'This time PICK A THEME — light, water, faces — and shoot only that.',                              parentWhy: 'Silver Skills depth — moving from snapshot to intentional composition.' },
  { week: 28, stage: 'silver', activity: 'Tutoring Younger Kid',      pillars: ['service','skills'],                  hours: 2, kidWhy: 'Weekly tutoring now — same kid, same time. Real impact takes weeks.',                            parentWhy: 'Silver Service consistency — weekly recurring volunteer commitment.' },
  { week: 29, stage: 'silver', activity: 'Waterfalls & Creeks',       pillars: ['physical','adventure'],              hours: 4, kidWhy: 'Kondalilla Falls full circuit. Steep stairs. Worth every step.',                                parentWhy: 'Physical + Adventure. Slippery surfaces awareness, group pace management.' },
  { week: 30, stage: 'silver', activity: 'First Aid Training',        pillars: ['skills','service'],                  hours: 3, kidWhy: 'Refresher + new stuff — snake bite, asthma, choking, CPR. Critical AJ prep.',                     parentWhy: 'Silver Skills + Service. Mandatory AJ pre-requisite at deeper level.' },
  { week: 31, stage: 'silver', activity: 'Canyoning',                 pillars: ['physical','adventure'],              hours: 5, kidWhy: 'Down through a canyon — sliding, swimming, abseiling. ELITE adventure.',                         parentWhy: 'Physical + Adventure. Experienced guide required. Drysuits/helmets.' },
  { week: 32, stage: 'silver', activity: 'Helping at Animal Shelter', pillars: ['service'],                           hours: 3, kidWhy: 'Weekly shelter shift now. Get to know the dogs by name. You\'re a regular.',                      parentWhy: 'Silver Service ramp — sustained relationship with one organisation.' },
  { week: 33, stage: 'silver', activity: 'Wakeboarding',              pillars: ['physical','skills'],                 hours: 2, kidWhy: 'Behind the boat, riding the wake. Falling is mandatory. Standing up = victory.',                  parentWhy: 'Physical + Skills. Lake Borumba — PFD, hand signals, towrope safety.' },
  { week: 34, stage: 'silver', activity: 'Map & Compass Navigation',  pillars: ['skills','adventure'],                hours: 3, kidWhy: 'Triangulation, bearings, contour reading. Real bush-nav, no phone needed.',                       parentWhy: 'Silver Skills + Adventure. Pre-Silver-AJ technical requirement.' },
  { week: 35, stage: 'silver', activity: 'Yoga / Stretching',         pillars: ['physical'],                          hours: 2, kidWhy: 'Weekly flexibility — your body will thank you for the big trek coming up.',                       parentWhy: 'Physical pillar — injury prevention prep for upcoming Silver AJ.' },
  { week: 36, stage: 'silver', activity: 'Outback Festivals',         pillars: ['skills'],                            hours: 4, kidWhy: 'Visit an outback show — animals, crafts, country skills. Cultural skill-up.',                     parentWhy: 'Skills section — cultural literacy, Aussie heritage, regional connection.' },
  { week: 37, stage: 'silver', activity: 'Caving',                    pillars: ['adventure','skills'],                hours: 4, kidWhy: 'Underground — helmet lamp, squeezes, crystal chambers. Earth\'s secret rooms.',                    parentWhy: 'Adventure + Skills. Experienced caver guide. Safety brief mandatory.' },
  { week: 38, stage: 'silver', activity: 'Trekking',                  pillars: ['physical','adventure'],              hours: 5, kidWhy: 'Big day trek — 15km+ with a 5kg pack. Your AJ is days away. Train hard!',                          parentWhy: 'Pre-Silver-AJ conditioning. Pack weight + distance build.' },
  { week: 39, stage: 'silver', activity: 'Survival Skills',           pillars: ['skills','adventure'],                hours: 4, kidWhy: 'Final prep — water purification, shelter from scratch, fire in the rain.',                        parentWhy: 'Skills + Adventure. Silver AJ readiness check.' },
  { week: 40, stage: 'silver', activity: 'Overnight Hike Expedition', pillars: ['physical','skills','adventure'],     hours: 21, kidWhy: 'SILVER ADVENTUROUS JOURNEY!! 3 days, 2 nights, 7hrs/day. You\'re a Silver hero! 🥈',                parentWhy: '🥈 SILVER AJ COMPLETE — 3d/2n in open country, 7hr/day. Silver qualification milestone.' },

  // ───── GOLD EXPEDITION (weeks 41-52) — leadership, residential, the full hero arc ─────
  { week: 41, stage: 'gold',   activity: 'Bushwalking',               pillars: ['physical','adventure'],              hours: 5, kidWhy: 'Gold prep starts. You\'re leading newer kids on a trail YOU planned.',                          parentWhy: 'Gold Physical + leadership element. Self-directed planning required.' },
  { week: 42, stage: 'gold',   activity: 'Tutoring Younger Kid',      pillars: ['service','skills'],                  hours: 2, kidWhy: 'You\'ve been tutoring for months now — train a NEW tutor. Multiplier effect.',                    parentWhy: 'Gold Service — leadership through mentoring other volunteers.' },
  { week: 43, stage: 'gold',   activity: 'Rock Climbing',             pillars: ['physical','skills'],                 hours: 3, kidWhy: 'Outdoor lead climbing now — placing your own gear. Trust your training.',                        parentWhy: 'Gold Physical + Skills. Lead climbing instructor required. Advanced ropework.' },
  { week: 44, stage: 'gold',   activity: 'Beach Cleanup',             pillars: ['service'],                           hours: 4, kidWhy: 'Organise the WHOLE event — permits, social media, volunteers. Gold-level service.',                parentWhy: 'Gold Service leadership — event organisation, public engagement.' },
  { week: 45, stage: 'gold',   activity: 'Map & Compass Navigation',  pillars: ['skills','adventure'],                hours: 3, kidWhy: 'Nav class — YOU teach the younger kids. Best way to master something.',                          parentWhy: 'Gold Skills + leadership. Teaching = deepest learning.' },
  { week: 46, stage: 'gold',   activity: 'Canyoning',                 pillars: ['physical','adventure'],              hours: 6, kidWhy: 'Multi-canyon day — Cedar Creek + Booloumba. Big logistics, bigger memories.',                     parentWhy: 'Gold Physical + Adventure. Complex multi-stage trip planning practice.' },
  { week: 47, stage: 'gold',   activity: 'First Aid Training',        pillars: ['skills','service'],                  hours: 4, kidWhy: 'Wilderness First Aid now — multi-day care, evacuation decisions. Pro level.',                      parentWhy: 'Gold Skills + Service. Wilderness First Aid certification — Gold AJ requirement.' },
  { week: 48, stage: 'gold',   activity: 'Survival Skills',           pillars: ['skills','adventure'],                hours: 5, kidWhy: 'Solo bivvy night — sleep out with just a tarp + sleeping bag. You\'ve got this.',                  parentWhy: 'Gold Skills + Adventure. Self-reliance assessment. Adult supervision nearby.' },
  { week: 49, stage: 'gold',   activity: 'Cooking a Family Meal',     pillars: ['skills','service'],                  hours: 4, kidWhy: 'Cook a 3-course meal for 10 people. Menu, shopping, timing — full restaurant mode.',                parentWhy: 'Gold Skills — complex multi-task project execution under time pressure.' },
  { week: 50, stage: 'gold',   activity: 'Trekking',                  pillars: ['physical','adventure'],              hours: 6, kidWhy: 'Final long-day trek — 20km+ with 8kg pack. Your Gold AJ is THIS WEEKEND-but-one.',                   parentWhy: 'Final Gold AJ conditioning peak — full pack weight, full distance.' },
  { week: 51, stage: 'gold',   activity: 'Helping at Animal Shelter', pillars: ['service'],                           hours: 5, kidWhy: 'GOLD RESIDENTIAL — 5 days/4 nights staying at an animal sanctuary working with strangers.',          parentWhy: '🥇 GOLD RESIDENTIAL PROJECT — 5d/4n shared purpose with unfamiliar group.' },
  { week: 52, stage: 'gold',   activity: 'Overnight Hike Expedition', pillars: ['physical','skills','adventure'],     hours: 32, kidWhy: 'GOLD ADVENTUROUS JOURNEY!!! 4 days, 3 nights, 8hrs/day, wild country. YOU ARE THE HERO. 🥇',     parentWhy: '🥇 GOLD AJ COMPLETE — 4d/3n in wild country, 8hr/day. Gold qualification achieved.' }
]

// Helper: today's ISO date + which DofE week we're on
// Week 1 starts THIS Saturday — anchor the plan to that date so it auto-progresses.
function getDofeAnchorDate(): string {
  // Anchor = this coming (or current) Saturday at 00:00. Stable for the whole year.
  const d = new Date()
  const day = d.getDay()                      // 0=Sun..6=Sat
  const diff = day === 6 ? 0 : (6 - day + 7) % 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function getCurrentDofeWeek(): WeekPlan {
  const anchor = new Date(getDofeAnchorDate() + 'T00:00:00')
  const now = new Date()
  // If we haven't reached anchor yet, we're on week 1.
  const daysSince = Math.floor((now.getTime() - anchor.getTime()) / 86400000)
  let weekIndex = Math.floor(daysSince / 7)
  if (weekIndex < 0) weekIndex = 0
  if (weekIndex > 51) weekIndex = weekIndex % 52  // wrap around for year 2+
  return DOFE_52_WEEK_PLAN[weekIndex]
}

// Helper: compute a kid's DofE progress (pillar hours + stage %) from their attended events.
type PillarHours = { physical: number; skills: number; service: number; adventure: number }
function computeDofeProgressFor(memberName: string): {
  pillarHours: PillarHours;
  totalHours: number;
  bronze: { pillars: Record<string, number>; complete: boolean; percent: number };
  silver: { pillars: Record<string, number>; complete: boolean; percent: number };
  gold:   { pillars: Record<string, number>; complete: boolean; percent: number };
  currentStage: 'starter' | 'bronze' | 'silver' | 'gold' | 'legend';
  ajCompleted: { bronze: boolean; silver: boolean; gold: boolean };
} {
  // Build activity → {pillars, hours} lookup from CLUB_INFO
  const activityLookup: Record<string, { pillars: string[]; hours: number }> = {}
  for (const a of (CLUB_INFO.activities as any[])) {
    activityLookup[a.name] = { pillars: a.pillars || [], hours: a.hours || 0 }
  }
  const pillarHours: PillarHours = { physical: 0, skills: 0, service: 0, adventure: 0 }
  let bronzeAJ = false, silverAJ = false, goldAJ = false
  const today = new Date().toISOString().slice(0, 10)

  for (const ev of EVENTS) {
    if (!ev.members.includes(memberName)) continue
    if (ev.date > today) continue  // only count completed events
    const meta = activityLookup[ev.activity]
    if (!meta) continue
    const hours = meta.hours
    for (const p of meta.pillars) {
      if (p in pillarHours) (pillarHours as any)[p] += hours
    }
    // AJ detection — Camping (Bronze AJ ≥12hr), Overnight Hike Expedition (Silver/Gold AJ)
    if (ev.activity === 'Camping' && hours >= 12) bronzeAJ = true
    if (ev.activity === 'Overnight Hike Expedition') {
      if (hours >= 21) silverAJ = true
      if (hours >= 32) goldAJ = true
    }
  }

  const totalHours = pillarHours.physical + pillarHours.skills + pillarHours.service + pillarHours.adventure

  function stageStatus(target: number) {
    const pillars = {
      physical: Math.min(100, Math.round((pillarHours.physical / target) * 100)),
      skills:   Math.min(100, Math.round((pillarHours.skills   / target) * 100)),
      service:  Math.min(100, Math.round((pillarHours.service  / target) * 100)),
      adventure:Math.min(100, Math.round((pillarHours.adventure/ target) * 100))
    }
    const complete = pillars.physical >= 100 && pillars.skills >= 100 && pillars.service >= 100 && pillars.adventure >= 100
    const percent = Math.round((pillars.physical + pillars.skills + pillars.service + pillars.adventure) / 4)
    return { pillars, complete, percent }
  }

  const bronze = stageStatus(DOFE_SYLLABUS.bronze.sectionTargetHours)
  const silver = stageStatus(DOFE_SYLLABUS.silver.sectionTargetHours)
  const gold   = stageStatus(DOFE_SYLLABUS.gold.sectionTargetHours)

  let currentStage: 'starter' | 'bronze' | 'silver' | 'gold' | 'legend' = 'starter'
  if (bronze.complete && bronzeAJ) currentStage = 'bronze'
  if (silver.complete && silverAJ) currentStage = 'silver'
  if (gold.complete && goldAJ)     currentStage = 'gold'
  if (currentStage === 'gold')     currentStage = 'legend'
  // If you're partway through bronze, you're a "starter"

  return {
    pillarHours,
    totalHours,
    bronze: { pillars: bronze.pillars, complete: bronze.complete && bronzeAJ, percent: bronze.percent },
    silver: { pillars: silver.pillars, complete: silver.complete && silverAJ, percent: silver.percent },
    gold:   { pillars: gold.pillars,   complete: gold.complete && goldAJ,     percent: gold.percent },
    currentStage,
    ajCompleted: { bronze: bronzeAJ, silver: silverAJ, gold: goldAJ }
  }
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

// ====================================================================================
// 🏷️ ASSET REGISTER — Club-owned equipment tracking
// ====================================================================================
// Rules (from Saia's mum):
// 1. ALL assets are purchased with club funds → club property, not personal
// 2. Every asset gets a printable QR sticker (asset ID F5-001, F5-002...)
// 3. Kids can borrow assets home → tracked with borrower name + date
// 4. If a kid LEAVES the club, all their borrowed gear MUST be returned
// 5. Only parents (helper mode 🛟) can add/edit/delete assets; kids can borrow/return
// ====================================================================================
type AssetCondition = 'new' | 'good' | 'fair' | 'needs-repair' | 'retired'
type AssetCategory = 'watersports' | 'cycling' | 'camping' | 'climbing' | 'sports' | 'safety' | 'camera' | 'other'

type AssetBorrowEntry = {
  borrower: string       // kid name from MEMBER_NAMES
  borrowedAt: number     // timestamp
  returnedAt?: number    // timestamp (undefined = still out)
  borrowNote?: string    // optional context: "for camping trip"
  returnNote?: string    // optional context on return
}

type Asset = {
  id: string                  // F5-001, F5-002... auto-generated
  name: string                // e.g. "Yellow Kayak"
  category: AssetCategory
  condition: AssetCondition
  purchaseCost?: number       // AUD, optional — for insurance/totals
  purchaseDate?: string       // YYYY-MM-DD
  purchaseFrom?: string       // store/seller name
  notes?: string              // free text
  photoUrl?: string           // optional image URL
  // Current status (derived from borrowHistory but cached for performance)
  status: 'at-club' | 'borrowed' | 'in-repair' | 'retired'
  currentBorrower?: string    // name if borrowed
  currentBorrowedAt?: number  // when current borrow started
  borrowHistory: AssetBorrowEntry[]
  createdAt: number
  updatedAt: number
}

// In-memory cache, hydrated from KV
let ASSETS: Asset[] = []
let ASSETS_HYDRATED = false
let ASSET_COUNTER = 0  // for generating F5-XXX IDs

async function hydrateAssetsFromKV(env: Bindings): Promise<void> {
  if (ASSETS_HYDRATED || !env.PROFILES_KV) {
    ASSETS_HYDRATED = true
    return
  }
  try {
    const raw = await env.PROFILES_KV.get('assets:all')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) ASSETS = parsed as Asset[]
    }
    const counterRaw = await env.PROFILES_KV.get('assets:counter')
    if (counterRaw) ASSET_COUNTER = parseInt(counterRaw) || 0
  } catch (e) {
    console.error('[KV] asset hydrate failed', e)
  }
  ASSETS_HYDRATED = true
}

async function saveAssetsToKV(env: Bindings): Promise<void> {
  if (!env.PROFILES_KV) return
  try {
    await env.PROFILES_KV.put('assets:all', JSON.stringify(ASSETS))
    await env.PROFILES_KV.put('assets:counter', String(ASSET_COUNTER))
  } catch (e) {
    console.error('[KV] asset save failed', e)
  }
}

function generateAssetId(): string {
  ASSET_COUNTER++
  return `F5-${String(ASSET_COUNTER).padStart(3, '0')}`
}

function recomputeAssetStatus(a: Asset): void {
  if (a.condition === 'retired') {
    a.status = 'retired'
    a.currentBorrower = undefined
    a.currentBorrowedAt = undefined
    return
  }
  if (a.condition === 'needs-repair') {
    a.status = 'in-repair'
    a.currentBorrower = undefined
    a.currentBorrowedAt = undefined
    return
  }
  const open = a.borrowHistory.find(b => !b.returnedAt)
  if (open) {
    a.status = 'borrowed'
    a.currentBorrower = open.borrower
    a.currentBorrowedAt = open.borrowedAt
  } else {
    a.status = 'at-club'
    a.currentBorrower = undefined
    a.currentBorrowedAt = undefined
  }
}

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
app.use('/api/assets', authMiddleware)
app.use('/api/assets/*', authMiddleware)

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

app.get('/api/club-info', async (c) => {
  // Hydrate persisted profile edits from KV before returning to the frontend
  await hydrateProfilesFromKV(c.env)
  return c.json({
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
  diary: DIARY,
  adventureSpots: ADVENTURE_SPOTS,
  challenges: CHALLENGES,
  captionBattles: CAPTION_BATTLES,
  postcards: POSTCARDS,
  })
})

// =========== 🧒 KID PROFILES API ===========
// KV-backed persistence — without this, profile edits vanish on cold start.
// Strategy: on every read, hydrate KV overrides into in-memory KID_PROFILES.
// Only hydrate ONCE per worker instance (KV reads cost money + add latency).
let KV_HYDRATED = false
async function hydrateProfilesFromKV(env: Bindings) {
  if (KV_HYDRATED || !env.PROFILES_KV) return
  KV_HYDRATED = true
  try {
    for (const name of Object.keys(KID_PROFILES)) {
      const stored = await env.PROFILES_KV.get('profile:' + name, 'json') as Partial<KidProfile> | null
      if (stored && typeof stored === 'object') {
        // Merge stored fields over the seeded defaults (stored wins)
        Object.assign(KID_PROFILES[name], stored)
      }
    }
  } catch (e) {
    console.error('[KV] hydrate failed', e)
  }
}

async function saveProfileToKV(env: Bindings, name: string) {
  if (!env.PROFILES_KV) return
  try {
    await env.PROFILES_KV.put('profile:' + name, JSON.stringify(KID_PROFILES[name]))
  } catch (e) {
    console.error('[KV] save failed for', name, e)
  }
}

// GET all profiles
app.get('/api/kid-profiles', async (c) => {
  await hydrateProfilesFromKV(c.env)
  return c.json({ profiles: KID_PROFILES })
})

// PATCH a single kid's profile — only existing members can be updated (no new kids via API)
app.patch('/api/kid-profiles/:name', async (c) => {
  await hydrateProfilesFromKV(c.env)
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
    let sid = (body.hypeSong.spotifyId || '').toString().trim()
    // Accept a full Spotify URL and extract just the ID
    const urlMatch = sid.match(/track\/([a-zA-Z0-9]+)/)
    if (urlMatch) sid = urlMatch[1]
    sid = sid.slice(0, 40)
    if (t && a) prof.hypeSong = { title: t, artist: a, spotifyId: sid || undefined }
    else if (!t && !a) prof.hypeSong = undefined
  }
  // ----- FUN FACTS (Saia's request — kids can edit their own card) -----
  if (typeof body.favouriteColour === 'string') prof.favouriteColour = body.favouriteColour.trim().slice(0, 40) || undefined
  if (typeof body.favouriteColourHex === 'string') {
    const v = body.favouriteColourHex.trim()
    // Only accept valid hex colours (#rgb or #rrggbb)
    if (v === '' || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) prof.favouriteColourHex = v || undefined
  }
  if (typeof body.favouriteFood === 'string')    prof.favouriteFood = body.favouriteFood.trim().slice(0, 80) || undefined
  if (typeof body.favouriteAnimal === 'string')  prof.favouriteAnimal = body.favouriteAnimal.trim().slice(0, 60) || undefined
  if (typeof body.favouriteMovie === 'string')   prof.favouriteMovie = body.favouriteMovie.trim().slice(0, 80) || undefined
  if (typeof body.favouriteSport === 'string')   prof.favouriteSport = body.favouriteSport.trim().slice(0, 60) || undefined
  if (typeof body.superpower === 'string')       prof.superpower = body.superpower.trim().slice(0, 120) || undefined
  if (typeof body.dreamHoliday === 'string')     prof.dreamHoliday = body.dreamHoliday.trim().slice(0, 120) || undefined

  // 💾 Persist to KV so edits survive cold starts + deploys
  await saveProfileToKV(c.env, name)

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

// =========== 📔 ADVENTURE DIARY API ===========
app.get('/api/diary', (c) => c.json({ entries: DIARY.slice().sort((a,b)=>b.createdAt-a.createdAt) }))

app.post('/api/diary', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const title = (body.title || '').toString().trim().slice(0, 200)
  const story = (body.story || '').toString().trim().slice(0, 5000)
  if (!title || !story) return c.json({ error: 'Title + story required' }, 400)
  const entry: DiaryEntry = {
    id: 'diary-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    eventId: body.eventId || undefined,
    title, story,
    mentionedMembers: Array.isArray(body.mentionedMembers) ? body.mentionedMembers.slice(0, 6) : [],
    date: (body.date || '').toString().slice(0, 20) || undefined,
    createdAt: Date.now(),
  }
  DIARY.unshift(entry)
  if (DIARY.length > 100) DIARY.length = 100
  return c.json({ ok: true, entry })
})

app.delete('/api/diary/:id', (c) => {
  const id = c.req.param('id')
  const idx = DIARY.findIndex(d => d.id === id)
  if (idx === -1) return c.json({ error: 'Not found' }, 404)
  DIARY.splice(idx, 1)
  return c.json({ ok: true })
})

// Pebbles writes a diary entry for an event (uses OpenAI)
app.post('/api/diary/generate', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const eventId = (body.eventId || '').toString()
  const event = EVENTS.find(e => e.id === eventId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const apiKey = c.env?.OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  if (!apiKey) {
    // Fallback: simple template if no AI
    const entry: DiaryEntry = {
      id: 'diary-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      eventId,
      title: `The ${event.title} Adventure`,
      story: `Today the Fab 5 hit ${event.location} for some ${event.activity}! ${event.members.join(', ')} were on the crew. ${event.leader ? `${event.leader} wore the gold and led the day.` : ''} What a memory! 🐾`,
      mentionedMembers: event.members || [],
      date: event.date,
      createdAt: Date.now(),
    }
    DIARY.unshift(entry)
    return c.json({ ok: true, entry, fallback: true })
  }

  // Build context for Pebbles to write a story
  const profiles = KID_PROFILES
  const sparks = (event.members || []).map(m => {
    const p = profiles[m]
    return p?.spark ? `${m} (spark: "${p.spark}")` : m
  }).join(', ')
  const awardsForEvent = AWARDS.filter(a => a.eventId === eventId || (event.date && a.date === event.date))
  const awardsText = awardsForEvent.length ? `Badges awarded: ${awardsForEvent.map(a => `${a.badge} to ${a.recipient}`).join('; ')}` : ''

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: `You are Pebbles 🐾, the Fab 5 Fun Club's Bull Arab dog mascot. Write a warm, fun, 2-3 paragraph kid-friendly diary entry about an adventure the crew just had. Use the kids' sparks. Sprinkle Pebbles-isms (*tail wag*, dog metaphors). Be specific, not generic. End with a one-line memory hook.` },
          { role: 'user', content: `Write a diary entry about this adventure:\nTitle: ${event.title}\nActivity: ${event.activity}\nLocation: ${event.location}\nDate: ${event.date}\nMembers: ${sparks}\n${event.leader ? `Leader: ${event.leader} (wore the gold)` : ''}\n${awardsText}\n${event.notes ? `Notes from the day: ${event.notes}` : ''}` }
        ],
        max_completion_tokens: 700,
      })
    })
    if (!res.ok) return c.json({ error: 'AI write failed: ' + res.status }, 500)
    const data: any = await res.json()
    const story = data.choices?.[0]?.message?.content?.trim() || 'A great day! 🐾'
    const entry: DiaryEntry = {
      id: 'diary-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      eventId,
      title: `The ${event.title} Adventure`,
      story,
      mentionedMembers: event.members || [],
      date: event.date,
      createdAt: Date.now(),
    }
    DIARY.unshift(entry)
    if (DIARY.length > 100) DIARY.length = 100
    return c.json({ ok: true, entry })
  } catch (e: any) {
    return c.json({ error: 'AI error: ' + e.message }, 500)
  }
})

// =========== 🗺️ ADVENTURE SPOTS API ===========
app.get('/api/adventure-spots', (c) => c.json({ spots: ADVENTURE_SPOTS }))

app.post('/api/adventure-spots', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const name = (body.name || '').toString().trim().slice(0, 100)
  if (!name) return c.json({ error: 'Name required' }, 400)
  const lat = Number(body.lat), lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ error: 'Valid lat/lon required' }, 400)
  const spot: AdventureSpot = {
    id: 'spot-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name,
    emoji: (body.emoji || '📍').toString().slice(0, 8),
    lat, lon,
    status: ['visited','planned','wishlist'].includes(body.status) ? body.status : 'wishlist',
    notes: (body.notes || '').toString().slice(0, 300) || undefined,
    addedAt: Date.now(),
  }
  ADVENTURE_SPOTS.push(spot)
  return c.json({ ok: true, spot })
})

app.patch('/api/adventure-spots/:id', async (c) => {
  const id = c.req.param('id')
  const spot = ADVENTURE_SPOTS.find(s => s.id === id)
  if (!spot) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json().catch(() => ({} as any))
  if (body.status && ['visited','planned','wishlist'].includes(body.status)) spot.status = body.status
  if (typeof body.notes === 'string') spot.notes = body.notes.slice(0, 300) || undefined
  return c.json({ ok: true, spot })
})

app.delete('/api/adventure-spots/:id', (c) => {
  const id = c.req.param('id')
  const idx = ADVENTURE_SPOTS.findIndex(s => s.id === id)
  if (idx === -1) return c.json({ error: 'Not found' }, 404)
  ADVENTURE_SPOTS.splice(idx, 1)
  return c.json({ ok: true })
})

// =========== 🎯 CREW CHALLENGES API ===========
function getMondayISO(d = new Date()): string {
  const dt = new Date(d)
  const day = dt.getDay() || 7      // Sun = 0 -> 7
  if (day !== 1) dt.setHours(-24 * (day - 1))
  return dt.toISOString().slice(0, 10)
}

app.get('/api/challenges', (c) => {
  // Ensure there's a challenge for THIS week
  const weekStart = getMondayISO()
  let current = CHALLENGES.find(ch => ch.weekStart === weekStart)
  if (!current) {
    // Pick a random one from the bank not used in the last 8 weeks
    const recentTitles = CHALLENGES.slice(-8).map(ch => ch.title)
    const available = CHALLENGE_BANK.filter(b => !recentTitles.includes(b.title))
    const pool = available.length ? available : CHALLENGE_BANK
    const pick = pool[Math.floor(Math.random() * pool.length)]
    current = {
      id: 'challenge-' + weekStart,
      weekStart,
      title: pick.title,
      description: pick.description,
      emoji: pick.emoji,
      category: pick.category,
      completedBy: [],
      createdAt: Date.now(),
    }
    CHALLENGES.unshift(current)
  }
  return c.json({ current, history: CHALLENGES.slice().sort((a,b)=>b.createdAt-a.createdAt) })
})

app.post('/api/challenges/:id/complete', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({} as any))
  const member = (body.member || '').toString().trim()
  if (!member) return c.json({ error: 'Member required' }, 400)
  const ch = CHALLENGES.find(x => x.id === id)
  if (!ch) return c.json({ error: 'Challenge not found' }, 404)
  if (!ch.completedBy.includes(member)) ch.completedBy.push(member)
  return c.json({ ok: true, challenge: ch })
})

app.post('/api/challenges/new', async (c) => {
  // Force a new random challenge for this week
  const weekStart = getMondayISO()
  const idx = CHALLENGES.findIndex(ch => ch.weekStart === weekStart)
  const recentTitles = CHALLENGES.slice(0, 8).map(ch => ch.title)
  const available = CHALLENGE_BANK.filter(b => !recentTitles.includes(b.title))
  const pool = available.length ? available : CHALLENGE_BANK
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const fresh: Challenge = {
    id: 'challenge-' + weekStart + '-' + Math.random().toString(36).slice(2, 5),
    weekStart,
    title: pick.title,
    description: pick.description,
    emoji: pick.emoji,
    category: pick.category,
    completedBy: [],
    createdAt: Date.now(),
  }
  if (idx >= 0) CHALLENGES.splice(idx, 1, fresh)
  else CHALLENGES.unshift(fresh)
  return c.json({ ok: true, challenge: fresh })
})

// =========== 📸 PHOTO CAPTION BATTLE API ===========
app.get('/api/caption-battles', (c) => c.json({ battles: CAPTION_BATTLES.slice().sort((a,b)=>b.createdAt-a.createdAt) }))

// Start a battle on a gallery item — Pebbles auto-writes 3 captions
app.post('/api/caption-battles/start', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const galleryItemId = (body.galleryItemId || '').toString()
  const item = GALLERY.find(g => g.id === galleryItemId)
  if (!item) return c.json({ error: 'Gallery item not found' }, 404)
  // Prevent duplicate active battles
  if (CAPTION_BATTLES.find(b => b.galleryItemId === galleryItemId && b.status === 'voting')) {
    return c.json({ error: 'Battle already running for this photo' }, 400)
  }

  // Try to generate 3 fun captions with Pebbles
  const apiKey = c.env?.OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  let captions: { id: string; text: string; author: 'pebbles'|string; votes: string[] }[] = []

  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: `You are Pebbles 🐾, a Bull Arab dog mascot for the Fab 5 Fun Club. Write THREE different funny one-line captions for a kids' adventure photo. Each on its own line. Number them 1) 2) 3). No commentary, JUST the captions. Keep them silly, kind, kid-friendly. Use emojis.` },
            { role: 'user', content: `Photo caption: "${item.caption || 'A Fab 5 adventure moment!'}". Write 3 funny captions.` }
          ],
          max_completion_tokens: 300,
        })
      })
      if (res.ok) {
        const data: any = await res.json()
        const txt = data.choices?.[0]?.message?.content?.trim() || ''
        // Parse out 3 captions
        const lines = txt.split('\n').map((l: string) => l.replace(/^\s*[\d)\.\-]+\s*/, '').trim()).filter((l: string) => l.length > 0)
        captions = lines.slice(0, 3).map((text: string) => ({
          id: 'cap-' + Math.random().toString(36).slice(2, 8),
          text, author: 'pebbles' as const, votes: []
        }))
      }
    } catch {}
  }
  // Fallback captions if AI failed
  if (captions.length < 3) {
    captions = [
      { id: 'cap-' + Math.random().toString(36).slice(2,8), text: 'When you realise the snack pack is empty 😱', author: 'pebbles', votes: [] },
      { id: 'cap-' + Math.random().toString(36).slice(2,8), text: 'Main character energy ✨🐾', author: 'pebbles', votes: [] },
      { id: 'cap-' + Math.random().toString(36).slice(2,8), text: 'Tell your friends you were there 📸', author: 'pebbles', votes: [] },
    ]
  }

  const battle: CaptionBattle = {
    id: 'battle-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    galleryItemId,
    captions,
    status: 'voting',
    createdAt: Date.now(),
  }
  CAPTION_BATTLES.unshift(battle)
  return c.json({ ok: true, battle })
})

// Add a human-written caption to an existing battle
app.post('/api/caption-battles/:id/add-caption', async (c) => {
  const id = c.req.param('id')
  const battle = CAPTION_BATTLES.find(b => b.id === id)
  if (!battle) return c.json({ error: 'Battle not found' }, 404)
  const body = await c.req.json().catch(() => ({} as any))
  const text = (body.text || '').toString().trim().slice(0, 200)
  const author = (body.author || 'crew').toString().trim().slice(0, 40)
  if (!text) return c.json({ error: 'Caption text required' }, 400)
  battle.captions.push({ id: 'cap-' + Math.random().toString(36).slice(2,8), text, author, votes: [] })
  return c.json({ ok: true, battle })
})

// Vote for a caption
app.post('/api/caption-battles/:id/vote', async (c) => {
  const id = c.req.param('id')
  const battle = CAPTION_BATTLES.find(b => b.id === id)
  if (!battle) return c.json({ error: 'Battle not found' }, 404)
  const body = await c.req.json().catch(() => ({} as any))
  const captionId = (body.captionId || '').toString()
  const voter = (body.voter || '').toString().trim()
  if (!voter) return c.json({ error: 'Voter required' }, 400)
  // Remove existing vote from this voter
  battle.captions.forEach(cap => { cap.votes = cap.votes.filter(v => v !== voter) })
  const cap = battle.captions.find(x => x.id === captionId)
  if (!cap) return c.json({ error: 'Caption not found' }, 404)
  cap.votes.push(voter)
  return c.json({ ok: true, battle })
})

app.post('/api/caption-battles/:id/close', (c) => {
  const id = c.req.param('id')
  const battle = CAPTION_BATTLES.find(b => b.id === id)
  if (!battle) return c.json({ error: 'Battle not found' }, 404)
  battle.status = 'closed'
  return c.json({ ok: true, battle })
})

// =========== 💌 PEBBLES POSTCARDS API ===========
app.get('/api/postcards', (c) => c.json({ postcards: POSTCARDS.slice().sort((a,b)=>b.createdAt-a.createdAt) }))

app.post('/api/postcards/generate', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const toMember = (body.toMember || '').toString().trim()
  const eventId = (body.eventId || '').toString()
  if (!toMember) return c.json({ error: 'toMember required' }, 400)
  const event = eventId ? EVENTS.find(e => e.id === eventId) : undefined

  const apiKey = c.env?.OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  let message = ''

  const profile = KID_PROFILES[toMember]
  const sparkLine = profile?.spark ? `What makes ${toMember} special: "${profile.spark}". ` : ''
  const eventLine = event ? `They missed: ${event.title} (${event.activity}) at ${event.location} on ${event.date}.` : ''

  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: `You are Pebbles 🐾, the Fab 5 Fun Club mascot. Write a warm, short (3-4 sentences) "we missed you!" postcard to a kid who couldn't make today's adventure. Be specific to their spark. End with paw print 🐾 and "Love, Pebbles + the crew". Don't be over-the-top — just genuine warmth.` },
            { role: 'user', content: `Write a postcard to ${toMember}. ${sparkLine}${eventLine}` }
          ],
          max_completion_tokens: 300,
        })
      })
      if (res.ok) {
        const data: any = await res.json()
        message = data.choices?.[0]?.message?.content?.trim() || ''
      }
    } catch {}
  }
  if (!message) {
    // Fallback
    message = `Hey ${toMember}!\n\nThe crew missed your sunshine today. ${event ? `${event.title} wasn't the same without you. ` : ''}Hope you're OK — next adventure's going to be even better with you back! 🐾\n\nLove, Pebbles + the crew`
  }

  const postcard: Postcard = {
    id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    toMember,
    fromEventId: event?.id,
    fromEventTitle: event?.title,
    message,
    createdAt: Date.now(),
  }
  POSTCARDS.unshift(postcard)
  if (POSTCARDS.length > 100) POSTCARDS.length = 100
  return c.json({ ok: true, postcard })
})

app.delete('/api/postcards/:id', (c) => {
  const id = c.req.param('id')
  const idx = POSTCARDS.findIndex(p => p.id === id)
  if (idx === -1) return c.json({ error: 'Not found' }, 404)
  POSTCARDS.splice(idx, 1)
  return c.json({ ok: true })
})

// =========== 🌟 HALL OF FAME API (computed) ===========
app.get('/api/hall-of-fame', (c) => {
  const memberNames = CLUB_INFO.members.filter(m => m.name !== 'Pebbles').map(m => m.name)
  const stats = memberNames.map(name => {
    const adventures = EVENTS.filter(e => e.members?.includes(name)).length
    const led = EVENTS.filter(e => e.leader === name).length
    const badges = AWARDS.filter(a => a.recipient === name).length
    const photos = GALLERY.filter(g => g.uploadedBy === name).length
    return { name, adventures, led, badges, photos }
  })
  return c.json({
    stats,
    mostAdventures: [...stats].sort((a,b) => b.adventures - a.adventures)[0],
    mostLed:        [...stats].sort((a,b) => b.led - a.led)[0],
    mostBadges:     [...stats].sort((a,b) => b.badges - a.badges)[0],
    mostPhotos:     [...stats].sort((a,b) => b.photos - a.photos)[0],
  })
})

// =========== 🎂 BIRTHDAY BRAIN API (computed from profiles) ===========
app.get('/api/birthdays', (c) => {
  const today = new Date()
  const upcoming: { name: string; birthday: string; daysUntil: number; age: number; turning: number }[] = []
  Object.values(KID_PROFILES).forEach(p => {
    if (!p.birthday) return
    const [y, m, d] = p.birthday.split('-').map(Number)
    if (!y || !m || !d) return
    const thisYear = new Date(today.getFullYear(), m - 1, d)
    let nextBday = thisYear
    if (nextBday < new Date(today.toDateString())) {
      nextBday = new Date(today.getFullYear() + 1, m - 1, d)
    }
    const daysUntil = Math.round((nextBday.getTime() - new Date(today.toDateString()).getTime()) / (1000 * 60 * 60 * 24))
    const turning = nextBday.getFullYear() - y
    upcoming.push({ name: p.name, birthday: p.birthday, daysUntil, age: turning - 1, turning })
  })
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil)
  return c.json({ birthdays: upcoming })
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

// =========== 🏅 DUKE OF EDINBURGH API ===========
// Returns the full syllabus + 52-week plan + current week marker (for parent page).
app.get('/api/dofe/syllabus', (c) => {
  ensureSeeded()
  const current = getCurrentDofeWeek()
  return c.json({
    pillars: DOFE_PILLARS,
    syllabus: DOFE_SYLLABUS,
    plan: DOFE_52_WEEK_PLAN,
    currentWeek: current.week,
    anchorDate: getDofeAnchorDate()
  })
})

// Returns a kid's pillar progress + Bronze/Silver/Gold % + this weekend's activity.
app.get('/api/dofe/progress/:name', (c) => {
  ensureSeeded()
  const name = c.req.param('name')
  if (!MEMBER_NAMES.includes(name) && name !== 'Pebbles') {
    return c.json({ error: 'Unknown member' }, 404)
  }
  const progress = computeDofeProgressFor(name)
  const current = getCurrentDofeWeek()
  return c.json({
    member: name,
    progress,
    thisWeek: current,
    nextWeek: DOFE_52_WEEK_PLAN[Math.min(51, current.week)] || null
  })
})

// Team chart — all 5 kids' progress in one call
app.get('/api/dofe/team', (c) => {
  ensureSeeded()
  const team = MEMBER_NAMES.map(name => {
    const member = CLUB_INFO.members.find(m => m.name === name)
    const progress = computeDofeProgressFor(name)
    return {
      name,
      color: member?.color || '#999',
      emoji: member?.emoji || '⭐',
      pillarHours: progress.pillarHours,
      totalHours: progress.totalHours,
      bronze: progress.bronze,
      silver: progress.silver,
      gold: progress.gold,
      currentStage: progress.currentStage,
      ajCompleted: progress.ajCompleted
    }
  })
  // Team totals (combined pillar hours across all 5)
  const teamPillarHours = team.reduce((acc, k) => ({
    physical: acc.physical + k.pillarHours.physical,
    skills: acc.skills + k.pillarHours.skills,
    service: acc.service + k.pillarHours.service,
    adventure: acc.adventure + k.pillarHours.adventure
  }), { physical: 0, skills: 0, service: 0, adventure: 0 })
  return c.json({ team, teamPillarHours, currentWeek: getCurrentDofeWeek() })
})

// Individual kid's event-by-event journey (drill-down view)
app.get('/api/dofe/journey/:name', (c) => {
  ensureSeeded()
  const name = c.req.param('name')
  if (!MEMBER_NAMES.includes(name) && name !== 'Pebbles') {
    return c.json({ error: 'Unknown member' }, 404)
  }
  const activityLookup: Record<string, { pillars: string[]; hours: number; emoji: string; category: string }> = {}
  for (const a of (CLUB_INFO.activities as any[])) {
    activityLookup[a.name] = { pillars: a.pillars || [], hours: a.hours || 0, emoji: a.emoji, category: a.category }
  }
  const today = new Date().toISOString().slice(0, 10)
  const kidsEvents = EVENTS
    .filter(ev => ev.members.includes(name))
    .map(ev => {
      const meta = activityLookup[ev.activity] || { pillars: [], hours: 0, emoji: '🎯', category: 'Other' }
      const isPast = ev.date <= today
      // What syllabus area(s) this counts toward
      const syllabusAreas = meta.pillars.map(p => {
        const pillar = DOFE_PILLARS.find(x => x.id === p)
        return pillar ? { id: pillar.id, name: pillar.name, emoji: pillar.emoji, color: pillar.color } : null
      }).filter(Boolean)
      return {
        eventId: ev.id,
        title: ev.title,
        activity: ev.activity,
        emoji: meta.emoji,
        date: ev.date,
        location: ev.location,
        hours: meta.hours,
        pillars: meta.pillars,
        syllabusAreas,
        leader: ev.leader,
        isPast,
        isAJ: (ev.activity === 'Camping' && meta.hours >= 12) ||
              (ev.activity === 'Overnight Hike Expedition')
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // Compute graduations — when each pillar hit Bronze/Silver/Gold thresholds
  const progress = computeDofeProgressFor(name)
  const graduations: Array<{ stage: string; emoji: string; pillar?: string; pillarName?: string; pillarEmoji?: string; achieved: boolean; date?: string; label: string }> = []
  // Stage-level graduations
  if (progress.bronze.complete) graduations.push({ stage: 'bronze', emoji: '🥉', achieved: true, label: 'Bronze Award unlocked!' })
  if (progress.silver.complete) graduations.push({ stage: 'silver', emoji: '🥈', achieved: true, label: 'Silver Award unlocked!' })
  if (progress.gold.complete)   graduations.push({ stage: 'gold',   emoji: '🥇', achieved: true, label: 'Gold Award unlocked!' })

  return c.json({
    member: name,
    progress,
    events: kidsEvents,
    pastEventCount: kidsEvents.filter(e => e.isPast).length,
    futureEventCount: kidsEvents.filter(e => !e.isPast).length,
    graduations
  })
})

// ====================================================================================
// 🏷️ ASSET REGISTER API
// ====================================================================================
// Public reads (any authed user) + parent-restricted writes.
// Helper mode (🛟) is enforced on the client side; the API trusts authed users for
// borrow/return (kids do these), and we use a simple "parent flag" on the request
// body for add/delete (sent only when user is in helper mode).
// ====================================================================================

// GET /api/assets — list all
app.get('/api/assets', async (c) => {
  await hydrateAssetsFromKV(c.env)
  // Compute summary stats for mum's dashboard
  const totalValue = ASSETS.reduce((sum, a) => sum + (a.purchaseCost || 0), 0)
  const stats = {
    total: ASSETS.length,
    atClub: ASSETS.filter(a => a.status === 'at-club').length,
    borrowed: ASSETS.filter(a => a.status === 'borrowed').length,
    inRepair: ASSETS.filter(a => a.status === 'in-repair').length,
    retired: ASSETS.filter(a => a.status === 'retired').length,
    totalValue,
    // Overdue = borrowed > 30 days
    overdue: ASSETS.filter(a => {
      if (a.status !== 'borrowed' || !a.currentBorrowedAt) return false
      return (Date.now() - a.currentBorrowedAt) > 30 * 24 * 60 * 60 * 1000
    }).length,
  }
  return c.json({ assets: ASSETS, stats })
})

// GET /api/assets/:id — single asset detail
app.get('/api/assets/:id', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const id = c.req.param('id').toUpperCase()
  const asset = ASSETS.find(a => a.id === id)
  if (!asset) return c.json({ error: 'Asset not found' }, 404)
  return c.json({ asset })
})

// POST /api/assets — create new (parent-only via helper mode)
app.post('/api/assets', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const body = await c.req.json<Partial<Asset>>().catch(() => ({} as any))

  const name = (body.name || '').toString().trim().slice(0, 100)
  if (!name) return c.json({ error: 'Name is required' }, 400)

  const validCats: AssetCategory[] = ['watersports','cycling','camping','climbing','sports','safety','camera','other']
  const validConds: AssetCondition[] = ['new','good','fair','needs-repair','retired']
  const category = (validCats.includes(body.category as any) ? body.category : 'other') as AssetCategory
  const condition = (validConds.includes(body.condition as any) ? body.condition : 'good') as AssetCondition

  let purchaseCost: number | undefined
  if (body.purchaseCost !== undefined && body.purchaseCost !== null) {
    const n = Number(body.purchaseCost)
    if (!isNaN(n) && n >= 0 && n < 1000000) purchaseCost = Math.round(n * 100) / 100
  }

  const purchaseDate = (typeof body.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.purchaseDate))
    ? body.purchaseDate : undefined
  const purchaseFrom = body.purchaseFrom ? body.purchaseFrom.toString().trim().slice(0, 100) : undefined
  const notes = body.notes ? body.notes.toString().trim().slice(0, 500) : undefined
  let photoUrl: string | undefined
  if (body.photoUrl && typeof body.photoUrl === 'string') {
    const url = body.photoUrl.trim()
    if (/^https?:\/\//.test(url) && url.length < 500) photoUrl = url
  }

  const now = Date.now()
  const asset: Asset = {
    id: generateAssetId(),
    name,
    category,
    condition,
    purchaseCost,
    purchaseDate,
    purchaseFrom,
    notes,
    photoUrl,
    status: 'at-club',
    borrowHistory: [],
    createdAt: now,
    updatedAt: now,
  }
  recomputeAssetStatus(asset)
  ASSETS.push(asset)
  await saveAssetsToKV(c.env)
  return c.json({ ok: true, asset })
})

// PATCH /api/assets/:id — edit (parent-only via helper mode)
app.patch('/api/assets/:id', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const id = c.req.param('id').toUpperCase()
  const asset = ASSETS.find(a => a.id === id)
  if (!asset) return c.json({ error: 'Asset not found' }, 404)

  const body = await c.req.json<Partial<Asset>>().catch(() => ({} as any))
  const validCats: AssetCategory[] = ['watersports','cycling','camping','climbing','sports','safety','camera','other']
  const validConds: AssetCondition[] = ['new','good','fair','needs-repair','retired']

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 100)
    if (n) asset.name = n
  }
  if (validCats.includes(body.category as any)) asset.category = body.category as AssetCategory
  if (validConds.includes(body.condition as any)) asset.condition = body.condition as AssetCondition
  if (body.purchaseCost !== undefined) {
    const n = Number(body.purchaseCost)
    if (!isNaN(n) && n >= 0) asset.purchaseCost = Math.round(n * 100) / 100
    else if (body.purchaseCost === null || body.purchaseCost === 0) asset.purchaseCost = undefined
  }
  if (typeof body.purchaseDate === 'string') {
    if (body.purchaseDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(body.purchaseDate)) {
      asset.purchaseDate = body.purchaseDate || undefined
    }
  }
  if (typeof body.purchaseFrom === 'string') {
    asset.purchaseFrom = body.purchaseFrom.trim().slice(0, 100) || undefined
  }
  if (typeof body.notes === 'string') {
    asset.notes = body.notes.trim().slice(0, 500) || undefined
  }
  if (typeof body.photoUrl === 'string') {
    const url = body.photoUrl.trim()
    if (url === '') asset.photoUrl = undefined
    else if (/^https?:\/\//.test(url) && url.length < 500) asset.photoUrl = url
  }
  asset.updatedAt = Date.now()
  recomputeAssetStatus(asset)
  await saveAssetsToKV(c.env)
  return c.json({ ok: true, asset })
})

// DELETE /api/assets/:id — remove asset (parent-only via helper mode)
app.delete('/api/assets/:id', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const id = c.req.param('id').toUpperCase()
  const idx = ASSETS.findIndex(a => a.id === id)
  if (idx === -1) return c.json({ error: 'Asset not found' }, 404)
  ASSETS.splice(idx, 1)
  await saveAssetsToKV(c.env)
  return c.json({ ok: true })
})

// POST /api/assets/:id/borrow — kid borrows asset home
app.post('/api/assets/:id/borrow', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const id = c.req.param('id').toUpperCase()
  const asset = ASSETS.find(a => a.id === id)
  if (!asset) return c.json({ error: 'Asset not found' }, 404)
  if (asset.status === 'retired') return c.json({ error: 'This asset is retired' }, 400)
  if (asset.status === 'in-repair') return c.json({ error: 'This asset needs repair' }, 400)
  if (asset.status === 'borrowed') return c.json({ error: `Already borrowed by ${asset.currentBorrower}` }, 400)

  const body = await c.req.json<{ borrower?: string; note?: string }>().catch(() => ({} as any))
  const borrower = (body.borrower || '').toString().trim()
  if (!MEMBER_NAMES.includes(borrower)) {
    return c.json({ error: 'Invalid borrower — must be a Fab 5 member' }, 400)
  }
  const note = body.note ? body.note.toString().trim().slice(0, 200) : undefined

  asset.borrowHistory.push({ borrower, borrowedAt: Date.now(), borrowNote: note })
  asset.updatedAt = Date.now()
  recomputeAssetStatus(asset)
  await saveAssetsToKV(c.env)
  return c.json({ ok: true, asset })
})

// POST /api/assets/:id/return — return asset to club
app.post('/api/assets/:id/return', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const id = c.req.param('id').toUpperCase()
  const asset = ASSETS.find(a => a.id === id)
  if (!asset) return c.json({ error: 'Asset not found' }, 404)
  if (asset.status !== 'borrowed') return c.json({ error: 'Asset is not currently borrowed' }, 400)

  const body = await c.req.json<{ note?: string }>().catch(() => ({} as any))
  const note = body.note ? body.note.toString().trim().slice(0, 200) : undefined

  const open = asset.borrowHistory.find(b => !b.returnedAt)
  if (open) {
    open.returnedAt = Date.now()
    if (note) open.returnNote = note
  }
  asset.updatedAt = Date.now()
  recomputeAssetStatus(asset)
  await saveAssetsToKV(c.env)
  return c.json({ ok: true, asset })
})

// GET /api/assets/handback/:name — list everything a kid has (for "leaving club" handback)
app.get('/api/assets/handback/:name', async (c) => {
  await hydrateAssetsFromKV(c.env)
  const name = c.req.param('name')
  const items = ASSETS.filter(a => a.status === 'borrowed' && a.currentBorrower === name)
  const totalValue = items.reduce((s, a) => s + (a.purchaseCost || 0), 0)
  return c.json({ kid: name, items, count: items.length, totalValue })
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
17. ADVENTURE DIARY — when asked to "remember" or "write up" an adventure, point them to the 📔 Adventure Diary section (or use the diary generator button on each event card).
18. SPOT IDEAS — when planning, suggest locations from the Adventure Map (Lake MacDonald, Maleny, Noosa, etc). Encourage adding new spots to the wishlist.
19. CHALLENGES — the 🎯 Crew Challenge of the Week is a small kind/creative dare for the whole crew. Encourage completion. If asked, suggest a new challenge from the bank.
20. CAPTION BATTLE — for any gallery photo, the crew can start a Caption Battle. You write 3 funny captions and the crew votes. Encourage it!
21. POSTCARDS — when a kid misses an adventure, write them a warm "we missed you" postcard. Use their spark from their profile. Sign off with 🐾 Love, Pebbles + the crew.
22. BIRTHDAYS — once profiles have birthdays, you can suggest birthday parties and remind the crew when a birthday is coming up.
23. HALL OF FAME — celebrates each kid for THEIR thing (most adventures, most led, most badges, most photos). Never about ranking kids against each other — about celebrating their unique contribution.

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

AVAILABLE BADGES (you can award these to crew) — Fab 5 Values only:
- team (🤝 Team Player) — our team rule: "no team player → not in team"
- mentor (👯 Peer Mentor) — guided a friend with kindness
- kind (💛 Kind Heart) — not selfish, greedy, or impatient
- safety (⛑️ Safety Champ) — kept the team safe

🏅 DUKE OF EDINBURGH JOURNEY (NEW — IMPORTANT!):
We've now baked the OFFICIAL Duke of Edinburgh (DofE) Award syllabus into the club.
- It's a real UK/Australia-wide youth development program with 3 stages: 🥉 Bronze (14+), 🥈 Silver (15+), 🥇 Gold (16+)
- Fab 5 are 12 so we're "DofE-prep" — building the habit early. Same syllabus, kid-friendly framing.
- 4 PILLARS each kid develops:
  • 💪 Physical Recreation — getting fit, moving your body
  • 🎓 Skills — learning cool new skills (cooking, photography, knots, first aid)
  • 💛 Voluntary Service — helping people, animals, environment (UNPAID!)
  • 🏔️ Adventurous Journey — outdoor expeditions in unfamiliar wild country

EVERY ACTIVITY IN THE CLUB IS TAGGED with which pillars it builds + how many hours.
- We have a 52-WEEK PROGRESSIVE PLAN starting THIS Saturday → "Zero to Hero" over 12 months
- Weeks 1-20 = Bronze foundation (light 1-3hr activities, sampling each pillar)
- Weeks 21-40 = Silver depth (longer 3-5hr activities, building mastery)
- Weeks 41-52 = Gold expedition (overnight hikes, leadership, Gold Project prep)
- Adventurous Journey milestones: Week 20 = Bronze AJ (2d/1n), Week 40 = Silver AJ (3d/2n), Week 52 = Gold AJ (4d/3n)

WHEN A KID ASKS "what are we doing this weekend?" or "why are we doing X?":
→ Look at the "TODAY'S DOFE PLAN" block injected below
→ Explain in KID LANGUAGE what the activity is + which pillars it builds + why that matters
→ Example: "This Saturday we're going bushwalking! 🌳 That builds your Physical pillar (sneaky exercise!) AND your Adventure pillar (getting comfortable outdoors). It's training for the BIG overnight hike at the end of the year! *tail wag*"
→ NEVER lecture parent-style — keep it fun, kid-talk, "*wags tail*" energy
→ Parents have their OWN page (/dofe-syllabus) with the full official syllabus — don't quote it at kids unless they ask

WHEN A KID ASKS "what's the Duke of Edinburgh?" or "what's DofE?":
→ Kid version: "It's like a treasure hunt for your future-self 🏆 You collect hours doing 4 kinds of cool stuff — getting fit, learning skills, helping people, and going on adventures. After enough hours you earn Bronze 🥉, then Silver 🥈, then Gold 🥇. Gold gets you respect WORLDWIDE — uni admissions and jobs love it!"
→ Don't dump the syllabus — keep it 2-3 sentences max

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

const BADGE_IDS = ['team','mentor','kind','safety']

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

  // 🏅 DofE — what's on this weekend + each kid's progress
  const thisWeek = getCurrentDofeWeek()
  const dofeBlock =
    `\n\n🏅 TODAY'S DOFE PLAN (week ${thisWeek.week} of 52 — ${thisWeek.stage.toUpperCase()} stage):\n` +
    `- Activity: ${thisWeek.activity}  •  Pillars: ${thisWeek.pillars.join(', ') || '(fun bonus week)'}  •  ${thisWeek.hours}hr\n` +
    `- Kid talk: ${thisWeek.kidWhy}\n` +
    `- Why it matters: ${thisWeek.parentWhy}\n`
  const userProgress = MEMBER_NAMES.includes(user) ? computeDofeProgressFor(user) : null
  const progressBlock = userProgress
    ? `\n📊 ${user}'s DofE progress so far:\n` +
      `- Hours: 💪 Physical ${userProgress.pillarHours.physical}hr • 🎓 Skills ${userProgress.pillarHours.skills}hr • 💛 Service ${userProgress.pillarHours.service}hr • 🏔️ Adventure ${userProgress.pillarHours.adventure}hr\n` +
      `- Bronze ${userProgress.bronze.percent}% • Silver ${userProgress.silver.percent}% • Gold ${userProgress.gold.percent}%\n` +
      `- Current stage: ${userProgress.currentStage}\n`
    : ''

  const systemMsg = {
    role: 'system',
    content: PEBBLES_SYSTEM_PROMPT +
      `\n\nThe user chatting with you: ${user}.` +
      `\nToday's date: ${today} (${todayName}).` +
      `\nNext Saturday: ${getNextSaturday()}.` +
      `\nNext Sunday: ${getNextSunday()}.` +
      `\nLeader rotation counts so far: ${JSON.stringify(counts)}.` +
      `\nFairest next leader (led fewest times): ${sorted[0]}.` +
      dofeBlock +
      progressBlock +
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
            <img src="/static/pebbles.png?v=2" alt="Pebbles" />
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
            <a href="#dofe-journey">🏅 My Journey</a>
            <a href="#team-progress">📊 Team Chart</a>
            <a href="#fab5-ways">🌟 Fab 5 Ways</a>
            <a href="#merch">👕 Merch</a>
            <a href="#awards">🏆 Awards</a>
            <a href="#gallery">📸 Gallery</a>
            <a href="/dofe-syllabus">📋 Parent Syllabus</a>
            <a href="/assets">🏷️ Gear</a>
            <a href="#parents-faq">❓ Parents</a>
          </div>
          <button id="whoami-btn" class="whoami-btn" title="Who are you?">
            <span id="whoami-label">👋 Who am I?</span>
          </button>
          <button id="take-tour-btn" class="take-tour-btn" title="Start here!">🎈 Start here!</button>
          <button id="logout-btn" class="logout-btn" title="Log out">🚪</button>
        </nav>

        {/* 👤 WHO ARE YOU? PICKER — each phone claims one crew member */}
        <div id="whoami-modal" class="whoami-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="whoami-title">
          <div class="whoami-card">
            <button id="whoami-close" class="whoami-close" title="Close">✕</button>
            <h2 id="whoami-title">👋 Who are you?</h2>
            <p class="whoami-sub">Pick which crew member is using this phone — only YOUR card will show the Edit button!</p>
            <div id="whoami-grid" class="whoami-grid"></div>
            <div class="whoami-extras">
              <button id="whoami-leader-toggle" class="whoami-leader-btn" type="button">
                🛟 Grown-up helper mode — let me edit anyone's card
              </button>
              <p class="whoami-leader-hint" id="whoami-leader-hint">(For parents or grown-ups helping a kid set up their card)</p>
            </div>
          </div>
        </div>

        {/* 🪄 ONBOARDING WIZARD — first-visit welcome tour */}
        <div id="onboarding-wizard" class="wizard-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
          <div class="wizard-card">
            <button id="wizard-skip" class="wizard-skip" title="Skip tour">✕</button>
            <div id="wizard-content" class="wizard-content"></div>
            <div class="wizard-footer">
              <div id="wizard-dots" class="wizard-dots"></div>
              <div class="wizard-buttons">
                <button id="wizard-back" class="btn btn-tertiary" style="display:none">← Back</button>
                <button id="wizard-next" class="btn btn-primary">Next →</button>
              </div>
            </div>
          </div>
        </div>

        {/* 👤 KID PROFILE MODAL — opens when a crew card is tapped */}
        <div id="kid-profile-modal" class="kp-modal-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="kp-modal-name">
          <div class="kp-modal-card">
            <button id="kp-modal-close" class="kp-modal-close" title="Close">✕</button>
            <div id="kp-modal-content" class="kp-modal-content"></div>
          </div>
        </div>

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
            <img src="/static/fab5-group.png?v=2" alt="The Fab 5 Fun Club — cartoon group portrait" class="hero-group" />
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

        {/* 🏅 MY DOFE JOURNEY — kid-facing pillar progress + this weekend's plan */}
        <section class="section dofe-journey-section" id="dofe-journey">
          <h2 class="section-title">🏅 My Duke of Edinburgh Journey</h2>
          <p class="section-subtitle">Zero to Hero — 52 weekends of cool stuff that builds 4 super-powers 💪🎓💛🏔️</p>
          <div class="dofe-journey-intro">
            <p>👋 Pick who you are above (the <strong>"Who am I?"</strong> button up top) and watch your pillars fill up as you join adventures!</p>
            <p class="dofe-journey-parent-link">📋 Parents — see the full official syllabus & 52-week calendar on the <a href="/dofe-syllabus">Parent Syllabus page</a>.</p>
          </div>
          <div id="dofe-journey-content" class="dofe-journey-content">
            <p class="muted">Loading your journey…</p>
          </div>
          <div class="dofe-this-week" id="dofe-this-week">
            <h3>📅 This Weekend's Plan</h3>
            <div id="dofe-this-week-content" class="dofe-this-week-content">Loading…</div>
          </div>
        </section>

        {/* 📊 TEAM PROGRESS CHART — kid-friendly view of ALL 5 crew members */}
        <section class="section team-progress-section" id="team-progress">
          <h2 class="section-title">📊 Team Progress Chart</h2>
          <p class="section-subtitle">See how the WHOLE crew is doing — tap any kid to drill into their journey! 🔍</p>

          {/* Team-wide pillar totals (combined) */}
          <div class="team-totals-card">
            <h3>🌟 The Fab 5 Combined Power</h3>
            <p class="team-totals-sub">Every adventure builds the team's total pillar hours!</p>
            <div id="team-totals" class="team-totals-grid">
              <p class="muted">Loading team power…</p>
            </div>
          </div>

          {/* All 5 kids' cards */}
          <h3 class="team-grid-heading">🏅 Each crew member's journey</h3>
          <div id="team-grid" class="team-grid">
            <p class="muted">Loading team chart…</p>
          </div>

          {/* Drill-down modal — opens when a kid card is tapped */}
          <div id="kid-journey-modal" class="journey-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="journey-title">
            <div class="journey-card">
              <button id="journey-close" class="journey-close" title="Close">✕</button>
              <div id="journey-content" class="journey-content">Loading journey…</div>
            </div>
          </div>
        </section>

        {/* 🎉 MILESTONE CELEBRATION OVERLAY — fires when a kid crosses a pillar/stage threshold */}
        <div id="milestone-overlay" class="milestone-overlay" style="display:none" aria-hidden="true">
          <div id="confetti-canvas" class="confetti-canvas"></div>
          <div class="milestone-card">
            <div id="milestone-emoji" class="milestone-emoji">🎉</div>
            <h2 id="milestone-title" class="milestone-title">YOU DID IT!</h2>
            <p id="milestone-message" class="milestone-message">You just unlocked a new pillar!</p>
            <p id="milestone-pebbles" class="milestone-pebbles">🐾 Pebbles is SO proud of you!</p>
            <button id="milestone-close" class="btn btn-primary btn-big">🎊 Keep going!</button>
          </div>
        </div>

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
              <img src="/static/merch/tshirt-crew.png?v=2" alt="Crew T-Shirt" />
              <h4>Crew T-Shirt</h4>
              <p>White tee with rainbow Fab 5 logo, 5 adventure icons, and ALL your names. Est. <strong>$25–35</strong>.</p>
            </div>
            <div class="merch-card leader">
              <img src="/static/merch/tshirt-leader.png?v=2" alt="Leader T-Shirt" />
              <h4>🎖️ Leader T-Shirt</h4>
              <p>Gold tee for the Leader of the Day — only one in the whole crew kit! Est. <strong>$30–40</strong>.</p>
            </div>
            <div class="merch-card">
              <img src="/static/merch/hoodie-crew.png?v=2" alt="Crew Hoodie" />
              <h4>Crew Hoodie</h4>
              <p>Pink hoodie, huge "FAB 5" back print, "SUNSHINE COAST QLD" sleeve. Est. <strong>$55–75</strong>.</p>
            </div>
            <div class="merch-card">
              <img src="/static/merch/caps.png?v=2" alt="Crew & Leader Caps" />
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

        {/* 🎂 BIRTHDAY BRAIN */}
        <section class="section birthday-brain-section" id="birthday-brain">
          <h2 class="section-title">🎂 Birthday Brain</h2>
          <p class="section-subtitle">Pebbles never forgets a crew birthday 🐾</p>
          <div id="birthday-list" class="birthday-list">
            {/* Populated by app.js */}
          </div>
        </section>

        {/* 🌟 HALL OF FAME */}
        <section class="section hall-of-fame-section" id="hall-of-fame">
          <h2 class="section-title">🌟 Hall of Fame</h2>
          <p class="section-subtitle">Every kid celebrated for THEIR thing — not against each other 💛</p>
          <div id="hof-categories" class="hof-categories">
            {/* Populated by app.js: most adventures, most led, most badges, most photos */}
          </div>
          <div id="hof-stats" class="hof-stats">
            {/* Per-kid stat cards */}
          </div>
        </section>

        {/* 🎯 CREW CHALLENGE OF THE WEEK */}
        <section class="section challenge-section" id="challenge">
          <h2 class="section-title">🎯 Crew Challenge of the Week</h2>
          <p class="section-subtitle">A small kind/creative dare for the whole crew 🌟</p>
          <div id="challenge-current" class="challenge-current">
            {/* Populated by app.js */}
          </div>
          <details class="challenge-history-wrap">
            <summary>📜 Past challenges</summary>
            <div id="challenge-history" class="challenge-history"></div>
          </details>
        </section>

        {/* 🗺️ ADVENTURE MAP */}
        <section class="section adventure-map-section" id="adventure-map">
          <h2 class="section-title">🗺️ Adventure Map — SE Queensland</h2>
          <p class="section-subtitle">Where we've been, where we're going 📍</p>
          <div class="map-legend">
            <span class="legend-item"><span class="legend-dot visited"></span> Visited</span>
            <span class="legend-item"><span class="legend-dot planned"></span> Planned</span>
            <span class="legend-item"><span class="legend-dot wishlist"></span> Wishlist</span>
          </div>
          <div id="adventure-map-svg" class="adventure-map-svg">
            {/* SVG map populated by app.js */}
          </div>
          <div id="adventure-spots-list" class="adventure-spots-list">
            {/* List view fallback */}
          </div>
          <details class="spot-add-wrap">
            <summary>➕ Add a new spot</summary>
            <form id="spot-form" class="spot-form">
              <div class="form-row">
                <label><span>📍 Name</span><input type="text" id="spot-name" required maxlength={100} placeholder="e.g. Caloundra Skate Park" /></label>
                <label><span>✨ Emoji</span><input type="text" id="spot-emoji" maxlength={4} placeholder="🛹" /></label>
              </div>
              <div class="form-row">
                <label><span>📡 Latitude</span><input type="number" id="spot-lat" step="0.0001" placeholder="-26.8" /></label>
                <label><span>📡 Longitude</span><input type="number" id="spot-lon" step="0.0001" placeholder="153.1" /></label>
              </div>
              <label><span>📝 Notes</span><input type="text" id="spot-notes" maxlength={300} placeholder="Why's it cool?" /></label>
              <label><span>🏷️ Status</span><select id="spot-status"><option value="wishlist">Wishlist</option><option value="planned">Planned</option><option value="visited">Visited</option></select></label>
              <button type="submit" class="btn btn-primary">📍 Add to map</button>
              <p class="field-hint">💡 Tip: search the place on Google Maps → right-click the pin → click the lat/lon to copy.</p>
            </form>
          </details>
        </section>

        {/* 📔 ADVENTURE DIARY */}
        <section class="section diary-section" id="diary">
          <h2 class="section-title">📔 Adventure Diary</h2>
          <p class="section-subtitle">Pebbles writes up our adventures, story-style 🐾✨</p>
          <details class="diary-write-wrap">
            <summary>✍️ Write a new diary entry (Pebbles will do it for you)</summary>
            <div class="diary-write-body">
              <label><span>📅 Which adventure?</span>
                <select id="diary-event-select">
                  <option value="">Pick an event from your calendar...</option>
                </select>
              </label>
              <button id="diary-generate-btn" class="btn btn-secondary">🐾 Ask Pebbles to write it</button>
              <div id="diary-msg"></div>
            </div>
          </details>
          <div id="diary-entries" class="diary-entries">
            {/* populated by app.js */}
          </div>
        </section>

        {/* 📸 PHOTO CAPTION BATTLE */}
        <section class="section caption-battle-section" id="caption-battle">
          <h2 class="section-title">📸 Photo Caption Battle</h2>
          <p class="section-subtitle">Pebbles writes 3 funny captions, the crew votes for the best 🏆</p>
          <details class="caption-start-wrap">
            <summary>⚡ Start a new battle on a gallery photo</summary>
            <div class="caption-start-body">
              <label><span>📸 Which photo?</span>
                <select id="caption-gallery-select">
                  <option value="">Pick a photo from your gallery...</option>
                </select>
              </label>
              <button id="caption-start-btn" class="btn btn-tertiary">🎬 Start the battle!</button>
              <div id="caption-start-msg"></div>
            </div>
          </details>
          <div id="caption-battles-list" class="caption-battles-list">
            {/* populated by app.js */}
          </div>
        </section>

        {/* 💌 PEBBLES POSTCARDS */}
        <section class="section postcards-section" id="postcards">
          <h2 class="section-title">💌 Pebbles Postcards</h2>
          <p class="section-subtitle">For when a crew member missed an adventure — nobody gets left out 💛</p>
          <details class="postcard-write-wrap">
            <summary>✍️ Write a postcard to a kid who missed out</summary>
            <div class="postcard-write-body">
              <div class="form-row">
                <label><span>👤 To which kid?</span>
                  <select id="postcard-to">
                    <option>Ace</option><option>Charlotte</option><option>Elijah</option><option>Saia</option><option>Sienna</option>
                  </select>
                </label>
                <label><span>📅 Which adventure did they miss? <em>(optional)</em></span>
                  <select id="postcard-event">
                    <option value="">Pick an event...</option>
                  </select>
                </label>
              </div>
              <button id="postcard-generate-btn" class="btn btn-primary">🐾 Ask Pebbles to write it</button>
              <div id="postcard-msg"></div>
            </div>
          </details>
          <div id="postcards-list" class="postcards-list">
            {/* populated by app.js */}
          </div>
        </section>

        {/* 🎤 VOICE PEBBLES — floating chat already exists, this adds voice button */}
        <section class="section voice-pebbles-section" id="voice-pebbles">
          <h2 class="section-title">🎤 Voice Pebbles</h2>
          <p class="section-subtitle">Press the mic, talk to Pebbles, she replies out loud 🐾</p>
          <div class="voice-pebbles-card">
            <button id="voice-pebbles-btn" class="voice-pebbles-btn">
              <span class="voice-mic-icon">🎤</span>
              <span class="voice-btn-text">Hold to talk to Pebbles</span>
            </button>
            <div id="voice-status" class="voice-status">Click the mic, ask anything!</div>
            <div id="voice-transcript" class="voice-transcript"></div>
            <p class="voice-hint">💡 Pebbles will listen, think, and talk back. Best for little kids who can't type fast yet!</p>
          </div>
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
          <img src="/static/pebbles.png?v=2" alt="Pebbles" />
          <span class="pebbles-fab-badge">Ask me!</span>
        </button>

        <div id="pebbles-chat" class="pebbles-chat" style="display:none">
          <div class="pebbles-chat-header">
            <img src="/static/pebbles.png?v=2" alt="Pebbles" />
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

// ====================================================================================
// 🏷️ ASSET REGISTER PAGE — /assets
// Standalone page for managing club-owned gear. Auth-gated (redirect to home).
// All DOM IDs MUST match the IDs referenced in public/static/app.js (initAssetsPage).
// ====================================================================================
app.get('/assets', (c) => {
  if (!isAuthed(c)) return c.redirect('/')

  return c.render(
    <div class="assets-page">
      <header class="assets-header">
        <div class="assets-header-inner">
          <a href="/" class="assets-back">← Back to Fab 5</a>
          <h1>🏷️ Club Asset Register</h1>
          <p class="assets-subtitle">
            All gear is <strong>owned by the Fab 5 Fun Club</strong> — purchased with club funds.
            Crew members can borrow items home, but <strong>everything must come back if a member leaves the club</strong>.
          </p>
        </div>
      </header>

      <main class="assets-main">

        {/* HELPER-MODE NOTICE (hidden if helper mode is on) */}
        <div class="asset-helper-notice" id="asset-helper-notice">
          <p>
            🛟 <strong>Helper Mode is off.</strong> Kids can browse, borrow, and return gear.
            Only <strong>parents in Helper Mode</strong> can add, edit, or delete assets.
            Turn on Helper Mode from the <a href="/">homepage</a> (👋 Who am I → 🛟 Grown-up helper mode).
          </p>
        </div>

        {/* DASHBOARD STATS */}
        <section class="assets-stats-row">
          <div class="assets-stat">
            <div class="assets-stat-icon">🎒</div>
            <div class="assets-stat-value" id="stat-total">—</div>
            <div class="assets-stat-label">Total items</div>
          </div>
          <div class="assets-stat">
            <div class="assets-stat-icon">🏛️</div>
            <div class="assets-stat-value" id="stat-at-club">—</div>
            <div class="assets-stat-label">At club</div>
          </div>
          <div class="assets-stat">
            <div class="assets-stat-icon">🎈</div>
            <div class="assets-stat-value" id="stat-borrowed">—</div>
            <div class="assets-stat-label">Borrowed</div>
          </div>
          <div class="assets-stat assets-stat-warning">
            <div class="assets-stat-icon">🔧</div>
            <div class="assets-stat-value" id="stat-repair">—</div>
            <div class="assets-stat-label">Needs repair</div>
          </div>
          <div class="assets-stat">
            <div class="assets-stat-icon">💰</div>
            <div class="assets-stat-value" id="stat-value">—</div>
            <div class="assets-stat-label">Club investment</div>
          </div>
          <div class="assets-stat assets-stat-warning">
            <div class="assets-stat-icon">⏰</div>
            <div class="assets-stat-value" id="stat-overdue">—</div>
            <div class="assets-stat-label">Overdue (&gt;30 days)</div>
          </div>
        </section>

        {/* CONTROLS — search, filter, add */}
        <section class="assets-controls">
          <div class="assets-search-wrap">
            <input type="search" id="asset-search" placeholder="🔍 Search by name, ID, or notes..." />
          </div>
          <div class="assets-filters">
            <select id="asset-filter-category">
              <option value="">All categories</option>
              <option value="watersports">🛶 Watersports</option>
              <option value="cycling">🚴 Cycling</option>
              <option value="camping">⛺ Camping</option>
              <option value="climbing">🧗 Climbing</option>
              <option value="sports">⚽ Sports</option>
              <option value="safety">🦺 Safety</option>
              <option value="camera">📷 Camera</option>
              <option value="other">📦 Other</option>
            </select>
            <select id="asset-filter-status">
              <option value="">All statuses</option>
              <option value="at-club">🏛️ At club</option>
              <option value="borrowed">🎈 Borrowed</option>
              <option value="in-repair">🔧 In repair</option>
              <option value="retired">📦 Retired</option>
            </select>
          </div>
          <div class="assets-actions">
            <button id="asset-add-btn" class="assets-btn assets-btn-primary">
              ➕ Add asset
            </button>
            <button id="asset-print-stickers-btn" class="assets-btn assets-btn-secondary">
              🖨️ Print all stickers
            </button>
            <a href="#handback" id="handback-link" class="assets-btn assets-btn-ghost">
              👋 Member leaving
            </a>
          </div>
        </section>

        {/* GRID */}
        <section class="assets-grid-wrap">
          <div id="assets-grid" class="assets-grid">
            <div class="assets-empty">Loading club gear... 🐾</div>
          </div>
        </section>

        <footer class="assets-footer">
          <p>🐾 All assets stored securely in the club's database. Powered by Cloudflare KV.</p>
          <p class="muted">
            <strong>Rules:</strong> All gear is club-owned, purchased with club funds. Members may
            borrow items home, but must return everything if they leave the club.
          </p>
        </footer>
      </main>

      {/* MODAL: Asset detail (QR code + borrow/return + edit/delete) */}
      <div id="asset-detail-modal" class="asset-modal-overlay" style="display:none"></div>

      {/* MODAL: Add/Edit asset form */}
      <div id="asset-edit-modal" class="asset-modal-overlay" style="display:none"></div>

      {/* MODAL: Handback list (member leaving the club) */}
      <div id="asset-handback-modal" class="asset-modal-overlay" style="display:none"></div>
    </div>
  )
})

// =========== 📋 PARENT-FACING DOFE SYLLABUS PAGE ===========
app.get('/dofe-syllabus', (c) => {
  ensureSeeded()
  const currentWeek = getCurrentDofeWeek().week
  return c.render(
    <div id="app">
      <div class="dofe-parent-page">
        <header class="dofe-parent-hero">
          <div class="dofe-parent-hero-inner">
            <a href="/" class="dofe-parent-back">← Back to club</a>
            <h1>🏅 Duke of Edinburgh — Parent Syllabus</h1>
            <p class="dofe-parent-sub">The official DofE framework, the 52-week progressive plan, and exactly which weekend activity maps to which syllabus area.</p>
          </div>
        </header>

        <main class="dofe-parent-main">
          <section class="dofe-card">
            <h2>What is the Duke of Edinburgh Award?</h2>
            <p>The Duke of Edinburgh's International Award is a globally recognised youth development program founded by HRH Prince Philip in 1956. It runs in 130+ countries, including <strong>Australia</strong>, where it's delivered by The Duke of Edinburgh's International Award – Australia.</p>
            <p>The Award has <strong>3 progressive levels</strong> — Bronze (14+), Silver (15+), Gold (16+) — and 4 mandatory sections (we call them <strong>"pillars"</strong>). Each kid sets a personal goal in each section and tracks regular activity over weeks/months. Gold-level Award holders enjoy genuine recognition with universities and employers worldwide.</p>
            <p class="muted">The Fab 5 are currently 12 — too young to formally enrol, but we're <strong>baking in the habit early</strong> so when each kid hits 14 they're already months ahead. Same syllabus, kid-friendly framing.</p>
          </section>

          <section class="dofe-card">
            <h2>The 4 Pillars</h2>
            <div class="dofe-pillars-grid">
              {DOFE_PILLARS.map(p => (
                <div class="dofe-pillar-card" style={`border-left: 6px solid ${p.color}`}>
                  <h3>{p.emoji} {p.name}</h3>
                  <p class="dofe-pillar-kid"><strong>Kid talk:</strong> {p.kidTalk}</p>
                  <p>{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section class="dofe-card">
            <h2>The 3 Stages — Bronze 🥉 / Silver 🥈 / Gold 🥇</h2>
            <table class="dofe-stage-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Min Age</th>
                  <th>Per Section</th>
                  <th>Adventurous Journey</th>
                  <th>Extra</th>
                </tr>
              </thead>
              <tbody>
                <tr style="background:#FFF5E6">
                  <td><strong>🥉 Bronze</strong></td>
                  <td>{DOFE_SYLLABUS.bronze.minAge}+</td>
                  <td>{DOFE_SYLLABUS.bronze.minWeeksPerSection} weeks × ~{DOFE_SYLLABUS.bronze.hoursPerWeekTarget}hr/week</td>
                  <td>{DOFE_SYLLABUS.bronze.aj.days}d / {DOFE_SYLLABUS.bronze.aj.nights}n @ {DOFE_SYLLABUS.bronze.aj.hoursPerDay}hr/day — {DOFE_SYLLABUS.bronze.aj.env}</td>
                  <td>—</td>
                </tr>
                <tr style="background:#F0F0F0">
                  <td><strong>🥈 Silver</strong></td>
                  <td>{DOFE_SYLLABUS.silver.minAge}+</td>
                  <td>{DOFE_SYLLABUS.silver.minWeeksPerSection} weeks × ~{DOFE_SYLLABUS.silver.hoursPerWeekTarget}hr/week</td>
                  <td>{DOFE_SYLLABUS.silver.aj.days}d / {DOFE_SYLLABUS.silver.aj.nights}n @ {DOFE_SYLLABUS.silver.aj.hoursPerDay}hr/day — {DOFE_SYLLABUS.silver.aj.env}</td>
                  <td>—</td>
                </tr>
                <tr style="background:#FFF8DC">
                  <td><strong>🥇 Gold</strong></td>
                  <td>{DOFE_SYLLABUS.gold.minAge}+</td>
                  <td>{DOFE_SYLLABUS.gold.minWeeksPerSection} weeks × ~{DOFE_SYLLABUS.gold.hoursPerWeekTarget}hr/week</td>
                  <td>{DOFE_SYLLABUS.gold.aj.days}d / {DOFE_SYLLABUS.gold.aj.nights}n @ {DOFE_SYLLABUS.gold.aj.hoursPerDay}hr/day — {DOFE_SYLLABUS.gold.aj.env}</td>
                  <td>Gold Residential Project — {DOFE_SYLLABUS.gold.residentialProject.days}d / {DOFE_SYLLABUS.gold.residentialProject.nights}n shared project with strangers</td>
                </tr>
              </tbody>
            </table>
            <p class="muted" style="margin-top: 1rem;"><strong>Note for parents:</strong> The hours above are official entry minimums. Many kids exceed them naturally — the goal isn't ticking boxes, it's building <em>consistent habits</em> in each pillar.</p>
          </section>

          <section class="dofe-card">
            <h2>📅 The 52-Week Progressive Plan</h2>
            <p>Each weekend is mapped to a specific activity + the pillars it builds. The plan progresses <strong>Bronze foundation (weeks 1-20) → Silver depth (weeks 21-40) → Gold expedition (weeks 41-52)</strong>. Each phase ends with an <strong>Adventurous Journey milestone</strong>: Bronze AJ week 20, Silver AJ week 40, Gold AJ + Residential week 51-52.</p>
            <p class="dofe-current-marker">🐾 We're currently on <strong>Week {currentWeek}</strong> of 52 — the row highlighted below is this weekend.</p>
            <div class="dofe-plan-table-wrap">
              <table class="dofe-plan-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Stage</th>
                    <th>Activity</th>
                    <th>Pillars</th>
                    <th>Hours</th>
                    <th>Why it counts (syllabus mapping)</th>
                  </tr>
                </thead>
                <tbody>
                  {DOFE_52_WEEK_PLAN.map(w => (
                    <tr class={w.week === currentWeek ? 'dofe-plan-current' : `dofe-plan-${w.stage}`}>
                      <td><strong>{w.week}</strong></td>
                      <td class={`dofe-stage-cell dofe-stage-${w.stage}`}>
                        {w.stage === 'bronze' ? '🥉' : w.stage === 'silver' ? '🥈' : '🥇'} {w.stage}
                      </td>
                      <td>{w.activity}</td>
                      <td>
                        {w.pillars.map(p => {
                          const pillar = DOFE_PILLARS.find(x => x.id === p)
                          return pillar ? <span class="dofe-pillar-chip" style={`background:${pillar.color}22; color:${pillar.color}`}>{pillar.emoji} {pillar.name}</span> : null
                        })}
                      </td>
                      <td>{w.hours}hr</td>
                      <td class="dofe-plan-why">{w.parentWhy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="dofe-card">
            <h2>How to support your kid</h2>
            <ul class="dofe-support-list">
              <li>📅 <strong>Show up</strong> to the weekend adventures (or wave them off — your call).</li>
              <li>🎒 <strong>Pack the standard day-pack</strong> (food, drink, weather-appropriate clothes, sunscreen).</li>
              <li>💬 <strong>Ask about it</strong> on Sunday night — "Which pillar did you build today?" — kids LOVE explaining what they learned.</li>
              <li>📲 <strong>Use the kid app</strong> with them — they have a "My DofE Journey" view that shows their pillar progress in kid language. They can chat with Pebbles (the AI mascot) about each weekend.</li>
              <li>🏆 <strong>Celebrate AJ milestones</strong> — week 20 (Bronze AJ), week 40 (Silver AJ), week 52 (Gold AJ). These are the BIG memories.</li>
            </ul>
          </section>

          <footer class="dofe-parent-footer">
            <p>🐾 Built with love by the Fab 5 Fun Club crew. Questions? Tap the chat icon in the kid app and ask Pebbles!</p>
            <p class="muted">Reference: <a href="https://dukeofed.com.au/" target="_blank" rel="noopener">Duke of Edinburgh's International Award – Australia</a></p>
          </footer>
        </main>
      </div>
    </div>
  )
})

// ============================================================================
// 🏷️ ASSET REGISTER PAGE — Club equipment register
// ============================================================================
// Single-page route at /assets that renders the gear register shell.
// All data fetching + interactivity happens client-side via /api/assets/*.
// Page also handles deep-linking to /assets/F5-001 etc. via JS routing.
// ============================================================================
app.get('/assets', (c) => {
  return c.render(
    <div class="assets-page">
      <header class="assets-header">
        <a href="/" class="assets-back">← Back to club</a>
        <h1>🏷️ Club Asset Register</h1>
        <p class="assets-tagline">Every bit of gear the Fab 5 owns. Bought with club funds — returned to club always.</p>
      </header>

      {/* Dashboard stats (rendered client-side from /api/assets) */}
      <section class="assets-dashboard">
        <div class="assets-stat" data-stat="total">
          <div class="assets-stat-icon">🎒</div>
          <div class="assets-stat-value" id="stat-total">—</div>
          <div class="assets-stat-label">Total items</div>
        </div>
        <div class="assets-stat" data-stat="at-club">
          <div class="assets-stat-icon">🏠</div>
          <div class="assets-stat-value" id="stat-at-club">—</div>
          <div class="assets-stat-label">At the club</div>
        </div>
        <div class="assets-stat" data-stat="borrowed">
          <div class="assets-stat-icon">🎈</div>
          <div class="assets-stat-value" id="stat-borrowed">—</div>
          <div class="assets-stat-label">Borrowed</div>
        </div>
        <div class="assets-stat" data-stat="repair">
          <div class="assets-stat-icon">🔧</div>
          <div class="assets-stat-value" id="stat-repair">—</div>
          <div class="assets-stat-label">Needs repair</div>
        </div>
        <div class="assets-stat" data-stat="value">
          <div class="assets-stat-icon">💰</div>
          <div class="assets-stat-value" id="stat-value">—</div>
          <div class="assets-stat-label">Total value</div>
        </div>
        <div class="assets-stat assets-stat-warning" data-stat="overdue">
          <div class="assets-stat-icon">⏰</div>
          <div class="assets-stat-value" id="stat-overdue">—</div>
          <div class="assets-stat-label">Overdue (30+ days)</div>
        </div>
      </section>

      {/* Toolbar: search, filters, add button */}
      <section class="assets-toolbar">
        <input type="search" id="asset-search" placeholder="🔍 Search by name, ID, or notes..." class="asset-search-input" />
        <select id="asset-filter-category" class="asset-filter-select">
          <option value="">All categories</option>
          <option value="watersports">🛶 Watersports</option>
          <option value="cycling">🚴 Cycling</option>
          <option value="camping">⛺ Camping</option>
          <option value="climbing">🧗 Climbing</option>
          <option value="sports">⚽ Sports</option>
          <option value="safety">🦺 Safety</option>
          <option value="camera">📷 Camera</option>
          <option value="other">📦 Other</option>
        </select>
        <select id="asset-filter-status" class="asset-filter-select">
          <option value="">All status</option>
          <option value="at-club">🏠 At club</option>
          <option value="borrowed">🎈 Borrowed</option>
          <option value="in-repair">🔧 Needs repair</option>
          <option value="retired">📦 Retired</option>
        </select>
        <button id="asset-add-btn" class="asset-add-btn">➕ Add asset</button>
        <button id="asset-print-stickers-btn" class="asset-print-btn">🖨️ Print stickers</button>
      </section>

      {/* Helper-mode notice (shown when 🛟 not active) */}
      <div id="asset-helper-notice" class="asset-helper-notice" style="display:none">
        🛟 <strong>Add/edit/delete needs grown-up helper mode.</strong> Switch it on from the homepage (the 🛟 button in the Who am I popup).
      </div>

      {/* Asset grid */}
      <section class="assets-grid" id="assets-grid">
        <div class="assets-loading">Loading club gear... 🐾</div>
      </section>

      {/* Modals (rendered into these slots via JS) */}
      <div id="asset-detail-modal" class="asset-modal-overlay" style="display:none"></div>
      <div id="asset-edit-modal" class="asset-modal-overlay" style="display:none"></div>
      <div id="asset-handback-modal" class="asset-modal-overlay" style="display:none"></div>

      <footer class="assets-footer">
        <p>🏛️ All assets are club property. Borrow them, love them, return them.</p>
        <p class="muted">If a member leaves the club, all their borrowed items must be returned. Use the <a href="#" id="handback-link">handback checklist</a> for departures.</p>
      </footer>
    </div>
  )
})

// ============================================================================
// 🐾 PEBBLES 404 — kid-friendly "oops you got lost" page
// Replaces the generic Cloudflare 404 (the fishing guy) when someone types a
// wrong URL like /login or /home. Returns the kid back to the homepage with a
// big paw-print button + Pebbles being adorable.
// ============================================================================
app.notFound((c) => {
  c.status(404)
  return c.render(
    <div class="pebbles-404">
      <div class="pebbles-404-card">
        <div class="pebbles-404-dog" aria-hidden="true">
          <div class="pebbles-404-emoji">🐾</div>
          <div class="pebbles-404-face">🐶</div>
          <div class="pebbles-404-paws">
            <span>🐾</span><span>🐾</span><span>🐾</span><span>🐾</span>
          </div>
        </div>

        <h1 class="pebbles-404-title">Woof! You got a bit lost! 🐾</h1>
        <p class="pebbles-404-subtitle">
          Pebbles sniffed around but couldn't find that page.
        </p>

        <div class="pebbles-404-speech">
          <p>
            <strong>Hey there!</strong> The page you were looking for isn't here —
            maybe a typo? Don't worry, the whole Fab 5 Fun Club is just one tap away. 🌈
          </p>
        </div>

        <a href="/" class="pebbles-404-home-btn">
          🏠 Take me back to the Fab 5 Fun Club
        </a>

        <div class="pebbles-404-tips">
          <h2>🐾 Quick tips:</h2>
          <ul>
            <li>Make sure you typed <code>fab5funclub.org</code> — no slashes, no extras!</li>
            <li>If you saved a bookmark, it might be old — bookmark the homepage instead.</li>
            <li>Stuck? Ask Saia (or her mum/dad) for help 💛</li>
          </ul>
        </div>

        <p class="pebbles-404-signoff">
          🐕 — Pebbles, Chief Sniffer of Lost Kids
        </p>
      </div>
    </div>
  )
})

export default app
