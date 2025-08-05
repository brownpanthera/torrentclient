import fs from 'fs';
import bencode from 'bencode';

console.log('analyzing moana torrent structure...');

const torrentData = bencode.decode(fs.readFileSync('./torrents/lilo.torrent'));
const info = torrentData.info;

console.log('\ntorrent info:');
console.log(`piece length: ${info['piece length'].toLocaleString()} bytes`);
console.log(`total pieces: ${info.pieces.length / 20}`);

if (info.files) {
    console.log('\nfiles in this torrent:');
    console.log('='.repeat(80));
    
    let currentOffset = 0;
    const pieceLength = info['piece length'];
    
    info.files.forEach((file, index) => {
        const fileName = Buffer.from(file.path[0]).toString('utf8');
        const fileSize = file.length;
        
        const startPiece = Math.floor(currentOffset / pieceLength);
        const endPiece = Math.floor((currentOffset + fileSize - 1) / pieceLength);
        
        console.log(`\n${index + 1}. ${fileName}`);
        console.log(`   size: ${(fileSize / 1024 / 1024).toFixed(2)} mb`);
        console.log(`   pieces: ${startPiece} - ${endPiece}`);
        
        // Detect file type
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) {
            console.log(`   main video file!`);
        } else if (['srt', 'sub', 'vtt'].includes(ext)) {
            console.log(`   subtitle file`);
        } else if (['txt', 'nfo'].includes(ext)) {
            console.log(`   info file`);
        } else if (['jpg', 'png'].includes(ext)) {
            console.log(`   image file`);
        }
        
        currentOffset += fileSize;
    });
    
    // Find the main video file
    let mainVideo = null;
    currentOffset = 0;
    
    info.files.forEach((file, index) => {
        const fileName = Buffer.from(file.path[0]).toString('utf8');
        const fileSize = file.length;
        const ext = fileName.split('.').pop()?.toLowerCase();
        
        if (['mp4', 'mkv', 'avi', 'mov'].includes(ext) && fileSize > 100 * 1024 * 1024) { // > 100MB
            const startPiece = Math.floor(currentOffset / pieceLength);
            const endPiece = Math.floor((currentOffset + fileSize - 1) / pieceLength);
            
            mainVideo = {
                name: fileName,
                size: fileSize,
                startPiece,
                endPiece
            };
        }
        
        currentOffset += fileSize;
    });
    
    if (mainVideo) {
        console.log('\nmain video analysis:');
        console.log('='.repeat(50));
        console.log(`file: ${mainVideo.name}`);
        console.log(`size: ${(mainVideo.size / 1024 / 1024).toFixed(2)} mb`);
        console.log(`piece range: ${mainVideo.startPiece} - ${mainVideo.endPiece}`);
        console.log(`total pieces needed: ${mainVideo.endPiece - mainVideo.startPiece + 1}`);
        
        // Check what we already have
        let downloadedVideo = 0;
        if (fs.existsSync('pieces')) {
            for (let i = mainVideo.startPiece; i <= mainVideo.endPiece; i++) {
                if (fs.existsSync(`pieces/piece_${i}_complete.bin`)) {
                    downloadedVideo++;
                }
            }
        }
        
        console.log(`video pieces downloaded: ${downloadedVideo}/${mainVideo.endPiece - mainVideo.startPiece + 1}`);
        console.log(`video progress: ${(downloadedVideo / (mainVideo.endPiece - mainVideo.startPiece + 1) * 100).toFixed(1)}%`);
        
        if (downloadedVideo > 0) {
            console.log('\nto watch the video:');
            console.log(`   1. focus downloading pieces ${mainVideo.startPiece} - ${mainVideo.endPiece}`);
            console.log(`   2. once you have enough sequential pieces, assemble from piece ${mainVideo.startPiece}`);
            console.log(`   3. use: node assemble_video.js ${mainVideo.startPiece} ${mainVideo.endPiece}`);
        }
    }
    
} else {
    console.log('\nsingle file torrent');
    const fileName = Buffer.from(info.name).toString('utf8');
    console.log(`file: ${fileName}`);
    console.log(`size: ${(info.length / 1024 / 1024).toFixed(2)} mb`);
} 