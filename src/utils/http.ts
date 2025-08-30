export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function httpGet(url: string, opts: HttpOptions = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 10000);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}
