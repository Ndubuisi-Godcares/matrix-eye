import type { WidgetTemplate } from "@matrix-eye/sdk";
import { TEMPLATES } from "../lib/catalog";

export function TemplateGallery({ selected, onSelect }: { selected: WidgetTemplate; onSelect: (id: WidgetTemplate) => void }) {
  return (
    <div className="gallery gallery--templates">
      {TEMPLATES.map((t) => {
        const active = t.id === selected;
        return (
          <button key={t.id} type="button" className={`template-card${active ? " template-card--active" : ""}`} aria-pressed={active} onClick={() => onSelect(t.id)}>
            <div className={`template-card__thumb template-card__thumb--${t.id}`} aria-hidden="true">
              <span className="template-card__thumb-head" />
              <span className="template-card__thumb-line template-card__thumb-line--user" />
              <span className="template-card__thumb-line template-card__thumb-line--bot" />
            </div>
            <div className="template-card__body">
              <strong>{t.name}</strong>
              <p>{t.description}</p>
              <p className="template-card__use">{t.useCase}</p>
              <div className="tag-row">
                {t.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {active && <span className="template-card__selected">Applied</span>}
          </button>
        );
      })}
    </div>
  );
}
