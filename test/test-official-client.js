const { SchemaRegistryClient } = require('@confluentinc/schemaregistry');

async function testOfficialClient() {
    console.log('Testing official Confluent Schema Registry client...');
    
    // Create client for SR2
    const client = new SchemaRegistryClient({
        baseURLs: ['http://localhost:8082']
    });
    
    try {
        // Test basic connectivity
        console.log('1. Testing connectivity...');
        const subjects = await client.getAllSubjects();
        console.log(`   Found ${subjects.length} subjects: ${subjects.join(', ')}`);
        
        // Test schema registration
        const testSubject = `test-official-${Date.now()}`;
        console.log(`2. Registering schema to subject: ${testSubject}`);
        
        const schemaInfo = {
            schema: '"string"',
            schemaType: 'AVRO'
        };
        
        const id = await client.register(testSubject, schemaInfo);
        console.log(`   Schema registered with ID: ${id}`);
        
        // Test immediate retrieval by subject and version
        console.log('3. Testing immediate retrieval...');
        try {
            const versions = await client.getAllVersions(testSubject);
            console.log(`   ✓ getAllVersions returned: ${versions.join(', ')}`);
            
            const schema = await client.getLatestSchemaMetadata(testSubject);
            console.log(`   ✓ getLatestSchemaMetadata returned: ${JSON.stringify(schema)}`);
        } catch (error) {
            console.log(`   ✗ Immediate retrieval failed: ${error.message}`);
        }
        
        // Test retrieval with retries
        console.log('4. Testing retrieval with retries...');
        let found = false;
        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential delay
                const versions = await client.getAllVersions(testSubject);
                console.log(`   ✓ Attempt ${attempt}: Found versions ${versions.join(', ')}`);
                found = true;
                break;
            } catch (error) {
                console.log(`   ✗ Attempt ${attempt}: ${error.message}`);
            }
        }
        
        if (found) {
            console.log('SUCCESS: Official client can retrieve registered schema after retries');
        } else {
            console.log('FAILURE: Official client has same issue - register succeeds but reads fail');
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testOfficialClient().catch(console.error);
