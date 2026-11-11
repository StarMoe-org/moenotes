import HomeCarousel from "@/components/home/HomeCarousel";
import HomeHighlights from "@/components/home/HomeHighlights";
import HomeLayoutEditor from "@/components/home/HomeLayoutEditor";
import HomeUpdates, { type HomeAvailability } from "@/components/home/HomeUpdates";
import RouteGlyph from "@/components/shared/RouteGlyph";
import SectionHeading from "@/components/shared/SectionHeading";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getBuildCards, getBuildHomeData, getBuildMusic, getBuildSupportCards } from "@/lib/masterdata/build-data";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { getNavChildren, getNavigationGroups } from "@/lib/route/registry";
import { pickFacet, valueForServer } from "@/lib/servers/facets";

export default async function HomeServerPage({ locale }: { locale: AppLocale }) {
  const [data, servers, music, cards, supportCards] = await Promise.all([
    getBuildHomeData(locale),
    getBuildServers(),
    getBuildMusic(locale),
    getBuildCards(locale),
    getBuildSupportCards(locale),
  ]);

  const slides = pickFacet(data, ["slides"]);
  const updates = pickFacet(data, ["rewards", "latestMusic", "latestCards", "latestSupportCards"]);
  const highlights = pickFacet(data, ["events", "birthdays"]);

  const listed = (key: "latestMusic" | "latestCards" | "latestSupportCards") =>
    new Set(data.servers.flatMap((server) => valueForServer(data, server)[key].map((entry) => entry.id)));
  const serversOf = (entries: ReadonlyArray<{ id: number; servers: GameServer[] }>, ids: Set<number>): Record<number, GameServer[]> =>
    Object.fromEntries(entries.filter((entry) => ids.has(entry.id)).map((entry) => [entry.id, entry.servers]));

  const availability: HomeAvailability = {
    music: serversOf(music, listed("latestMusic")),
    cards: serversOf(cards, listed("latestCards")),
    supportCards: serversOf(supportCards, listed("latestSupportCards")),
  };

  const shortcuts = getNavigationGroups().flatMap((group) => {
    const children = getNavChildren(group);
    return children.length > 0 ? children : [group];
  });

  return (
    <div className="pb-4">
      <h1 className="sr-only">{t(locale, "home.heading")}</h1>
      <div className="mb-2 flex justify-end">
        <HomeLayoutEditor locale={locale} />
      </div>

      <div className="flex flex-col gap-10" data-density-section="">
        <section data-home-module="now" aria-labelledby="home-now">
          <SectionHeading id="home-now" title={t(locale, "home.now")} />
          <HomeCarousel locale={locale} home={slides} servers={servers} />
        </section>

        <div data-home-module="event">
          <HomeHighlights locale={locale} home={highlights} servers={servers} module="event" />
        </div>

        <div data-home-module="birthdays">
          <HomeHighlights locale={locale} home={highlights} servers={servers} module="birthdays" />
        </div>

        <div data-home-module="rewards">
          <HomeUpdates locale={locale} home={updates} servers={servers} module="rewards" />
        </div>

        <div data-home-module="music">
          <HomeUpdates locale={locale} home={updates} servers={servers} module="music" availability={availability} />
        </div>

        <div data-home-module="cards">
          <HomeUpdates locale={locale} home={updates} servers={servers} module="cards" availability={availability} />
        </div>

        <nav data-home-module="shortcuts" aria-labelledby="home-shortcuts">
          <SectionHeading id="home-shortcuts" title={t(locale, "home.shortcuts")} />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
            {shortcuts.map((route) => (
              <li key={route.id} className="min-w-0">
                <a
                  href={localizePath(route.path, locale)}
                  className="md3-state flex min-h-14 min-w-0 items-center gap-3 rounded-shape-md bg-surface-container-low px-3 text-label-large text-on-surface"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                    <RouteGlyph icon={route.nav && route.nav.icon ? route.nav.icon : "sparkles"} routeId={route.id} className="h-4 w-4" />
                  </span>
                  <span className="truncate">{t(locale, route.labelKey)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
