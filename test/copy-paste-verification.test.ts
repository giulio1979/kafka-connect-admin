import axios from 'axios';

const SR1 = process.env.SR1 || 'http://localhost:8081';
const SR2 = process.env.SR2 || 'http://localhost:8082';

// This is an integration-style test that attempts to reproduce the paste behavior:
// 1) read a subject+version from SR1
// 2) register the same schema on SR2
// 3) poll SR2 for the subject (via /subjects or /subjects/:subject/versions)

describe('copy-paste verification (integration)', () => {
  beforeAll(() => {
    if (process.env.INTEGRATION !== '1') {
      console.log('Skipping copy-paste verification; set INTEGRATION=1 to run');
      return;
    }
  });

  test('register schema on SR2 and verify subject appears (polling)', async () => {
    if (process.env.INTEGRATION !== '1') return;

    // list subjects on SR1
    const r1 = await axios.get(`${SR1}/subjects`, { timeout: 5000 });
    expect(r1.status).toBe(200);
    const subjects: string[] = r1.data;
    if (!Array.isArray(subjects) || subjects.length === 0) {
      console.log('No subjects in SR1 to copy; skipping');
      return;
    }

    const subject = subjects[0];
    console.log('Selected subject from SR1:', subject);

    // get versions and choose the latest
    const vres = await axios.get(`${SR1}/subjects/${encodeURIComponent(subject)}/versions`, { timeout: 5000 });
    expect(vres.status).toBe(200);
    const versions: number[] = vres.data;
    expect(Array.isArray(versions)).toBe(true);
    const latest = versions[versions.length - 1];

    const sres = await axios.get(`${SR1}/subjects/${encodeURIComponent(subject)}/versions/${latest}`, { timeout: 5000 });
    expect(sres.status).toBe(200);
    const schemaPayload = sres.data;
    console.log('Schema payload fetched from SR1 (trimmed):', JSON.stringify(schemaPayload).slice(0, 400));

    // register on SR2
    const payload = { schema: schemaPayload.schema };
    console.log('About to POST to SR2:', `${SR2}/subjects/${encodeURIComponent(subject)}/versions`);
    console.log('Payload being sent:', JSON.stringify(payload));
    const reg = await axios.post(`${SR2}/subjects/${encodeURIComponent(subject)}/versions`, payload, { timeout: 5000 });
    expect(reg.status).toBe(200);
    console.log('Register response from SR2:', JSON.stringify(reg.data));

    // Poll SR2 for the subject to appear in subjects list or for getVersions to return.
    const maxAttempts = 10;
    let found = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const subjList = await axios.get(`${SR2}/subjects`, { timeout: 5000 });
        if (subjList.status === 200 && Array.isArray(subjList.data) && subjList.data.includes(subject)) {
          console.log(`Attempt ${attempt}: subject present in SR2 subjects`);
          found = true;
          break;
        }
      } catch (e:any) {
        console.log(`Attempt ${attempt}: subjects list failed: ${e.message || e}`);
      }

      // try getVersions for the specific subject
      try {
        const gv = await axios.get(`${SR2}/subjects/${encodeURIComponent(subject)}/versions`, { timeout: 5000 });
        if (gv.status === 200 && Array.isArray(gv.data) && gv.data.length > 0) {
          console.log(`Attempt ${attempt}: getVersions returned ${gv.data.length} versions`);
          found = true;
          break;
        }
      } catch (e:any) {
        console.log(`Attempt ${attempt}: getVersions failed: ${e.message || e}`);
      }

      // backoff
      await new Promise(r => setTimeout(r, 500 * attempt));
    }

    expect(found).toBe(true);
  }, 120000);
});
