const { SchemaRegistryClient } = require('@confluentinc/schemaregistry');

async function testCopyPasteScenario() {
    console.log('Testing copy/paste scenario with independent Schema Registries...');
    
    // Create clients for both schema registries
    const sr1 = new SchemaRegistryClient({
        baseURLs: ['http://localhost:8081']
    });
    
    const sr2 = new SchemaRegistryClient({
        baseURLs: ['http://localhost:8082']
    });
    
    try {
        // Step 1: Register a schema in SR1
        console.log('\n1. Registering schema in SR1...');
        const testSubject = `user-record-${Date.now()}`;
        const userSchema = {
            schema: JSON.stringify({
                type: 'record',
                name: 'User',
                fields: [
                    { name: 'id', type: 'int' },
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]
            }),
            schemaType: 'AVRO'
        };
        
        const id1 = await sr1.register(testSubject, userSchema);
        console.log(`   ✓ Schema registered in SR1 with ID: ${id1}`);
        
        // Step 2: Verify it's readable in SR1
        console.log('\n2. Verifying schema in SR1...');
        const versions1 = await sr1.getAllVersions(testSubject);
        const schema1 = await sr1.getLatestSchemaMetadata(testSubject);
        console.log(`   ✓ SR1 versions: ${versions1.join(', ')}`);
        console.log(`   ✓ SR1 schema: ${schema1.schema.substring(0, 100)}...`);
        
        // Step 3: "Copy" the schema (simulate what our extension does)
        console.log('\n3. Copying schema from SR1 to SR2...');
        const copyData = {
            subject: testSubject,
            versions: []
        };
        
        // Get all versions for copy
        for (const version of versions1) {
            const versionSchema = await sr1.getSchemaMetadata(testSubject, version);
            copyData.versions.push({
                version,
                schema: {
                    schema: versionSchema.schema,
                    schemaType: versionSchema.schemaType || 'AVRO'
                }
            });
        }
        console.log(`   ✓ Copied ${copyData.versions.length} versions from SR1`);
        
        // Step 4: "Paste" to SR2
        console.log('\n4. Pasting schema to SR2...');
        for (const versionData of copyData.versions) {
            const id2 = await sr2.register(testSubject, versionData.schema);
            console.log(`   ✓ Version ${versionData.version} registered in SR2 with ID: ${id2}`);
        }
        
        // Step 5: Verify it's readable in SR2
        console.log('\n5. Verifying schema in SR2...');
        const versions2 = await sr2.getAllVersions(testSubject);
        const schema2 = await sr2.getLatestSchemaMetadata(testSubject);
        console.log(`   ✓ SR2 versions: ${versions2.join(', ')}`);
        console.log(`   ✓ SR2 schema: ${schema2.schema.substring(0, 100)}...`);
        
        // Step 6: Compare schemas
        console.log('\n6. Comparing schemas...');
        const schemasMatch = schema1.schema === schema2.schema;
        console.log(`   ${schemasMatch ? '✓' : '✗'} Schemas match: ${schemasMatch}`);
        
        if (schemasMatch) {
            console.log('\n🎉 SUCCESS: Copy/paste scenario works perfectly!');
            console.log('   - Schema registered in SR1');
            console.log('   - Schema copied and pasted to SR2');
            console.log('   - Both registries can read the schema');
            console.log('   - Schemas are identical');
        } else {
            console.log('\n❌ FAILURE: Schemas do not match');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

testCopyPasteScenario().catch(console.error);
