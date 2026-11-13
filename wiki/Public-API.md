# Public API

A small, versioned, read-only surface that lets other software read your trips — built for integrations like location trackers, journalling tools and home automation, where something outside TREK wants to know what you planned.

> **Not the same as the internal API.** TREK's own frontend talks to a few hundred endpoints under `/api/…`. Those answer a session cookie, carry no version and change whenever the client changes — they are not a contract, and anything built on them will break. The public API is the opposite promise: a handful of endpoints under `/api/v1/`, authenticated with a key you mint yourself, that will not change shape without a new version number.

## What it can do

Read trips. That is deliberate and complete:

- list the trips you own or are a member of
- fetch one trip with its days, places in planned order, day notes, reservations, accommodations and fellow travellers
- download a tour's route as a GPX file for a bike computer or a route planner, or as a FIT course for a watch
- follow a public transport journey stop by stop: its points, lines, tracks and times
- read the bucket list: places the traveller wants to reach, not tied to any trip
- read a handful of totals for a dashboard widget: trips, countries, cities, places, days, flown distance, and the last trip taken

It cannot write anything. An integration that reads your itinerary needs no ability to delete a place, and a key that can only read is a very different thing to hand to third-party software.

## Getting a key

1. Open **Settings → Integrations** in the desktop layout. The tab is always there and needs no addon: an API key works with MCP and every other integration switched off. The phone layout has no API Keys section yet, so create the key on a wider screen.
2. Under **API Keys**, click **Create key** and give it a name you will recognise later (the name is only for you — "Dawarich", "home assistant", "laptop script")
3. Choose **what the key may read.** Everything is selected by default. Anything you switch off is refused for that key.
4. **Copy the key immediately.** It is shown once. TREK stores only a hash of it, so it cannot be shown again — if you lose it, delete the key and make a new one.

Keys look like `trek_` followed by 48 characters. You can hold ten at a time.

> **API keys and MCP tokens are not interchangeable.** They live on the same screen but open different doors: an [MCP token](MCP-Setup) drives every assistant tool, an API key reads trips over HTTP. A key of the wrong kind is rejected exactly like one that does not exist. Mint the kind the other software asks for.

To revoke access, delete the key. It stops working immediately, and anything using it gets a 401 on its next request.

## Using it

Send the key as a bearer token:

```bash
curl -H "Authorization: Bearer trek_your_key_here" \
     https://trek.example.com/api/v1/trips
```

or, if the software you are configuring expects a header named for an API key:

```bash
curl -H "X-API-Key: trek_your_key_here" \
     https://trek.example.com/api/v1/trips
```

Both are equivalent. Use whichever the other side offers.

## What a key may read

A key can be narrowed when you create it, to any subset of:

`trips` · `days` · `places` · `notes` · `reservations` · `accommodations` · `travellers` · `bucket-list` · `stats`

This is **not** the same as `include`. `include` chooses which sections a response carries and any key may ask for any of them; this decides what the key may see at all, and the server refuses the rest with a `403`. `trips` is the entry ticket for both trip endpoints: without it, every call to `/api/v1/trips` and `/api/v1/trips/{id}` is a `403` with `required_scope: "trips"`, whatever else the key was given. The other areas only trim what a trip brings along. A key given `trips`, `days` and `notes` reads exactly that, however it asks.

Two rules make it predictable:

- **A section you named but may not read is a `403`**, with the missing one in `required_scope`. Silently dropping what you explicitly asked for would send you debugging your own correct code.
- **A section you did not name is simply left out.** `include` defaults to everything, so a narrow key that omits `include` gets what it may have rather than an error for wanting sections it never mentioned.

A key without `days` still receives the day skeleton when it asks for `places`, `notes` or `reservations`, because those are reported on days; each day then carries its `date` and `day_number`, and its `title` and `notes` are `null`.

Keys created before this existed, and keys created with everything selected, read all of it — nothing that worked before stops working.

## Endpoints

### `GET /api/v1/trips`

Every trip you can reach, newest first, without itineraries.

```json
{
  "trips": [
    {
      "id": 12,
      "title": "Tuscany",
      "description": "Wine and hill towns",
      "start_date": "2026-06-14",
      "end_date": "2026-06-22",
      "currency": "EUR",
      "archived": false,
      "updated_at": "2026-06-01 10:00:00"
    }
  ]
}
```

`updated_at` moves when the trip's **own** fields change — title, dates, currency, cover. It does **not** move when a place, a day or a note is edited. Do not use it to decide whether to re-fetch; you would miss every itinerary change. Compare the payload instead.

### `GET /api/v1/trips/{id}`

