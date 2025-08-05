import fs from 'fs';
import bencode from 'bencode';

console.log('analyzing torrent file structure...');

// Load and decode the torrent file
const torrentData = bencode.decode(fs.readFileSync('./torrents/spiderman.torrent'));
const info = torrentData.info;

console.log('torrent info:');
console.log(`name: ${info.name.toString()}`);
console.log(`piece length: ${info['piece length']} bytes`);
console.log(`total pieces: ${info.pieces.length / 20}`);

// Check if it's single or multi-file torrent
if (info.files) {
    console.log('\nmulti-file torrent detected!');
    console.log(`number of files: ${info.files.length}`);
    
    let currentOffset = 0;
    const pieceLength = info['piece length'];
    
    console.log('\nfile structure and piece mapping:');
    console.log('=' * 80);
    
    info.files.forEach((file, index) => {
        const fileName = file.path.join('/');
        const fileSize = file.length;
        
        // Calculate piece ranges for this file
        const startPiece = Math.floor(currentOffset / pieceLength);
        const endOffset = currentOffset + fileSize - 1;
        const endPiece = Math.floor(endOffset / pieceLength);
        
        const startOffsetInPiece = currentOffset % pieceLength;
        const endOffsetInPiece = endOffset % pieceLength;
        
        console.log(`\n${index + 1}. ${fileName}`);
        console.log(`   size: ${fileSize.toLocaleString()} bytes (${(fileSize / 1024 / 1024).toFixed(2)} mb)`);
        console.log(`   pieces: ${startPiece} to ${endPiece} (${endPiece - startPiece + 1} pieces)`);
        console.log(`   byte range: ${currentOffset.toLocaleString()} - ${endOffset.toLocaleString()}`);
        
        if (startPiece === endPiece) {
            console.log(`   within piece ${startPiece}: bytes ${startOffsetInPiece} - ${endOffsetInPiece}`);
        } else {
            console.log(`   start: piece ${startPiece} at byte ${startOffsetInPiece}`);
            console.log(`   end: piece ${endPiece} at byte ${endOffsetInPiece}`);
        }
        
        // Identify likely video files
        const ext = fileName.split('.').pop().toLowerCase();
        if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'm4v'].includes(ext)) {
            console.log(`   video file detected! download pieces ${startPiece}-${endPiece}`);
        } else if (['srt', 'sub', 'idx', 'ass'].includes(ext)) {
            console.log(`   subtitle file`);
        } else if (['txt', 'nfo', 'md'].includes(ext)) {
            console.log(`   text/info file`);
        }
        
        currentOffset += fileSize;
    });
    
    console.log('\nsummary:');
    console.log('=' * 50);
    
    // Find the largest video file
    let largestVideo = null;
    let largestSize = 0;
    currentOffset = 0;
    
    info.files.forEach((file, index) => {
        const fileName = file.path.join('/');
        const fileSize = file.length;
        const ext = fileName.split('.').pop().toLowerCase();
        
        if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'm4v'].includes(ext) && fileSize > largestSize) {
            const startPiece = Math.floor(currentOffset / pieceLength);
            const endPiece = Math.floor((currentOffset + fileSize - 1) / pieceLength);
            
            largestVideo = {
                name: fileName,
                size: fileSize,
                startPiece,
                endPiece,
                index: index + 1
            };
            largestSize = fileSize;
        }
        
        currentOffset += fileSize;
    });
    
    if (largestVideo) {
        console.log(`main video: ${largestVideo.name}`);
        console.log(`size: ${(largestVideo.size / 1024 / 1024).toFixed(2)} mb`);
        console.log(`target pieces: ${largestVideo.startPiece} - ${largestVideo.endPiece}`);
        console.log(`progress needed: ${largestVideo.endPiece - largestVideo.startPiece + 1} pieces`);
        
        // Check what we have
        const piecesNeeded = [];
        for (let i = largestVideo.startPiece; i <= largestVideo.endPiece; i++) {
            piecesNeeded.push(i);
        }
        
        // Check downloaded pieces
        let downloadedCount = 0;
        if (fs.existsSync('pieces')) {
            for (let i = largestVideo.startPiece; i <= largestVideo.endPiece; i++) {
                if (fs.existsSync(`pieces/piece_${i}_complete.bin`)) {
                    downloadedCount++;
                }
            }
        }
        
        console.log(`downloaded: ${downloadedCount}/${piecesNeeded.length} pieces for main video`);
        console.log(`video progress: ${(downloadedCount / piecesNeeded.length * 100).toFixed(1)}%`);
    }
    
} else {
    console.log('\nsingle-file torrent');
    console.log(`file: ${info.name.toString()}`);
    console.log(`size: ${info.length.toLocaleString()} bytes`);
    console.log(`total pieces: ${Math.ceil(info.length / info['piece length'])}`);
} 