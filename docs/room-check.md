# Room Check

Room Check (`/tools/room-check`) reads the players of a room from the Room Check service and follows a room while it
is open. The page calls the service same-origin under `/api/room-check/`; the deploy server relays those requests to
the internal origin (`server/internal/web/roomcheck.go`).

## Client contract

`src/config/room-check.ts` holds the base the page calls (`PUBLIC_ROOM_CHECK_API`; `mock` serves made-up rooms in the
page itself) and `src/lib/room-check/client.ts` the requests. A room's endpoint is
`/api/room-check/v1/rooms/{code}?region=…` plus one of:

| Path suffix | Method | Meaning |
| --- | --- | --- |
| `/watch` | `POST` | Take a lease on the room and return its `watchId` |
| `/events?watch=…` | `GET` | Server-sent events: `snapshot` and `stopped` |
| `/watch/{id}` | `DELETE` | Release the lease |
| `/watch/{id}/ping` | `POST` | Renew the lease |

Reads and watches are anonymous. Creating a room (`/v1/rooms/create`) and removing the observer from it
(`/v1/rooms/{code}/probe/leave`, or `/kick`) act on the visitor's account, so those need a site session.

## Relay

The deploy server forwards `/api/room-check/<rest>` to `<MOENOTES_ROOM_CHECK_INTERNAL>/<rest>`, query included, and
passes the service's status and body through unchanged, so its JSON errors reach the page as they are. Event streams
are flushed as they are written and are never buffered or cut by a request deadline.

Every relayed request carries the visitor's identity in `X-Room-Check-User` when it is signed in; the header is set by
the relay only, so a value sent by a client is dropped. The identity comes from starmoe-api's `/api/me`, read with the
same session cookie the site's own account button uses; the stable field is `username`, with `name` as the fallback.
A null user, a non-200 answer or an empty identity counts as signed out. The session cookie itself is not forwarded:
the identity header is the whole contract. `MOENOTES_ROOM_CHECK_KEY`, when set, is added as `X-Room-Check-Key`.

Without a session the account-bound actions answer 401 `{"error":"login_required"}` and the service is not called.
Without `MOENOTES_ROOM_CHECK_INTERNAL` the relay uses the site's built-in Room Check origin; a value that is not an
absolute http(s) URL answers 404 instead, so a typo disables Room Check instead of taking the site down. The startup
log states the origin and whether a shared key is set, without printing the key. A service that does not answer
yields 502, with the address only in the log, never in the page's answer.
