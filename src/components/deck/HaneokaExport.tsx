import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { CardBox } from "@/lib/box/model";
import { createHaneokaInventory, haneokaTeamBuilderUrl } from "@/lib/box/haneoka-export";
import CollectionIcon from "@/components/box/CollectionIcon";

export default function HaneokaExport({ locale, box, disabled }: { locale: AppLocale; box: CardBox | null; disabled: boolean }) {
  function download() {
    if (disabled || !box) return;
    const inventory = createHaneokaInventory(box);
    const url = URL.createObjectURL(new Blob([JSON.stringify(inventory, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `moenotes-haneoka-${box.server}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="dc-pool-actions">
    <Button variant="text" size="small" disabled={disabled} onClick={download} startIcon={<CollectionIcon name="export" />}>
      {t(locale, "deckWorkspace.haneoka.export")}
    </Button>
    <Button variant="text" size="small" href={haneokaTeamBuilderUrl(locale)} target="_blank" rel="noopener noreferrer">
      {t(locale, "deckWorkspace.haneoka.link")}
    </Button>
  </div>;
}
