import React from "react";
import { getCommercialPageDefinition } from "../../public/content/commercialPageDefinitions.js";
import "./commercial-landing-page.css";

function SolutionLinks({ currentPage }) {
  return (
    <div className="commercial-related-grid">
      {currentPage.relatedPageIds.map((id) => {
        const page = getCommercialPageDefinition(id);
        if (!page) return null;
        return (
          <a href={page.pathname} key={page.id}>
            <strong>{page.breadcrumbLabel}</strong>
            <span>{page.heroText}</span>
          </a>
        );
      })}
    </div>
  );
}

export function CommercialLandingPage({ onStartFree, pageId }) {
  const page = getCommercialPageDefinition(pageId);
  if (!page) return null;

  return (
    <main className="commercial-page">
      <header className="commercial-header">
        <a className="commercial-brand" href="/" aria-label="Support Communication — главная">
          <span aria-hidden="true">SC</span>
          <strong>Support Communication</strong>
        </a>
        <nav aria-label="Основная навигация">
          <a href="/pricing/">Тарифы</a>
          <a href="/docs/">Документация</a>
        </nav>
      </header>

      <nav className="commercial-breadcrumbs" aria-label="Хлебные крошки">
        <a href="/">Главная</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{page.breadcrumbLabel}</span>
      </nav>

      <section className="commercial-hero" aria-labelledby="commercial-title">
        <div>
          <span className="commercial-eyebrow">{page.eyebrow}</span>
          <h1 id="commercial-title">{page.h1}</h1>
          <p>{page.heroText}</p>
          <div className="commercial-actions">
            {page.primaryCta.kind === "start_free" ? (
              <button
                className="commercial-button primary"
                onClick={() => onStartFree({ plan: "free", source: page.primaryCta.source })}
                type="button"
              >
                {page.primaryCta.label}
              </button>
            ) : (
              <a className="commercial-button primary" href={page.primaryCta.href}>{page.primaryCta.label}</a>
            )}
            <a className="commercial-button secondary" href={page.secondaryCta.href}>{page.secondaryCta.label}</a>
          </div>
        </div>
        <aside className="commercial-summary" aria-label={page.summary.title}>
          <span>Support Communication</span>
          <strong>{page.summary.title}</strong>
          <p>{page.summary.text}</p>
          <div className="commercial-demo-flow">
            <span>{page.visual.title}</span>
            <ol>
              {page.visual.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        </aside>
      </section>

      <section className="commercial-section" aria-labelledby="commercial-capabilities-title">
        <div className="commercial-section-heading">
          <span>Возможности</span>
          <h2 id="commercial-capabilities-title">{page.sectionHeadings.capabilities}</h2>
          <p>{page.sectionHeadings.capabilitiesIntro}</p>
        </div>
        <div className="commercial-card-grid">
          {page.capabilities.map((item, index) => (
            <article key={item.title}>
              <span className="commercial-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="commercial-section commercial-workflow" aria-labelledby="commercial-workflow-title">
        <div className="commercial-section-heading">
          <span>Подключение и работа</span>
          <h2 id="commercial-workflow-title">{page.sectionHeadings.workflow}</h2>
        </div>
        <ol>
          {page.workflow.map((item) => (
            <li key={item.title}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside className="commercial-caveat" aria-labelledby="commercial-caveat-title">
        <span>Важно до запуска</span>
        <div>
          <h2 id="commercial-caveat-title">{page.caveat.title}</h2>
          <p>{page.caveat.text}</p>
        </div>
      </aside>

      <section className="commercial-section commercial-faq" aria-labelledby="commercial-faq-title">
        <div className="commercial-section-heading">
          <span>FAQ</span>
          <h2 id="commercial-faq-title">{page.sectionHeadings.faq}</h2>
        </div>
        <div>
          {page.faq.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="commercial-section commercial-related" aria-labelledby="commercial-related-title">
        <div className="commercial-section-heading">
          <span>Связанные решения</span>
          <h2 id="commercial-related-title">{page.sectionHeadings.related}</h2>
        </div>
        <SolutionLinks currentPage={page} />
      </section>

      <footer className="commercial-footer">
        <a href="/">Support Communication</a>
        <nav aria-label="Ресурсы">
          <a href="/pricing/">Тарифы</a>
          <a href="/docs/">Документация</a>
        </nav>
        <span>Подтверждённые возможности без вымышленных метрик</span>
      </footer>
    </main>
  );
}

export default CommercialLandingPage;
