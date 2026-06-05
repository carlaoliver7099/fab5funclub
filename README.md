# 🌈 Fab 5 Fun Club

## Project Overview
A **private, AI-powered adventure-planning website** for 5 friends — **Ace, Charlotte, Elijah, Saia & Sienna** — an EGALITARIAN fun club on the Sunshine Coast & Hinterlands, SE Queensland, Australia. Their Bull Arab puppy **Pebbles** is the AI events mascot, badge-awarder, and leadership coach.

> 🤝 **Egalitarian rule**: "We don't have roles. We just wear the merch for leader when we are the leader. Other than that we are just the Fab 5."

## Live URLs

### 🌐 Production (LIVE on Cloudflare!)
- **Primary**: https://fab5funclub.pages.dev
- **Custom domain (pending mum's DNS setup)**: https://fab5funclub.org
- **Password**: `pebbles123!`

### Sandbox (development)
- https://3000-i9m9vtz06aqmft4184vj3-ea026bf9.sandbox.novita.ai

### Source Code
- **GitHub**: https://github.com/carlaoliver7099/fab5funclub

## Currently Completed Features
✅ **Private login** (90-day cookie session, password: `pebbles123!`)
✅ **Sticky top navigation** for jumping between sections
✅ **Egalitarian rebrand** — no founder, no captain, all "Fab 5"
✅ **Cartoon group hero image** — all 5 cartoon kids + real Pebbles (Bull Arab girl!) under a rainbow on the Sunshine Coast
✅ **Individual cartoon avatars** for all 5 friends (Pixar-style, custom-drawn from real photos)
✅ **The Crew** — 5 friends with their cartoon avatars + Pebbles (real photo)
✅ **Team Charter / Values section** with:
   - 🤝 Egalitarian rule (top of section)
   - Our 3 club rules (not selfish/greedy/impatient)
   - Our team rule ("if you're not a team player, you're not in the team")
   - Our story wisdom ("we have the pen in our hands")
   - Duke of Edinburgh 4-pillar framework with link to dukeofed.com.au
   - Peer-guidance explanation + Team Leader questions
✅ **Calendar** — month nav, weekend-only Sat/Sun events, leader badge per event, click rotate button
✅ **Add Event form** — full details + leader selector + auto-rotate option
✅ **Leader Rotation tracker** — shows who's led how many times, highlights "next up"
✅ **Merch section** — 4 designs (crew tee, leader tee in gold, hoodie, snapback caps + leader cap)
   - "How to print" guide (Redbubble, Printify, local printers)
   - Pebbles' pup-tip on sizing
✅ **Awards section** with:
   - All 8 badge designs shown
   - Nominate-a-friend form (peer feedback only — can't self-award)
   - Per-member badge cards with reasons and "from" attribution
   - Delete badges
✅ **Gallery** — upload photos & videos (under 2MB, base64 in-memory), captions, by-line, delete
✅ **Concert Wishlist** — pre-seeded with Olivia Rodrigo (GUTS Tour) + Chappell Roan (Pink Pony Club!), add new, interest chips (5 members can tap to mark "I want to go")
✅ **🐾 Pebbles AI** with 3 tool-calling abilities (now egalitarian-aware):
   - `create_event` — adds events to calendar (Sat/Sun validated, auto-rotates leader)
   - `award_badge` — issues badges with peer-feedback reasons (asks for detail first!)
   - `add_concert` — adds concerts to wishlist
   - Knows leader-rotation fairness, never calls Saia "founder", treats all 5 as equals
   - Aussie dog personality, kid-safe, teaches leadership questions
✅ **Cloudflare Pages production deploy** — live worldwide on the edge!
✅ **🏷️ Club Asset Register** at `/assets` — track club-owned equipment with:
   - Auto-generated asset IDs (F5-001, F5-002…)
   - Categories (watersports, cycling, camping, climbing, sports, safety, camera, other)
   - Borrow / return tracking with full history per item
   - **QR code stickers** (free api.qrserver.com) — print and stick on the gear
   - **Printable single sticker** or **print-all-stickers** sheet
   - Dashboard stats (total items, at-club, borrowed, in-repair, club investment $, overdue)
   - Search by name/ID/notes, filter by category & status
   - **Helper-mode gating** — only parents can add/edit/delete; kids can borrow & return
   - **🚪 Member-leaving handback workflow** — checklist + printable form of everything a kid has out, so nothing gets lost when someone leaves the club
   - Detail view with QR + full history + cost + vendor + notes
   - Hash deep-link: `/assets#F5-001` jumps straight to that item
   - **Cloudflare KV persistence** — survives restarts (key `assets:all`)
✅ **🎯 DofE Coverage View** at `/dofe-syllabus#dofe-coverage` — the **reverse mapping**: instead of "what does this activity build?", it asks "for each DofE pillar we need, which of our PLANNED events covers it — and where are the gaps?"
   - 4-pillar gap analysis (🔴 GAP <25% / 🟡 THIN <50% / 🟢 ON-TRACK <100% / 🏆 STRONG ≥100% of Bronze target)
   - For each pillar: list of scheduled events that build it + coverage % progress bar + count of past/upcoming events + count of template weeks
   - **Gap-filler recommendations** — unscheduled activities first, sorted by efficiency (activities hitting 3 pillars marked 🔥)
   - Master event table — every event on the calendar tagged with which pillars it builds (or marked "fun bonus" if no DofE credit)
   - Auto-detects strongest & weakest pillar across the whole calendar
   - Activity → pillar mapping is M:N (an activity like Abseiling builds 3 pillars; Beach Cleanup builds 1)
✅ **🏅 DofE pillar chips on every event card** — homepage calendar now shows "Builds: 💪 Physical 🎓 Skills" badges (or "🎉 Fun bonus" for no-credit events) so the crew sees DofE progress every time they look at an event
✅ **🐶 Pebbles Oops 404 page** — friendly custom 404 instead of Cloudflare's generic page
✅ **💚 Fundraising Hub** at `/fundraising` — Containers for Change tracker with:
   - Big member-number hero card (**C11761772** — our fab5funclub team code)
   - 4 stat circles ($ in pocket, containers saved, donated to cause, lifetime raised) synced manually from the CforC dashboard
   - **🎯 Savings Pace Simulator** — interactive slider 0–$1000/month (default $150 = Saia's challenge) with live vibe labels (Tiny steps → Steady saver → On target → Crushing it → Fab 5 dynasty), live containers-per-month, containers-per-day, $/year, and "all goals done by" date
   - 3 prioritised savings goals: 🥇 Crew Merch ($300) → 🥈 MX Farm Camping ($600) → 🥉 Olivia Rodrigo Tickets ($1,500)
   - Each goal shows current progress bar + **projected ghost-bar overlay** showing where we'll be after 1 month at current pace, plus per-goal ETA
   - Donation log (date / source / amount / containers / goal allocation) with edit & undo
   - **Adult-mode unlock** — anyone can VIEW; only people who know the CforC member number C11761772 can LOG donations or sync dashboard totals
   - 4-step "How supporters can donate" guide with copyable member number + team-invite QR poster (printable A4)
   - **Cloudflare KV persistence** (key `fundraising:state`)
   - Confetti animation when a goal is reached 🎉

## API Endpoints
All `/api/*` (except `/api/login`, `/api/logout`, `/api/me`) require login cookie.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Body `{password}` → cookie |
| POST | `/api/logout` | Clears cookie |
| GET  | `/api/me` | `{authed: bool}` |
| GET  | `/api/club-info` | Club name, location, 6 members, 25 activities, 8 badges |
| GET  | `/api/events` | All events |
| POST | `/api/events` | Create event (Sat/Sun only). Auto-rotates leader if not provided. |
| DELETE | `/api/events/:id` | Delete |
| POST | `/api/leader/rotate/:eventId` | Rotate leader to next member |
| GET  | `/api/leader/next` | Suggest fairest next leader |
| GET  | `/api/awards` | All awards (peer feedback) |
| POST | `/api/awards` | Body `{awardedBy, member, badgeId, reason}` |
| DELETE | `/api/awards/:id` | Delete |
| GET  | `/api/gallery` | All photos/videos |
| POST | `/api/gallery` | Body `{type, dataUrl, caption, uploadedBy}` (<2MB) |
| DELETE | `/api/gallery/:id` | Delete |
| GET  | `/api/concerts` | All concert wishlist items |
| POST | `/api/concerts` | Body `{artist, tour, city, date, notes}` |
| POST | `/api/concerts/:id/interested` | Body `{member, going: bool}` toggle interest |
| DELETE | `/api/concerts/:id` | Delete |
| POST | `/api/pebbles/chat` | Body `{messages, user}` → AI reply, may create events/awards/concerts |
| GET  | `/api/assets` | List all club-owned gear with summary stats |
| GET  | `/api/assets/:id` | Get a single asset (e.g. `F5-001`) |
| POST | `/api/assets` | Create new asset (helper-mode only) — body: `{name, category, condition, purchaseCost?, purchaseDate?, purchaseFrom?, notes?, photoUrl?}` |
| PATCH | `/api/assets/:id` | Edit asset (helper-mode only) |
| DELETE | `/api/assets/:id` | Remove asset (helper-mode only) |
| POST | `/api/assets/:id/borrow` | Member borrows home — body: `{borrower, note?}` |
| POST | `/api/assets/:id/return` | Return to club — body: `{note?}` |
| GET  | `/api/assets/handback/:name` | List everything `:name` currently has borrowed (for leaving-club handback) |
| GET  | `/api/dofe/syllabus` | Full DofE pillars + 52-week plan + current week marker |
| GET  | `/api/dofe/progress/:name` | A kid's pillar hours + Bronze/Silver/Gold % + this week's activity |
| GET  | `/api/dofe/team` | All 5 kids' DofE progress in one call (combined chart) |
| GET  | `/api/dofe/journey/:name` | Event-by-event journey for a kid, each tagged with syllabus areas |
| GET  | `/api/dofe/coverage` | **Reverse mapping** — for each pillar, which scheduled events build it + gap status (gap/thin/on-track/strong) + recommended unscheduled activities to plug gaps. Used by the Coverage view at `/dofe-syllabus#dofe-coverage` |
| GET  | `/api/fundraising` | Full state: $ in pocket, containers saved, goals, donations |
| POST | `/api/fundraising/unlock` | Body `{unlockCode}` → verifies CforC member number = adult mode |
| POST | `/api/fundraising/sync` | Adult pastes dashboard snapshot — body: `{inPocketAud, containersSavedFromLandfill, donatedToCauseAud, syncedBy?, unlockCode}` |
| POST | `/api/fundraising/donations` | Log a donation — body: `{amountAud or containers, date?, source?, goalId?, notes?, loggedBy?, unlockCode}` |
| PATCH | `/api/fundraising/donations/:id` | Re-allocate donation to a different goal (adult only) |
| DELETE | `/api/fundraising/donations/:id` | Undo a donation (adult only) |
| POST | `/api/fundraising/goals` | Add savings goal — body: `{emoji, title, targetAud, description?, unlockCode}` |
| PATCH | `/api/fundraising/goals/:id` | Edit goal (adult only) |
| DELETE | `/api/fundraising/goals/:id` | Remove goal (adult only) |

## Badges (8)
**Duke of Edinburgh inspired:**
- 🧠 Skill Master — learned something new
- 💪 Physical Hero — pushed their body
- 🏞️ Adventurer — tried something exciting outdoors
- ❤️ Service Star — helped someone

**Fab 5 Values (passed down to the crew from family):**
- 🤝 Team Player — "no team player → not in team"
- 👯 Peer Mentor — guided a friend with kindness
- 💛 Kind Heart — not selfish, greedy, or impatient
- ⛑️ Safety Champ — kept the team safe

## Merch Designs
- 👕 Crew T-Shirt — white with rainbow logo, 5 names — Est. $25-35
- 🎖️ Leader T-Shirt — GOLD edition rotates daily — Est. $30-40
- 🧥 Crew Hoodie — pink with huge back print — Est. $55-75
- 🧢 Crew + Leader Caps — teal & gold snapbacks — Est. $25-35 each

Print via: Redbubble, Printify, Spring, or local Sunshine Coast printers.

## Leader Merch System
- Gold tee/hoodie/cap rotates fairly between Ace, Charlotte, Elijah, Saia, Sienna
- The Leader of the Day asks the team-leader questions, not bossy
- After every event, crew gives kind peer feedback to the leader
- Tracker on the Merch section shows counts so rotation stays fair

## Data Architecture
- **Cloudflare KV** (binding `PROFILES_KV`): club profiles + assets register (keys `assets:all`, `assets:counter`) — survives restarts
- **In-memory** stores: events, awards, gallery (base64), concerts (resets on worker restart)
- **AI**: OpenAI-compatible (`gpt-5-mini`) via Genspark LLM proxy with 3 function tools
- **Auth**: HTTP-only cookie, 90-day expiry, shared password in `CLUB_PASSWORD`
- **Secrets** in `.dev.vars` (git-ignored): `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CLUB_PASSWORD`

## Features Not Yet Implemented
- 💾 Persistent storage (Cloudflare D1) — events/awards/gallery reset on restart
- 📸 Gallery on R2 storage so big videos work (currently 2MB cap)
- 👤 Onboarding wizard — each friend fills in their own profile via invite link (designed, awaiting mum's login choice A/B/C)
- 🌦️ Weather forecast for event dates
- 🗺️ Map view of locations
- 📲 SMS/email reminders to parents
- 🏆 "Duke-of-Ed style progress tracker" — auto badges when adventure covers all 4 pillars
- 🎟️ Live concert API integration (Ticketek/Ticketmaster) for real concert dates

## Recommended Next Steps
1. **Mum finishes DNS setup** so `fab5funclub.org` resolves to the Pages project
2. **Onboarding wizard** — each friend logs in with an invite link and fills in their own profile
3. **Cloudflare D1** — make all data permanent
4. **Cloudflare R2** — host big photos/videos
5. **Per-person logins** (better security for parent sharing)
6. **Live concert ticket integration**
7. **Photo tagging** — tag which crew members are in each photo
8. **Adventure progress dashboard** — show stats per person (badges earned, events led, etc.)

## Deployment
- **Platform**: Cloudflare Pages (Hono + Workers, edge-deployed worldwide)
- **Project name**: `fab5funclub`
- **Production branch**: `main`
- **Status**: ✅ Live at https://fab5funclub.pages.dev
- **Custom domain**: fab5funclub.org (DNS pending mum's setup)
- **Tech**: Hono 4 TSX • Vite 6 • OpenAI-compatible gpt-5-mini • cookie auth • vanilla JS
- **Last Updated**: 2026-06-02
