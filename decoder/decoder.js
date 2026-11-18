
import { init, decodeRPack } from './rpack_bg.js';

let wasmDecode;

// Initialize WASM and get the decode function.
async function initialize() {
    await init();
    // After init, the functions on the wasm object are available.
    // The exported decodeRPack is the one we should use.
    wasmDecode = decodeRPack;
    log('WASM Initialized and decoder function is ready.');
    dropZone.querySelector('p').textContent = 'Drop file here';
    dropZone.style.cursor = 'pointer';
    dropZone.style.borderColor = '#ccc';
}

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const logOutput = document.getElementById('log-output');

// Initial state
dropZone.querySelector('p').textContent = 'Initializing WASM...';
dropZone.style.cursor = 'not-allowed';
dropZone.style.borderColor = '#f00';
initialize();

function log(message) {
    console.log(message);
    logOutput.textContent += message + '\n';
}

function clearLogs() {
    logOutput.textContent = '';
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) {
        handleFile(files[0]);
    }
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        handleFile(fileInput.files[0]);
    }
});

async function handleFile(file) {
    clearLogs();
    log(`Selected file: ${file.name}`);
    statusEl.textContent = 'Processing...';

    try {
        const buffer = await file.arrayBuffer();
        const uint8Buffer = new Uint8Array(buffer);
        log('File read into buffer.');

        const module = await readModule(uint8Buffer);
        log('Module data successfully decoded.');

        const zip = new JSZip();
        log('Creating ZIP file...');

        // --- Logic for module.json (with new structured assets) ---
        const moduleForJson = createJsonSafeModule(module);
        const newAssetsForJson = [];
        let jsonAssetCounter = 1;

        if (module.assets && module.assets.length > 0) {
            for (const asset of module.assets) {
                const originalName = asset[0];
                const originalExt = asset[2];
                const newAssetName = `${jsonAssetCounter}.${originalExt}`;

                newAssetsForJson.push({
                    type: "x-risu-asset",
                    uri: `embeded://assets/${newAssetName}`,
                    name: newAssetName,
                    ext: originalExt
                });
                jsonAssetCounter++;
            }
        }
        moduleForJson.assets = newAssetsForJson;

        const moduleJsonString = JSON.stringify(moduleForJson, createJsonSafeReplacer());
        zip.file('module.json', moduleJsonString);
        log('Added module.json (with new structured assets) to ZIP.');

        // --- Logic for actual assets (using original Uint8Array data and new names) ---
        let zipAssetCounter = 1;
        if (module.assets && module.assets.length > 0) { // Use the ORIGINAL 'module' here
            for (const asset of module.assets) {
                const originalName = asset[0];
                const originalExt = asset[2];
                const assetData = asset[1]; // This is the actual Uint8Array
                const newAssetName = `${zipAssetCounter}.${originalExt}`;

                if (newAssetName && assetData instanceof Uint8Array) { // Ensure it's Uint8Array
                    zip.file(`assets/${newAssetName}`, assetData);
                    log(`Added asset: assets/${newAssetName} to ZIP.`);
                } else {
                    log(`Warning: Skipping asset ${originalName} as its data is not a Uint8Array.`);
                }
                zipAssetCounter++;
            }
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        log('ZIP file generated.');

        const zipFileName = file.name.replace(/\.risum$/, '.zip');
        saveAs(zipBlob, zipFileName);
        statusEl.textContent = `Success! ${zipFileName} has been downloaded.`;

    } catch (error) {
        console.error(error);
        log(`ERROR: ${error.message}`);
        statusEl.textContent = 'Failed to decode file. See log for details.';
    }
}

async function readModule(buf) {
    let pos = 0;

    const readLength = () => {
        const view = new DataView(buf.buffer, pos, 4);
        const len = view.getUint32(0, true); // true for little-endian
        pos += 4;
        return len;
    };

    const readByte = () => {
        const byte = buf[pos];
        pos += 1;
        return byte;
    };

    const readData = (len) => {
        const data = buf.subarray(pos, pos + len);
        pos += len;
        return data;
    };

    if (readByte() !== 111) throw new Error('Invalid magic number');
    log('Magic number OK.');

    if (readByte() !== 0) throw new Error('Invalid version');
    log('Version OK.');

    const mainLen = readLength();
    log(`Main data length: ${mainLen}`);
    const mainData = readData(mainLen);
    log('Read main data chunk.');

    const decodedMainData = await wasmDecode(mainData);
    log('Decoded main data chunk via WASM.');

    const main = JSON.parse(new TextDecoder().decode(decodedMainData));
    log('Parsed main data as JSON.');

    if (main.type !== 'risuModule') throw new Error('Invalid module type');

    let module = main.module;
    log(`Module name: ${module.name}`);

    let i = 0;
    while (pos < buf.length) {
        const mark = readByte();
        if (mark === 0) {
            log('End of file marker reached.');
            break;
        }
        if (mark !== 1) throw new Error(`Invalid asset marker: ${mark}`);

        const len = readLength();
        const data = readData(len);
        log(`Read asset chunk ${i}: ${len} bytes`);

        // Directly decode the asset data
        const decodedAssetData = await wasmDecode(data);
        log(`Decoded asset chunk ${i}`);
        
        // The original code saves the asset and puts the path in asset[1].
        // Here, we'll put the data itself in asset[1] to be zipped.
        if (module.assets && module.assets[i]) {
            module.assets[i][1] = decodedAssetData;
        }
        i++;
    }

    return module;
}

function createJsonSafeModule(module) {
    const moduleForJson = { ...module };
    delete moduleForJson.assets;
    return moduleForJson;
}


function createJsonSafeReplacer() {
    const seen = new WeakSet();

    return (key, value) => {
        if (value && typeof value === 'object') {
            if (seen.has(value)) {
                return undefined;
            }
            seen.add(value);
        }

        if (ArrayBuffer.isView(value)) {
            return undefined;
        }

        if (value instanceof ArrayBuffer) {
            return undefined;
        }

        if (Array.isArray(value) && value.length > 10000 && value.every((item) => typeof item === 'number')) {
            return undefined;
        }

        return value;
    };
}
