import { useState } from "react";
import { motion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import BaseFilters, { FilterSection, FilterButton, FilterToggle } from "@/components/shared/BaseFilters";
import { useSpringAnimation } from "@/lib/animation/use-animation";

const TABS = ["colors", "typography", "components", "modals", "filters", "animations"] as const;
type TabId = (typeof TABS)[number];

interface Props {
  locale: AppLocale;
}

export default function DesignSystemPage({ locale }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("colors");
  const { springTransition, hoverProps, tapProps } = useSpringAnimation();

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <header>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-accent)] px-3 py-1 font-[var(--mn-font-display)] text-xs tracking-wider text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" style={{ transform: "rotate(-3deg)" }}>
          DESIGN SYSTEM
        </div>
        <h1 className="font-[var(--mn-font-display)] text-4xl tracking-tight text-[var(--mn-text)] sm:text-5xl">
          {t(locale, "designSystem.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--mn-text-muted)]">
          {t(locale, "designSystem.subtitle")}
        </p>
      </header>

      {/* Tab Navigation */}
      <nav className="sticky top-20 z-20 -mx-4 border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-3 shadow-[var(--mn-shadow-stamp-sm)] sm:mx-0 sm:rounded-xl sm:px-5">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab, i) => (
            <motion.button
              key={tab}
              onClick={() => setActiveTab(tab)}
              {...hoverProps}
              {...tapProps}
              transition={springTransition}
              className={`rounded-full border-2 border-[var(--mn-border)] px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm ${
                activeTab === tab
                  ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]"
                  : "bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:shadow-[var(--mn-shadow-stamp-sm)]"
              }`}
              style={{ transform: activeTab === tab ? "rotate(-1deg)" : `rotate(${i % 2 ? 0.5 : -0.5}deg)` }}
            >
              {t(locale, `designSystem.sections.${tab}`)}
            </motion.button>
          ))}
        </div>
      </nav>

      {/* Sections */}
      {activeTab === "colors" && <ColorsSection locale={locale} />}
      {activeTab === "typography" && <TypographySection locale={locale} />}
      {activeTab === "components" && <ComponentsSection locale={locale} />}
      {activeTab === "modals" && <ModalsSection locale={locale} />}
      {activeTab === "filters" && <FiltersSection locale={locale} />}
      {activeTab === "animations" && <AnimationsSection locale={locale} />}
    </div>
  );
}

// ── Section Wrapper ─────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-stamp-lg)] sm:p-8">
      {children}
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="mb-6 flex items-center gap-2 font-[var(--mn-font-display)] text-2xl tracking-tight text-[var(--mn-text)]">
      <span className="h-8 w-1.5 rounded-full bg-[var(--mn-accent)]" />
      {title}
    </h2>
  );
}

// ── Colors Section ──────────────────────────────────────────────────────────────

