import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import type { CardViewModel } from "@/lib/cards/data";
import type { SnapMemberSelection } from "@/lib/chart-data/snap-query";

export interface SnapReferenceMember { id: number; name: string; vm?: CardViewModel; gkLevels: number[] }

/** Explicit reference predicates for the paired slot, without assuming the player's ownership or growth. */
export default function SnapPairedMemberControls({ locale, members, value, onChange }: {
  locale: AppLocale;
  members: readonly SnapReferenceMember[];
  value: SnapMemberSelection | null;
  onChange: (member: SnapMemberSelection | null) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const member = members.find((entry) => entry.id === value?.memberId);
  const vm = member?.vm;
  return <div className="mn-cd-snap-paired">
    {vm ? <MemberCardArtwork assetId={vm.assetId} characterId={vm.characterId} rarity={vm.rarity} cardType={vm.cardType}
      alt="" attributeLabel={t(locale, `cards.attributes.${vm.cardType}`)} fallbackLabel={member!.name} className="mn-cd-snap-member-art" /> : null}
    <label><span>{tr("pairedMember")}</span><select value={value?.memberId ?? ""} onChange={(event) => onChange(event.target.value ? { memberId: Number(event.target.value), gekisouLevel: null } : null)}>
      <option value="">{tr("chooseMember")}</option>
      {value && !member ? <option value={value.memberId}>{tr("unavailable")}</option> : null}
      {members.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || String(entry.id)}</option>)}
    </select></label>
    {member ? <label><span>{tr("gkLevel")}</span><select value={value?.gekisouLevel ?? ""}
      onChange={(event) => onChange({ memberId: member.id, gekisouLevel: event.target.value ? Number(event.target.value) : null })}>
      <option value="">{tr("noGkSkill")}</option>
      {member.gkLevels.map((level) => <option key={level} value={level}>{tr("level", { n: level })}</option>)}
    </select></label> : null}
  </div>;
}
