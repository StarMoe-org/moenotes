# Game servers

Our Notes runs on four servers: `tw` (Traditional Chinese, HK/TW/MO), `jp`, `kr` and `en`. Each has its own
MasterData (moenotes-masterdata-sync, `/{code}/master/{Table}.json`) and its own asset catalog (moenotes-assets,
`/{region}/{language}/{key}/…`). `src/config/servers.ts` is the registry: per server the metadata region and path,
the asset region and the languages it publishes, the UTC offset of its MasterData timestamps and its time zone.

The international servers (`tw`, `kr`, `en`) share one MasterData build: apart from shop, chat-frame and
external-content tables their tables are byte-identical, and MasterText carries all five languages. The JP server has
its own build: more entities, its own schedules, Japanese-only MasterText and timestamps in JST.

## Which servers a build shows

`getBuildServers()` (`src/lib/masterdata/build-servers.ts`): the primary server (`tw`) always, and every other server
once the asset service has exported a release of its region (`versions/current_version.json` `regions`) and the
metadata service serves its tables. A server whose assets are still being unpacked is therefore left out rather than
shown with missing files; the export's completion changes the deploy server's build key, and the next build adds the
server. A region's first release does not hold back builds of the others (`server/upstream.ts`).

`MOENOTES_SERVERS=tw,jp` replaces the check, e.g. to try a server before its export finishes or with a local
MasterData checkout.

## The merged catalog

Pages are built once per locale, not once per server. `src/lib/masterdata/build-data.ts` computes every view model per
server (`cardsOn(server, locale)`, …) from that server's tables and merges the servers by id
(`src/lib/servers/facets.ts`):

- `servers`: the servers that have the entity, in switcher order. The first one supplies the base fields.
- `serverVariants`: for another server, the top-level fields it sets differently (JST release dates, a gacha's window,
  the home page's banners). Absent when every server agrees.

A merged entity (`ServerFaceted<T>`) is a superset of the plain view model, so code that does not tell servers apart
keeps working with the base fields. Detail pages exist for the union of ids; detail data is a
`ServerFacetedValue<T>` (`{ value, servers, serverVariants }`). Story scripts are large, so a story page carries one:
the first server's with the ADV.

Tables with identical bytes (index.json SHA-256) load and parse once for all servers. MasterText cells a server leaves
without copy are filled from the other servers' row of the same id, so JP-only entities read in Japanese and shared
ones keep their translations. JP timestamps get `+09:00` appended at load; `parseMasterDate` reads the offset and
`formatMasterDate` shows the time in that zone.

## In the browser

`useContentServer(locale, servers)` (`src/lib/servers/use-content-server.ts`) picks the server a page shows: during
hydration the one the static HTML was rendered for (the locale's usual server, `defaultGameServer`, when the build has
it), then the reader's `gameServer` setting. The server switch above a list or detail (`ServerScope`) changes that
setting, so every content page, the rankings and the news follow it. It appears only when a build has several servers.

- Lists show the entities the server has, as it has them (`listForServer`); an entity only some servers have carries
  an "… only" badge.
- A detail page of an entity the reader's server lacks shows it as its first server has it, with a note.
- Schedules that differ between servers are listed per server (`ServerSchedules`).

## Files

View models and helpers keep server-neutral release URLs (`{api}/{language}/{key}/…`, the default region's form).
Pages move them to the server they show: `useAssetUrl()` inside a `ServerScope` (`ContentServerProvider`),
`serverAssetUrl(url, server)` elsewhere, `moveReleaseUrls` for whole objects such as a parsed story script, and
`serverReleaseFetcher(server)` for requests. The default region keeps its short paths (so cached files stay valid);
other regions get `/{region}` in front; a language the region does not publish becomes its first one (JP: `ja`).

Not covered yet: the story player, the 3D chart previewer and the Live2D viewer read their own sites (nnnotes story
site, `/chart-site/`), which are built from the TW catalog.
