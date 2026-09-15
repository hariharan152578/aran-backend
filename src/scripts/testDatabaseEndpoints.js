import assert from 'assert';

const BACKEND_URL = 'http://localhost:5000/api/configuration';

const runIntegrationTests = async () => {
  console.log('--- STARTING DATABASE CRUD ENDPOINTS INTEGRATION TEST ---');
  
  try {
    // 1. Create a new Node
    console.log('\n1. Testing POST /nodes...');
    const newNodePayload = {
      name: 'Integration Test Sliding Sash',
      code: 'ITSS',
      parentId: null,
      isProduct: true,
      allowChildren: false,
      description: 'Temporary node created for integration tests',
      sortOrder: 99
    };
    
    let res = await fetch(`${BACKEND_URL}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNodePayload)
    });
    
    if (!res.ok) {
      throw new Error(`Failed to create node: ${res.statusText}`);
    }
    const createdNode = await res.json();
    console.log(`Successfully created Node: ${createdNode.name} (_id: ${createdNode._id})`);
    assert.strictEqual(createdNode.name, newNodePayload.name);
    assert.strictEqual(createdNode.code, newNodePayload.code);
    assert.strictEqual(createdNode.isProduct, true);
    
    // 2. Fetch the nodes
    console.log('\n2. Testing GET /nodes...');
    res = await fetch(`${BACKEND_URL}/nodes`);
    if (!res.ok) {
      throw new Error(`Failed to get nodes list: ${res.statusText}`);
    }
    const nodesList = await res.json();
    const fetchedNode = nodesList.find(n => n._id === createdNode._id);
    assert.ok(fetchedNode, 'Created node should be present in the node list');
    console.log('Successfully retrieved Node from list.');
    
    // 3. Update the node
    console.log('\n3. Testing PUT /nodes/:id...');
    const updatedPayload = {
      ...createdNode,
      name: 'Integration Test Sliding Sash UPDATED',
      description: 'Updated description for integration tests'
    };
    
    res = await fetch(`${BACKEND_URL}/nodes/${createdNode._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPayload)
    });
    
    if (!res.ok) {
      throw new Error(`Failed to update node: ${res.statusText}`);
    }
    const updatedNode = await res.json();
    console.log(`Successfully updated Node: ${updatedNode.name}`);
    assert.strictEqual(updatedNode.name, updatedPayload.name);
    assert.strictEqual(updatedNode.description, updatedPayload.description);

    // 4. Create Formula Group for the product
    console.log('\n4. Testing POST /formula-groups...');
    res = await fetch(`${BACKEND_URL}/formula-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: createdNode._id, name: `${createdNode.name} Formulas` })
    });
    if (!res.ok) {
      throw new Error(`Failed to create formula group: ${res.statusText}`);
    }
    const formulaGroup = await res.json();
    console.log(`Successfully created Formula Group: ${formulaGroup.name} (_id: ${formulaGroup._id})`);
    
    // 5. Create a Formula Rule
    console.log('\n5. Testing POST /formula-rules...');
    const newFormulaPayload = {
      groupId: formulaGroup._id,
      name: 'TestFrameFormula',
      expression: '((width + height) * 2) / 6000',
      unit: 'Nos',
      description: 'Test outer frame profile quantity'
    };
    res = await fetch(`${BACKEND_URL}/formula-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFormulaPayload)
    });
    if (!res.ok) {
      throw new Error(`Failed to create formula rule: ${res.statusText}`);
    }
    const createdRule = await res.json();
    console.log(`Successfully created Formula Rule: ${createdRule.name} (_id: ${createdRule._id})`);
    assert.strictEqual(createdRule.name, newFormulaPayload.name);
    assert.strictEqual(createdRule.expression, newFormulaPayload.expression);

    // 6. Get Formula Rules in Group
    console.log('\n6. Testing GET /formula-rules/group/:groupId...');
    res = await fetch(`${BACKEND_URL}/formula-rules/group/${formulaGroup._id}`);
    if (!res.ok) {
      throw new Error(`Failed to get formula rules: ${res.statusText}`);
    }
    const rulesList = await res.json();
    const fetchedRule = rulesList.find(r => r._id === createdRule._id);
    assert.ok(fetchedRule, 'Created formula rule should be present in group formulas list');
    console.log('Successfully retrieved Formula Rule from group list.');

    // 7. Update Formula Rule
    console.log('\n7. Testing PUT /formula-rules/:id...');
    const updatedFormulaPayload = {
      ...createdRule,
      expression: '((width + height) * 2) / 5850',
      description: 'Test outer frame profile quantity - UPDATED'
    };
    res = await fetch(`${BACKEND_URL}/formula-rules/${createdRule._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFormulaPayload)
    });
    if (!res.ok) {
      throw new Error(`Failed to update formula rule: ${res.statusText}`);
    }
    const updatedRule = await res.json();
    console.log(`Successfully updated Formula Rule: ${updatedRule.expression}`);
    assert.strictEqual(updatedRule.expression, updatedFormulaPayload.expression);
    assert.strictEqual(updatedRule.description, updatedFormulaPayload.description);

    // 8. Delete Formula Rule
    console.log('\n8. Testing DELETE /formula-rules/:id...');
    res = await fetch(`${BACKEND_URL}/formula-rules/${createdRule._id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error(`Failed to delete formula rule: ${res.statusText}`);
    }
    console.log('Successfully deleted Formula Rule.');

    // Verify deleted formula is gone
    res = await fetch(`${BACKEND_URL}/formula-rules/group/${formulaGroup._id}`);
    const postDeleteRulesList = await res.json();
    const isRuleGone = !postDeleteRulesList.some(r => r._id === createdRule._id);
    assert.ok(isRuleGone, 'Deleted rule should not be present in group list');
    console.log('Verified Formula Rule deletion from database.');

    // 9. Delete the Node
    console.log('\n9. Testing DELETE /nodes/:id...');
    res = await fetch(`${BACKEND_URL}/nodes/${createdNode._id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error(`Failed to delete node: ${res.statusText}`);
    }
    console.log('Successfully deleted Node.');

    // Verify node is gone
    res = await fetch(`${BACKEND_URL}/nodes`);
    const postDeleteNodesList = await res.json();
    const isNodeGone = !postDeleteNodesList.some(n => n._id === createdNode._id);
    assert.ok(isNodeGone, 'Deleted node should not be present in nodes list');
    console.log('Verified Node deletion from database.');

    console.log('\nSUCCESS: Database CRUD endpoints verified successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\nFAILURE: Database CRUD integration tests failed!');
    console.error(err);
    process.exit(1);
  }
};

runIntegrationTests();
