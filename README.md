# 🌈 Fab 5 Fun Club

## Project Overview
- **Name**: Fab 5 Fun Club
- **Goal**: A **private**, interactive adventure-planning website for Saia, Elijah, Charlotte, Ace & Sienna — a 5-friend fun club based on the Sunshine Coast & Hinterlands, SE Queensland, Australia. Their dog Pebbles is the AI events mascot.
- **Features**:
  - 🔐 Private login (password-protected)
  - 🎨 Custom colorful logo
  - 🐾 **Pebbles the AI Mascot** — Saia's real Bull Arab dog reborn as an AI events coach with chat
  - 📅 Interactive calendar (Saturdays & Sundays only, 7am – 7pm)
  - ➕ Manual or AI-assisted event creation
  - 🌟 Club Values + Duke of Edinburgh-style adventure framework + Team Leader questions
  - 🗑️ Delete events
  - 👋 Crew member profiles (5 friends + Pebbles)
  - 🎯 25 epic activities by category
  - 📱 Mobile responsive

## Live URL (Sandbox Preview)
**https://3000-i9m9vtz06aqmft4184vj3-ea026bf9.sandbox.novita.ai**

- **Password**: `pebbles123!`
- **GitHub**: not pushed yet
- **Cloudflare Pages**: not deployed yet

