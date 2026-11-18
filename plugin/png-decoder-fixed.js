// PNG Decoder using RisuAI's exact implementation
class RisuAIPngReader {
    // Exact implementation from RisuAI's pngChunk.ts
    static read(data, chunkName = ['chara', 'ccv3'], arg = {}) {
        console.log('Starting RisuAI PNG chunk reading...');
        console.log('Input data length:', data.length);
        console.log('Target chunks:', chunkName);
        
        let pos = 8; // Skip PNG signature
        let chunks = {};
        let chunkCount = 0;
        
        while (pos < data.length) {
            if (pos + 12 > data.length) {
                console.log('Reached end of data at position', pos);
                break;
            }
            
            // Read length (RisuAI style)
            const len = data[pos] * 0x1000000 + data[pos+1] * 0x10000 + data[pos+2] * 0x100 + data[pos+3];
            
            // Read type
            const type = data.slice(pos+4, pos+8);
            const typeString = new TextDecoder().decode(type);
            
            console.log(`Chunk ${chunkCount}: type="${typeString}", length=${len}, position=${pos}`);
            chunkCount++;
            
            if (arg.checkCrc) {
                const crc = data[pos+8+len] * 0x1000000 + data[pos+9+len] * 0x10000 + data[pos+10+len] * 0x100 + data[pos+11+len];
                // Note: CRC check implementation would need crc32 function
            }
            
            if (typeString === 'IEND') {
                console.log('Found IEND chunk - end of PNG');
                break;
            }
            
            if (typeString === 'tEXt') {
                const chunkData = data.slice(pos+8, pos+8+len);
                console.log('Processing tEXt chunk, data length:', chunkData.length);
                
                let key = '';
                let value = '';
                
                // RisuAI implementation: look for null separator in first 70 bytes
                for (let i = 0; i < 70; i++) {
                    if (i >= chunkData.length) break;
                    if (chunkData[i] === 0) {
                        key = new TextDecoder().decode(chunkData.slice(0, i));
                        value = new TextDecoder().decode(chunkData.slice(i + 1));
                        break;
                    }
                }
                
                console.log(`Found tEXt chunk: key="${key}", value length=${value.length}`);
                
                if (chunkName.includes(key)) {
                    chunks[key] = value;
                    console.log(`Stored chunk "${key}"`);
                }
            }
            
            pos += 12 + len; // Move to next chunk
        }
        
        console.log(`Total chunks processed: ${chunkCount}`);
        console.log('Found target chunks:', Object.keys(chunks));
        return chunks;
    }
}

// PNG file processor
class PngProcessor {
    constructor(arrayBuffer, fileName) {
        this.buffer = new Uint8Array(arrayBuffer);
        this.fileName = fileName;
    }

    async process() {
        console.log(`Processing file: ${this.fileName}`);
        console.log(`File size: ${this.buffer.length} bytes`);
        
        // Verify PNG signature
        const signature = Array.from(this.buffer.slice(0, 8));
        const expectedSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (!signature.every((byte, i) => byte === expectedSignature[i])) {
            throw new Error('Not a valid PNG file');
        }
        
        console.log('PNG signature verified');
        
        // Use RisuAI's exact implementation
        const chunks = RisuAIPngReader.read(this.buffer, ['chara', 'ccv3']);
        
        const result = {
            fileName: this.fileName,
            fileSize: this.buffer.length,
            chunks: chunks,
            parsedData: {}
        };
        
        // Parse found chunks
        for (const [key, value] of Object.entries(chunks)) {
            console.log(`Parsing chunk: ${key}, value length: ${value.length}`);
            
            try {
                // Character card data is base64 encoded JSON
                const decoded = atob(value);
                const parsed = JSON.parse(decoded);
                result.parsedData[key] = parsed;
                
                console.log(`Successfully parsed ${key}:`, {
                    spec: parsed.spec || 'unknown',
                    spec_version: parsed.spec_version || 'unknown',
                    data_name: parsed.data?.name || 'unknown',
                    character_book_entries: parsed.data?.character_book?.entries?.length || 0
                });
                
            } catch (e) {
                console.error(`Failed to parse chunk ${key}:`, e);
                result.parsedData[key] = { error: e.message, rawValue: value.substring(0, 100) + '...' };
            }
        }
        
        return result;
    }
}

// Global storage for results
let globalResults = [];

