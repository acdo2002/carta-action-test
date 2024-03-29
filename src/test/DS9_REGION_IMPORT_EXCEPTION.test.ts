import { CARTA } from "carta-protobuf";
import { checkConnection, Stream} from './myClient';
import { MessageController } from "./MessageController";
import config from "./config.json";


let testServerUrl = config.serverURL0;
let testSubdirectory = config.path.QA;
let regionSubdirectory = config.path.region;
let connectTimeout = config.timeout.connection;
let importTimeout = config.timeout.import;

interface AssertItem {
    registerViewer: CARTA.IRegisterViewer;
    openFile: CARTA.IOpenFile;
    precisionDigits: number;
    importRegion: CARTA.IImportRegion[];
    importRegionAck: CARTA.IImportRegionAck[];
};
let assertItem: AssertItem = {
    registerViewer: {
        sessionId: 0,
        apiKey: "",
        clientFeatureFlags: 5,
    },
    openFile:
    {
        directory: testSubdirectory,
        file: "M17_SWex.image",
        fileId: 0,
        hdu: "",
        renderMode: CARTA.RenderMode.RASTER,
    },
    precisionDigits: 4,
    importRegion:
        [
            {
                contents: [],
                // directory: regionSubdirectory,
                file: "M17_SWex_regionSet2_pix.reg",
                groupId: 0,
                type: CARTA.FileType.DS9_REG,
            },
            {
                contents: [],
                // directory: regionSubdirectory,
                file: "M17_SWex_regionSet2_world.reg",
                groupId: 0,
                type: CARTA.FileType.DS9_REG,
            },
        ],
    importRegionAck:
        [
            { message: "Invalid DS9 region syntax:" },
            { message: "Invalid DS9 region syntax:" },
        ],
};

let basepath: string;
describe("DS9_REGION_IMPORT_EXCEPTION test: Testing import/export of DS9 region format", () => {
    const msgController = MessageController.Instance;
    describe(`Register a session`, () => {
        beforeAll(async ()=> {
            await msgController.connect(testServerUrl);
        }, connectTimeout);

        checkConnection();
        test(`Get basepath`, async () => {
            let fileListResponse = await msgController.getFileList("$BASE",0);
            basepath = fileListResponse.directory;
            assertItem.openFile.directory = basepath + "/" + assertItem.openFile.directory;
        });

        describe(`Go to "${testSubdirectory}" folder and open image "${assertItem.openFile.file}"`, () => {
            test(`Preparation: Open image`,async () => {
                msgController.closeFile(-1);
                let OpenFileResponse = await msgController.loadFile(assertItem.openFile);
                expect(OpenFileResponse.success).toEqual(true);
                let RegionHistrogramDataResponse = await Stream(CARTA.RegionHistogramData,1);
            });

            assertItem.importRegionAck.map((regionAck, idxRegion) => {
                describe(`Import "${assertItem.importRegion[idxRegion].file}"`, () => {
                    let importRegionAck: any;
                    test(`IMPORT_REGION_ACK should return within ${importTimeout}ms and check the returned error message`, async () => {
                        try {
                            importRegionAck = await msgController.importRegion(basepath + "/" + regionSubdirectory, assertItem.importRegion[idxRegion].file, assertItem.importRegion[idxRegion].type, assertItem.importRegion[idxRegion].groupId);
                        } catch (err) {
                            expect(err).toContain(assertItem.importRegionAck[idxRegion].message);
                        }
                    }, importTimeout);
                });
            });
        })

        afterAll(() => msgController.closeConnection());
    });
})