One trip with its contents. Returns **404** if the trip does not exist *or* is not yours — the two are indistinguishable on purpose, so the endpoint cannot be used to find out which trip ids exist.

Pick what you need with `?include=`, comma-separated:

| Section | What it adds |
|---|---|
| `days` | the itinerary spine: one entry per day, with `date`, `day_number`, `title`, `notes` |
| `places` | stops on each day, **in planned order**, with coordinates, times, duration, category and transport mode; a tour also has its type, its length and a link to its route |
| `notes` | timed free-text notes on a day |
| `reservations` | bookings on their starting day: type, title, location, time, status; a transport booking also has its points, and a public transport journey its legs |
| `accommodations` | where you sleep, with the date range resolved and check-in/check-out times |
| `travellers` | who is on the trip, by display name |

Two sections come back at trip level rather than on a day, because that is where they live:

| Field | Comes with | What it is |
|---|---|---|
| `unplanned_places` | `places` | places collected but not scheduled yet. On a real instance these are routinely **half** of a trip's places, and they carry coordinates. A hotel is not listed here; it is under `accommodations`. |
| `unscheduled_reservations` | `reservations` | bookings with no day. Deleting a day or shortening a trip detaches the bookings on the days that go rather than deleting them, so these exist in the wild. |

Asking for `places`, `notes` or `reservations` brings `days` along automatically, since that is where they are reported. `?include=notes` returns the day skeleton with its notes and empty place lists, not an empty trip.

Omitting `include` returns everything. A section you did not ask for is **absent** rather than empty, so your code can tell "not requested" apart from "nothing there". An unknown section name is a `400` rather than being silently ignored — a typo should not hand you a payload quietly missing what you wanted.

```bash
# only the notes, for a lightweight sync
curl -H "Authorization: Bearer trek_…" \
     "https://trek.example.com/api/v1/trips/12?include=days,notes"
```

```json
{
  "id": 12,
  "title": "Tuscany",
  "start_date": "2026-06-14",
  "days": [
    {
      "date": "2026-06-14",
      "day_number": 1,
      "title": "Arrival",
      "notes": null,
      "places": [
        {
          "name": "Uffizi",
          "address": "Florence",
          "lat": 43.76, "lng": 11.25,
          "time": "14:00", "end_time": null,
          "duration_minutes": 180,
          "category": "Museum",
          "notes": null,
          "transport_mode": "walking",
          "gpx_url": null, "fit_url": null, "tour_type": null, "distance_m": null
        },
        {
          "name": "Ridge walk to Fiesole",
          "address": null,
          "lat": 43.80, "lng": 11.29,
          "time": "09:00", "end_time": null,
          "duration_minutes": 240,
          "category": null,
          "notes": null,
          "transport_mode": "walking",
          "gpx_url": "/api/v1/trips/12/tours/41/gpx",
          "fit_url": "/api/v1/trips/12/tours/41/fit",
          "tour_type": "hike",
          "distance_m": 12346
        }
      ],
      "day_notes": [{ "text": "Bring the tickets", "time": "09:00" }],
      "reservations": [
        { "type": "flight", "title": "LH 1234", "location": "FRA",
          "time": "2026-06-14T08:00", "end_time": null,
          "status": "confirmed", "notes": null,
          "endpoints": [
            { "role": "from", "name": "Frankfurt", "code": "FRA", "lat": 50.03, "lng": 8.56,
              "local_date": "2026-06-14", "local_time": "08:00" },
            { "role": "to", "name": "Florence", "code": "FLR", "lat": 43.81, "lng": 11.2,
              "local_date": "2026-06-14", "local_time": "09:35" }
          ],
          "legs": [] }
      ]
    }
  ],
  "accommodations": [
    { "name": "Hotel Alba", "address": null, "lat": null, "lng": null,
      "start_date": "2026-06-14", "end_date": "2026-06-15",
      "check_in": "15:00", "check_out": "11:00", "notes": null }
  ],
  "travellers": [{ "name": "ada", "owner": true }, { "name": "bob", "owner": false }]
}
```

#### Tours

A tour (a hike, a run, a ride, a ski or paddle route, a city walk) is a place like any other, at its starting point, with four more fields. They are `null` on every place that is no tour.

| Field | What it is |
|---|---|
| `gpx_url` | where its route is served as a GPX file (see below), or `null` when the tour has no route of its own |
| `fit_url` | where the same route is served as a FIT course (see below); `null` exactly when `gpx_url` is |
| `tour_type` | the tour's type as TREK names it: `hike`, `run`, `bike`, `walk` (a city walk), `ski`, `kayak` (any paddle tour), `horse`, `food` … Passed through unmapped, like a booking's `type`, so expect values you have not seen |
| `distance_m` | its length in whole metres, or `null` when TREK does not know it |

