"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import type { AppLocale } from "@/config/locales";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { DeckEvent } from "@/lib/deck/goals";
import type {
  ManualBonusTier,
  ManualEventDraft,
  ManualEventTargetKind,
  ManualEventTemplate,
  ManualFeaturedCard,
} from "@/lib/deck/manual-event";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import { Icon } from "@/components/shared/icons";
import CardIdentitySelection from "@/components/box/CardIdentitySelection";
import { MemberSquareArtwork, SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import { DeckSegmented, DeckSelect } from "./DeckControls";

const EVENT_ATTRIBUTE_IDS = [1, 2, 3, 4, 5] as const;

export type DeckEventSourceMode = "auto" | "template" | "custom";

export interface NamedEntityOption {
  id: number;
  name: string;
}

export interface DeckEventSourceControlsProps {
  locale: AppLocale;
  mode: DeckEventSourceMode;
  heldEvent: DeckEvent | null;
  events: readonly DeckEvent[];
  selectedEventId: number | null;
  customTemplates: readonly { event: DeckEvent; template: ManualEventTemplate }[];
  customDraft: ManualEventDraft | null;
  canCustom: boolean;
  onModeChange: (mode: DeckEventSourceMode) => void;
  onSelectedEventChange: (eventId: number) => void;
  onOpenCustomModal: () => void;
}

export function DeckEventSourceControls(props: DeckEventSourceControlsProps) {
  const { locale, mode, heldEvent, events, selectedEventId, customTemplates, customDraft, canCustom } = props;
  const tr = (key: string, values?: Record<string, string | number>) =>
    t(locale, `deckWorkspace.manualEvent.${key}`, values);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.id - a.id),
    [events],
  );
  const templateOptions = useMemo(
    () =>
      customTemplates.map(({ event }) => ({
        value: event.id,
        label: `#${event.id} ${event.name}`,
      })),
    [customTemplates],
  );
  const allEventOptions = useMemo(
    () =>
      sortedEvents.map((event) => ({
        value: event.id,
        label: `#${event.id} ${event.name}`,
      })),
    [sortedEvents],
  );

  if (sortedEvents.length === 0) return null;

  const activeTemplateEvent =
    mode === "custom"
      ? (customTemplates.find((entry) => entry.event.id === (customDraft?.templateEventId ?? selectedEventId))?.event ??
        customTemplates[0]?.event ??
        null)
      : (sortedEvents.find((event) => event.id === selectedEventId) ?? sortedEvents[0] ?? null);

  return (
    <div className="dc-arena">
      <DeckSegmented
        label={tr("title")}
        size="small"
        value={mode}
        onChange={props.onModeChange}
        options={[
          { value: "auto", label: tr("modeAuto") },
          { value: "template", label: tr("modeTemplate") },
          { value: "custom", label: tr("modeCustom"), disabled: !canCustom || customTemplates.length === 0 },
        ]}
      />

      {mode === "auto" && !heldEvent && (
        <div className="dc-arena-summary is-inactive" role="status">
          <p>{tr("noActiveEvent")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="text" size="small" onClick={() => props.onModeChange("template")}>
              {tr("modeTemplate")}
            </Button>
            {canCustom && customTemplates.length > 0 && (
              <Button variant="text" size="small" onClick={() => props.onModeChange("custom")}>
                {tr("modeCustom")}
              </Button>
            )}
          </div>
        </div>
      )}

      {mode === "template" && activeTemplateEvent && (
        <DeckSelect
          label={tr("templateLabel")}
          value={activeTemplateEvent.id}
          options={allEventOptions}
          onChange={props.onSelectedEventChange}
        />
      )}

      {mode === "custom" && activeTemplateEvent && customDraft && (
        <div className="dc-arena-custom">
          <DeckSelect
            label={tr("templateLabel")}
            value={activeTemplateEvent.id}
            options={templateOptions}
            onChange={props.onSelectedEventChange}
          />
          <div className="dc-arena-summary" role="status">
            <div className="dc-arena-summary-head">
              <strong>
                {tr("summaryCustom", {
                  event: activeTemplateEvent.name,
                  attrs: customDraft.attributes.length,
                  pickup: customDraft.featuredMembers.length + customDraft.featuredSnaps.length,
                })}
              </strong>
              <Button
                variant="tonal"
                size="small"
                onClick={props.onOpenCustomModal}
                startIcon={<Icon name="tune" className="h-4 w-4" />}
              >
                {tr("configure")}
              </Button>
            </div>
            <p>{tr("challengeDisabled")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export interface DeckManualEventDialogProps {
  locale: AppLocale;
  isOpen: boolean;
  onClose: () => void;
  template: ManualEventTemplate;
  draft: ManualEventDraft;
  onChange: (next: ManualEventDraft) => void;
  onReset: () => void;
  bands: readonly NamedEntityOption[];
  characters: readonly NamedEntityOption[];
  catalog: {
    members: readonly CardViewModel[];
    snaps: readonly SupportCardViewModel[];
  };
}

function tierLabel(
  tr: (key: string, values?: Record<string, string | number>) => string,
  tier: ManualBonusTier,
): string {
  return tr("tierOption", {
    pt: tier.maxPointPercent,
    item: tier.maxItemPercent,
    param: tier.maxParamPercent,
  });
}

export default function DeckManualEventDialog(props: DeckManualEventDialogProps) {
  const { locale, isOpen, onClose, template, draft, onChange, onReset, bands, characters, catalog } = props;
  const tr = (key: string, values?: Record<string, string | number>) =>
    t(locale, `deckWorkspace.manualEvent.${key}`, values);

  const [pickingKind, setPickingKind] = useState<"member" | "snap" | null>(null);

  const memberById = useMemo(
    () => new Map(catalog.members.map((card) => [card.id, card])),
    [catalog.members],
  );
  const snapById = useMemo(
    () => new Map(catalog.snaps.map((card) => [card.id, card])),
    [catalog.snaps],
  );

  function toggleNumber(list: readonly number[], value: number): number[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value].sort((a, b) => a - b);
  }

  function updatePickupTier(
    kind: "member" | "snap",
    cardId: number,
    tierKey: string,
  ) {
    const key = kind === "member" ? "featuredMembers" : "featuredSnaps";
    onChange({
      ...draft,
      [key]: draft[key].map((item): ManualFeaturedCard =>
        item.cardId === cardId ? { cardId, tierKey } : item,
      ),
    });
  }

  function removePickupCard(kind: "member" | "snap", cardId: number) {
    const key = kind === "member" ? "featuredMembers" : "featuredSnaps";
    onChange({
      ...draft,
      [key]: draft[key].filter((item) => item.cardId !== cardId),
    });
  }

  function appendPickupCard(kind: "member" | "snap", rawId: string | null) {
    setPickingKind(null);
    if (!rawId) return;
    const cardId = Number(rawId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return;
    const tiers = kind === "member" ? template.memberTiers : template.snapTiers;
    const defaultTier = tiers[0];
    if (!defaultTier) return;
    const key = kind === "member" ? "featuredMembers" : "featuredSnaps";
    if (draft[key].some((item) => item.cardId === cardId)) return;
    onChange({
      ...draft,
      [key]: [...draft[key], { cardId, tierKey: defaultTier.key }],
    });
  }

  const hasTargetProfile = template.targetProfile.length > 0;
  const targetOptions: { value: ManualEventTargetKind; label: string; disabled?: boolean }[] = [
    { value: "band", label: tr("targetBand"), disabled: !hasTargetProfile },
    { value: "character", label: tr("targetCharacter"), disabled: !hasTargetProfile },
    { value: "none", label: tr("targetNone") },
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={tr("configure")}
        size="lg"
        historyNavigation={false}
        headerActions={
          <Button variant="text" size="small" onClick={onReset}>
            {tr("resetTemplate")}
          </Button>
        }
      >
        <div className="flex flex-col gap-5 py-1">
          <p className="m-0 text-sm text-on-surface-variant">{tr("templateHint")}</p>

          {template.attributeProfile.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-on-surface-variant">{tr("attributes")}</span>
              <div className="flex flex-wrap gap-2">
                {EVENT_ATTRIBUTE_IDS.map((attr) => {
                  const selected = draft.attributes.includes(attr);
                  return (
                    <Chip
                      key={attr}
                      clickable
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      label={t(locale, `cards.attributes.${attr}`)}
                      onClick={() =>
                        onChange({
                          ...draft,
                          attributes: toggleNumber(draft.attributes, attr),
                        })
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <DeckSegmented
              label={tr("targetKind")}
              size="small"
              value={draft.targetKind}
              options={targetOptions}
              onChange={(targetKind) =>
                onChange({
                  ...draft,
                  targetKind,
                  targets: targetKind === draft.targetKind ? draft.targets : [],
                })
              }
            />

            {draft.targetKind === "band" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-on-surface-variant">{tr("selectBands")}</span>
                <div className="flex flex-wrap gap-2">
                  {bands.map((band) => {
                    const selected = draft.targets.includes(band.id);
                    return (
                      <Chip
                        key={band.id}
                        clickable
                        color={selected ? "primary" : "default"}
                        variant={selected ? "filled" : "outlined"}
                        label={band.name}
                        onClick={() =>
                          onChange({
                            ...draft,
                            targets: toggleNumber(draft.targets, band.id),
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {draft.targetKind === "character" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-on-surface-variant">{tr("selectCharacters")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {characters.map((character) => {
                    const selected = draft.targets.includes(character.id);
                    return (
                      <Chip
                        key={character.id}
                        size="small"
                        clickable
                        color={selected ? "primary" : "default"}
                        variant={selected ? "filled" : "outlined"}
                        label={character.name}
                        onClick={() =>
                          onChange({
                            ...draft,
                            targets: toggleNumber(draft.targets, character.id),
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {template.memberTiers.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-on-surface-variant">{tr("featuredMembers")}</span>
                <Button
                  variant="tonal"
                  size="small"
                  onClick={() => setPickingKind("member")}
                >
                  + {tr("addMember")}
                </Button>
              </div>
              {draft.featuredMembers.length > 0 && (
                <div className="flex flex-col gap-2">
                  {draft.featuredMembers.map((entry) => {
                    const card = memberById.get(entry.cardId);
                    const tierKey = template.memberTiers.some((tItem) => tItem.key === entry.tierKey)
                      ? entry.tierKey
                      : (template.memberTiers[0]?.key ?? "");
                    return (
                      <div
                        key={entry.cardId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                            {card ? (
                              <MemberSquareArtwork card={card} locale={locale} className="dw-card-art" native={false} />
                            ) : (
                              <span className="dw-card-art dw-card-unknown">?</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-on-surface">
                              {card?.characterName ?? `#${entry.cardId}`}
                            </div>
                            <div className="truncate text-xs text-on-surface-variant">
                              {card?.title ?? ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DeckSelect
                            compact
                            ariaLabel={tr("featuredMembers")}
                            value={tierKey}
                            options={template.memberTiers.map((tier) => ({
                              value: tier.key,
                              label: tierLabel(tr, tier),
                            }))}
                            onChange={(nextKey) => updatePickupTier("member", entry.cardId, nextKey)}
                          />
                          <IconButton
                            size="small"
                            aria-label={tr("removeCard")}
                            onClick={() => removePickupCard("member", entry.cardId)}
                          >
                            <Icon name="close" className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {template.snapTiers.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-on-surface-variant">{tr("featuredSnaps")}</span>
                <Button
                  variant="tonal"
                  size="small"
                  onClick={() => setPickingKind("snap")}
                >
                  + {tr("addSnap")}
                </Button>
              </div>
              {draft.featuredSnaps.length > 0 && (
                <div className="flex flex-col gap-2">
                  {draft.featuredSnaps.map((entry) => {
                    const snap = snapById.get(entry.cardId);
                    const tierKey = template.snapTiers.some((tItem) => tItem.key === entry.tierKey)
                      ? entry.tierKey
                      : (template.snapTiers[0]?.key ?? "");
                    return (
                      <div
                        key={entry.cardId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                            {snap ? (
                              <SupportSquareArtwork card={snap} locale={locale} className="dw-card-art" native={false} />
                            ) : (
                              <span className="dw-card-art dw-card-unknown">?</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-on-surface">
                              {snap?.name ?? `#${entry.cardId}`}
                            </div>
                            <div className="truncate text-xs text-on-surface-variant">
                              {snap?.title ?? ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DeckSelect
                            compact
                            ariaLabel={tr("featuredSnaps")}
                            value={tierKey}
                            options={template.snapTiers.map((tier) => ({
                              value: tier.key,
                              label: tierLabel(tr, tier),
                            }))}
                            onChange={(nextKey) => updatePickupTier("snap", entry.cardId, nextKey)}
                          />
                          <IconButton
                            size="small"
                            aria-label={tr("removeCard")}
                            onClick={() => removePickupCard("snap", entry.cardId)}
                          >
                            <Icon name="close" className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={pickingKind !== null}
        onClose={() => setPickingKind(null)}
        title={pickingKind === "snap" ? tr("addSnap") : tr("addMember")}
        size="xl"
        historyNavigation={false}
      >
        {pickingKind && (
          <CardIdentitySelection
            locale={locale}
            kind={pickingKind}
            catalog={catalog}
            value={null}
            allowUnknown={false}
            disabledIds={
              pickingKind === "member"
                ? draft.featuredMembers.map((entry) => String(entry.cardId))
                : draft.featuredSnaps.map((entry) => String(entry.cardId))
            }
            onChange={(id) => appendPickupCard(pickingKind, id)}
            onCancel={() => setPickingKind(null)}
          />
        )}
      </Modal>
    </>
  );
}
