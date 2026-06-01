# 🌈 Fab 5 Fun Club

## Project Overview
- **Name**: Fab 5 Fun Club
- **Goal**: An interactive adventure-planning website for Saia, Elijah, Charlotte, Ace & Sienna — a 5-friend fun club based on the Sunshine Coast & Hinterlands, SE Queensland, Australia.
- **Features**:
  - 🎨 Custom colorful logo representing fun & adventure
  - 📅 Interactive calendar (Saturdays & Sundays only, 7am – 7pm)
  - ➕ Add events with activity, time, location, who's coming, equipment to pack, and notes
  - 🗑️ Delete events you no longer want
  - 👋 Crew member profiles
  - 🎯 Browse 25 epic activities by category (Wheels, Water, Adventure, Skills, Fun)
  - 📱 Mobile responsive — works on phone, tablet, laptop

## Live URL
- **Sandbox preview**: see the public URL in the chat — currently running on port 3000
- **GitHub**: not pushed yet
- **Cloudflare Pages**: not deployed yet

## Currently Completed Features
✅ Colorful animated hero with logo, club name, and crew names
✅ Crew section showing all 5 members with custom emoji + color
✅ Monthly calendar with month navigation (◀ ▶)
✅ Weekend cells highlighted; cells with events highlighted; today gets a pink outline
✅ Click a Sat/Sun cell to jump to the add-event form pre-filled with that date
✅ Add-event form with activity dropdown (25 activities), date picker (Sat/Sun only), start/end time, location, member checkboxes, equipment list, notes
✅ Upcoming events list with date badge, full details, member chips, equipment chips, notes
✅ Activities grid filterable by category — click any activity to plan an event with it
✅ Two pre-loaded seed events (Motocross & Snorkel/SUP) so you can see how it works
✅ Server-side weekend validation (only Sat/Sun events accepted)
✅ Friendly error/success toast messages on the form

## Functional API Endpoints
| Method | Path                  | Description                                                                              |
|--------|-----------------------|------------------------------------------------------------------------------------------|
| GET    | `/`                   | Main app page (home, calendar, add event, activities)                                    |
| GET    | `/api/club-info`      | Club name, location, 5 members, 25 activities                                            |
| GET    | `/api/events`         | All events, sorted by date                                                               |
| POST   | `/api/events`         | Create event. Body: `{title, activity, date (YYYY-MM-DD, Sat/Sun), startTime, endTime, location, members[], equipment[], notes}` |
| DELETE | `/api/events/:id`     | Delete an event by id                                                                    |

## Data Architecture
- **Data Models**:
  - `Event { id, title, activity, date, startTime, endTime, location, members[], equipment[], notes, createdAt }`
  - `Member { name, role, emoji, color }`
  - `Activity { name, emoji, category }`
- **Storage Service**: In-memory (resets when the worker restarts). See "Next Steps" below to switch to Cloudflare D1 for permanent storage.
- **Data Flow**: Browser → `fetch('/api/...')` → Hono routes → in-memory store → JSON response → frontend re-renders calendar/list.

## Activities Available (25)
**Wheels** 🏍️ Motocross • Enduro Trails • Go Karting • Skateboarding • Rollerskating
**Water** 🌊 Kayaking • Snorkeling • SUP • Wakeboarding • Water Skiing • Jet Skiing • Sailing • 6HP Boating • Aqua Park Inflatables
**Adventure** 🥾 Waterfalls & Creeks • Canyoning • Caving • Abseiling • Trekking • Camping
**Skills** ⛑️ First Aid Training • Survival Skills
**Fun** 🎢 Theme Parks • Pig Races • Outback Festivals

## User Guide (for Saia & the crew!)
1. Open the site — you'll see the logo & your names up top.
2. Scroll to **📅 Weekend Adventure Calendar** to see this month at a glance. Yellow cells = events. Aqua cells = weekend.
3. Click any **Saturday or Sunday** cell to start planning an event for that day.
4. Or scroll to **➕ Plan a New Adventure** and fill in the form:
   - Pick a title (e.g. "Epic Wakeboard Day")
   - Choose an activity from the dropdown
   - Pick a date (must be Sat or Sun!)
   - Set start/end times (7am – 7pm)
   - Type the location (e.g. "Lake MacDonald")
   - Tick everyone who's coming
   - List what to pack (comma-separated: e.g. "wakeboards, rope, life jackets")
   - Add notes (e.g. "Meet at Saia's 6am to load utes")
   - Hit **🎉 Add to Calendar**
5. See your event appear in both the calendar and the "Upcoming Adventures" list.
6. Tap the ✕ on an event card to delete it.
7. Scroll to **🎯 Our Epic Activities** to browse — click any activity card to start planning an event with it.

## Features Not Yet Implemented
- 💾 Persistent storage (events disappear if the server restarts) — would use Cloudflare D1
- 🔐 Login / per-member accounts
- 📸 Photo uploads from past adventures (would use Cloudflare R2)
- 🌦️ Weather forecast preview for event dates
- 🗺️ Map view of locations (Google Maps / OpenStreetMap)
- 📲 Mobile push reminders the day before an event
- 💰 Equipment-purchase wishlist & shared budget tracker
- 🎉 RSVP yes/no/maybe per member instead of just ticking
- 🏆 Badges / "completed adventures" log
- ☁️ Cloudflare Pages production deploy

## Recommended Next Steps
1. **Add D1 database** to make events permanent across restarts (I can do this — just say the word!)
2. **Deploy to Cloudflare Pages** so the site is on the public internet at a real URL (e.g. `fab5funclub.pages.dev`)
3. **Add photo uploads** for each past event (R2 bucket)
4. **Add weather forecast** for each event date using a free weather API
5. **Add a map** for event locations
6. **Get a custom domain** like `fab5funclub.com.au` 🇦🇺

## Deployment
- **Platform**: Cloudflare Pages (Hono + Workers runtime) — running locally in sandbox via PM2 + Wrangler
- **Status**: ✅ Active (sandbox preview)
- **Tech Stack**: Hono 4 (TypeScript JSX) • Vite 6 build • Cloudflare Pages compatibility • Vanilla JS frontend • Google Fonts (Fredoka + Bungee)
- **Last Updated**: 2026-06-01

## Local Development
```bash
cd /home/user/webapp
npm run build                         # build to dist/
pm2 start ecosystem.config.cjs        # start on port 3000
pm2 logs webapp --nostream            # check logs
curl http://localhost:3000/api/events # test API
```
