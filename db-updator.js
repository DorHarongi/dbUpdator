const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const utils = require('utils');
const http = require('http');

// Vanguard trait bonus multipliers by academy level (1 + bonus percentage)
// Index 0-2: 1.0 (no bonus), Level 3: 1.07, Level 4: 1.09, ... Level 10: 1.25
const vanguardMultiplierByLevel = [1.0, 1.0, 1.0, 1.07, 1.09, 1.11, 1.13, 1.15, 1.17, 1.21, 1.25];

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

// Connection url
const url = 'mongodb://localhost:27017/';
// Database Name
const dbName = 'users';

async function startWorkFlow() {
    let dbConnection = await connectToDB();
    if (dbConnection) {
        let usersCollection = dbConnection.collection('users');
        updateDb(usersCollection)
    }
}

function updateDb(usersCollection) {
    setInterval(async () => {
        usersCollection.updateMany({},
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
                                                        // Base production multiplied by Vanguard bonus (if applicable)
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
                                                                // Vanguard multiplier (1.0 if not vanguard)
                                                                {
                                                                    $cond: {
                                                                        if: { $eq: ["$$item.trait", "vanguard"] },
                                                                        then: { $arrayElemAt: [vanguardMultiplierByLevel, "$$item.buildingsLevels.academyLevel"] },
                                                                        else: 1.0
                                                                    }
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
                                                        // Base production multiplied by Vanguard bonus (if applicable)
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
                                                                // Vanguard multiplier (1.0 if not vanguard)
                                                                {
                                                                    $cond: {
                                                                        if: { $eq: ["$$item.trait", "vanguard"] },
                                                                        then: { $arrayElemAt: [vanguardMultiplierByLevel, "$$item.buildingsLevels.academyLevel"] },
                                                                        else: 1.0
                                                                    }
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
                                                        // Base production multiplied by Vanguard bonus (if applicable)
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
                                                                // Vanguard multiplier (1.0 if not vanguard)
                                                                {
                                                                    $cond: {
                                                                        if: { $eq: ["$$item.trait", "vanguard"] },
                                                                        then: { $arrayElemAt: [vanguardMultiplierByLevel, "$$item.buildingsLevels.academyLevel"] },
                                                                        else: 1.0
                                                                    }
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
                                    trait: "$$item.trait"
                                }
                            }
                        },
                        energy: {
                            '$min': [
                                {
                                    $add: [
                                        "$energy",
                                        // Energy production with Vanguard bonus (uses first village's trait)
                                        {
                                            $multiply: [
                                                utils.energyProductionSpeedPerSecond,
                                                {
                                                    $cond: {
                                                        if: { $eq: [{ $arrayElemAt: ["$villages.trait", 0] }, "vanguard"] },
                                                        then: { $arrayElemAt: [vanguardMultiplierByLevel, { $arrayElemAt: ["$villages.buildingsLevels.academyLevel", 0] }] },
                                                        else: 1.0
                                                    }
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

    let mongoClient = await MongoClient.connect(url + dbName);
    if (mongoClient == undefined) {
        console.log("Mongo down. trying again...")
        await this.connect();
    }
    else {
        console.log("Connected to db succesfully");
        return this.connection = mongoClient.db('users');
    }
}

