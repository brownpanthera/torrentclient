import fs from 'fs';
import path from 'path';
import { fileTorrentName } from './src/index.js';

console.log('pieces assemble!');

// Find pieces directory (either old format or new hash-based format)
let piecesDir = 'pieces';

// Look for pieces_HASH directories if 'pieces' doesn't exist
if (!fs.existsSync('pieces')) {
    const hashDirs = fs.readdirSync('.').filter(dir => dir.startsWith('pieces_'));
    
    if (hashDirs.length === 0) {
        console.log('no pieces directory found');
        console.log('looking for: pieces/ or pieces_HASH/');
        process.exit(1);
    } else if (hashDirs.length === 1) {
        piecesDir = hashDirs[0];
        console.log(`auto-detected pieces directory: ${piecesDir}`);
    } else {
        console.log('multiple torrents found:');
        hashDirs.forEach((dir, i) => console.log(`  ${i + 1}. ${dir}`));
        console.log('using the first one:', hashDirs[0]);
        piecesDir = hashDirs[0];
    }
} else {
    console.log('using default pieces directory');
}

// Get all files in pieces directory
const allFiles = fs.readdirSync(piecesDir);
console.log(`found ${allFiles.length} files in pieces directory`);

// Find all piece files (both formats)
const pieceFiles = allFiles
    .map(file => {
        // Match both formats: piece_X_complete.bin and piece_X_0.bin
        const match1 = file.match(/^piece_(\d+)_complete\.bin$/);
        const match2 = file.match(/^piece_(\d+)_0\.bin$/);
        
        if (match1) {
            return { index: parseInt(match1[1]), filename: file, format: 'complete' };
        } else if (match2) {
            return { index: parseInt(match2[1]), filename: file, format: 'numbered' };
        }
        return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

if (pieceFiles.length === 0) {
    console.log('no valid piece files found');
    console.log('looking for: piece_X_complete.bin or piece_X_0.bin');
    process.exit(1);
}

// Get piece sizes and determine format
const sampleFile = pieceFiles[0];
const sampleSize = fs.statSync(path.join(piecesDir, sampleFile.filename)).size;
const format = sampleFile.format;

console.log(`found ${pieceFiles.length} pieces in "${format}" format`);
console.log(`piece size: ${sampleSize} bytes (${(sampleSize/1024/1024).toFixed(2)} MB)`);

// Auto-detect total pieces based on size and format
let totalPieces;

if (sampleSize === 1929216) {
    totalPieces = 1025;
} else if (sampleSize === 1048576) {
    totalPieces = 1024;
    console.log('detected: 1mb piece torrent');
} else {
    // Auto-detect from highest piece number
    totalPieces = Math.max(...pieceFiles.map(p => p.index)) + 1;
    console.log(`auto-detected: ${totalPieces} total pieces`);
}

// Use actual torrent name from torrent file
const torrentName = fileTorrentName.replace(/[<>:"/\\|?*]/g, '_'); // sanitize filename

// Add piece sizes to the array
pieceFiles.forEach(piece => {
    piece.size = fs.statSync(path.join(piecesDir, piece.filename)).size;
});

console.log(`range: piece ${pieceFiles[0]?.index} to ${pieceFiles[pieceFiles.length-1]?.index}`);

const downloadedPieces = new Set(pieceFiles.map(p => p.index));

// Find missing pieces
const missingPieces = [];
for (let i = 0; i < totalPieces; i++) {
    if (!downloadedPieces.has(i)) {
        missingPieces.push(i);
    }
}

const completeness = (pieceFiles.length / totalPieces * 100).toFixed(1);
console.log(`downloaded: ${pieceFiles.length}/${totalPieces} pieces (${completeness}%)`);

if (missingPieces.length > 0) {
    console.log(`missing: ${missingPieces.length} pieces`);
    if (missingPieces.length <= 10) {
        console.log(`missing: ${missingPieces.join(', ')}`);
    }
}

// Create output filename
const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
const outputFile = `${torrentName}_${completeness}%_${timestamp}.mp4`;

console.log(`\ncreating: ${outputFile}`);

// Assemble video with error handling
const writeStream = fs.createWriteStream(outputFile);
let totalBytesWritten = 0;

// Add error handler to prevent crash
writeStream.on('error', (err) => {
    console.log(`write error: ${err.message}`);
    console.log(`partial file may still be usable`);
    process.exit(1);
});

for (let pieceIndex = 0; pieceIndex < totalPieces; pieceIndex++) {
    if (downloadedPieces.has(pieceIndex)) {
        // We have this piece
        const pieceFile = pieceFiles.find(p => p.index === pieceIndex);
        const pieceData = fs.readFileSync(path.join(piecesDir, pieceFile.filename));
        
        // Handle variable piece sizes gracefully
        if (pieceData.length !== sampleSize && pieceIndex !== totalPieces - 1) {
            console.log(`Piece ${pieceIndex}: expected ${sampleSize}, got ${pieceData.length} bytes`);
        }
        
        writeStream.write(pieceData);
        totalBytesWritten += pieceData.length;
        
        if (pieceIndex % 100 === 0 || pieceIndex < 10) {
            console.log(`added piece ${pieceIndex}`);
        }
    } else {
        // Missing piece - calculate correct size
        let actualPieceSize = sampleSize;
        if (sampleSize === 1929216 && pieceIndex === totalPieces - 1) {
            actualPieceSize = 1560066; // Moana last piece
        }
        
        // Fill with zeros or pattern based on position
        let fillData;
        if (pieceIndex < 50) {
            // Critical early pieces - try to use nearby data
            if (pieceIndex > 0 && downloadedPieces.has(pieceIndex - 1)) {
                const prevPiece = pieceFiles.find(p => p.index === pieceIndex - 1);
                const prevData = fs.readFileSync(path.join(piecesDir, prevPiece.filename));
                fillData = Buffer.concat([
                    prevData.slice(0, actualPieceSize / 2),
                    prevData.slice(0, actualPieceSize / 2)
                ]).slice(0, actualPieceSize);
            } else {
                fillData = Buffer.alloc(actualPieceSize, 0);
            }
        } else {
            // Later pieces - simple pattern
            fillData = Buffer.alloc(actualPieceSize);
            for (let i = 0; i < actualPieceSize; i++) {
                fillData[i] = i % 255;
            }
        }
        
        writeStream.write(fillData);
        totalBytesWritten += fillData.length;
        
        if (missingPieces.length <= 10) {
            console.log(`filled missing piece ${pieceIndex}`);
        }
    }
}

writeStream.end();

console.log(`file: ${outputFile}`);
console.log(`size: ${(totalBytesWritten / 1024 / 1024).toFixed(2)} MB`);
console.log(`completeness: ${completeness}%`);

if (parseFloat(completeness) > 90) {
    console.log(`should be playable`);
} else {
    console.log(`low completeness (${completeness}%). video may not play well.`);
}
