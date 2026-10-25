import { useCallback, useEffect, useMemo, useState } from "react";
import { MatrixEyeClient, MatrixEyeError, type Project } from "@matrix-eye/sdk";
import { ConnectForm } from "./components/ConnectForm";
import { ProjectPicker } from "./components/ProjectPicker";
import { Studio } from "./components/Studio";
import { clearConnection, loadConnection, saveConnection, type Connection } from "./lib/connection";

export function App() {
  const [connection, setConnection] = useState<Connection | null>(() => loadConnection());
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const client = useMemo(() => (connection ? new MatrixEyeClient({ baseUrl: connection.baseUrl, apiKey: connection.apiKey }) : null), [connection]);

  const refreshProjects = useCallback(() => {
    if (!client) return;
    setProjects(null);
    setProjectsError(null);
    client
      .listProjects()
      .then(setProjects)
      .catch((err: unknown) => setProjectsError(err instanceof MatrixEyeError ? err.message : "Could not reach the API. Check the base URL and that the server is running."));
  }, [client]);

  useEffect(refreshProjects, [refreshProjects]);

  const disconnect = useCallback(() => {
    clearConnection();
    setConnection(null);
    setProjects(null);
    setSelectedId(null);
  }, []);

  if (!connection || !client) {
    return (
      <ConnectForm
        onConnect={(next) => {
          saveConnection(next);
          setConnection(next);
        }}
      />
    );
  }

  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="app__bar">
        <div className="app__brand">
          <span className="app__mark" aria-hidden="true" />
          MatrixEye <span className="app__bar-sep">/</span> Template Studio
        </div>
        <div className="app__bar-actions">
          {selected && (
            <button type="button" className="btn btn--ghost" onClick={() => setSelectedId(null)}>
              &larr; All projects
            </button>
          )}
          <code className="app__base-url" title={connection.baseUrl}>
            {connection.baseUrl}
          </code>
          <button type="button" className="btn btn--ghost" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>
      <main className="app__main">
        {selected ? (
          <Studio key={selected.id} client={client} project={selected} baseUrl={connection.baseUrl} />
        ) : (
          <ProjectPicker projects={projects} error={projectsError} onRetry={refreshProjects} onSelect={setSelectedId} />
        )}
      </main>
    </div>
  );
}
