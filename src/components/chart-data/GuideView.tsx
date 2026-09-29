import { useEffect, useRef, useState } from "react";
import type { ChartDataGuide } from "@/i18n/guides/chart-data";
import { Heading } from "./shared";

const no = (i: number) => String(i + 1).padStart(2, "0");

/** The guide: definitions, derivations and conditions behind every figure, with contents that follow the reading. */
export default function GuideView({ guide }: { guide: ChartDataGuide }) {
  const [current, setCurrent] = useState(0);
  const body = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = body.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    // the first section in the band from under the header to 45% of the window
    const seen = new Set<string>();
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
      const first = guide.sections.findIndex((_, i) => seen.has(`mn-cd-g${i}`));
      if (first >= 0) setCurrent(first);
    }, { rootMargin: "-90px 0px -55% 0px" });
    root.querySelectorAll(".mn-cd-g-section").forEach((x) => spy.observe(x));
    return () => spy.disconnect();
  }, [guide]);
  return (
    <>
      <div className="mn-cd-guide-head">
        <Heading title={guide.title} />
        <p>{guide.lead}</p>
      </div>
      <div className="mn-cd-guide">
        <nav className="mn-cd-toc mn-cd-glass" aria-label={guide.title}>
          {guide.sections.map((x, i) => (
            <a key={x.title} href={`#mn-cd-g${i}`} aria-current={i === current ? "true" : "false"}><span>{no(i)}</span>{x.title}</a>
          ))}
        </nav>
        <article ref={body} className="mn-cd-g-body">
          {guide.sections.map((x, i) => (
            <section key={x.title} id={`mn-cd-g${i}`} className="mn-cd-g-section">
              <Heading title={<><span className="mn-cd-g-no">{no(i)}</span> {x.title}</>} />
              {(x.body ?? []).map((p) => <p key={p}>{p}</p>)}
              {x.math?.length ? <div className="mn-cd-formula">{x.math.map((m) => <code key={m}>{m}</code>)}</div> : null}
              {(x.after ?? []).map((p) => <p key={p}>{p}</p>)}
              {x.defs?.length ? (
                <dl className="mn-cd-defs">
                  {x.defs.map(([term, def]) => [<dt key={`t${term}`}>{term}</dt>, <dd key={`d${term}`}>{def}</dd>])}
                </dl>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