## Currently Completed Features
✅ **Login screen** — animated rainbow background, password protection, cookie-based session (90 days)
✅ **Logout button** in the top-right of the main app
✅ **Colorful animated hero** with logo, club name, crew, and Pebbles mascot mention
✅ **The Crew section** — 5 friends + Pebbles (with her real photo as avatar)
✅ **Our Values section** — Carla's three rules, Duke of Edinburgh framework, Team Leader questions
✅ **Monthly calendar** with navigation, weekend highlighting, click-to-add
✅ **Add Event form** — activity dropdown, Sat/Sun-only date picker, time 7am–7pm, member checkboxes, equipment, notes
✅ **Upcoming events list** with detailed cards & delete
✅ **25 activities** filterable by category — click to start planning
✅ **🐾 PEBBLES AI CHAT WIDGET** (floating bubble bottom-right):
  - Real photo of Pebbles as avatar
  - Aussie dog personality, kid-safe language
  - Knows local Sunshine Coast spots for every activity
  - Knows typical kid budgets for activities
  - Teaches team leadership questions
  - Reinforces club values (Carla's 3 rules + Duke of Ed framework)
  - **Can ADD EVENTS to the calendar directly via OpenAI tool calling**
  - Confirms before adding
  - Quick-action buttons for common questions
  - User-selector so Pebbles knows which kid is chatting
✅ Server-side weekend validation
✅ Friendly error/success messages

## Functional API Endpoints
| Method | Path                  | Auth | Description |
|--------|-----------------------|------|-------------|
| GET    | `/`                   | public | Main app page (renders login overlay if not authed) |
| POST   | `/api/login`          | public | `{password}` → sets 90-day session cookie |
| POST   | `/api/logout`         | public | Clears session cookie |
| GET    | `/api/me`             | public | `{authed: bool}` |
| GET    | `/api/club-info`      | 🔐 | Club name, location, 6 members, 25 activities |
| GET    | `/api/events`         | 🔐 | All events, sorted by date |
| POST   | `/api/events`         | 🔐 | Create event (Sat/Sun only). Body: `{title, activity, date, startTime, endTime, location, members[], equipment[], notes}` |
| DELETE | `/api/events/:id`     | 🔐 | Delete event by id |
| POST   | `/api/pebbles/chat`   | 🔐 | Body: `{messages: [...], user: "Saia"}` → returns Pebbles AI reply, may also create an event |

## Data Architecture
- **Models**:
  - `Event { id, title, activity, date, startTime, endTime, location, members[], equipment[], notes, createdAt }`
  - `Member { name, role, emoji, color }`
  - `Activity { name, emoji, category }`
- **Storage**: In-memory (resets on worker restart) — TODO: migrate to Cloudflare D1
- **AI**: OpenAI-compatible LLM (`gpt-5-mini`) via Genspark LLM proxy
- **Auth**: HTTP-only session cookie (`fab5_auth`), 90-day expiry, shared password stored in `CLUB_PASSWORD` env var
- **Secrets**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CLUB_PASSWORD` stored in `.dev.vars` locally (git-ignored)

## How to Share Access With Your Friends & Their Parents
1. **Send them this URL**: https://3000-i9m9vtz06aqmft4184vj3-ea026bf9.sandbox.novita.ai
2. **Send them the password**: `pebbles123!`
3. They'll see the login screen, type the password, and they're in!
4. The login lasts 90 days on their device — so once they log in, they won't have to do it again for ages.

## Pebbles' Knowledge — Sunshine Coast Spots
Pebbles knows real local spots for: motocross, kayaking, snorkeling, wakeboarding, waterfalls, caving, abseiling, skateparks, go karting, aqua parks, theme parks, camping, and outback festivals. Including: Coolum Pines MX, Lake MacDonald, Maroochy River, Noosa Everglades, Kondalilla Falls, Gardners Falls, Booloumba Creek, Mt Coolum, Mt Tibrogargan, Maroochydore Skatepark, Big Kart Track Landsborough, Aussie World, and many more.

## Pebbles' Values (Taught to Saia by her Mum, Carla)
> **"Don't be selfish. Don't be greedy. Don't be impatient. Then everything will be ok."**

Plus inspiration from the **Duke of Edinburgh Award** (Carla did this when she was younger!) — every adventure should include:
1. **SKILL** — learn something new
2. **PHYSICAL** — move your body
3. **ADVENTURE** — try something exciting
4. **SERVICE** — help someone else

## Activities Available (25)
**Wheels** 🏍️ MX • Enduro • Go Karting • Skateboarding • Rollerskating
**Water** 🌊 Kayaking • Snorkeling • SUP • Wakeboarding • Water Skiing • Jet Skiing • Sailing • 6HP Boating • Aqua Park
**Adventure** 🥾 Waterfalls • Canyoning • Caving • Abseiling • Trekking • Camping
**Skills** ⛑️ First Aid • Survival
**Fun** 🎢 Theme Parks • Pig Races • Outback Festivals

## User Guide
1. **Log in** with the club password.
2. **Talk to Pebbles** — click the floating dog photo in the bottom-right corner. Pick your name from the dropdown so she knows who's chatting. Try the quick-action buttons or type freely!
3. **Pebbles can add events** — describe an adventure (activity, date, who's coming, location), confirm, and she'll put it straight on your calendar.
4. **Or use the form** — scroll to "➕ Plan a New Adventure" to add events manually.
5. **Browse activities** — click any of the 25 activity cards to start planning that activity.
6. **Read your values** — the "🌟 Our Values" section reminds you of Carla's wisdom and the Duke of Ed framework.

## Features Not Yet Implemented
- 💾 Persistent storage (events disappear if worker restarts) — would use Cloudflare D1
- 📸 Photo uploads from past adventures (R2 storage)
- 🌦️ Weather forecast preview for event dates
- 🗺️ Map view of locations
- 📲 Mobile push reminders
- 💰 Shared equipment budget/wishlist tracker
- 🎉 RSVP yes/no/maybe
- 🏆 Badges / completed adventures log (Duke of Ed style progress!)
- 👤 Individual logins per person (currently one shared password)
- ☁️ Cloudflare Pages production deploy with custom domain

## Recommended Next Steps
1. **Persist data with Cloudflare D1** so events survive restarts
2. **Deploy to Cloudflare Pages** so the site is on a real URL like `fab5funclub.pages.dev`
3. **Per-user logins** so each kid has their own login (better security than a shared password)
4. **Photo gallery of past events** (R2 bucket)
5. **Duke of Ed progress tracker** — track which adventures included Skill / Physical / Adventure / Service and award badges
6. **Email/SMS reminders to parents** the day before each event

## Deployment
- **Platform**: Cloudflare Pages (Hono + Workers runtime) — running locally in sandbox via PM2 + Wrangler
- **Status**: ✅ Active (sandbox preview, password-protected)
- **Tech Stack**: Hono 4 (TypeScript JSX) • Vite 6 build • OpenAI-compatible AI (gpt-5-mini) • Cookie auth • Vanilla JS frontend
- **Last Updated**: 2026-06-01

## Local Development
```bash
cd /home/user/webapp
npm run build
pm2 start ecosystem.config.cjs
pm2 logs webapp --nostream
curl http://localhost:3000/api/me
```
