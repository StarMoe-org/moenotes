import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { UIPlayer } from "ournotes-player/ui";
import NativeFormationGroup from "../src/components/chart-data/NativeFormationGroup";
import { NativeMemberArtwork, NativeSupportArtwork } from "../src/components/shared/CardSquareArtwork";
import { ContentServerProvider, useAssetUrl } from "../src/lib/servers/use-content-server";
import { releaseFileUrl } from "../src/lib/assets/release";
import { getSupportCardThumbnailUrl } from "../src/lib/support-cards/assets";
import type NativeGameCard from "../src/components/shared/NativeGameCard";
import { listForServer, type ServerFaceted } from "../src/lib/servers/facets";
import type { CardViewModel } from "../src/lib/cards/data";
import type { SupportCardViewModel } from "../src/lib/support-cards/data";
import type { GameServer } from "../src/config/servers";
import type { AppLocale } from "../src/config/locales";

interface State { kind: "member" | "snap" | "formation"; index: number; level: number; rank: number; shown: boolean; epoch: number }
interface Deferred { promise: Promise<void>; release: () => void }
const deferred = (): Deferred => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

/** A scheduling control only: the companion player's real render and source checks still run. */
export function mountNativeCardLifecycle(host: HTMLElement, props: { locale?: AppLocale; formationControl?: boolean; members: ServerFaceted<CardViewModel>[]; snaps: ServerFaceted<SupportCardViewModel>[] }, baselineCard?: typeof NativeGameCard, mode: "square" | "formation" = "square", server: GameServer = "jp") {
  if (baselineCard && mode === "formation") throw new Error("The baseline fixture renders square cards only");
  const sourceMembers = listForServer(props.members, server), sourceSnaps = listForServer(props.snaps, server), locale = props.locale ?? "en-US";
  // The shared main artwork explicitly uses ordinary images for these new EX rarities.
  const members = sourceMembers.filter(card => card.rarity !== 20), snaps = sourceSnaps.filter(card => card.rarity !== 10);
  if (members.length < 2 || snaps.length < 1) throw new Error(`Actual ${server} native-supported catalogue is missing`);
  const controlledMembers = [61,62,63,64,62].map(id => sourceMembers.find(card => card.id === id));
  const controlledSnaps = [62,63,64,70,70].map(id => sourceSnaps.find(card => card.id === id));
  if (props.formationControl && (server !== "tw" || controlledMembers.some(card => !card) || controlledSnaps.some(card => !card))) throw new Error("Actual TW new-member/EX formation inputs are missing");
  const root = createRoot(host);
  let change: ((patch: Partial<State>) => void) | undefined;
  let hold: Deferred | undefined, heldPlayer: UIPlayer | undefined, arm = false;
  const events: Array<{ action: string; at: number; player: number; destroyed?: boolean }> = [];
  const ids = new WeakMap<UIPlayer, number>();
  let nextId = 0;
  const id = (player: UIPlayer) => { let value = ids.get(player); if (!value) { value = ++nextId; ids.set(player, value); } return value; };
  const originalRender = UIPlayer.prototype.render, originalDestroy = UIPlayer.prototype.destroy;
  UIPlayer.prototype.render = async function (...args: Parameters<UIPlayer["render"]>) {
    if (arm && !heldPlayer) { heldPlayer = this; arm = false; events.push({ action: "held-before-real-render", at: performance.now(), player: id(this) }); }
    if (this === heldPlayer && hold) await hold.promise;
    const result = await originalRender.apply(this, args);
    events.push({ action: result ? "real-render-returned" : "real-render-null", at: performance.now(), player: id(this) });
    return result;
  };
  UIPlayer.prototype.destroy = function (...args: Parameters<UIPlayer["destroy"]>) {
    events.push({ action: "destroy", at: performance.now(), player: id(this) });
    return originalDestroy.apply(this, args);
  };
  function BaselineArtwork({ state }: { state: State }) {
    const assetUrl = useAssetUrl(), Card = baselineCard!;
    const member = members[state.index % members.length]!, snap = snaps[state.index % snaps.length]!;
    return state.kind === "member"
      ? <Card entry="memberSquare" label={`${member.characterName} ${member.title}`} className="lifecycle-card" data={{ leader: false, member: {
        rarity: member.rarity, cardType: member.cardType, level: state.level, rank: state.rank,
        thumbnailUrl: assetUrl(releaseFileUrl(`MemberCard/${member.assetId}/member_thumbnail`, "square.webp", locale)),
        thumbnailSpriteKey: `MemberCard/${member.assetId}/member_thumbnail[square]`,
      } }} />
      : <Card entry="supportSquare" label={snap.name} className="lifecycle-card" data={{ leader: false, support: {
        rarity: snap.rarity, cardType: snap.cardType, level: state.level, rank: state.rank,
        thumbnailUrl: assetUrl(getSupportCardThumbnailUrl(snap.assetId)),
        thumbnailSpriteKey: `SupportCard/${snap.assetId}/snap_thumbnail[snap_thumbnail]`,
      } }} />;
  }
  function Fixture() {
    const [state, setState] = useState<State>({ kind: mode === "formation" ? "formation" : "member", index: 0, level: 1, rank: 1, shown: true, epoch: 0 });
    change = patch => setState(previous => ({ ...previous, ...patch }));
    return <ContentServerProvider server={server} servers={[server]}>
      {state.shown && <div key={state.epoch} style={{ width: 300 }}>
        {baselineCard ? <BaselineArtwork state={state} /> : state.kind === "formation"
          ? <NativeFormationGroup locale={locale} label="Actual native formation lifecycle fixture" slots={Array.from({ length: 5 }, (_, slot) => ({
            member: props.formationControl ? controlledMembers[(state.index + slot) % 5]! : members[(state.index + slot) % 2]!,
            support: props.formationControl ? controlledSnaps[(state.index + slot) % 5]! : snaps[slot % snaps.length]!,
            memberLevel: state.level, memberRank: state.rank, supportLevel: state.level, supportRank: state.rank,
          }))} /> : state.kind === "member"
          ? <NativeMemberArtwork locale={locale} card={members[state.index % members.length]!} className="lifecycle-card" level={state.level} rank={state.rank} />
          : <NativeSupportArtwork card={snaps[state.index % snaps.length]!} className="lifecycle-card" level={state.level} rank={state.rank} />}
      </div>}
    </ContentServerProvider>;
  }
  root.render(<StrictMode><Fixture /></StrictMode>);
  return {
    update(patch: Partial<State>) { if (!change) throw new Error("Lifecycle fixture is not mounted"); change(patch); },
    holdNextRender() { if (hold) throw new Error("Existing held render has not released"); hold = deferred(); heldPlayer = undefined; arm = true; },
    get held() { return !!heldPlayer; },
    releaseRender() { hold?.release(); hold = undefined; heldPlayer = undefined; arm = false; },
    get events() { return [...events]; },
    get catalogue() { return { server, locale, sourceMembers: sourceMembers.length, sourceSnaps: sourceSnaps.length,
      members: members.map(card => ({ id: card.id, assetId: card.assetId })), snaps: snaps.map(card => ({ id: card.id, assetId: card.assetId })),
      formationControl: props.formationControl ? { members: controlledMembers.map(card => ({id:card!.id,assetId:card!.assetId,rarity:card!.rarity})),
        snaps: controlledSnaps.map(card => ({id:card!.id,assetId:card!.assetId,rarity:card!.rarity})) } : null }; },
    async dispose() { hold?.release(); root.unmount(); UIPlayer.prototype.render = originalRender; UIPlayer.prototype.destroy = originalDestroy; }
  };
}