// JSON download functions
function downloadJSON(fileName, chunkKey, type) {
    const result = globalResults.find(r => r.fileName === fileName);
    if (!result || !result.parsedData[chunkKey]) {
        alert('Data not found');
        return;
    }
    
    const data = result.parsedData[chunkKey];
    const characterName = data.data?.name || 'character';
    const safeFileName = characterName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    
    let downloadData;
    let filename;
    
    switch (type) {
        case 'full':
            downloadData = data;
            filename = `${safeFileName}_full.json`;
            break;
        case 'data':
            downloadData = data.data;
            filename = `${safeFileName}_data.json`;
            break;
        case 'lorebook':
            downloadData = data.data?.character_book;
            filename = `${safeFileName}_lorebook.json`;
            break;
        default:
            downloadData = data;
            filename = `${safeFileName}.json`;
    }
    
    if (!downloadData) {
        alert('No data available for download');
        return;
    }
    
    const jsonString = JSON.stringify(downloadData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`Downloaded ${filename} (${jsonString.length} characters)`);
}

async function processFiles() {
    const fileInput = document.getElementById('file-input');
    const resultsDiv = document.getElementById('results');
    
    if (!fileInput.files.length) {
        resultsDiv.innerHTML = '<p>Please select PNG files first.</p>';
        return;
    }
    
    resultsDiv.innerHTML = '<p>Processing files...</p>';
    
    const results = [];
    globalResults = []; // Reset global storage
    
    for (const file of fileInput.files) {
        console.log(`\n=== Processing ${file.name} ===`);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const processor = new PngProcessor(arrayBuffer, file.name);
            const result = await processor.process();
            results.push(result);
            globalResults.push(result); // Store for download functions
            
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            results.push({
                fileName: file.name,
                error: error.message
            });
        }
    }
    
    // Display results
    let html = '<h3>Analysis Results</h3>';
    
    for (const result of results) {
        html += `<div class="result-item">`;
        html += `<h4>${result.fileName}</h4>`;
        
        if (result.error) {
            html += `<p class="error">Error: ${result.error}</p>`;
        } else {
            html += `<p>File size: ${result.fileSize.toLocaleString()} bytes</p>`;
            
            const chunkKeys = Object.keys(result.chunks);
            if (chunkKeys.length === 0) {
                html += `<p class="error">No character card data found in ${result.fileName}. This might not be a RisuAI character card PNG file.</p>`;
            } else {
                html += `<p>Found chunks: ${chunkKeys.join(', ')}</p>`;
                
                for (const [key, data] of Object.entries(result.parsedData)) {
                    html += `<div class="chunk-info">`;
                    html += `<h5>Chunk: ${key}</h5>`;
                    
                    if (data.error) {
                        html += `<p class="error">Parse error: ${data.error}</p>`;
                        html += `<p>Raw data preview: ${data.rawValue}</p>`;
                    } else {
                        html += `<p>Spec: ${data.spec || 'unknown'} v${data.spec_version || 'unknown'}</p>`;
                        html += `<p>Character: ${data.data?.name || 'unknown'}</p>`;
                        html += `<p>Description length: ${data.data?.description?.length || 0}</p>`;
                        html += `<p>First message length: ${data.data?.first_mes?.length || 0}</p>`;
                        
                        // Add download buttons
                        const characterName = data.data?.name || 'character';
                        const safeFileName = characterName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
                        html += `<div class="download-buttons">`;
                        html += `<button onclick="downloadJSON('${result.fileName}', '${key}', 'full')" class="download-btn">Download Full JSON</button>`;
                        html += `<button onclick="downloadJSON('${result.fileName}', '${key}', 'data')" class="download-btn">Download Character Data Only</button>`;
                        html += `</div>`;
                        
                        const lorebook = data.data?.character_book;
                        if (lorebook) {
                            html += `<p>Lorebook entries: ${lorebook.entries?.length || 0}</p>`;
                            if (lorebook.entries?.length > 0) {
                                html += `<button onclick="downloadJSON('${result.fileName}', '${key}', 'lorebook')" class="download-btn">Download Lorebook Only</button>`;
                                html += `<ul>`;
                                for (let i = 0; i < Math.min(3, lorebook.entries.length); i++) {
                                    const entry = lorebook.entries[i];
                                    html += `<li>${entry.keys?.join(', ') || 'No keys'}: ${(entry.content || '').substring(0, 100)}...</li>`;
                                }
                                if (lorebook.entries.length > 3) {
                                    html += `<li>... and ${lorebook.entries.length - 3} more entries</li>`;
                                }
                                html += `</ul>`;
                            }
                        }
                    }
                    html += `</div>`;
                }
            }
        }
        html += `</div>`;
    }
    
    // Debug info
    html += `<div class="debug-info">`;
    html += `<h4>Debug Information</h4>`;
    html += `<p>Check browser console (F12) for detailed chunk reading logs.</p>`;
    html += `<p>Total files processed: ${results.length}</p>`;
    html += `</div>`;
    
    resultsDiv.innerHTML = html;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('PNG Decoder initialized with RisuAI implementation');
    document.getElementById('process-btn').addEventListener('click', processFiles);
});
