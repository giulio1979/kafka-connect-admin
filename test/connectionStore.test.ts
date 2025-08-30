import { ConnectionStore, ConnectionMeta } from '../src/connectionStore';

class DummySecrets {
  private map = new Map<string, string>();
  async store(key: string, value: string) { this.map.set(key, value); }
  async get(key: string) { return this.map.get(key); }
  async delete(key: string) { this.map.delete(key); }
}

class DummyGlobalState {
  private map = new Map<string, string>();
  get<T>(key: string, defaultValue?: T) { const v = this.map.get(key); return (v === undefined) ? defaultValue : (v as unknown as T); }
  update(key: string, value: any) { this.map.set(key, value); }
}

const dummyContext: any = {
  globalState: new DummyGlobalState(),
  secrets: new DummySecrets()
};

describe('ConnectionStore', () => {
  let store: ConnectionStore;
  beforeEach(() => {
    store = new ConnectionStore(dummyContext as any);
  });

  test('add, list, remove connection and secret', async () => {
    const conn: ConnectionMeta = { id: 'c1', name: 'Local', url: 'http://localhost:8083', type: 'connect', authType: 'basic', username: 'user' };
    await store.addConnection(conn, 'p@ss');
    let list = await store.listConnections();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('c1');

    const secret = await store.getSecret('c1');
    expect(secret).toBe('p@ss');

    await store.removeConnection('c1');
    list = await store.listConnections();
    expect(list.length).toBe(0);
    const secretAfter = await store.getSecret('c1');
    expect(secretAfter).toBeUndefined();
  });
});
