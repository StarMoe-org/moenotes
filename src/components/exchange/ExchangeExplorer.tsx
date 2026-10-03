import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import BannerImage from "@/components/shared/BannerImage";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerFiles, useServerList, useServerOnlyLabel } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import type { ExchangeCategoryViewModel, ExchangeProductViewModel } from "@/lib/exchange/data";
import { formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";

interface Props {
  locale: AppLocale;
  initialCategories: ServerFaceted<ExchangeCategoryViewModel>[];
  servers: GameServer[];
}

export default function ExchangeExplorer({ locale, servers, initialCategories }: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, initialCategories);
  const assetCategories = useServerFiles(categories, server, ["bannerUrl"]);
  const timeZone = useDisplayTimeZone();
  const serverOnly = useServerOnlyLabel(locale);
  const [activeId, setActiveId] = useState<number | null>(null);

  const active = activeId === null ? assetCategories : assetCategories.filter((category) => category.id === activeId);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <nav aria-label={t(locale, "exchange.categories")} className="mn-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CategoryTab active={activeId === null} onClick={() => setActiveId(null)} label={t(locale, "exchange.categories")} />
        {assetCategories.map((category) => (
          <CategoryTab key={category.id} active={activeId === category.id} onClick={() => setActiveId(category.id)} label={category.name} />
        ))}
      </nav>
      <div className="mt-5 space-y-8">
        {active.map((category) => {
          const note = serverOnly(category);
          return (
            <section key={category.id} aria-labelledby={`exchange-category-${category.id}`}>
              {category.bannerUrl ? (
                <div className="overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)]">
                  <BannerImage src={category.bannerUrl} alt={category.name} fallback={category.name} />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id={`exchange-category-${category.id}`} className="font-[var(--mn-font-display)] text-xl tracking-tight text-[var(--mn-text)] sm:text-2xl">{category.name}</h2>
                {note ? <span className="text-xs font-bold text-[var(--mn-text-muted)]">{note}</span> : null}
              </div>
              <div className="mt-4 space-y-6">
                {category.exchanges.map((exchange) => (
                  <div key={exchange.id} className="mn-paper p-4 sm:p-5">
                    <h3 className="text-sm font-black text-[var(--mn-text)] sm:text-base">{exchange.name}</h3>
                    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {exchange.products.map((product) => (
                        <ProductCard key={product.id} product={product} locale={locale} timeZone={timeZone} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {assetCategories.length === 0 ? (
          <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "exchange.pageDescription")}</p>
        ) : null}
      </div>
    </ServerScope>
  );
}

function CategoryTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`mn-focus mn-stamp-press shrink-0 rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition sm:text-sm ${
        active
          ? "border-[var(--mn-accent-deep)] bg-[var(--mn-accent-deep)] text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
          : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] hover:border-[var(--mn-accent-deep)]/50"
      }`}
    >
      {label}
    </button>
  );
}

function ProductCard({ product, locale, timeZone }: { product: ExchangeProductViewModel; locale: AppLocale; timeZone: string | null }) {
  const limitLabel = product.limitCount === 0
    ? t(locale, "exchange.product.unlimited")
    : [
        t(locale, "exchange.product.limit", { count: product.limitCount }),
        product.limitResetLabel ? t(locale, `exchange.product.${product.limitResetLabel}`) : "",
      ].filter(Boolean).join(" · ");
  const start = formatMasterDate(product.startAt, locale, false, timeZone);
  const end = formatMasterDate(product.endAt, locale, false, timeZone);
  return (
    <li className="relative flex gap-3 rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-3 shadow-[var(--mn-shadow-stamp)]">
      {product.isRecommended ? (
        <span className="absolute -top-2 left-3 rounded-full border border-[var(--mn-accent-deep)]/30 bg-[var(--mn-accent-deep)] px-2 py-0.5 text-[10px] font-bold leading-none text-[var(--mn-paper)]">
          {t(locale, "exchange.product.recommended")}
        </span>
      ) : null}
      {product.resourceImageUrl ? (
        <img src={product.resourceImageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl border border-[var(--mn-glass-border)] object-cover" />
      ) : (
        <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] text-lg font-black text-[var(--mn-text-muted)]">?</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-bold leading-4 text-[var(--mn-text)] sm:text-sm sm:leading-5">
          {product.resourceName}
          {product.resourceCount > 1 ? <span className="text-[var(--mn-text-muted)]"> ×{product.resourceCount}</span> : null}
        </p>
        <p className="mt-1.5 flex items-center gap-1 text-xs font-bold tabular-nums text-[var(--mn-accent-deep)]">
          {product.paymentResourceImageUrl ? <img src={product.paymentResourceImageUrl} alt="" className="h-4 w-4 rounded-sm object-cover" /> : null}
          <span>×{product.paymentResourceCount}</span>
          {product.paymentResourceName ? <span className="truncate font-medium text-[var(--mn-text-muted)]">{product.paymentResourceName}</span> : null}
        </p>
        <p className="mt-1 text-[11px] font-medium text-[var(--mn-text-muted)]">{limitLabel}</p>
        {start || end ? <p className="mt-0.5 text-[11px] tabular-nums text-[var(--mn-text-muted)]">{[start, end].filter(Boolean).join(" – ")}</p> : null}
      </div>
    </li>
  );
}
