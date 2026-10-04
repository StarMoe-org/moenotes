import { useEffect, useState } from "react";
import OpenPlatform from "@/components/account/OpenPlatform";
import SiriusLoader from "@/components/shared/SiriusLoader";
import type { AppLocale } from "@/config/locales";
import { accountLoginUrl } from "@/config/account";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { useAccount } from "@/lib/account/use-account";

import { accountSection as panel, accountPrimary } from "./ui-styles";

export default function OpenPlatformPanel({ locale }: { locale: AppLocale }) {
  const account = useAccount();
  const [returnPath, setReturnPath] = useState<string>(localizePath(getRoutePathById("open-platform"), locale));
  useEffect(() => { setReturnPath(window.location.pathname + window.location.search); }, []);
  if (!account) return <SiriusLoader locale={locale} compact label={t(locale, "account.loading")} />;
  if (account.status === "unavailable") return <p className={panel}>{t(locale, "account.unavailable")}</p>;
  if (account.status !== "signed-in") return <section className={panel}><p className="mb-4 text-sm">{t(locale, "account.signedOutHint")}</p><a className={accountPrimary} href={accountLoginUrl(locale, returnPath)}>{t(locale, "account.signIn")}</a></section>;
  return <OpenPlatform locale={locale} panel={panel} />;
}