function ColorsSection({ locale }: { locale: AppLocale }) {
  const colors = [
    { key: "accent", var: "--mn-accent", cls: "bg-[var(--mn-accent)]" },
    { key: "pink", var: "--mn-pink", cls: "bg-[var(--mn-pink)]" },
    { key: "cyan", var: "--mn-cyan", cls: "bg-[var(--mn-cyan)]" },
    { key: "amber", var: "--mn-amber", cls: "bg-[var(--mn-amber)]" },
    { key: "mint", var: "--mn-mint", cls: "bg-[var(--mn-mint)]" },
    { key: "yellow", var: "--mn-yellow", cls: "bg-[var(--mn-yellow)]" },
    { key: "paper", var: "--mn-paper", cls: "bg-[var(--mn-paper)] border-[2.5px] border-[var(--mn-border)]" },
    { key: "background", var: "--mn-bg", cls: "bg-[var(--mn-bg)] border-[2.5px] border-[var(--mn-border)]" },
    { key: "surface", var: "--mn-surface", cls: "bg-[var(--mn-surface)] border-[2.5px] border-[var(--mn-border)]" },
    { key: "border", var: "--mn-border", cls: "bg-[var(--mn-border)]" },
    { key: "text", var: "--mn-text", cls: "bg-[var(--mn-text)]" },
    { key: "muted", var: "--mn-text-muted", cls: "bg-[var(--mn-text-muted)]" },
  ];

  return (
    <SectionCard>
      <SectionTitle title={t(locale, "designSystem.sections.colors")} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {colors.map((c) => (
          <div key={c.key} className="flex h-28 flex-col overflow-hidden rounded-md border-[2.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp-sm)]">
            <div className={`flex-1 ${c.cls}`} />
            <div className="border-t-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-2">
              <div className="text-xs font-bold text-[var(--mn-text)]">{t(locale, `designSystem.colors.${c.key}`)}</div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--mn-text-muted)]">{c.var}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Textures */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="mn-halftone flex h-20 items-center justify-center rounded-md border-[2.5px] border-[var(--mn-border)] text-xs font-bold text-[var(--mn-accent)]">halftone</div>
        <div className="mn-stripes-warm flex h-20 items-center justify-center rounded-md border-[2.5px] border-[var(--mn-border)] text-xs font-bold text-[var(--mn-bg)]">stripes-warm</div>
        <div className="mn-stripes-cream flex h-20 items-center justify-center rounded-md border-[2.5px] border-[var(--mn-border)] text-xs font-bold text-[var(--mn-text-muted)]">stripes-cream</div>
        <div className="mn-staff-bg flex h-20 items-center justify-center rounded-md border-[2.5px] border-[var(--mn-border)] text-xs font-bold text-[var(--mn-text-muted)]">staff-bg</div>
      </div>
    </SectionCard>
  );
}

// ── Typography Section ──────────────────────────────────────────────────────────

function TypographySection({ locale }: { locale: AppLocale }) {
  const fonts = [
    { key: "display", var: "var(--mn-font-display)", sample: "BANG! DREAM", sizes: ["text-5xl", "text-3xl", "text-xl"] },
    { key: "body", var: "var(--mn-font-body)", sample: "5 つの音、5 つの物語", sizes: ["text-2xl", "text-base", "text-sm"] },
    { key: "hand", var: "var(--mn-font-hand)", sample: "a quote from the heart", sizes: ["text-4xl", "text-2xl", "text-lg"] },
    { key: "note", var: "var(--mn-font-note)", sample: "notes from our journey", sizes: ["text-3xl", "text-xl", "text-base"] },
  ];

  return (
    <SectionCard>
      <SectionTitle title={t(locale, "designSystem.sections.typography")} />
      <div className="space-y-8">
        {fonts.map((font) => (
          <div key={font.key} className="border-b-2 border-dashed border-[var(--mn-border)] pb-8 last:border-0">
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--mn-bg)]">
                {t(locale, `designSystem.typography.${font.key}`)}
              </span>
              <span className="font-mono text-xs text-[var(--mn-text-muted)]">{font.var}</span>
            </div>
            <div className="space-y-2">
              {font.sizes.map((size, i) => (
                <div key={i} className={`${size} text-[var(--mn-text)]`} style={{ fontFamily: font.var }}>
                  {font.sample}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Components Section ──────────────────────────────────────────────────────────

function ComponentsSection({ locale }: { locale: AppLocale }) {
  return (
    <div className="space-y-6">
      {/* Buttons */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.buttons")} />
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-accent)] px-5 py-2.5 font-[var(--mn-font-display)] text-sm tracking-wider text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp)] hover:shadow-[var(--mn-shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]">
            {t(locale, "designSystem.components.primary")}
          </button>
          <button className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2.5 font-[var(--mn-font-display)] text-sm tracking-wider text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] hover:shadow-[var(--mn-shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]">
            {t(locale, "designSystem.components.outline")}
          </button>
          <button className="rounded-md px-4 py-2.5 text-sm font-bold text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]">
            {t(locale, "designSystem.components.ghost")}
          </button>
          <span className="mn-stamp rounded-sm px-3 py-1 text-xs" style={{ transform: "rotate(-3deg)" }}>
            {t(locale, "designSystem.components.stamp")}
          </span>
        </div>
      </SectionCard>

      {/* Inputs */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.inputs")} />
        <div className="max-w-sm space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-[var(--mn-text)]">Standard Input</label>
            <input type="text" placeholder="Type something..." className="w-full rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2.5 text-sm text-[var(--mn-text)] placeholder:text-[var(--mn-text-muted)] focus:border-[var(--mn-accent)] focus:bg-[var(--mn-paper)] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-[var(--mn-text)]">Input with Error</label>
            <input type="text" defaultValue="Invalid" className="w-full rounded-md border-[2.5px] border-[var(--mn-accent)] bg-[var(--mn-surface)] px-4 py-2.5 text-sm text-[var(--mn-accent)] focus:outline-none" />
            <p className="mt-1 text-xs font-bold text-[var(--mn-accent)]">Please enter a valid value</p>
          </div>
        </div>
      </SectionCard>

      {/* Badges */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.badges")} />
        <div className="flex flex-wrap gap-3">
          <span className="mn-stamp rounded-sm px-3 py-1 text-xs" style={{ transform: "rotate(-2deg)" }}>ACCENT</span>
          <span className="rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-pink)] px-3 py-1 text-xs font-bold text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" style={{ transform: "rotate(1deg)" }}>PINK</span>
          <span className="rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-cyan)] px-3 py-1 text-xs font-bold text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" style={{ transform: "rotate(-1deg)" }}>CYAN</span>
          <span className="rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-amber)] px-3 py-1 text-xs font-bold text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" style={{ transform: "rotate(2deg)" }}>AMBER</span>
          <span className="rounded-sm border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-1 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]">OUTLINE</span>
        </div>
      </SectionCard>

      {/* Cards */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.cards")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="mn-card relative rounded-md p-5">
            <p className="font-[var(--mn-font-display)] text-lg">mn-card</p>
            <p className="mt-1 text-sm text-[var(--mn-text-muted)]">Standard card with stamp shadow</p>
          </div>
          <div className="mn-sticker relative rounded-md p-5">
            <p className="font-[var(--mn-font-display)] text-lg">mn-sticker</p>
            <p className="mt-1 text-sm text-[var(--mn-text-muted)]">Sticker variant</p>
          </div>
          <div className="mn-tape mn-paper relative rounded-md p-5">
            <p className="font-[var(--mn-font-display)] text-lg">mn-tape</p>
            <p className="mt-1 text-sm text-[var(--mn-text-muted)]">Paper with tape decoration</p>
          </div>
        </div>
      </SectionCard>

      {/* Select (Dropdown) */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.select")} />
        <div className="grid max-w-sm gap-4">
          <SelectDemo locale={locale} />
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--mn-text-muted)]">
{`<Select label="..." value={v} options={[...]} onChange={...} />`}
        </p>
      </SectionCard>

      {/* Checkbox */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.components.checkbox")} />
        <div className="flex flex-wrap items-center gap-6">
          <CheckboxDemo defaultChecked />
          <CheckboxDemo />
          <CheckboxDemo accent />
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--mn-text-muted)]">
{`<Checkbox checked={v} onChange={...} label="..." />`}
        </p>
      </SectionCard>
    </div>
  );
}

// ── Modals Section ──────────────────────────────────────────────────────────────

function ModalsSection({ locale }: { locale: AppLocale }) {
  const [modalSize, setModalSize] = useState<"sm" | "md" | "lg" | "xl">("md");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "success">("idle");

  const openModal = (size: "sm" | "md" | "lg" | "xl") => {
    setModalSize(size);
    setIsModalOpen(true);
  };

  const handleCopy = async () => {
    setCopyState("copying");
    await new Promise((r) => setTimeout(r, 800));
    setCopyState("success");
    setTimeout(() => setCopyState("idle"), 1500);
  };

  const copyHeaderActions = (
    <button
      onClick={handleCopy}
      disabled={copyState === "copying"}
      className="grid h-8 w-8 place-items-center rounded border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
    >
      {copyState === "idle" && (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
      {copyState === "copying" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
      {copyState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.sections.modals")} />
        <div className="flex flex-wrap items-center gap-4">
          {(["sm", "md", "lg", "xl"] as const).map((size) => (
            <button
              key={size}
              onClick={() => openModal(size)}
              className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2.5 font-[var(--mn-font-display)] text-sm tracking-wider text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] hover:shadow-[var(--mn-shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
            >
              {t(locale, `designSystem.modals.open${size.charAt(0).toUpperCase() + size.slice(1)}` as const)}
            </button>
          ))}
          <button
            onClick={() => setIsCopyModalOpen(true)}
            className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-mint)] px-5 py-2.5 font-[var(--mn-font-display)] text-sm tracking-wider text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp)] hover:shadow-[var(--mn-shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
          >
            {t(locale, "designSystem.modals.copyModal")}
          </button>
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--mn-text-muted)]">
          {`<Modal isOpen={…} onClose={…} title="..." size="sm | md | lg | xl">{children}</Modal>`}
        </p>
      </SectionCard>

      {/* Regular Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t(locale, "designSystem.modals.title")} size={modalSize}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--mn-text-muted)]">{t(locale, "designSystem.modals.body")}</p>
          <div className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-4">
            <h3 className="mb-2 text-sm font-bold text-[var(--mn-text)]">Features</h3>
            <ul className="space-y-1 text-sm text-[var(--mn-text-muted)]">
              <li>• createPortal — z-index free</li>
              <li>• framer-motion spring animation</li>
              <li>• ESC / backdrop / browser back</li>
              <li>• Body scroll lock</li>
              <li>• sm / md / lg / xl sizes</li>
              <li>• mn-tape decoration</li>
            </ul>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-accent)] px-3 py-1 text-xs font-bold text-[var(--mn-bg)]">
            {t(locale, "designSystem.modals.currentSize")}: {modalSize}
          </span>
        </div>
      </Modal>

      {/* Copy Modal */}
      <Modal isOpen={isCopyModalOpen} onClose={() => { setIsCopyModalOpen(false); setCopyState("idle"); }} title={t(locale, "designSystem.modals.copyModalTitle")} size="lg" headerActions={copyHeaderActions}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--mn-text-muted)]">Copy Modal variant — copy/save actions in the header via headerActions prop.</p>
          <div className="flex items-center justify-center rounded-md border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] p-8">
            <div className="flex h-40 w-60 items-center justify-center rounded-md border-[2.5px] border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] text-sm text-[var(--mn-text-muted)]">
              Image Placeholder
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Filters Section ─────────────────────────────────────────────────────────────

function FiltersSection({ locale }: { locale: AppLocale }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [language, setLanguage] = useState("all");
  const [toggle, setToggle] = useState(false);

  const total = 128;
  const filtered = search || category !== "all" || toggle || language !== "all" ? 42 : total;
  const hasActive = search !== "" || category !== "all" || toggle || sortBy !== "name" || language !== "all";

  const reset = () => { setSearch(""); setCategory("all"); setSortBy("name"); setLanguage("all"); setToggle(false); };

  const sortOptions = [
    { value: "name", label: t(locale, "designSystem.filters.name") },
    { value: "date", label: t(locale, "designSystem.filters.date") },
    { value: "level", label: t(locale, "designSystem.filters.level") },
  ];

  const languageOptions = [
    { value: "all", label: t(locale, "designSystem.filters.all") },
    { value: "zh", label: "简体中文" },
    { value: "ja", label: "日本語" },
    { value: "en", label: "English" },
  ];

  return (
    <SectionCard>
      <SectionTitle title={t(locale, "designSystem.sections.filters")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <BaseFilters
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t(locale, "designSystem.filters.searchPlaceholder")}
            resultCount={filtered}
            totalCount={total}
            hasActiveFilters={hasActive}
            onReset={reset}
          >
            <FilterSection title={t(locale, "designSystem.filters.category")}>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "typeA", "typeB"] as const).map((cat) => (
                  <FilterButton key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                    {t(locale, `designSystem.filters.${cat}` as const)}
                  </FilterButton>
                ))}
              </div>
            </FilterSection>
            <FilterSection title={t(locale, "designSystem.filters.sortBy")}>
              <FilterSelect value={sortBy} options={sortOptions} onChange={setSortBy} />
            </FilterSection>
            <FilterSection title={t(locale, "designSystem.filters.language")}>
              <FilterSelect value={language} options={languageOptions} onChange={setLanguage} />
            </FilterSection>
            <FilterToggle checked={toggle} onChange={setToggle} label={t(locale, "designSystem.filters.onlyComplete")} />
          </BaseFilters>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">Current State</h4>
            <div className="space-y-1 font-mono text-xs text-[var(--mn-text-muted)]">
              <div>search: "{search || "(empty)"}"</div>
              <div>category: "{category}"</div>
              <div>sortBy: "{sortBy}"</div>
              <div>language: "{language}"</div>
              <div>toggle: {String(toggle)}</div>
              <div>filtered: {filtered} / {total}</div>
            </div>
          </div>
          <div className="rounded-md border-[2.5px] border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">API</h4>
            <pre className="overflow-x-auto text-[10px] text-[var(--mn-text-muted)]">
{`<BaseFilters searchValue={...} onSearchChange={...}>
  <FilterSection title="...">
    <FilterButton active={...} onClick={...}>...</FilterButton>
  </FilterSection>
  <FilterSection title="Sort by">
    <FilterSelect value={v} options={[...]} onChange={...} />
  </FilterSection>
  <FilterToggle checked={...} onChange={...} label="..." />
</BaseFilters>`}
            </pre>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function FilterSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:shadow-[var(--mn-shadow-stamp)] hover:translate-x-[1px] hover:translate-y-[1px]"
        onClick={() => setOpen(!open)}
      >
        {selected?.label}
        {chevronDown}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] py-1 shadow-[var(--mn-shadow-stamp)]">
            {options.map((opt) => (
              <button
                key={opt.value}
                className={`w-full px-3 py-2 text-left text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${opt.value === value ? "bg-[var(--mn-accent)] text-[var(--mn-bg)]" : "text-[var(--mn-text)]"}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Animations Section ──────────────────────────────────────────────────────────

function AnimationsSection({ locale }: { locale: AppLocale }) {
  const { hoverProps, tapProps, springTransition, staggerContainer, staggerItem, isDisabled } = useSpringAnimation();

  const customTapBig = isDisabled ? {} : { whileTap: { scale: 0.85 } };

  return (
    <div className="space-y-6">
      {/* Spring Hover */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.animations.spring")} />
        <p className="mb-4 text-sm text-[var(--mn-text-muted)]">{t(locale, "designSystem.animations.springDesc")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <motion.div
              key={i}
              {...hoverProps}
              transition={springTransition}
              className="mn-card relative flex h-32 items-center justify-center rounded-md p-4"
              style={{ transform: `rotate(${i % 2 ? -2 : 2}deg)` }}
            >
              <div className="text-center">
                <div className="text-2xl">🎸</div>
                <div className="mt-1 text-xs font-bold text-[var(--mn-text-muted)]">Card {i + 1}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </SectionCard>

      {/* Tap Feedback */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.animations.tap")} />
        <p className="mb-4 text-sm text-[var(--mn-text-muted)]">{t(locale, "designSystem.animations.tapDesc")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <motion.button
            {...tapProps}
            transition={springTransition}
            className="grid h-14 w-14 place-items-center rounded-full border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp)]"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </motion.button>
          <motion.button
            {...tapProps}
            transition={springTransition}
            className="grid h-14 w-14 place-items-center rounded-full border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-pink)] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp)]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </motion.button>
          <motion.button
            {...customTapBig}
            transition={springTransition}
            className="rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-amber)] px-6 py-3 font-[var(--mn-font-display)] text-sm text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp)]"
          >
            TAP ME
          </motion.button>
        </div>
      </SectionCard>

      {/* Stagger Animation */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.animations.stagger")} />
        <p className="mb-4 text-sm text-[var(--mn-text-muted)]">{t(locale, "designSystem.animations.staggerDesc")}</p>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="flex h-20 items-center justify-center rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] text-xs font-bold text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)]"
            >
              Item {i + 1}
            </motion.div>
          ))}
        </motion.div>
      </SectionCard>

      {/* Wobble */}
      <SectionCard>
        <SectionTitle title={t(locale, "designSystem.animations.wobble")} />
        <p className="mb-4 text-sm text-[var(--mn-text-muted)]">{t(locale, "designSystem.animations.wobbleDesc")}</p>
        <div className="flex flex-wrap gap-4">
          {["🎤", "🎸", "🥁", "🎹", "🎻"].map((emoji, i) => (
            <div
              key={i}
              className="mn-wobble mn-stamp grid h-16 w-16 cursor-pointer place-items-center rounded-md text-2xl"
              style={{ transform: `rotate(${(i - 2) * 3}deg)` }}
            >
              {emoji}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Select & Checkbox Demos ───────────────────────────────────────────────────

const chevronDown = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

const checkSvg = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
);

function SelectDemo({ locale }: { locale: AppLocale }) {
  const options = [
    { value: "a", label: t(locale, "designSystem.components.optA") },
    { value: "b", label: t(locale, "designSystem.components.optB") },
    { value: "c", label: t(locale, "designSystem.components.optC") },
  ];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("a");
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-bold text-[var(--mn-text)]">{t(locale, "designSystem.components.select")}</label>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2.5 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] transition hover:shadow-[var(--mn-shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
        onClick={() => setOpen(!open)}
      >
        {selected?.label ?? t(locale, "designSystem.components.selectPlaceholder")}
        {chevronDown}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] py-1 shadow-[var(--mn-shadow-stamp)]">
            {options.map((opt) => (
              <button
                key={opt.value}
                className={`w-full px-4 py-2 text-left text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${opt.value === value ? "bg-[var(--mn-accent)] text-[var(--mn-bg)]" : "text-[var(--mn-text)]"}`}
                onClick={() => { setValue(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckboxDemo({ defaultChecked = false, accent = false }: { defaultChecked?: boolean; accent?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded border-[2.5px] transition ${checked ? (accent ? "border-[var(--mn-accent)] bg-[var(--mn-accent)] text-[var(--mn-bg)]" : "border-[var(--mn-border)] bg-[var(--mn-accent)] text-[var(--mn-bg)]") : "border-[var(--mn-border)] bg-[var(--mn-paper)]"}`}
        onClick={() => setChecked(!checked)}
      >
        {checked && checkSvg}
      </button>
      <span className="text-sm font-bold text-[var(--mn-text)]">
        {accent ? "Accent" : checked ? "Checked" : "Unchecked"}
      </span>
    </label>
  );
}
