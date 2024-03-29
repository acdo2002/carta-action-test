import { CARTA } from "carta-protobuf";
import { checkConnection, Stream} from './myClient';
import { MessageController } from "./MessageController";
import config from "./config.json";
import exp from "constants";

let testServerUrl: string = config.serverURL0;
let testSubdirectory: string = config.path.QA;
let connectTimeout: number = config.timeout.connection;
let openFileTimeout: number = config.timeout.openFile;

interface AssertItem {
    filelist: CARTA.IFileListRequest;
    fileOpen: CARTA.IOpenFile[];
    addTilesReq: CARTA.IAddRequiredTiles[];
    setCursor: CARTA.ISetCursor[];
    setRegion: CARTA.ISetRegion[];
    setPVRequest: CARTA.IPvRequest[];
    pvCancelMessage: String;
};

let assertItem: AssertItem = {
    filelist: { directory: testSubdirectory },
    fileOpen: [
        {
            directory: testSubdirectory,
            file: "S255_IR_sci.spw25.cube.I.pbcor.fits",
            hdu: "0",
            fileId: 0,
            renderMode: CARTA.RenderMode.RASTER,
        },
    ],
    addTilesReq: [
        {
            fileId: 0,
            compressionQuality: 11,
            compressionType: CARTA.CompressionType.ZFP,
            tiles: [0],
        },
    ],  
    setCursor: [
        {
            fileId: 0,
            point: { x: 1, y: 1 },
        },
    ],
    setRegion: [
        {
            fileId: 0,
            regionId: -1,
            previewRegion: false,
            regionInfo: {
                regionType: CARTA.RegionType.LINE,
                controlPoints: [{ x: 260, y: 287 }, { x: 1613, y: 1640 }],
                rotation: 135,
            }
        },
    ],
    setPVRequest: [
        {
            fileId: 0,
            regionId: 1,
            width: 5,
            keep: false,
            reverse: false,
            spectralRange: {min: 0, max: 400},
            previewSettings: {
                animationCompressionQuality: 9,
                compressionType: CARTA.CompressionType.ZFP,
                imageCompressionQuality: 11,
                previewId: 0,
                rebinXy: 4,
                rebinZ: 4,
                regionId: -1,
            }
        }
    ],
    pvCancelMessage: "PV image preview cancelled",
};

let basepath: string;
describe("PV_PREVIEW_CANCEL test: Testing PV preview with cancel request", () => {
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

        describe(`Preparation`, () => {
            test(`(step 1): Open image`, async () => {
                msgController.closeFile(-1);
                let OpenFileResponse = await msgController.loadFile(assertItem.fileOpen[0]);
                let RegionHistogramData = await Stream(CARTA.RegionHistogramData,1);

                expect(OpenFileResponse.success).toBe(true);
                expect(OpenFileResponse.fileInfo.name).toEqual(assertItem.fileOpen[0].file);
            });

            test(`(Stpe 2): Set cursor and add required tiles`, async () => {
                msgController.addRequiredTiles(assertItem.addTilesReq[0]);
                let RasterTileDataResponse = await Stream(CARTA.RasterTileData,assertItem.addTilesReq[0].tiles.length + 2);

                msgController.setCursor(assertItem.setCursor[0].fileId, assertItem.setCursor[0].point.x, assertItem.setCursor[0].point.y);
                let SpatialProfileDataResponse1 = await Stream(CARTA.SpatialProfileData,1);
            });

            test(`(Step 3): Set region`, async () => {
                let setRegionAckResponse = await msgController.setRegion(assertItem.setRegion[0].fileId, assertItem.setRegion[0].regionId, assertItem.setRegion[0].regionInfo, assertItem.setRegion[0].previewRegion);
                expect(setRegionAckResponse.regionId).toEqual(1);
                expect(setRegionAckResponse.success).toEqual(true);
            });

            test(`(Step 4): Set PV request`, async () => {
                let pVProgressData = [];
                let pvProgressPromise = new Promise((resolve)=>{
                    msgController.pvProgressStream.subscribe({
                        next: (data) => {
                            pVProgressData.push(data)
                            if (pVProgressData.length === 1) {
                                msgController.cancelRequestingPV(assertItem.setRegion[0].fileId);
                                msgController.stopPvPreview(assertItem.setRegion[0].fileId);
                                resolve(pVProgressData);
                            }
                        }
                    })
                });

                try {
                    let PVresponse = await msgController.requestPV(assertItem.setPVRequest[0]);
                } catch (err) {
                    expect(err).toContain(assertItem.pvCancelMessage);
                } 
                let pvProgressReponse = await pvProgressPromise;
                expect(pvProgressReponse[0].progress).toBeLessThan(1);
            });
        });

        afterAll(() => msgController.closeConnection());
    });
});