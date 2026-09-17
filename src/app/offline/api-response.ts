/** Fail with a useful message when a SPA fallback or proxy returns HTML for a JSON API request. */
export async function readJsonResponse<T>(
  response: Response,
  endpoint: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    throw new Error(
      `${endpoint} returned ${contentType || "an unknown content type"} instead of JSON. Check the API server and dev proxy.`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `${endpoint} returned invalid JSON. Check the API response.`,
    );
  }
}
