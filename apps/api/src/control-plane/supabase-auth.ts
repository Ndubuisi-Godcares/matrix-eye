/**
 * Minimal Supabase Auth (GoTrue) client: just enough to turn an email/password into a verified
 * user id. A plain `fetch` wrapper rather than the `@supabase/supabase-js` SDK, since this is the
 * only Supabase feature the API needs (ADR-008) and the REST surface is small.
 */
import { MatrixError } from "@matrix-eye/core";

export interface SupabaseUser {
  id: string;
  email: string;
}

interface GoTrueErrorBody {
  msg?: string;
  error_description?: string;
  error?: string;
}

interface GoTrueUserBody {
  id?: string;
  email?: string;
  user?: { id: string; email?: string };
}

export class SupabaseAuthClient {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
  ) {}

  signUp(email: string, password: string): Promise<SupabaseUser> {
    return this.call("/auth/v1/signup", { email, password });
  }

  signIn(email: string, password: string): Promise<SupabaseUser> {
    return this.call("/auth/v1/token?grant_type=password", { email, password });
  }

  private async call(path: string, body: unknown): Promise<SupabaseUser> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.anonKey },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as GoTrueErrorBody & GoTrueUserBody;
    if (!res.ok) {
      throw new MatrixError("invalid_request", data.msg ?? data.error_description ?? data.error ?? "Authentication failed");
    }
    const user = data.user ?? data;
    if (!user.id) throw new MatrixError("invalid_request", "Unexpected response from the authentication service");
    return { id: user.id, email: user.email ?? "" };
  }
}
