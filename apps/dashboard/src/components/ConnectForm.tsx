import { useState } from "react";
import type { Connection } from "../lib/connection";

/**
 * Connects the dashboard to an existing MatrixEye API using an admin key you already hold — the same key you'd
 * pass to the CLI or curl. Kept in this browser's localStorage only (lib/connection.ts); never sent anywhere but
 * the API origin you type below. This is a local admin tool, not a hosted login.
 */
export function ConnectForm({ onConnect }: { onConnect: (connection: Connection) => void }) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8787");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="connect">
      <form
        className="connect__card"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmedUrl = baseUrl.trim().replace(/\/$/, "");
          const trimmedKey = apiKey.trim();
          if (trimmedUrl && trimmedKey) onConnect({ baseUrl: trimmedUrl, apiKey: trimmedKey });
        }}
      >
        <div className="connect__mark" aria-hidden="true" />
        <h1>Template Studio</h1>
        <p className="connect__lead">
          Connect to your MatrixEye API with an admin key — the same one you use with the CLI or <code>curl -H "authorization: Bearer ..."</code>. It is kept only in this browser.
        </p>
        <label className="field">
          <span>API base URL</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8787" autoComplete="off" spellCheck={false} required />
        </label>
        <label className="field">
          <span>Admin API key</span>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="MATRIX_EYE_API_KEY" autoComplete="off" spellCheck={false} required />
        </label>
        <button type="submit" className="btn btn--primary">
          Connect
        </button>
        <p className="connect__hint">
          Add this page's origin to <code>MATRIX_EYE_CORS_ORIGINS</code> on the API if the connection is refused. See{" "}
          <code>docs/widget.md</code>.
        </p>
      </form>
    </div>
  );
}
