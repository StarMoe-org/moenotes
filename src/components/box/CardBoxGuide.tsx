import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { getAssetUrl } from "@/lib/assets/url";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import { MemberSquareArtwork, SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import CharacterRankArtwork from "@/components/shared/CharacterRankArtwork";
import "@/styles/card-box-guide.css";

export interface CardBoxGuideProps {
  locale: AppLocale;
  members: readonly CardViewModel[];
  snaps: readonly SupportCardViewModel[];
  isOpen: boolean;
  onClose: () => void;
  onStartImport: () => void;
}

const steps = ["screenshots", "import", "review", "growth", "backup"] as const;
type GuideStep = typeof steps[number];
type ExampleCard = { kind: "member"; card: CardViewModel } | { kind: "snap"; card: SupportCardViewModel };
type Glyph = "capture" | "add" | "edit" | "file" | "left" | "right";

function GuideGlyph({ kind, className = "" }: { kind: Glyph; className?: string }) {
  const paths: Record<Glyph, string> = {
    capture: "M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M7 7h10v10H7z",
    add: "M12 5v14M5 12h14",
    edit: "m14 5 5 5M4 20l4-1 12-12a2.12 2.12 0 0 0-3-3L5 16l-1 4z",
    file: "M14 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9l-6-6zm0 0v6h6M8 13h8M8 17h5",
    left: "m15 5-7 7 7 7",
    right: "m9 5 7 7-7 7",
  };
  return <svg className={`cgb-glyph ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

function ExampleArtwork({ example, locale }: { example: ExampleCard; locale: AppLocale }) {
  return example.kind === "member"
    ? <MemberSquareArtwork locale={locale} card={example.card} className="cgb-game-card" />
    : <SupportSquareArtwork locale={locale} card={example.card} className="cgb-game-card" />;
}

function ExampleSheet({ examples, locale, compact = false }: { examples: readonly ExampleCard[]; locale: AppLocale; compact?: boolean }) {
  return <div className={`cgb-shot-sheet${compact ? " cgb-shot-compact" : ""}`}>
    <div className="cgb-shot-heading"><GuideGlyph kind="capture" /><span>{t(locale, "deckWorkspace.guide.visual.gameList")}</span></div>
    <div className="cgb-shot-grid">{examples.map(example => <ExampleArtwork key={`${example.kind}:${example.card.id}`} example={example} locale={locale} />)}</div>
  </div>;
}

function GuideIllustration({ step, examples, member, locale }: { step: GuideStep; examples: readonly ExampleCard[]; member: CardViewModel | undefined; locale: AppLocale }) {
  const assetUrl = useAssetUrl();
  const visual = (key: string) => t(locale, `deckWorkspace.guide.visual.${key}`);
  const unknown = t(locale, "deckWorkspace.unknown");
  const example = examples[0];
  const rarity = example ? ({ 2: "R", 3: "SR", 4: "SSR", 10: "EX", 20: "BD" } as const)[example.card.rarity] : "";
  return <figure className={`cgb-illustration cgb-illustration-${step}`}>
    <div className="cgb-stage">
      {step === "screenshots" && <ExampleSheet examples={examples.slice(0, 6)} locale={locale} />}
      {step === "import" && <div className="cgb-batch-picture">
        <div className="cgb-batch-back"><ExampleSheet examples={examples.slice(3, 6)} locale={locale} compact /></div>
        <div className="cgb-batch-front"><ExampleSheet examples={examples.slice(0, 3)} locale={locale} compact /></div>
        <div className="cgb-append-picture"><GuideGlyph kind="add" /><span>{visual("addMore")}</span></div>
      </div>}
      {step === "review" && <div className="cgb-review-picture">
        {example && <div className="cgb-review-art"><ExampleArtwork example={example} locale={locale} /><span className="cgb-edit-mark"><GuideGlyph kind="edit" /></span></div>}
        <div className="cgb-example-row"><span>{visual("identity")}</span><strong>{example?.kind === "member" ? example.card.characterName : example?.card.name}</strong></div>
        <div className="cgb-example-row"><span>{t(locale, "cards.rarity")}</span><strong>{rarity}</strong></div>
      </div>}
      {step === "growth" && <div className="cgb-growth-picture">
        <div className="cgb-growth-pair">
          <div className="cgb-growth-column">{member && <CharacterRankArtwork src={assetUrl(getAssetUrl({ path: `Character/Image/${member.characterId}/character_round_icon.png` }))} name={member.characterName} value={12} label={t(locale, "deckWorkspace.profile.rankBadge")} />}<span>{visual("characterRank")}</span><strong>{visual("rankExample")}</strong></div>
          <div className="cgb-growth-column">{example && <div className="cgb-growth-card"><ExampleArtwork example={example} locale={locale} /></div>}<span>{t(locale, "cards.rarity")}</span><strong>{rarity}</strong></div>
        </div>
        <div className="cgb-furniture-picture"><strong>{visual("furniture")}</strong><div><span>{visual("ownership")}</span><span>{unknown}</span></div></div>
      </div>}
      {step === "backup" && <div className="cgb-backup-picture">
        <div className="cgb-backup-cards">{examples.slice(0, 2).map(item => <ExampleArtwork key={`${item.kind}:${item.card.id}`} example={item} locale={locale} />)}</div>
        <div className="cgb-backup-file"><GuideGlyph kind="file" /><strong>{visual("backupFile")}</strong><ul><li>{visual("cards")}</li><li>{visual("growth")}</li><li>{visual("records")}</li></ul></div>
      </div>}
    </div>
    <figcaption>{t(locale, "deckWorkspace.guide.illustration")}</figcaption>
  </figure>;
}

/** An optional tour of the real import flow. It never creates facts or stores tutorial progress. */
export default function CardBoxGuide({ locale, members, snaps, isOpen, onClose, onStartImport }: CardBoxGuideProps) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepFocusRequested = useRef(false);
  useEffect(() => {
    if (!stepFocusRequested.current || !isOpen) return;
    stepFocusRequested.current = false;
    const heading = headingRef.current;
    const body = heading?.closest<HTMLElement>(".mn-overlay-body");
    if (body) body.scrollTop = 0;
    heading?.focus({ preventScroll: true });
  }, [step, isOpen]);
  const stepId = steps[step]!;
  const tr = (key: string) => t(locale, `deckWorkspace.guide.${key}`);
  const examples: ExampleCard[] = [
    ...members.filter(card => card.rarity === 4).slice(0, 3).map(card => ({ kind: "member" as const, card })),
    ...snaps.filter(card => card.rarity !== 10).slice(0, 3).map(card => ({ kind: "snap" as const, card })),
  ];
  const changeStep = (index: number) => {
    if (index === step) return;
    stepFocusRequested.current = true;
    setStep(index);
  };
  const close = () => { stepFocusRequested.current = false; setStep(0); onClose(); };

  return <Modal historyNavigation={false} isOpen={isOpen} onClose={close} title={tr("title")} closeLabel={t(locale, "deckWorkspace.close")} size="xl">
    {isOpen && <section className="cgb-guide">
      <nav className="cgb-navigation" aria-label={tr("navigation")}><ol>{steps.map((id, index) => <li key={id}>
        <button type="button" className="cgb-step" aria-current={index === step ? "step" : undefined} onClick={() => changeStep(index)}>
          <span className="cgb-step-number" aria-hidden="true">{index + 1}</span><span>{tr(`steps.${id}.label`)}</span>
        </button>
      </li>)}</ol></nav>
      <div className="cgb-content">
        <GuideIllustration step={stepId} examples={examples} member={members.find(card => card.rarity === 4)} locale={locale} />
        <div className="cgb-copy"><h3 ref={headingRef} tabIndex={-1}>{tr(`steps.${stepId}.title`)}</h3><ul>{(["point1", "point2", "point3"] as const).map(point => <li key={point}>{tr(`steps.${stepId}.${point}`)}</li>)}</ul></div>
      </div>
      <footer className="cgb-footer">
        <button type="button" className="cgb-button cgb-previous" disabled={step === 0} onClick={() => changeStep(step - 1)}><GuideGlyph kind="left" />{tr("previous")}</button>
        <p className="cgb-progress" role="status">{t(locale, "deckWorkspace.guide.step", { current: step + 1, total: steps.length })}</p>
        {step < steps.length - 1
          ? <button type="button" className="cgb-button cgb-primary" onClick={() => changeStep(step + 1)}>{tr("next")}<GuideGlyph kind="right" /></button>
          : <button type="button" className="cgb-button cgb-primary" onClick={() => { close(); onStartImport(); }}>{tr("start")}</button>}
      </footer>
    </section>}
  </Modal>;
}
