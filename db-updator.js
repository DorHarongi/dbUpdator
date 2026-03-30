const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const utils = require('utils');
const http = require('http');
const fs = require('fs');
const path = require('path');

function getMongoUrl() {
    const credPath = path.join(process.cwd(), 'mongo-credentials.txt');
    let password = '<password-here>';
    try {
        const content = fs.readFileSync(credPath, 'utf8');
        const match = content.match(/password:\s*(.+)/);
        if (match && match[1].trim() && match[1].trim() !== '<password-here>') {
            password = match[1].trim();
        }
    } catch (_) { /* use no-auth fallback */ }
    if (password === '<password-here>') {
        return 'mongodb://localhost:27017/';
    }
    return `mongodb://pasiflora:${encodeURIComponent(password)}@localhost:27017/?authSource=admin`;
}

// Bind to a port to prevent multiple instances
const LOCK_PORT = 3999;
const lockServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('db-updator is running');
});

lockServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERROR: Another instance of db-updator is already running on port ${LOCK_PORT}`);
        console.error('Exiting to prevent duplicate updates...');
        process.exit(1);
    }
    throw err;
});

lockServer.listen(LOCK_PORT, () => {
    console.log(`db-updator lock acquired on port ${LOCK_PORT}`);
    startWorkFlow();
});

// Connection url (reads password from mongo-credentials.txt)
const url = getMongoUrl();
const accountsDbName = 'pasiflora_accounts';
const serverDbPrefix = 'pasiflora_server_';

async function startWorkFlow() {
    const client = await connectToDB();
    if (!client) return;

    // Multi-server: get active server IDs from accounts DB, or fallback to single server 1
    let serverIds = [1];
    try {
        const accountsDb = client.db(accountsDbName);
        const servers = await accountsDb.collection('servers').find({ status: 'active' }).toArray();
        if (servers && servers.length > 0) {
            serverIds = servers.map((s) => s.serverId).filter((id) => id != null);
        }
    } catch (e) {
        console.log('No accounts/servers list found, using single server 1');
    }

    for (const serverId of serverIds) {
        const dbName = serverDbPrefix + serverId;
        const db = client.db(dbName);
        const usersCollection = db.collection('users');
        updateDb(usersCollection);
        console.log('db-updator: running updates for server ' + serverId + ' (db: ' + dbName + ')');
    }
}

function updateDb(usersCollection) {
    setInterval(async () => {
        usersCollection.updateMany({ isDeleted: { $ne: true } },
            [
                {
                    $set: {
                        villages: {
                            $map: {
                                input: "$villages",
                                as: "item",
                                in: {
                                    villageName: "$$item.villageName",
                                    resourcesAmounts: {
                                        woodAmount: 
                                        {
                                            '$min': [
                                                {
                                                    $add: [
                                                        // Base production multiplied by Gold Rush skill (if applicable)
                                                        {
                                                            $multiply: [
                                                                // Base production: workers + factory
                                                                {
                                                                    $add: [
                                                                        {
                                                                            $multiply: [
                                                                                "$$item.resourcesWorkers.woodWorkers",
                                                                                utils.singleWorkerProductionSpeedPerSecond
                                                                            ]
                                                                        },
                                                                        { 
                                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.woodFactoryLevel" ] 
                                                                        }
                                                                    ]
                                                                },
                                                                // Gold Rush multiplier based on skills.goldRush tier
                                                                {
                                                                    $add: [
                                                                        1,
                                                                        {
                                                                            $switch: {
                                                                                branches: [
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "I"] }, then: 0.05 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "II"] }, then: 0.10 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "III"] }, then: 0.15 },
                                                                                ],
                                                                                default: 0,
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "$$item.resourcesAmounts.woodAmount"
                                                    ]
                                                }
                                                ,{ 
                                                    $arrayElemAt: [utils.warehouseStorageByLevel,  "$$item.buildingsLevels.woodWarehouseLevel"]
                                                }
                                            ]
                                        },
                                        stonesAmount: 
                                        {
                                            '$min': [
                                                {
                                                    $add: [
                                                        // Base production multiplied by Gold Rush skill (if applicable)
                                                        {
                                                            $multiply: [
                                                                // Base production: workers + factory
                                                                {
                                                                    $add: [
                                                                        {
                                                                            $multiply: [
                                                                                "$$item.resourcesWorkers.stoneWorkers",
                                                                                utils.singleWorkerProductionSpeedPerSecond
                                                                            ]
                                                                        },
                                                                        {
                                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.stoneMineLevel" ]
                                                                        }
                                                                    ]
                                                                },
                                                                // Gold Rush multiplier based on skills.goldRush tier
                                                                {
                                                                    $add: [
                                                                        1,
                                                                        {
                                                                            $switch: {
                                                                                branches: [
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "I"] }, then: 0.05 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "II"] }, then: 0.10 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "III"] }, then: 0.15 },
                                                                                ],
                                                                                default: 0,
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "$$item.resourcesAmounts.stonesAmount"
                                                    ]
                                                }
                                                ,{
                                                    $arrayElemAt: [utils.warehouseStorageByLevel,  "$$item.buildingsLevels.stoneWarehouseLevel"]
                                                }
                                            ]
                                        },
                                        cropAmount: 
                                        {
                                            '$min': [
                                                {
                                                    $add: [
                                                        // Base production multiplied by Gold Rush skill (if applicable)
                                                        {
                                                            $multiply: [
                                                                // Base production: workers + factory
                                                                {
                                                                    $add: [
                                                                        {
                                                                            $multiply: [
                                                                                "$$item.resourcesWorkers.cropWorkers",
                                                                                utils.singleWorkerProductionSpeedPerSecond
                                                                            ]
                                                                        },
                                                                        { 
                                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.cropFarmLevel" ] 
                                                                        }
                                                                    ]
                                                                },
                                                                // Gold Rush multiplier based on skills.goldRush tier
                                                                {
                                                                    $add: [
                                                                        1,
                                                                        {
                                                                            $switch: {
                                                                                branches: [
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "I"] }, then: 0.05 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "II"] }, then: 0.10 },
                                                                                    { case: { $eq: ["$$item.skills.goldRush", "III"] }, then: 0.15 },
                                                                                ],
                                                                                default: 0,
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "$$item.resourcesAmounts.cropAmount"
                                                    ]
                                                },
                                                ,{
                                                    $arrayElemAt: [utils.warehouseStorageByLevel,  "$$item.buildingsLevels.cropWarehouseLevel"]
                                                }
                                            ]
                                        },
                                    },
                                    buildingsLevels: "$$item.buildingsLevels",
                                    population: "$$item.population",
                                    resourcesWorkers: "$$item.resourcesWorkers",
                                    troops: "$$item.troops",
                                    clanTroops: "$$item.clanTroops",
                                    location: "$$item.location",
                                    supportSent: "$$item.supportSent",
                                    oasisTroopsSent: "$$item.oasisTroopsSent",
                                    troopsInTransit: "$$item.troopsInTransit",
                                    skills: "$$item.skills",
                                    aliveSpies: "$$item.aliveSpies",
                                    spyDeathTimestamps: "$$item.spyDeathTimestamps"
                                }
                            }
                        },
                        energy: {
                            '$min': [
                                {
                                    $add: [
                                        "$energy",
                                        // Energy production with Adrenaline Surge skill (stacks across all villages)
                                        {
                                            $multiply: [
                                                utils.energyProductionSpeedPerSecond,
                                                {
                                                    $add: [
                                                        1,
                                                        {
                                                            $reduce: {
                                                                input: "$villages",
                                                                initialValue: 0,
                                                                in: {
                                                                    $add: [
                                                                        "$$value",
                                                                        {
                                                                            $switch: {
                                                                                branches: [
                                                                                    { case: { $eq: ["$$this.skills.adrenalineSurge", "I"] }, then: 0.05 },
                                                                                    { case: { $eq: ["$$this.skills.adrenalineSurge", "II"] }, then: 0.10 },
                                                                                    { case: { $eq: ["$$this.skills.adrenalineSurge", "III"] }, then: 0.15 },
                                                                                ],
                                                                                default: 0,
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                utils.maxEnergy]
                        }
                    }
                }
            ])
    }, 1000)
}

async function connectToDB() {
    try {
        const mongoClient = await MongoClient.connect(url);
        console.log('Connected to MongoDB successfully');
        return mongoClient;
    } catch (err) {
        console.log('Mongo down. Retrying in 5s...', err.message);
        await new Promise((r) => setTimeout(r, 5000));
        return connectToDB();
    }
}

