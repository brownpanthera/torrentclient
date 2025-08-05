import dgram, { Socket } from "dgram";
import crypto from "crypto";
import { URL } from "url";
import { infoHash, torrentFileSize, torrent } from "./index.js";
import net from "net";
import { getTotalPiece } from "./index.js";
import fs from "fs";

// global peerID to use across functions
export const peerID = crypto.randomBytes(20);

// why even im doing that?
function validateResponse(condition, errorMessage) {
  if (!condition) {
    console.error(errorMessage);
    process.exit(1);
  }
}

function createRequest(pieceIndex, begin, length) {
  const buffer = Buffer.alloc(17);
  buffer.writeUInt32BE(13, 0); // length prefix
  buffer.writeUInt8(6, 4); // message ID for 'request'
  buffer.writeUInt32BE(pieceIndex, 5); // piece index
  buffer.writeUInt32BE(begin, 9); // begin offset
  buffer.writeUInt32BE(length, 13); // length of block
  return buffer;
}

function createInterestedMessage() {
  const buffer = Buffer.alloc(5);
  buffer.writeUInt32BE(1, 0); // length: 1 byte for message ID
  buffer.writeUInt8(2, 4);    // message ID: 2 = interested
  return buffer;
}

export function connectionReq(announceURL) {
  const randomNumber = crypto.randomBytes(4).readUInt32BE();
  const buff = Buffer.alloc(16);
  buff.writeUInt32BE(0x417, 0); // magic constant of 4bytes
  buff.writeUint32BE(0x27101980, 4); // another magic constant of 4bytes
  buff.writeUInt32BE(0, 8); // action ID
  buff.writeUInt32BE(randomNumber, 12); // random transaction ID

  // Clean URL and validate
  const cleanURL = announceURL.replace(/[^\x20-\x7E]/g, ''); // Remove non-printable chars
  console.log(`tracker url: ${cleanURL}`);
  
  let url;
  try {
    url = new URL(cleanURL);
  } catch (err) {
    console.error(`invalid tracker url: ${cleanURL}`);
    console.error(`   error: ${err.message}`);
    return;
  }
  
  // Validate UDP tracker
  if (url.protocol !== 'udp:') {
    console.error(`only udp trackers supported got: ${url.protocol}`);
    return;
  }
  
  // Default port for UDP trackers
  const port = url.port || 80;
  console.log(`connecting to tracker: ${url.hostname}:${port}`);

  // sendin udp req to tracker
  const socket = dgram.createSocket("udp4");
  socket.send(buff, 0, buff.length, port, url.hostname, () => {
    console.log(`sent connection request to ${url.hostname}:${port}`);
  });

  // console.log("sending buffer", buff.toString("hex"));

  socket.on("error", (err) => {
    console.error(`tracker connection error: ${err.message}`);
    socket.close();
  });

  // extracting the res which is same as req
  socket.on("message", (msg, rinfo) => {
    console.log(rinfo);
    const actionID = msg.readUInt32BE(0);
    const transactionID = msg.readUInt32BE(4);
    const connectionID = msg.readBigUInt64BE(8);

    console.log(msg.length);

    validateResponse(
      !(msg.length < 16),
      "Error: Packet size is smaller than expected."
    );
    validateResponse(
      transactionID === randomNumber,
      "Error: Transaction ID does not match the one that was generated."
    );
    validateResponse(
      actionID === 0,
      "Unexpected Action ID, expected a connection response."
    );

    console.table({ actionID, transactionID, connectionID });

    console.log("infoHash babe", infoHash);
    console.log(torrentFileSize());
    socket.close();

    announceReq(announceURL, connectionID);
  });
}

export function announceReq(announceURL, connectionID) {
  const announceTransactionID = crypto.randomBytes(4).readUInt32BE();
  const requestBuff = Buffer.alloc(98);

  requestBuff.writeBigUInt64BE(BigInt(connectionID), 0);
  requestBuff.writeUInt32BE(1, 8);
  requestBuff.writeUInt32BE(announceTransactionID, 12);
  infoHash.copy(requestBuff, 16, 0, 20);
  peerID.copy(requestBuff, 36, 0, 20);
  requestBuff.writeBigUInt64BE(BigInt(0), 56);
  requestBuff.writeBigUInt64BE(BigInt(torrentFileSize()), 64);
  requestBuff.writeBigUInt64BE(BigInt(0), 48);
  requestBuff.writeUInt32BE(2, 80);
  requestBuff.writeUInt32BE(0, 84);
  requestBuff.writeUInt32BE(crypto.randomInt(0, 2 ** 32), 88);
  requestBuff.writeInt32BE(-1, 92);
  requestBuff.writeUInt16BE(6881, 96);

  const client = dgram.createSocket("udp4");
  const { hostname, port } = new URL(announceURL);

  client.send(requestBuff, 0, requestBuff.length, port, hostname, (err) => {
    if (err) console.error("Error sending req", err);
    else console.log("Announce Req send");
  });

  client.on("message", (msg, rinfo) => {
    const actionID = msg.readUInt32BE(0);
    const transactionID = msg.readUInt32BE(4);
    const interval = msg.readUInt32BE(8);
    const leechers = msg.readUInt32BE(12);
    const seeders = msg.readUInt32BE(16);

    if (actionID !== 1) {
      console.error("unexpected action ID, expected announce res");
      return;
    }

    console.log(msg.length);
    const peers = parsePeers(msg);
    console.log("Found peers:", peers);
    connectToPeers(peers);
  });
}

