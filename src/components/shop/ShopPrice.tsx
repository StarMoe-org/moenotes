import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { formatShopPrice, orderShopPrices, type ShopPayment, type ShopSummaryViewModel } from "@/lib/shop/data";

/** "Limit 1 / week" / "Unlimited". */
export function shopLimitLabel(locale: AppLocale, shop: Pick<ShopSummaryViewModel, "limitKind" | "limitCount">): string {
  if (shop.limitKind === "unlimited") return t(locale, "shop.limits.unlimited");
  return t(locale, `shop.limitPer.${shop.limitKind}`, { count: shop.limitCount });
}

function CurrencyIcon({ src }: { src: string }) {
  const url = useAssetUrl()(src);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return <img src={url} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

interface Props {
  locale: AppLocale;
  payment: ShopPayment;
  /** One line: the locale's leading storefront price only (the detail page lists every one). */
  compact?: boolean;
}

/**
 * A pack's price: stars (with the star item's icon), an ad, or the storefront prices of a real-money pack in the order
 * the locale reads them (its own storefront first). No exchange rates: each storefront's own list price.
 */
export default function ShopPrice({ locale, payment, compact = false }: Props) {
  const figure = "font-mono text-sm font-black tabular-nums text-[var(--mn-accent-deep)]";
  if (payment.kind === "ad") return <span className={figure}>{t(locale, "shop.payments.ad")}</span>;
  if (payment.kind === "money") {
    const prices = orderShopPrices(payment.prices, locale);
    if (!prices.length) return <span className="text-xs font-semibold text-[var(--mn-text-muted)]">{t(locale, "shop.payments.money")}</span>;
    const shown = compact ? prices.slice(0, locale === "zh-TW" ? 2 : 1) : prices;
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5" title={prices.map((price) => formatShopPrice(price, locale)).join(" / ")}>
        {shown.map((price, index) => (
          <span key={price.currency} className={index === 0 ? figure : "font-mono text-xs font-bold tabular-nums text-[var(--mn-text-muted)]"}>{formatShopPrice(price, locale)}</span>
        ))}
      </span>
    );
  }
  if (payment.amount === 0) return <span className={figure}>{t(locale, "shop.free")}</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${figure}`} title={payment.currency?.name || undefined}>
      {payment.currency?.imageUrl ? <CurrencyIcon src={payment.currency.imageUrl} /> : null}
      {payment.amount.toLocaleString(locale)}
      {!compact && payment.currency?.name ? <span className="ml-1 font-sans text-xs font-semibold text-[var(--mn-text-muted)]">{payment.currency.name}</span> : null}
    </span>
  );
}
