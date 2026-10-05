import { useEffect, useRef, useState } from "react";
import type { ChartDataGuide } from "@/i18n/guides/chart-data";
import { Heading } from "./shared";
import ModelSourceText from "./ModelSourceText";

const no = (i: number) => String(i + 1).padStart(2, "0");
const anchor = (section: ChartDataGuide["sections"][number], i: number) => section.id ?? `mn-cd-g${i}`;

/** The guide: definitions, derivations and conditions behind every figure, with contents that follow the reading. */
export default function GuideView({ guide }: { guide: ChartDataGuide }) {
  const [current, setCurrent] = useState(0);
  const body = useRef<HTMLElement>(null);
  // a link into a section lands on it once the page has its final layout
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  useEffect(() => {
    const root = body.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    // the first section in the band from under the header to 45% of the window
    const seen = new Set<string>();
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
      const first = guide.sections.findIndex((x, i) => seen.has(anchor(x, i)));
      if (first >= 0) setCurrent(first);
    }, { rootMargin: "-90px 0px -55% 0px" });
    root.querySelectorAll(".mn-cd-g-section").forEach((x) => spy.observe(x));
    return () => spy.disconnect();
  }, [guide]);
  return (
    <>
      <div className="mn-cd-guide-head">
        <Heading title={guide.title} />
        {guide.reminder ? <aside className="mn-cd-guide-reminder" role="note"><strong>{guide.reminder.title}</strong>{guide.reminder.priority ? <p><strong>{guide.reminder.priority}</strong></p> : null}<p><ModelSourceText text={guide.reminder.text} /></p></aside> : <p><ModelSourceText text={guide.lead} /></p>}
        {guide.method ? <section className="mn-cd-guide-method" id="mn-cd-sources"><h2>{guide.method.title}</h2><p><ModelSourceText text={guide.method.text} /></p></section> : null}
      </div>
      <div className="mn-cd-guide">
        <nav className="mn-cd-toc" aria-label={guide.title}>
          {guide.sections.map((x, i) => (
            <a key={x.title} href={`#${anchor(x, i)}`} aria-current={i === current ? "true" : "false"}><span>{no(i)}</span>{x.title}</a>
          ))}
        </nav>
        <details className="mn-cd-toc-mobile"><summary>{guide.contentsLabel}</summary><nav aria-label={guide.title}>{guide.sections.map((x,i)=><a key={x.title} href={`#${anchor(x, i)}`} onClick={(e)=>{e.currentTarget.closest("details")?.removeAttribute("open");}}><span>{no(i)}</span>{x.title}</a>)}</nav></details>
        <article ref={body} className="mn-cd-g-body">
          {guide.sections.map((x, i) => (
            <section key={x.title} id={anchor(x, i)} className="mn-cd-g-section">
              <header className="mn-cd-guide-section-head"><span className="mn-cd-g-no">{no(i)}</span><h2>{x.title}</h2></header>
              {!x.table ? (x.body ?? []).map((p) => <p key={p}>{p}</p>) : null}
              {x.math?.length ? <div className="mn-cd-formula">{x.math.map((m) => <code key={m}>{m}</code>)}</div> : null}
              {x.table ? <div className="mn-cd-verification-scroll" tabIndex={0} role="region" aria-label={x.title}><table className="mn-cd-verification">
                {x.table.caption ? <caption>{x.table.caption}</caption> : null}
                <thead><tr>{x.table.headers.map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead>
                <tbody>{x.table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody>
              </table></div> : null}
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
