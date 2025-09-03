export interface ConnectClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

import { getOutputChannel } from '../logger';

export class ConnectClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(opts: ConnectClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.headers = opts.headers || {};
  }

  async listConnectors(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/connectors`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list connectors: ${res.status}`);
  return (await res.json()) as string[];
  }

  async getStatus(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/status`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to get status: ${res.status}`);
  return (await res.json()) as any;
  }

  async pauseConnector(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/pause`, { method: 'PUT', headers: this.headers });
    if (!res.ok) throw new Error(`Pause failed: ${res.status}`);
  }

  async resumeConnector(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/resume`, { method: 'PUT', headers: this.headers });
    if (!res.ok) throw new Error(`Resume failed: ${res.status}`);
  }

  // offsets endpoints can vary; implement a basic fetch/set
  async getOffsets(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/offsets`, { headers: this.headers });
    if (!res.ok) throw new Error(`Get offsets failed: ${res.status}`);
  return (await res.json()) as any;
  }

  // send offsets with an explicit HTTP method (PUT/POST/PATCH)
  async setOffsetsMethod(name: string, body: any, method: 'PUT' | 'POST' | 'PATCH'): Promise<any> {
    const url = `${this.baseUrl}/connectors/${encodeURIComponent(name)}/offsets`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] setOffsetsMethod: trying ${method} ${url}`);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...this.headers }, body: JSON.stringify(body) });
    if (res.ok) {
      oc.appendLine(`[http] setOffsetsMethod ${method} success ${res.status}`);
      try { const j = await res.json(); oc.appendLine(`[http] setOffsetsMethod ${method} body: ${JSON.stringify(j)}`); return j; } catch(e) { return undefined; }
    }
    try { const txt = await res.text(); oc.appendLine(`[http] setOffsetsMethod ${method} failed ${res.status} ${txt}`); } catch(e) { oc.appendLine(`[http] setOffsetsMethod ${method} failed ${res.status} (no body)`); }
    throw new Error(`setOffsets ${method} failed: ${res.status}`);
  }

  async setOffsets(name: string, body: any): Promise<any> {
    const url = `${this.baseUrl}/connectors/${encodeURIComponent(name)}/offsets`;
    const oc = getOutputChannel();
    // Log current connector status (will help explain 405 responses)
    try {
      const statusRes = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/status`, { headers: this.headers });
      if (statusRes.ok) {
        const statusJson: any = await statusRes.json();
        const connState = statusJson && statusJson.connector && statusJson.connector.state;
        oc.appendLine(`[http] setOffsets: connector status ${connState || 'unknown'}`);
      } else {
        oc.appendLine(`[http] setOffsets: failed to fetch status ${statusRes.status}`);
      }
    } catch (e: any) {
      oc.appendLine(`[http] setOffsets: status fetch failed: ${e.message || String(e)}`);
    }

    // Try PATCH first — Confluent docs specify PATCH /connectors/{connector}/offsets to alter offsets (connector usually must be STOPPED)
    oc.appendLine(`[http] setOffsets: trying PATCH ${url}`);
    let res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...this.headers }, body: JSON.stringify(body) });
    if (res.ok) {
      oc.appendLine(`[http] setOffsets PATCH success ${res.status}`);
      try { const j = await res.json(); oc.appendLine(`[http] setOffsets PATCH body: ${JSON.stringify(j)}`); } catch(e) {}
      return (await res.json()) as any;
    }
    try { const txt = await res.text(); oc.appendLine(`[http] setOffsets PATCH failed ${res.status} ${txt}`); } catch(e) { oc.appendLine(`[http] setOffsets PATCH failed ${res.status} (no body)`); }

    // If PATCH not allowed, fall back to legacy PUT/POST behavior
    oc.appendLine(`[http] setOffsets: trying PUT ${url} as fallback`);
    res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(body) });
    if (res.ok) {
      oc.appendLine(`[http] setOffsets PUT success ${res.status}`);
      try { const j = await res.json(); oc.appendLine(`[http] setOffsets PUT body: ${JSON.stringify(j)}`); } catch(e) {}
      return (await res.json()) as any;
    }
    try { const txt = await res.text(); oc.appendLine(`[http] setOffsets PUT failed ${res.status} ${txt}`); } catch(e) { oc.appendLine(`[http] setOffsets PUT failed ${res.status} (no body)`); }

    // If PUT not allowed, try POST as some deployments accept POST
    if (res.status === 405) {
      oc.appendLine(`[http] setOffsets: trying POST ${url} due to 405`);
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(body) });
      if (res.ok) {
        oc.appendLine(`[http] setOffsets POST success ${res.status}`);
        try { const j = await res.json(); oc.appendLine(`[http] setOffsets POST body: ${JSON.stringify(j)}`); } catch(e) {}
        return (await res.json()) as any;
      }
      try { const txt = await res.text(); oc.appendLine(`[http] setOffsets POST failed ${res.status} ${txt}`); } catch(e) { oc.appendLine(`[http] setOffsets POST failed ${res.status} (no body)`); }
    }

    // Some Connect distributions expose per-task offsets endpoints; try to set offsets per task
    try {
  const statusRes = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/status`, { headers: this.headers });
  oc.appendLine(`[http] setOffsets: fetched status ${this.baseUrl}/connectors/${encodeURIComponent(name)}/status -> ${statusRes.status}`);
      if (statusRes.ok) {
        const status: any = await statusRes.json();
        const tasks = status.tasks || [];
        if (Array.isArray(tasks) && tasks.length > 0) {
          const results: any[] = [];
          for (const t of tasks) {
            const taskId = t.id || (t.task && t.task.id) || t.taskId || t;
            if (taskId === undefined) continue;
            const taskUrl = `${this.baseUrl}/connectors/${encodeURIComponent(name)}/tasks/${taskId}/offsets`;
            const taskRes = await fetch(taskUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(body) });
            if (taskRes.ok) {
              try { const jr = await taskRes.json(); results.push(jr); oc.appendLine(`[http] setOffsets task ${taskId} PUT success ${taskRes.status} ${JSON.stringify(jr)}`); } catch { results.push({ status: taskRes.status }); oc.appendLine(`[http] setOffsets task ${taskId} PUT success ${taskRes.status} (no json)`); }
            } else {
              try { const txt = await taskRes.text(); results.push({ status: taskRes.status, error: txt }); oc.appendLine(`[http] setOffsets task ${taskId} PUT failed ${taskRes.status} ${txt}`); } catch(e) { results.push({ status: taskRes.status, error: '' }); oc.appendLine(`[http] setOffsets task ${taskId} PUT failed ${taskRes.status} (no body)`); }
            }
          }
          // if any task succeeded, return aggregated results
          if (results.some(r => !(r && r.status && r.status >= 400))) return results;
        }
      }
    } catch (e) {
      // ignore and report original error below
    }

    // final fallback: return detailed error
    let bodyText: string;
    try { bodyText = await res.text(); } catch { bodyText = String(res.status); }
    throw new Error(`Set offsets failed: ${res.status} ${bodyText}`);
  }

  // stop a connector (shut down tasks but do not delete)
  async stopConnector(name: string): Promise<void> {
    const url = `${this.baseUrl}/connectors/${encodeURIComponent(name)}/stop`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] stopConnector: PUT ${url}`);
    const res = await fetch(url, { method: 'PUT', headers: this.headers });
    if (!res.ok) {
      let txt = '';
      try { txt = await res.text(); } catch {}
      oc.appendLine(`[http] stopConnector failed ${res.status} ${txt}`);
      throw new Error(`Stop connector failed: ${res.status} ${txt}`);
    }
    oc.appendLine(`[http] stopConnector success ${res.status}`);
  }

  // restart a connector; optional flags control whether tasks are included or only failed instances
  async restartConnector(name: string, includeTasks = true, onlyFailed = false): Promise<any> {
    const params = `?includeTasks=${includeTasks}&onlyFailed=${onlyFailed}`;
    const url = `${this.baseUrl}/connectors/${encodeURIComponent(name)}/restart${params}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] restartConnector: POST ${url}`);
    const res = await fetch(url, { method: 'POST', headers: { 'Accept': 'application/json', ...this.headers } });
    if (!res.ok) {
      let txt = '';
      try { txt = await res.text(); } catch {}
      oc.appendLine(`[http] restartConnector failed ${res.status} ${txt}`);
      throw new Error(`Restart connector failed: ${res.status} ${txt}`);
    }
    oc.appendLine(`[http] restartConnector success ${res.status}`);
    try { const j = await res.json(); oc.appendLine(`[http] restartConnector body: ${JSON.stringify(j)}`); return j; } catch { return undefined; }
  }

  // delete a connector
  async deleteConnector(name: string): Promise<void> {
    const url = `${this.baseUrl}/connectors/${encodeURIComponent(name)}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] deleteConnector: DELETE ${url}`);
    const res = await fetch(url, { method: 'DELETE', headers: this.headers });
    if (!res.ok && res.status !== 404) {
      let txt = '';
      try { txt = await res.text(); } catch {}
      oc.appendLine(`[http] deleteConnector failed ${res.status} ${txt}`);
      throw new Error(`Delete connector failed: ${res.status} ${txt}`);
    }
    oc.appendLine(`[http] deleteConnector success ${res.status}`);
  }
}
