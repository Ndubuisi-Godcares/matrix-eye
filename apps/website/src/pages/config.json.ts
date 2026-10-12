/**
 * Runtime configuration the browser reads (/config.json). Keeping the API address out of the compiled pages means
 * the same build can be deployed anywhere: only this file changes. Nothing secret belongs here, it is public.
 */
export const GET = () =>
  new Response(JSON.stringify({ apiUrl: import.meta.env.PUBLIC_API_URL ?? "" }), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