`gpx_url` and `fit_url` are paths on your TREK instance. Resolve them against the base URL you already call the API at, and send the same key. Follow them rather than building them yourself: the reference in them is opaque, and the place carries no id you could build it from.

#### Transport and public transport

Every booking has two more lists, empty when there is nothing to put in them:

- **`endpoints`** — the points of a transport booking in travel order: where it starts (`role: "from"`), each change on the way (`"stop"`) and where it ends (`"to"`). Each has a `name`, a `code` (an airport's IATA code, where there is one), `lat`/`lng`, and the `local_date` and `local_time` at that point, as a departure board there would show them. A stop carries the time the journey leaves it again.
- **`legs`** — for a public transport journey planned in TREK (`type: "transit"`), each leg of it, walks included:

```json
{ "mode": "LONG_DISTANCE", "line": "EC 278", "headsign": "Praha hl.n.", "agency": "České dráhy",
  "duration_s": 8880, "stops": 2,
  "from": { "name": "Brno hl.n.", "time": "08:28", "track": "3" },
  "to":   { "name": "Praha hl.n.", "time": "10:56", "track": "5" } }
```

`mode` is the journey planner's word (`WALK`, `BUS`, `TRAM`, `SUBWAY`, `REGIONAL_RAIL`, `LONG_DISTANCE` …) and is passed through unmapped. `stops` counts the stops between boarding and getting off, `duration_s` is in seconds, and the times are local, like the endpoints'. A walk has no `line`. What TREK keeps beside a leg for its own map, the drawn line and the line's colours, is not part of the payload, and neither are prices or confirmation codes.

With both, the next change of a journey is a lookup: the first leg whose `from.time` is still ahead names the stop, the line and the track.

### `GET /api/v1/trips/{id}/tours/{tourRef}/gpx`

A tour's route as a GPX file, the same file TREK writes when you export a tour as GPX: the whole line with the heights it has, and the trip's places along it as named waypoints. Reach it through a place's `gpx_url`.

```bash
curl -H "Authorization: Bearer trek_…" -o ridge.gpx \
     "https://trek.example.com/api/v1/trips/12/tours/41/gpx"
```

It answers `Content-Type: application/gpx+xml`. It needs the `places` scope as well as `trips`, since a tour is a place, and counts against the same rate limit as every other call. A trip you may not read is a `404`, exactly as for the trip itself; so is a tour the trip does not hold. A tour without a route answers `422` with `code: "tour_without_route"`.

### `GET /api/v1/trips/{id}/tours/{tourRef}/fit`

The same route as a FIT course file, for a watch. **Watches take a course only as FIT:** a Garmin watch app can save a course only by downloading it, and the watch refuses a GPX download. Reach it through a place's `fit_url`.

```bash
curl -H "Authorization: Bearer trek_…" -o ridge.fit \
     "https://trek.example.com/api/v1/trips/12/tours/41/fit"
```

It answers `Content-Type: application/vnd.ant.fit`, with a file name ending in `.fit`. The course carries the whole line, each point with its height where the route has one, and the tour's type as the FIT sport (hiking, walking, running, cycling, cross-country skiing, paddling, otherwise generic). A course has no clock of its own, so its times are made up at walking pace from the moment it is downloaded. Scopes, rate limit, `404` and `422` are exactly those of the GPX route.

### `GET /api/v1/bucket-list`

Places the caller wants to reach, with no trip attached. Its own endpoint because it hangs off the user, not a trip.

```json
{
  "items": [
    { "name": "Hokkaido", "lat": 43.06, "lng": 141.35,
      "country_code": "JP", "notes": "in winter", "target_date": "2027-02-01" }
  ]
}
```

`target_date` is an aspiration, not a booking. Entries are returned whether or not the Atlas addon is switched on: the addon governs whether TREK shows the feature, not whether the rows exist, and an endpoint whose answers change when an unrelated toggle moves is one nobody can build on.

### `GET /api/v1/stats`

Totals for a dashboard. Built for widgets like Homepage's `customapi`, which render a few numbers from one request and cannot aggregate a list themselves.

```json
{
  "total_trips": 12,
  "total_countries": 23,
  "total_cities": 41,
  "total_places": 143,
  "total_days": 87,
  "total_distance_km": 84213,
  "last_trip": {
    "title": "Hokkaido in winter",
    "start_date": "2026-02-03",
    "end_date": "2026-02-14",
    "country": "JP",
    "countries": ["JP"]
  },
  "next_trip": {
    "title": "Lisbon long weekend",
    "start_date": "2026-11-12",
    "end_date": "2026-11-16",
    "days_until": 42,
    "country": "PT",
    "countries": ["PT"]
  }
}
```

These are the same figures TREK's own dashboard shows, computed from the same source — a widget cannot disagree with the passport card next to it. In particular `total_countries` follows TREK's notion of *visited*: countries reached only by a flight or train count, layovers do not, and countries hidden by hand in Atlas stay hidden.

`last_trip` is the most recent trip that has **started** — a trip booked for next year is not one you have been on — and is `null` when every trip is still ahead. `country` is the country most of its places sit in, and is the head of `countries`, which lists them all for a trip that crossed a border. Both are empty or `null` for a trip whose places were never geocoded.

`next_trip` is its counterpart: the trip with the nearest start date that has **not started yet**, with the same `country` and `countries`, and `null` when nothing is planned. A trip that is under way is still `last_trip`, so the two never name the same trip. `days_until` counts whole days from today to the start date, so `1` means tomorrow.

A Homepage widget then needs no scripting:

```yaml
- TREK:
    icon: mdi-map-marker-path
    widget:
      type: customapi
      url: https://trek.example.com/api/v1/stats
      headers:
        X-API-Key: trek_your_key_here
      mappings:
        - field: total_trips
          label: Trips
        - field: total_countries
          label: Countries
        - field: total_cities
          label: Cities
        - field: last_trip.country
          label: Last
        - field: next_trip.days_until
          label: Days to go
```

## Notes for integrators

**Join on dates, not ids.** Every day carries an ISO `date`, and accommodations carry a resolved date range rather than internal day ids. If your software keeps its own notion of a trip, the date is the one thing both sides can agree on. TREK's internal ids are not in the payload as fields, by design — they would tie you to storage details that are free to change. The one place a reference appears is inside a tour's `gpx_url` and `fit_url`, and those are links to follow, not ids to store.

**One request, not many.** Rather than separate endpoints per section, `?include=` lets you fetch exactly what you need in a single call. Fetching a trip four times for four sections would burn your rate budget for no benefit.

**There are no timezones.** Times are stored and returned exactly as the traveller typed them: `14:00` means two in the afternoon wherever they were. The points and legs of a journey follow the same rule: each time is local to the place it belongs to. If you are matching against timestamps of your own, the trip's dates are the reliable join; the times are a hint, not a UTC instant.

**Rate limit: 120 requests per minute**, counted per user rather than per IP address. A self-hosted integration and its owner's browser often share an address, and an IP-based limit would let one starve the other. Exceeding it returns `429`; back off and retry.

**Errors** are JSON with an `error` field:

| Status | Meaning |
|---|---|
| `400` | malformed trip id or tour reference, or an unknown `include` section |
| `401` | missing, malformed or unknown key — also what you get for a key of the wrong kind |
| `403` | the key is valid but not allowed to read what was asked for (`code: "API_SCOPE_FORBIDDEN"`, with the missing section in `required_scope`) |
| `404` | no such trip, or not one of yours; for a tour file, also no such tour on the trip |
| `422` | a tour's GPX or FIT was asked for, but the tour has no route (`code: "tour_without_route"`) |
| `429` | rate limit exceeded |

**Which TREK is running.** To check the running version, for example against the latest GitHub release, call `GET /api/auth/app-config`. It needs no key and no login, and the `version` field holds the running version (such as `5.0.0`). It is not part of `/api/v1`, so it follows the app's own release rather than the promise below.

**Versioning.** `/api/v1` may gain fields; it will not lose them or change their types. A breaking change ships as `/api/v2` and both run side by side for a transition period. Write your client to ignore fields it does not know.

## What is not here yet

- **Writing.** Read-only. A key that can only read is a very different thing to hand to third-party software, and every integration asking for this surface so far wants to read.
- **Incremental sync.** There is no `?since=` filter, because TREK cannot yet answer it truthfully — child records carry no modification timestamp, so a filter on `updated_at` would silently hide trips whose itinerary changed. Fetch the list and compare.
- **Webhooks.** Nothing pushes; poll at a sensible interval.

If you are building something and one of these blocks you, open a discussion — the surface is meant to grow around real integrations rather than ahead of them.

## See also

- [MCP Overview](MCP-Overview) — the other machine-facing surface, for AI assistants
- [Calendar Feeds](Calendar-Feeds) — subscribe a calendar app to a trip
- [Admin: MCP Tokens](Admin-MCP-Tokens) — the instance-wide view of issued tokens
