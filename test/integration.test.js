"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const CONNECT_URL = process.env.CONNECT_URL || 'http://localhost:8083';
const SR1 = process.env.SR1 || 'http://localhost:8081';
const SR2 = process.env.SR2 || 'http://localhost:8082';
describe('integration tests (requires local docker compose)', () => {
    beforeAll(() => {
        if (process.env.INTEGRATION !== '1') {
            console.log('Skipping integration tests; set INTEGRATION=1 to run them');
            return;
        }
    });
    test('connect REST is reachable', async () => {
        if (process.env.INTEGRATION !== '1')
            return;
        const res = await axios_1.default.get(`${CONNECT_URL}/`, { timeout: 5000 });
        expect(res.status).toBe(200);
    }, 20000);
    test('list connectors', async () => {
        if (process.env.INTEGRATION !== '1')
            return;
        const res = await axios_1.default.get(`${CONNECT_URL}/connectors`, { timeout: 5000 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
    }, 20000);
    test('list subjects from both schema registries', async () => {
        if (process.env.INTEGRATION !== '1')
            return;
        const r1 = await axios_1.default.get(`${SR1}/subjects`, { timeout: 5000 });
        const r2 = await axios_1.default.get(`${SR2}/subjects`, { timeout: 5000 });
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(Array.isArray(r1.data)).toBe(true);
        expect(Array.isArray(r2.data)).toBe(true);
    }, 20000);
    test('copy a subject schema from SR1 to SR2 if any subject exists', async () => {
        if (process.env.INTEGRATION !== '1')
            return;
        const r1 = await axios_1.default.get(`${SR1}/subjects`, { timeout: 5000 });
        const subjects = r1.data;
        if (subjects.length === 0) {
            console.log('No subjects to copy; skipping copy test');
            return;
        }
        const subject = subjects[0];
        const versions = await axios_1.default.get(`${SR1}/subjects/${encodeURIComponent(subject)}/versions`, { timeout: 5000 });
        const version = versions.data[0];
        const schema = await axios_1.default.get(`${SR1}/subjects/${encodeURIComponent(subject)}/versions/${version}`, { timeout: 5000 });
        // register same schema on SR2
        const payload = { schema: schema.data.schema };
        const reg = await axios_1.default.post(`${SR2}/subjects/${encodeURIComponent(subject)}/versions`, payload, { timeout: 5000 });
        expect(reg.status).toBe(200);
    }, 40000);
});
//# sourceMappingURL=integration.test.js.map