"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const connectionStore_1 = require("../src/connectionStore");
class DummySecrets {
    constructor() {
        this.map = new Map();
    }
    async store(key, value) { this.map.set(key, value); }
    async get(key) { return this.map.get(key); }
    async delete(key) { this.map.delete(key); }
}
class DummyGlobalState {
    constructor() {
        this.map = new Map();
    }
    get(key, defaultValue) { const v = this.map.get(key); return (v === undefined) ? defaultValue : v; }
    update(key, value) { this.map.set(key, value); }
}
const dummyContext = {
    globalState: new DummyGlobalState(),
    secrets: new DummySecrets()
};
describe('ConnectionStore', () => {
    let store;
    beforeEach(() => {
        store = new connectionStore_1.ConnectionStore(dummyContext);
    });
    test('add, list, remove connection and secret', async () => {
        const conn = { id: 'c1', name: 'Local', url: 'http://localhost:8083', type: 'connect', authType: 'basic', username: 'user' };
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
//# sourceMappingURL=connectionStore.test.js.map