export function parsePeers(msg) {
  let listofPeers = [];
  for (let i = 20; i < msg.length; i += 6) {
    const ipofpeers = msg.readUInt32BE(i);
    const portofpeers = msg.readUInt16BE(i + 4);

    const ip = [
      (ipofpeers >> 24) & 0xff,
      (ipofpeers >> 16) & 0xff,
      (ipofpeers >> 8) & 0xff,
      ipofpeers & 0xff,
    ].join(".");
    listofPeers.push({ ip: ip, port: portofpeers });
  }
  return listofPeers;
}

function connectToPeers(listofPeers) {
  if (!listofPeers || listofPeers.length === 0) {
    console.log("No peers to connect to");
    return;
  } else {
    console.log(`Attempting to connect to ${listofPeers.length} peers...`);
  }

  // Create torrent-specific pieces directory
  const torrentHash = infoHash.toString('hex').slice(0, 8);
  const piecesDir = `pieces`;
  
  if (!fs.existsSync(piecesDir)) {
    fs.mkdirSync(piecesDir);
    console.log(`created pieces directory: ${piecesDir}`);
  } else {
    console.log(`using existing pieces directory: ${piecesDir}`);
  }

  // Global download tracking
  const peerState = new Map();
  const downloadedPieces = new Set();
  const pieceProgress = new Map(); // Track partial piece downloads
  const totalPieces = getTotalPiece();
  let cnt = 0;

  function getPieceSize(pieceIndex) {
    const totalSize = torrentFileSize();
    const pieceLength = torrent.info['piece length'];
    
    if (pieceIndex === totalPieces - 1) {
      // Last piece might be smaller
      return totalSize - (pieceIndex * pieceLength);
    }
    return pieceLength;
  }

  // Handshake Buffer
  function handShakeBuffer() {
    const buffer = Buffer.alloc(68);

    //  pstrlen
    buffer.writeUInt8(19, 0); // 1 byte

    // pstr ("BitTorrent protocol")
    buffer.write("BitTorrent protocol", 1, "ascii"); // 19 bytes

    // reserved (8 bytes of 0)
    buffer.fill(0, 20, 28); // 8 bytes

    // infoHash (20 bytes)
    infoHash.copy(buffer, 28); // from offset 28 to 48

    // peerId (20 bytes)
    peerID.copy(buffer, 48); // from offset 48 to 68

    return buffer;
  }

  // making a req through socket
  for (const { ip, port } of listofPeers) {
    let messageBuffer = Buffer.alloc(0);
    let handshakeComplete = false;
    let peerKey = `${ip}:${port}`;
    
    const socket = net.connect({ host: ip, port: port }, () => {
      console.log(`connected to peer: ${ip}:${port}`);

      // Send the handshake after connection is established
      const handshake = handShakeBuffer();
      socket.write(handshake);
    });

    socket.on("error", (err) => {
      console.error(`failed to connect to ${ip}:${port} -- ${err.message}`);
      socket.destroy();
    });

    socket.on("data", (data) => {
      // Accumulate data in buffer for proper TCP stream handling
      messageBuffer = Buffer.concat([messageBuffer, data]);
      
      // Handle handshake first
      if (!handshakeComplete) {
        if (messageBuffer.length < 68) return;

        const pstrlen = messageBuffer.readUInt8(0);
        const pstr = messageBuffer.toString("ascii", 1, 20);
        const receivedInfoHash = messageBuffer.subarray(28, 48);

        if (pstrlen === 19 && pstr === "BitTorrent protocol" && receivedInfoHash.equals(infoHash)) {
          console.log(`handshake successful with ${peerKey}`);
          handshakeComplete = true;
          messageBuffer = messageBuffer.subarray(68); // Remove handshake from buffer
        } else {
          console.log(`invalid handshake from ${peerKey}`);
          socket.destroy();
          return;
        }
      }

      while (messageBuffer.length >= 4) {
        const length = messageBuffer.readUInt32BE(0);
        
        // kee alive message
        if (length === 0) {
          messageBuffer = messageBuffer.subarray(4);
          continue;
        }
        
        // check if we have the complete message
        if (messageBuffer.length < 4 + length) {
          break; 
        }

        const msgID = messageBuffer.readUInt8(4);
        const msgPayload = messageBuffer.subarray(5, 4 + length);

        if (msgID === 5) { // bifield
          console.log(`bitfield from ${peerKey}`);
          const availablePieces = new Set();
          for (let i = 0; i < msgPayload.length; i++) {
            const byte = msgPayload[i];
            for (let j = 0; j < 8; j++) {
              const bitIndex = i * 8 + j;
              if (bitIndex >= totalPieces) break;
              const hasPiece = (byte >> (7 - j)) & 1;
              if (hasPiece) {
                availablePieces.add(bitIndex);
              }
            }
          }
          
          // Store peer state 
          peerState.set(peerKey, { 
            availablePieces, 
            socket, 
            choked: true,
            interested: false,
            downloading: undefined
          });
          
          console.log(`${peerKey}: ${availablePieces.size}/${totalPieces} pieces`);
          
          // send interested message
          const interestedMsg = createInterestedMessage();
          socket.write(interestedMsg);
          peerState.get(peerKey).interested = true;
          cnt++;
          console.log(`sent interested to ${peerKey} (${cnt} total peers)`);
          
        } else if (msgID === 1) { // UNCHOKE
          console.log(`unchoke from ${peerKey} - can download`);
          
          const peer = peerState.get(peerKey);
          if (peer) {
            peer.choked = false;
            requestNextPiece(peer, peerKey);
          }
          
        } else if (msgID === 0) { // CHOKE
          console.log(`choke from ${peerKey}`);
          const peer = peerState.get(peerKey);
          if (peer) peer.choked = true;
          
        } else if (msgID === 2) { // INTERESTED
          console.log(`peer ${peerKey} is interested`);
          
        } else if (msgID === 3) { // NOT INTERESTED
          console.log(`peer ${peerKey} is not interested`);
          
        } else if (msgID === 7) { // PIECE
          const pieceIndex = msgPayload.readUInt32BE(0);
          const begin = msgPayload.readUInt32BE(4);
          const blockData = msgPayload.subarray(8);
          
          // track piece progress
          if (!pieceProgress.has(pieceIndex)) {
            const pieceSize = getPieceSize(pieceIndex);
            pieceProgress.set(pieceIndex, {
              size: pieceSize,
              downloaded: 0,
              blocks: new Map()
            });
          }
          
          const progress = pieceProgress.get(pieceIndex);
          progress.blocks.set(begin, blockData);
          progress.downloaded += blockData.length;
          
                    console.log(`piece ${pieceIndex}: ${progress.downloaded}/${progress.size} bytes (${Math.round(progress.downloaded/progress.size*100)}%)`);
          
          // Check if piece is complete
          if (progress.downloaded >= progress.size) {
            console.log(`piece ${pieceIndex} completed - assembling...`);
            
            // Assemble complete piece
            const completeData = Buffer.alloc(progress.size);
            for (const [blockOffset, block] of progress.blocks) {
              block.copy(completeData, blockOffset);
            }
            
            fs.writeFileSync(`${piecesDir}/piece_${pieceIndex}_complete.bin`, completeData);
            downloadedPieces.add(pieceIndex);
            pieceProgress.delete(pieceIndex);
            
            console.log(`saved piece ${pieceIndex} (${downloadedPieces.size}/${totalPieces} total)`);
            
            // Clear downloading flag for all peers
            for (const [key, peerData] of peerState.entries()) {
              if (peerData.downloading === pieceIndex) {
                peerData.downloading = undefined;
              }
            }
          }
          
          // Request next piece
          const peer = peerState.get(peerKey);
          if (peer && !peer.choked) {
            requestNextPiece(peer, peerKey);
          }
          
        } else {
          console.log(`unknown message ${msgID} from ${peerKey}`);
        }

        // Remove processed message from buffer
        messageBuffer = messageBuffer.subarray(4 + length);
      }
        });

    socket.on('close', () => {
      console.log(`connection closed with ${peerKey}`);
      peerState.delete(peerKey);
    });
  }

  function requestNextPiece(peer, peerKey) {
    if (!peer.availablePieces || peer.choked) return;
    
    // Don't request if peer is already downloading something
    if (peer.downloading !== undefined) return;
    
    // Find a piece we need that this peer has
    let targetPiece = null;
    for (const pieceIndex of peer.availablePieces) {
      if (!downloadedPieces.has(pieceIndex) && !pieceProgress.has(pieceIndex)) {
        targetPiece = pieceIndex;
        break;
      }
    }
    
    if (targetPiece === null) {
      console.log(`no more pieces from ${peerKey} (${downloadedPieces.size}/${totalPieces} complete)`);
      return;
    }
    
    // Mark peer as downloading this piece
    peer.downloading = targetPiece;
    
    console.log(`requesting piece ${targetPiece} from ${peerKey}`);
    
    // Request piece in 16KB blocks
    const pieceSize = getPieceSize(targetPiece);
    const BLOCK_SIZE = 16384;
    
    for (let offset = 0; offset < pieceSize; offset += BLOCK_SIZE) {
      const blockSize = Math.min(BLOCK_SIZE, pieceSize - offset);
      const requestMsg = createRequest(targetPiece, offset, blockSize);
      peer.socket.write(requestMsg);
    }
    
    console.log(`requested ${Math.ceil(pieceSize / BLOCK_SIZE)} blocks for piece ${targetPiece}`);
  }
}