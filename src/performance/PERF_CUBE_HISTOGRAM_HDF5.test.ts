import { CARTA } from "carta-protobuf";
import { checkConnection, Stream} from './myClient';
import { MessageController } from "./MessageController";
import config from "./config.json";

let testServerUrl: string = config.serverURL0;
let testSubdirectory: string = config.path.performance;
let connectTimeout: number = config.timeout.connection;
let openFileTimeout: number = config.performance.openFile;
let readFileTimeout: number = config.performance.readFile;

interface AssertItem {
    fileOpen: CARTA.IOpenFile[];
    initTilesReq: CARTA.IAddRequiredTiles;
    initSetCursor: CARTA.ISetCursor;
    initSpatialRequirements: CARTA.ISetSpatialRequirements;
    histogram: CARTA.ISetHistogramRequirements;
    cubeHistogramTimeout: number[];
}
let assertItem: AssertItem = {
    fileOpen: [
        {
            directory: testSubdirectory + "/cube_B",
            file: "cube_B_09600_z00100.hdf5",
            hdu: "0",
            fileId: 0,
            renderMode: CARTA.RenderMode.RASTER,
        },
    ],
    initTilesReq: {
        fileId: 0,
        compressionQuality: 11,
        compressionType: CARTA.CompressionType.ZFP,
        tiles: [33558529, 33558528, 33554433, 33554432, 33562625, 33558530, 33562624, 33554434, 33562626],
    },
    initSetCursor: {
        fileId: 0,
        point: { x: 1, y: 1 },
    },
    initSpatialRequirements:
    {
        fileId: 0,
        regionId: 0,
        spatialProfiles: [{coordinate:"x"}, {coordinate:"y"}],
    },
    histogram: {
        fileId: 0,
        regionId: -2,
        histograms: [{ channel: -2, numBins: -1 }],
    },
    cubeHistogramTimeout: [500],
}

let basepath: string;
describe("PERF_CUBE_HISTOGRAM",()=>{
    const msgController = MessageController.Instance;
    describe(`Register a session`, () => {
        beforeAll(async ()=> {
            await msgController.connect(testServerUrl);
        }, connectTimeout);

        checkConnection();

        test(`Get basepath and modify the directory path`, async () => {
            let fileListResponse = await msgController.getFileList("$BASE",0);
            basepath = fileListResponse.directory;
            assertItem.fileOpen[0].directory = basepath + "/" + assertItem.fileOpen[0].directory;
        });

        describe(`Initialization: open the image`, () => {
            test(`(Step 1)"${assertItem.fileOpen[0].file}" OPEN_FILE_ACK and REGION_HISTOGRAM_DATA should arrive within ${openFileTimeout} ms`, async() => {
                msgController.closeFile(-1);
                msgController.closeFile(0);
                let OpenFileResponse = await msgController.loadFile(assertItem.fileOpen[0]);
                expect(OpenFileResponse.success).toEqual(true);
                let RegionHistrogramDataResponse = await Stream(CARTA.RegionHistogramData,1);
            }, openFileTimeout);

            test(`(Step 1)"${assertItem.fileOpen[0].file}" SetImageChannels & SetCursor responses should arrive within ${readFileTimeout} ms`, async () => {
                msgController.addRequiredTiles(assertItem.initTilesReq);
                let RasterTileDataResponse = await Stream(CARTA.RasterTileData,assertItem.initTilesReq.tiles.length + 2);

                msgController.setCursor(assertItem.initSetCursor.fileId, assertItem.initSetCursor.point.x, assertItem.initSetCursor.point.y);
                let SpatialProfileDataResponse1 = await Stream(CARTA.SpatialProfileData,1);

                msgController.setSpatialRequirements(assertItem.initSpatialRequirements);
                let SpatialProfileDataResponse2 = await Stream(CARTA.SpatialProfileData,1);

                expect(RasterTileDataResponse.length).toEqual(assertItem.initTilesReq.tiles.length + 2);
            }, openFileTimeout);

            describe(`Set histogram requirements:`, () => {
                let RegionHistogramDataTemp = [];
                let ReceiveProgress: number;
                let RegionHistogramData: CARTA.RegionHistogramData;
                test(`(Step 2)"${assertItem.fileOpen[0].file}" REGION_HISTOGRAM_DATA should arrive completely within ${assertItem.cubeHistogramTimeout[0]} ms:`, async () => {
                    msgController.setHistogramRequirements(assertItem.histogram);
                    let regionHistogramDataPromise = new Promise((resolve)=>{
                        msgController.histogramStream.subscribe({
                            next: (data) => {
                                RegionHistogramDataTemp.push(data)
                                if (data.progress === 1) {
                                    resolve(RegionHistogramDataTemp)
                                }
                            }
                        })
                    });
                    
                    let regionHistogramDataResponse = await regionHistogramDataPromise;
                    RegionHistogramData = regionHistogramDataResponse.slice(-1)[0]
                    ReceiveProgress = RegionHistogramData.progress;
                    expect(ReceiveProgress).toEqual(1);
                }, assertItem.cubeHistogramTimeout[0]);
            });

        });

        afterAll(() => msgController.closeConnection());
    });
});