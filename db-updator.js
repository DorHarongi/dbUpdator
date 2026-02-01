const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const utils = require('utils');
const http = require('http');

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
                                                        {
                                                            $multiply: [
                                                                "$$item.resourcesWorkers.woodWorkers",
                                                                utils.singleWorkerProductionSpeedPerSecond
                                                            ]
                                                        },
                                                        { 
                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.woodFactoryLevel" ] 
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
                                                        {
                                                            $multiply: [
                                                                "$$item.resourcesWorkers.stoneWorkers",
                                                                utils.singleWorkerProductionSpeedPerSecond
                                                            ]
                                                        },
                                                        {
                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.stoneMineLevel" ]
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
                                                        {
                                                            $multiply: [
                                                                "$$item.resourcesWorkers.cropWorkers",
                                                                utils.singleWorkerProductionSpeedPerSecond
                                                            ]
                                                        },
                                                        { 
                                                            $arrayElemAt: [utils.factoriesProductionSpeedByLevel, "$$item.buildingsLevels.cropFarmLevel" ] 
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
                                    supportSent: "$$item.supportSent"
                                }
                            }
                        },
                        energy: {
                            '$min': [
                                {
                                    $add: [
                                        "$energy",
                                        utils.energyProductionSpeedPerSecond
                                    ]
                                },
                                ,utils.maxEnergy]
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

