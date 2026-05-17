type RequestInitWithJson = RequestInit & {
  json?: unknown;
};

export async function http<T>(
  url: string,
  options: RequestInitWithJson = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body:
      options.json !== undefined ? JSON.stringify(options.json) : options.body
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.detail ||
      payload?.error?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
