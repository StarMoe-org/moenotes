import type { DetailSemanticSeoData } from "@/lib/seo/entity-seo";
import { serializeJsonLd } from "@/lib/seo/jsonld";

export default function DetailSemanticSeoShell({ data }: { data: DetailSemanticSeoData | null }) {
  if (!data) return null;
  return (
    <>
      {data.jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data.jsonLd) }}
        />
      )}
      <article className="sr-only" data-semantic-seo="">
        <h2>{data.heading}</h2>
        <p>{data.summary}</p>
        {data.facts.length > 0 && (
          <dl>
            {data.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {data.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        {data.links.length > 0 && (
          <nav aria-label="Related entities">
            <ul>
              {data.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </>
  );
}
