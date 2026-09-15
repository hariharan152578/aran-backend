import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Formula from '../models/Formula.js';

dotenv.config();

const usersToSeed = [
  { username: 'admin', name: 'System Administrator', password: 'password123', role: 'Admin' },
  { username: 'sales', name: 'Sales Executive', password: 'password123', role: 'Sales' },
  { username: 'prod', name: 'Production Supervisor', password: 'password123', role: 'Production' },
  { username: 'accounts', name: 'Accounts Officer', password: 'password123', role: 'Accounts' },
  { username: 'store', name: 'Store Keeper', password: 'password123', role: 'Store' },
  { username: 'install', name: 'Installation Lead', password: 'password123', role: 'Installation' },
  { username: 'manager', name: 'General Manager', password: 'password123', role: 'Management' }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected for Rule Engine Seeding...');

    // 1. Seed Users
    for (const u of usersToSeed) {
      const exists = await User.findOne({ username: u.username });
      if (!exists) {
        await User.create(u);
        console.log(`Successfully seeded user: ${u.username} (${u.role})`);
      }
    }

    // 2. Clear collections
    const collectionsToClear = [
      'categories',
      'brands',
      'systems',
      'mechanisms',
      'series',
      'configurations',
      'templatevariants',
      'features',
      'measurementrules',
      'bomrules',
      'configuration_nodes',
      'feature_library',
      'feature_values',
      'product_features',
      'measurement_templates',
      'template_registry',
      'bom_rules',
      'pricing_rules',
      'output_mappings',
      'formula_groups',
      'formula_rules',
      'excel_import_logs'
    ];

    for (const collName of collectionsToClear) {
      try {
        await mongoose.connection.db.collection(collName).deleteMany({});
        console.log(`Cleared collection: ${collName}`);
      } catch (e) {
        // Collection might not exist yet
      }
    }

    // 3. Seed Legacy Categories list (to maintain restored dashboard compatibility)
    await mongoose.connection.db.collection('categories').insertMany([
      { name: 'Windows', code: 'WD', active: true },
      { name: 'Doors', code: 'DR', active: true },
      { name: 'Partitions', code: 'PT', active: true },
      { name: 'Accessories', code: 'AC', active: true }
    ]);
    console.log('Seeded Legacy Categories List.');

    // 4. Seed Dynamic Configuration Nodes
    const nodesColl = mongoose.connection.db.collection('configuration_nodes');
    
    // Level 0: Root
    const rootRes = await nodesColl.insertOne({
      name: 'Production',
      code: 'PROD',
      parentId: null,
      path: ',Production,',
      level: 0,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'Root production classification'
    });
    const rootId = rootRes.insertedId;

    // Level 1: Categories
    const intactRes = await nodesColl.insertOne({
      name: 'INTACT',
      code: 'INT',
      parentId: rootId,
      path: `,Production,INTACT,`,
      level: 1,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'Premium UPVC profile brand'
    });
    const intactId = intactRes.insertedId;

    const accessoriesRes = await nodesColl.insertOne({
      name: 'Accessories',
      code: 'ACC',
      parentId: rootId,
      path: `,Production,Accessories,`,
      level: 1,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 2,
      description: 'Hardware items and fittings catalog'
    });
    const accessoriesId = accessoriesRes.insertedId;

    const breezeRes = await nodesColl.insertOne({
      name: 'Breeze',
      code: 'BRZ',
      parentId: rootId,
      path: `,Production,Breeze,`,
      level: 1,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 3,
      description: 'Economical sliding segments'
    });
    const breezeId = breezeRes.insertedId;

    // Level 2 (under INTACT): System
    const slidingRes = await nodesColl.insertOne({
      name: 'Sliding',
      code: 'SLD',
      parentId: intactId,
      path: `,Production,INTACT,Sliding,`,
      level: 2,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'Horizontal gliding window systems'
    });
    const slidingId = slidingRes.insertedId;

    // Level 2 (under Breeze): System
    const openBreezeRes = await nodesColl.insertOne({
      name: 'Open',
      code: 'OPB',
      parentId: breezeId,
      path: `,Production,Breeze,Open,`,
      level: 2,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'Casement openable Breeze segment'
    });
    const openBreezeId = openBreezeRes.insertedId;

    // Level 3 (under INTACT Sliding): Mechanism
    const withBushRes = await nodesColl.insertOne({
      name: 'With Bush',
      code: 'WB',
      parentId: slidingId,
      path: `,Production,INTACT,Sliding,With Bush,`,
      level: 3,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'With Bush track mechanisms'
    });
    const withBushId = withBushRes.insertedId;

    // Level 3 (under Breeze Open): Product + Parent Node
    const shutterRes = await nodesColl.insertOne({
      name: '36mm Shutter',
      code: 'SH36',
      parentId: openBreezeId,
      path: `,Production,Breeze,Open,36mm Shutter,`,
      level: 3,
      isProduct: true,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: '36mm openable shutter (direct product and nested categories parent)'
    });
    const shutterId = shutterRes.insertedId;

    // Level 4 (under 36mm Shutter): Sub products
    const vcuttingRes = await nodesColl.insertOne({
      name: 'V-Cutting',
      code: 'VCUT',
      parentId: shutterId,
      path: `,Production,Breeze,Open,36mm Shutter,V-Cutting,`,
      level: 4,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 1,
      description: 'V-cut variant openable shutter'
    });
    const vcuttingId = vcuttingRes.insertedId;

    const premiumRes = await nodesColl.insertOne({
      name: 'Premium Welded',
      code: 'PWELD',
      parentId: shutterId,
      path: `,Production,Breeze,Open,36mm Shutter,Premium Welded,`,
      level: 4,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 2,
      description: 'Premium welded variant openable shutter'
    });

    // Level 4 (under INTACT Sliding With Bush): Series
    const series50Res = await nodesColl.insertOne({
      name: '50 Series',
      code: 'SER50',
      parentId: withBushId,
      path: `,Production,INTACT,Sliding,With Bush,50 Series,`,
      level: 4,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: '50mm profile width series'
    });
    const series50Id = series50Res.insertedId;

    // Level 5 (under 50 Series): Configuration
    const slslRes = await nodesColl.insertOne({
      name: 'SL-SL',
      code: 'SLSL',
      parentId: series50Id,
      path: `,Production,INTACT,Sliding,With Bush,50 Series,SL-SL,`,
      level: 5,
      isProduct: false,
      allowChildren: true,
      active: true,
      sortOrder: 1,
      description: 'Double panel sliding configuration'
    });
    const slslId = slslRes.insertedId;

    // Level 6 (under SL-SL): Products
    const smallSashRes = await nodesColl.insertOne({
      name: 'Small Sash',
      code: 'SSASH',
      parentId: slslId,
      path: `,Production,INTACT,Sliding,With Bush,50 Series,SL-SL,Small Sash,`,
      level: 6,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 1,
      description: 'Small sash profile sliding window'
    });
    const smallSashId = smallSashRes.insertedId;

    const bigSashRes = await nodesColl.insertOne({
      name: 'Big Sash',
      code: 'BSASH',
      parentId: slslId,
      path: `,Production,INTACT,Sliding,With Bush,50 Series,SL-SL,Big Sash,`,
      level: 6,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 2,
      description: 'Big sash profile sliding window'
    });
    const bigSashId = bigSashRes.insertedId;

    // Level 2 (under Accessories): Direct Products
    const handleRes = await nodesColl.insertOne({
      name: 'Touch Handle',
      code: 'THD',
      parentId: accessoriesId,
      path: `,Production,Accessories,Touch Handle,`,
      level: 2,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 1,
      description: 'Sash operating handle'
    });
    const handleId = handleRes.insertedId;

    const lockRes = await nodesColl.insertOne({
      name: 'Multi Point Lock',
      code: 'MLK',
      parentId: accessoriesId,
      path: `,Production,Accessories,Multi Point Lock,`,
      level: 2,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 2,
      description: 'Multi-point espag locking rod'
    });
    const lockId = lockRes.insertedId;

    const rollerRes = await nodesColl.insertOne({
      name: 'Sliding Roller Wheels',
      code: 'SRW',
      parentId: accessoriesId,
      path: `,Production,Accessories,Sliding Roller Wheels,`,
      level: 2,
      isProduct: true,
      allowChildren: false,
      active: true,
      sortOrder: 3,
      description: 'Brass wheels for sliding tracks'
    });
    const rollerId = rollerRes.insertedId;

    console.log('Seeded Configuration Nodes hierarchy.');

    // 5. Seed Features Library
    const featureLib = mongoose.connection.db.collection('feature_library');
    const seededFeatures = await featureLib.insertMany([
      { name: 'Glass Type', code: 'GT', inputType: 'Select', required: true },
      { name: 'Glass Thickness', code: 'GTH', inputType: 'Select', required: true },
      { name: 'Color', code: 'CL', inputType: 'Select', required: true },
      { name: 'Locking Spindle', code: 'LK', inputType: 'Select', required: false },
      { name: 'Handle Type', code: 'HD', inputType: 'Select', required: true }
    ]);
    
    const ftGlassType = seededFeatures.insertedIds[0];
    const ftGlassThick = seededFeatures.insertedIds[1];
    const ftColor = seededFeatures.insertedIds[2];
    const ftLock = seededFeatures.insertedIds[3];
    const ftHandle = seededFeatures.insertedIds[4];
    console.log('Seeded Features Library.');

    // 6. Seed Feature Values
    const featureValues = mongoose.connection.db.collection('feature_values');
    await featureValues.insertMany([
      { featureId: ftGlassType, value: 'Clear Glass' },
      { featureId: ftGlassType, value: 'Tinted Glass' },
      { featureId: ftGlassType, value: 'Reflective Blue' },
      { featureId: ftGlassType, value: 'Toughened Glass' },

      { featureId: ftGlassThick, value: '4mm' },
      { featureId: ftGlassThick, value: '5mm' },
      { featureId: ftGlassThick, value: '6mm' },
      { featureId: ftGlassThick, value: '12mm' },

      { featureId: ftColor, value: 'White' },
      { featureId: ftColor, value: 'Black Matt' },
      { featureId: ftColor, value: 'Walnut Wood' },
      { featureId: ftColor, value: 'Golden Oak' },

      { featureId: ftLock, value: 'Single Point Touch' },
      { featureId: ftLock, value: 'Multi Point Espag' },

      { featureId: ftHandle, value: 'D-Handle' },
      { featureId: ftHandle, value: 'Pop-up Crescent' },
      { featureId: ftHandle, value: 'Lever Handle' }
    ]);
    console.log('Seeded Feature Values catalog.');

    // 7. Seed Product Feature Assignments
    const prodFeatures = mongoose.connection.db.collection('product_features');
    await prodFeatures.insertMany([
      { productId: smallSashId, featureId: ftGlassType },
      { productId: smallSashId, featureId: ftGlassThick },
      { productId: smallSashId, featureId: ftColor },
      { productId: smallSashId, featureId: ftLock },
      { productId: smallSashId, featureId: ftHandle },
      
      { productId: bigSashId, featureId: ftGlassType },
      { productId: bigSashId, featureId: ftGlassThick },
      { productId: bigSashId, featureId: ftColor },
      
      { productId: shutterId, featureId: ftGlassType },
      { productId: shutterId, featureId: ftColor }
    ]);
    console.log('Seeded Product Feature assignments.');

    // 8. Seed Measurement Templates
    const measurementsColl = mongoose.connection.db.collection('measurement_templates');
    await measurementsColl.insertMany([
      {
        productId: smallSashId,
        fields: [
          { name: 'width', label: 'Width (mm)', type: 'Number', required: true },
          { name: 'height', label: 'Height (mm)', type: 'Number', required: true },
          { name: 'track', label: 'Track Count', type: 'Select', options: ['2-Track', '3-Track'], required: true }
        ]
      },
      {
        productId: shutterId,
        fields: [
          { name: 'width', label: 'Shutter Width (mm)', type: 'Number', required: true },
          { name: 'height', label: 'Shutter Height (mm)', type: 'Number', required: true }
        ]
      }
    ]);
    console.log('Seeded Measurement templates.');

    // 9. Seed Formula Groups & Rules
    const groupsColl = mongoose.connection.db.collection('formula_groups');
    const rulesColl = mongoose.connection.db.collection('formula_rules');
    
    // Group 1: Small Sash Formulas
    const grp1Res = await groupsColl.insertOne({
      productId: smallSashId,
      name: 'SL-SL Small Sash Formulas',
      active: true
    });
    const grp1Id = grp1Res.insertedId;

    await rulesColl.insertMany([
      { groupId: grp1Id, name: 'FrameFormula', expression: '((width + height) * 2) / 5850', variables: ['width', 'height'], unit: 'Nos', description: 'Outer frame profiles' },
      { groupId: grp1Id, name: 'SteelFormula', expression: '((width + height) * 1.95) / 5850', variables: ['width', 'height'], unit: 'Nos', description: 'Inner reinforcement steel' },
      { groupId: grp1Id, name: 'GlassFormula', expression: '(width * height) / 1000000', variables: ['width', 'height'], unit: 'sqm', description: 'Glass area' },
      { groupId: grp1Id, name: 'RubberFormula', expression: '(width + height) * 4 / 1000', variables: ['width', 'height'], unit: 'm', description: 'Gaskets sealing strip' }
    ]);

    // Group 2: Shutter Formulas
    const grp2Res = await groupsColl.insertOne({
      productId: shutterId,
      name: 'Breeze 36mm Open Shutter Formulas',
      active: true
    });
    const grp2Id = grp2Res.insertedId;

    await rulesColl.insertMany([
      { groupId: grp2Id, name: 'FrameFormula', expression: '((width + height) * 2) / 5850', variables: ['width', 'height'], unit: 'Nos', description: 'Frame profiles count' },
      { groupId: grp2Id, name: 'RubberFormula', expression: '(width + height) * 4 / 1000', variables: ['width', 'height'], unit: 'm', description: 'Rubber gasket strip' }
    ]);
    console.log('Seeded Formula Groups and Formula Rules.');

    // 10. Seed BOM Rules (Reference formulas)
    const bomRulesColl = mongoose.connection.db.collection('bom_rules');
    await bomRulesColl.insertMany([
      {
        productId: smallSashId,
        materials: [
          { name: 'Outer Frame UPVC Profile', quantityFormula: 'FrameFormula', unit: 'Nos' },
          { name: 'Inner Galvanized Steel Support', quantityFormula: 'SteelFormula', unit: 'Nos' },
          { name: 'Double Glazed Glass Unit', quantityFormula: 'GlassFormula', unit: 'sqm' },
          { name: 'EPDM Rubber Gasket Strip', quantityFormula: 'RubberFormula', unit: 'm' },
          { name: 'Sliding Wheel Roller', quantityFormula: '4', unit: 'Nos' },
          { name: 'Multi Point Lock Mechanism', quantityFormula: '2', unit: 'Nos' },
          { name: 'Touch Window Handles', quantityFormula: '2', unit: 'Nos' }
        ]
      },
      {
        productId: shutterId,
        materials: [
          { name: 'Casement Frame UPVC Profile', quantityFormula: 'FrameFormula', unit: 'Nos' },
          { name: 'EPDM Rubber Gasket Strip', quantityFormula: 'RubberFormula', unit: 'm' }
        ]
      }
    ]);
    console.log('Seeded BOM Rules.');

    // 11. Seed Pricing Rules
    const pricingRulesColl = mongoose.connection.db.collection('pricing_rules');
    await pricingRulesColl.insertMany([
      {
        productId: smallSashId,
        materialCostFormula: 'BOM_COST * 1.15',
        laborCostFormula: '600',
        installationCostFormula: '250',
        marginPercent: 20,
        sellingPriceFormula: '(MATERIAL_COST + LABOR_COST + INSTALLATION_COST) * 1.20'
      },
      {
        productId: shutterId,
        materialCostFormula: 'BOM_COST * 1.10',
        laborCostFormula: '400',
        installationCostFormula: '150',
        marginPercent: 15,
        sellingPriceFormula: '(MATERIAL_COST + LABOR_COST + INSTALLATION_COST) * 1.15'
      }
    ]);
    console.log('Seeded Pricing Rules.');

    // 12. Seed Excel Import logs
    const importLogs = mongoose.connection.db.collection('excel_import_logs');
    await importLogs.insertOne({
      productId: smallSashId,
      productName: 'Small Sash',
      importedFrom: 'SL-SL Slim INTACT Small sash W.B.xlsx',
      importDate: new Date(),
      version: '1.0',
      inputs: ['width', 'height', 'track'],
      formulasExtracted: 4
    });
    console.log('Seeded Excel Import logs.');

    // 13. Seed Legacy global Formulas Library
    const formulaCount = await Formula.countDocuments();
    if (formulaCount === 0) {
      await Formula.insertMany([
        { name: 'Frame Profile Length', type: 'Profile', expression: '((width + height) * 2) / 5850', variables: ['width', 'height'], unit: 'Nos', description: 'UPVC outer frame profiles required count' },
        { name: 'Glass Area Calculation', type: 'Glass', expression: '(width * height) / 1000000', variables: ['width', 'height'], unit: 'sqm', description: 'Total double-glazed unit glass surface area' },
        { name: 'Inner Steel Reinforcement', type: 'Steel', expression: '((width + height) * 1.95) / 5850', variables: ['width', 'height'], unit: 'Nos', description: 'Steel support profiles required count' },
        { name: 'Rubber Sealing Gasket', type: 'Rubber', expression: '(width + height) * 4 / 1000', variables: ['width', 'height'], unit: 'm', description: 'Gasket rubber length for sealing' },
        { name: 'Secure Espag Lock', type: 'Hardware', expression: '1', variables: [], unit: 'Nos', description: 'Multi-point locking mechanism espag' },
        { name: 'Premium Handles', type: 'Hardware', expression: '2', variables: [], unit: 'Nos', description: 'Sash operating handle count' }
      ]);
      console.log('Seeded global Formulas Library.');
    }

    console.log('Rule Engine Database Seeding Completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error.message);
    process.exit(1);
  }
};

seedDatabase();
