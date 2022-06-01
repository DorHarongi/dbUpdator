const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const utils = require('utils');


// Connection url
const url = 'mongodb://localhost:27017/';
// Database Name
const dbName = 'users';



startWorkFlow();

async function startWorkFlow() {
    let dbConnection = await connectToDB();
    if (dbConnection) {
        let usersCollection = dbConnection.collection('users');
        updateDb(usersCollection)
    }
}

function updateDb(usersCollection) {
    setInterval(async () => {
        usersCollection.update({},
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
                                    clanTroops: "$$item.clanTroops"
                                }
                            }
                        }
                    }
                }
            ],
            {
                multi: true
            })
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

