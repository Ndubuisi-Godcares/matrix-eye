import type { Project } from "@matrix-eye/sdk";

export function ProjectPicker({ projects, error, onRetry, onSelect }: { projects: Project[] | null; error: string | null; onRetry: () => void; onSelect: (id: string) => void }) {
  if (error) {
    return (
      <div className="state-card">
        <p>{error}</p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!projects) return <div className="state-card">Loading your projects&hellip;</div>;
  if (projects.length === 0) {
    return (
      <div className="state-card">
        <p>No projects yet on this API. Create one first — see the quickstart — then come back here to design its widget.</p>
      </div>
    );
  }

  return (
    <div className="picker">
      <h1>Choose a project</h1>
      <p className="picker__lead">Pick which project's chat widget to customize.</p>
      <ul className="picker__list">
        {projects.map((p) => (
          <li key={p.id}>
            <button type="button" className="picker__item" onClick={() => onSelect(p.id)}>
              <strong>{p.name}</strong>
              <span>{p.siteUrl}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
