export interface SchemaRegistryOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  // Optional friendly name for logs/UI; falls back to baseUrl when not provided
  name?: string;
}

import { getOutputChannel } from '../logger';

export class SchemaRegistryClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private name: string;

  constructor(opts: SchemaRegistryOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.headers = opts.headers || {};
  this.name = opts.name || this.baseUrl;
  }

  async listSubjects(): Promise<string[]> {
    const url = `${this.baseUrl}/subjects`;
    const oc = getOutputChannel();
  oc.appendLine(`[http] SchemaRegistryClient.listSubjects (${this.name}) -> ${url}`);
  let res = await fetch(url, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
    // If 404, try trimming known extra path segments (user may have entered a URL ending with '/subjects')
    if (res.status === 404) {
      // try by removing trailing '/subjects' from base and re-request
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects`;
        const altRes = await fetch(altUrl, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
        if (altRes.ok) {
          // update baseUrl to the working altBase for future calls
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes; // keep the alt response (likely 404 or error)
        }
      }
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      oc.appendLine(`[http] SchemaRegistryClient.listSubjects failed ${res.status} ${body}`);
      throw new Error(`Failed to list subjects (${res.status}) for ${url}: ${body}`);
    }
    return (await res.json()) as string[];
  }

  async getVersions(subject: string): Promise<number[]> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`;
  const oc = getOutputChannel();
  oc.appendLine(`[http] SchemaRegistryClient.getVersions (${this.name}) -> ${url}`);
  let res = await fetch(url, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects/${encodeURIComponent(subject)}/versions`;
        const altRes = await fetch(altUrl, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      oc.appendLine(`[http] SchemaRegistryClient.getVersions failed ${res.status} ${body}`);
      throw new Error(`Failed to get versions (${res.status}) for ${url}: ${body}`);
    }
    return (await res.json()) as number[];
  }

  async getSchema(subject: string, version: string | number): Promise<any> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions/${version}`;
  const oc = getOutputChannel();
  oc.appendLine(`[http] SchemaRegistryClient.getSchema (${this.name}) -> ${url}`);
  let res = await fetch(url, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects/${encodeURIComponent(subject)}/versions/${version}`;
        const altRes = await fetch(altUrl, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      oc.appendLine(`[http] SchemaRegistryClient.getSchema failed ${res.status} ${body}`);
      throw new Error(`Failed to get schema (${res.status}) for ${url}: ${body}`);
    }
    return res.json();
  }

  async registerSchema(subject: string, schemaPayload: any): Promise<any> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`;
  const oc = getOutputChannel();
  // Log the target and a trimmed version of the payload for debugging (avoid unbounded output)
  const payloadPreview = (() => {
    try { return JSON.stringify(schemaPayload).slice(0, 2000); } catch (_) { return String(schemaPayload).slice(0,2000); }
  })();
  oc.appendLine(`[http] SchemaRegistryClient.registerSchema (${this.name}) -> ${url} subject=${subject} payload=${payloadPreview}`);
  let res = await fetch(url, { 
    method: 'POST', 
    headers: { 
      'Content-Type': 'application/vnd.schemaregistry.v1+json',
      'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
      ...this.headers 
    }, 
    body: JSON.stringify(schemaPayload) 
  });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects/${encodeURIComponent(subject)}/versions`;
        const altRes = await fetch(altUrl, { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/vnd.schemaregistry.v1+json',
            'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
            ...this.headers 
          }, 
          body: JSON.stringify(schemaPayload) 
        });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    // read response text and log it for debugging (some registries return plain text)
    let body = '';
    try { body = await res.text(); } catch (e) { body = String(e); }
  oc.appendLine(`[http] SchemaRegistryClient.registerSchema response (${this.name}) ${res.status} subject=${subject} body=${body}`);
    if (!res.ok) {
      throw new Error(`Failed to register schema (${res.status}) for ${url}: ${body}`);
    }
  try { return JSON.parse(body); } catch (_) { return body; }
  }

  // Fetch a schema by global id: /schemas/ids/{id}
  async getSchemaById(id: number): Promise<any> {
    const url = `${this.baseUrl}/schemas/ids/${encodeURIComponent(String(id))}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] SchemaRegistryClient.getSchemaById (${this.name}) -> ${url}`);
    let res = await fetch(url, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/schemas/ids/${encodeURIComponent(String(id))}`;
        const altRes = await fetch(altUrl, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      oc.appendLine(`[http] SchemaRegistryClient.getSchemaById failed ${res.status} ${body}`);
      throw new Error(`Failed to get schema by id (${res.status}) for ${url}: ${body}`);
    }
    return res.json();
  }

  // Get subject compatibility level: /config/{subject}
  async getCompatibility(subject: string): Promise<string> {
    const url = `${this.baseUrl}/config/${encodeURIComponent(subject)}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] SchemaRegistryClient.getCompatibility (${this.name}) -> ${url}`);
    let res = await fetch(url, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/config/${encodeURIComponent(subject)}`;
        const altRes = await fetch(altUrl, { headers: { Accept: 'application/vnd.schemaregistry.v1+json, application/json', ...this.headers } });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      oc.appendLine(`[http] SchemaRegistryClient.getCompatibility failed ${res.status} ${body}`);
      throw new Error(`Failed to get compatibility (${res.status}) for ${url}: ${body}`);
    }
    const result = await res.json();
    return (result as any).compatibilityLevel || 'UNKNOWN';
  }

  // Set subject compatibility level: PUT /config/{subject}
  async setCompatibility(subject: string, compatibilityLevel: string): Promise<any> {
    const url = `${this.baseUrl}/config/${encodeURIComponent(subject)}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] SchemaRegistryClient.setCompatibility (${this.name}) -> ${url} level=${compatibilityLevel}`);
    const payload = { compatibility: compatibilityLevel };
    let res = await fetch(url, { 
      method: 'PUT', 
      headers: { 
        'Content-Type': 'application/vnd.schemaregistry.v1+json',
        'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
        ...this.headers 
      }, 
      body: JSON.stringify(payload) 
    });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/config/${encodeURIComponent(subject)}`;
        const altRes = await fetch(altUrl, { 
          method: 'PUT', 
          headers: { 
            'Content-Type': 'application/vnd.schemaregistry.v1+json',
            'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
            ...this.headers 
          }, 
          body: JSON.stringify(payload) 
        });
        if (altRes.ok) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    let body = '';
    try { body = await res.text(); } catch (e) { body = String(e); }
    oc.appendLine(`[http] SchemaRegistryClient.setCompatibility response (${this.name}) ${res.status} ${body}`);
    if (!res.ok) {
      throw new Error(`Failed to set compatibility (${res.status}) for ${url}: ${body}`);
    }
    try { return JSON.parse(body); } catch (_) { return body; }
  }

  // Delete subject: DELETE /subjects/{subject}
  async deleteSubject(subject: string): Promise<any> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] SchemaRegistryClient.deleteSubject (${this.name}) -> ${url}`);
    let res = await fetch(url, { 
      method: 'DELETE',
      headers: { 
        'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
        ...this.headers 
      }
    });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects/${encodeURIComponent(subject)}`;
        const altRes = await fetch(altUrl, { 
          method: 'DELETE',
          headers: { 
            'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
            ...this.headers 
          }
        });
        if (altRes.ok || altRes.status === 404) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    let body = '';
    try { body = await res.text(); } catch (e) { body = String(e); }
    oc.appendLine(`[http] SchemaRegistryClient.deleteSubject response (${this.name}) ${res.status} ${body}`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete subject (${res.status}) for ${url}: ${body}`);
    }
    try { return JSON.parse(body); } catch (_) { return body; }
  }

  // Delete schema version: DELETE /subjects/{subject}/versions/{version}
  async deleteSchemaVersion(subject: string, version: string | number): Promise<any> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions/${version}`;
    const oc = getOutputChannel();
    oc.appendLine(`[http] SchemaRegistryClient.deleteSchemaVersion (${this.name}) -> ${url}`);
    let res = await fetch(url, { 
      method: 'DELETE',
      headers: { 
        'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
        ...this.headers 
      }
    });
    if (res.status === 404) {
      const altBase = this.baseUrl.replace(/\/subjects$/i, '').replace(/\/+$/, '');
      if (altBase !== this.baseUrl) {
        const altUrl = `${altBase}/subjects/${encodeURIComponent(subject)}/versions/${version}`;
        const altRes = await fetch(altUrl, { 
          method: 'DELETE',
          headers: { 
            'Accept': 'application/vnd.schemaregistry.v1+json, application/json', 
            ...this.headers 
          }
        });
        if (altRes.ok || altRes.status === 404) {
          this.baseUrl = altBase;
          res = altRes;
        } else {
          res = altRes;
        }
      }
    }
    let body = '';
    try { body = await res.text(); } catch (e) { body = String(e); }
    oc.appendLine(`[http] SchemaRegistryClient.deleteSchemaVersion response (${this.name}) ${res.status} ${body}`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete schema version (${res.status}) for ${url}: ${body}`);
    }
    try { return JSON.parse(body); } catch (_) { return body; }
  }
}
