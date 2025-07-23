import dgram, { Socket } from "dgram";
import crypto from "crypto";
import { URL } from "url";
import { infoHash, torrentFileSize } from "./index.js";
import net from "net";
import { getTotalPiece } from "./index.js";

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

export function connectionReq(announceURL) {
  const randomNumber = crypto.randomBytes(4).readUInt32BE();
  const buff = Buffer.alloc(16);
  buff.writeUInt32BE(0x417, 0); // magic constant of 4bytes
  buff.writeUint32BE(0x27101980, 4); // another magic constant of 4bytes
  buff.writeUInt32BE(0, 8); // action ID
  buff.writeUInt32BE(randomNumber, 12); // random transaction ID

  const url = new URL(announceURL);

  // sendin udp req to tracker
  const socket = dgram.createSocket("udp4");
  socket.send(buff, 0, buff.length, url.port, url.hostname, () => {
    console.log(`sent connection req to ${url.hostname}, ${url.port}`);
  });

  // console.log("sending buffer", buff.toString("hex"));

  socket.on("error", (err) => {
    console.err("socet error ", err);
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
  requestBuff.writeUint32BE(2, 80);
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
    const socket = net.connect({ host: ip, port: port }, () => {
      console.log(`Connected to peer: ${ip}:${port}`);

      // Send the handshake after connection is established
      const handshake = handShakeBuffer();
      socket.write(handshake);
    });

    socket.on("error", (err) => {
      console.error(`Failed to connect to ${ip}:${port} -- ${err.message}`);
      socket.destroy();
    });

    socket.on("data", (data) => {
      if (data.length <= 68) return console.log("incomplete handshake  ");

      const pstrlen = data.readUInt8(0);
      const pstr = data.toString("ascii", 1, 20);
      const recievedInfoHash = data.subarray(28, 48);
      console.log(data.subarray(48, 68).toString("hex"), "peeeer IIIDD");

      if (
        pstrlen === 19 &&
        pstr === "BitTorrent protocol" &&
        recievedInfoHash.equals(infoHash)
      ) {
        console.log("Handshake correct", socket.remoteAddress);
      } else {
        console.log("Invalid Handshake, closing socket");
        // not destryoig right now cause there is bitfield hehe
      }

      // after 68 byte
      const payload = data.subarray(68); // no need to use buffer.from cause subarry will return buffer with ref to same mem loc. slice?
      console.log(payload.length, "paylod");

      const length = payload.readUInt32BE(0); // might be 4byte length prefix
      console.log(length, "lllllll"); //if not 0 then good, we are getting more things
      const msgID = payload.readUInt8(4); // 1byte message id
      const msgPayload = payload.subarray(5, 4 + length);

      console.log(msgPayload, "msssgglLLoad");
      console.log(msgPayload.length, "msgPayload Length");

      console.log(msgID, "msssg idd");

      const tp = getTotalPiece() / 20;
      console.log(tp, "here my total piece divided by 20");
      // console.log(Math.ceil(msgPayload.length / 8), "lets see what it got")

      const totalPieces = getTotalPiece();

      if (msgID === 5) {
        for (let i = 0; i < msgPayload.length; i++) {
          const byte = msgPayload[i];
          for (let j = 0; j < 8; j++) {
            const bitIndex = i * 8 + j;
            if (bitIndex >= totalPieces) break; // stop if beyond total pieces
            const hasPiece = (byte >> (7 - j)) & 1;
            if (hasPiece) {
              console.log(`peer has piece ${bitIndex}`);
            }
          }
        }
      }
        
    

      // const requestMsg = createRequest(51, 0, 16384); // request 16KB of piece 51
      // socket.write(requestMsg);

      // const bufferTo8BitInt = Uint32Array.from(bitfield)
      // console.log(bufferTo8BitInt)
      // console.log(bufferTo8BitInt, "there there")

      // for(let i = 0; i < bitfield.length; i++){
      //   const byte = bitfield[i];
      // }
    });
  }
}

connectToPeers();
