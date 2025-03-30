import fs from "node:fs";
import bencode from "bencode";
import crypto from "crypto";

import { connectionReq } from "./tracker.js";

const torrent = bencode.decode(fs.readFileSync("./torrents/spiderman.torrent"));

// Convert Uint8Array to Buffer then String
// const decoder = new TextDecoder("utf-8")
// const announceURL = decoder.decode(torrent.announce);

// dithing the buffer
const announceURL = Buffer.from(torrent.announce).toString();

export const infoHash = (() => {
    const info = torrent.info;
    const bencodeInfo = bencode.encode(info);
    return crypto.createHash("sha1").update(bencodeInfo).digest(); // Buffer
  })();

export function torrentFileSize() {
    return torrent.info.files
      ? torrent.info.files.reduce((total, file) => total + file.length, 0)
      : torrent.info.length;
  }
// console.log("infoHash", infoHash.toString("hex")); // Print hex format

// console.dir(torrent)
connectionReq(announceURL);
