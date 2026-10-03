import { useMemo, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { getBandLogoWhiteUrl } from "@/lib/cards/assets";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import { releaseFileUrl } from "@/lib/assets/release";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import NativeGameCard from "@/components/shared/NativeGameCard";

export default function NativeFormationGroup({ locale, slots, label }: {
  locale: AppLocale; slots: readonly { member?: CardViewModel | undefined; support?: SupportCardViewModel | undefined; memberLevel?: number | undefined; memberRank?: number | undefined; supportLevel?: number | undefined; supportRank?: number | undefined }[]; label: string;
}) {
  const assetUrl = useAssetUrl();
  const host = useRef<HTMLDivElement>(null);
  const data = useMemo(() => ({ hideSlotBackdrop: true, slots: slots.map(({ member, support, memberLevel, memberRank, supportLevel, supportRank }) => {
    const background = member?.formationBackgroundKey?.match(/^(.+)\[([^\[\]]+)\]$/);
    return {
      ...(member ? { member: { rarity: member.rarity, cardType: member.cardType,
        ...(memberLevel !== undefined ? { level: memberLevel } : {}), ...(memberRank !== undefined ? { rank: memberRank } : {}),
        characterUrl: assetUrl(releaseFileUrl(`MemberCard/${member.assetId}/member_character`, "formation.webp", locale)),
        characterSpriteKey: `MemberCard/${member.assetId}/member_character[formation]`,
        backgroundUrl: background ? assetUrl(releaseFileUrl(background[1]!, `${background[2]}.webp`, locale)) : "",
        ...(member.formationBackgroundKey ? { backgroundSpriteKey: member.formationBackgroundKey } : {}),
        bandLogoUrl: assetUrl(getBandLogoWhiteUrl(member.bandId, locale)),
        bandLogoSpriteKey: `Band/${member.bandId}/band_logo_white[band_logo_white]`,
      } } : {}),
      ...(support ? { support: { rarity: support.rarity, cardType: support.cardType, thumbnailUrl: assetUrl(getSupportCardThumbnailUrl(support.assetId)),
        ...(supportLevel !== undefined ? { level: supportLevel } : {}), ...(supportRank !== undefined ? { rank: supportRank } : {}),
        thumbnailSpriteKey: `SupportCard/${support.assetId}/snap_thumbnail[snap_thumbnail]` } } : {}),
    };
  }) }), [slots, locale, assetUrl]);
  return <div ref={host} className="mn-cd-native-formation-art"><NativeGameCard entry="formationGroup" data={data} label={label} className="mn-cd-native-formation"
    onGeometry={({ bounds, layout, regions, padding, scale, canvas }) => {
      const stage = host.current?.closest<HTMLElement>(".mn-cd-native-formation-stage");
      if (!stage) return;
      const width = canvas.width / scale, height = canvas.height / scale;
      const box = (quad: Array<{ x: number; y: number }>) => ({ x: Math.min(...quad.map(p => p.x)), y: Math.min(...quad.map(p => p.y)),
        width: Math.max(...quad.map(p => p.x)) - Math.min(...quad.map(p => p.x)), height: Math.max(...quad.map(p => p.y)) - Math.min(...quad.map(p => p.y)) });
      const polygon = (quad: Array<{ x: number; y: number }>, rect: ReturnType<typeof box>) => `polygon(${quad.map(p => `${(p.x - rect.x) / rect.width * 100}% ${(p.y - rect.y) / rect.height * 100}%`).join(",")})`;
      // Regions come from the same native transform/camera pass that paints the cards.
      for (const { slotIndex, memberPath, supportPath } of layout.slots) {
        const slot = stage.querySelector<HTMLElement>(`[data-snap-slot="${slotIndex}"]`);
        if (!slot) continue;
        const memberQuad = regions[memberPath], supportQuad = regions[supportPath];
        if (memberQuad?.length !== 4 || supportQuad?.length !== 4) throw new Error("Original formation hit regions are missing");
        const member = box(memberQuad), support = box(supportQuad);
        for (const [key, value] of Object.entries({ left: (member.x + padding - bounds.minX) / width, top: (member.y + padding - bounds.minY) / height,
          width: member.width / width, height: member.height / height })) slot.style.setProperty(`--member-hit-${key}`, `${value * 100}%`);
        for (const [key, value] of Object.entries({ left: (support.x - member.x) / member.width, top: (support.y - member.y) / member.height,
          width: support.width / member.width, height: support.height / member.height })) slot.style.setProperty(`--snap-hit-${key}`, `${value * 100}%`);
        slot.style.setProperty("--member-hit-clip", polygon(memberQuad, member));
        slot.style.setProperty("--snap-hit-clip", polygon(supportQuad, support));
      }
      stage.dataset.uiGeometry = "ready";
    }} /></div>;
}
