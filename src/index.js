import fs from "node:fs";
import bencode from "bencode";
import crypto from "crypto";

import { connectionReq } from "./tracker.js";

const torrent = bencode.decode(fs.readFileSync("./torrents/moana.torrent"));
export { torrent };

// calculating how many pieces i need to download
export function getTotalPiece() {
  let total_size;

  if (torrent.info.files) {
    total_size = torrent.info.files.reduce((acc, file) => acc + file.length, 0);
  } else {
    total_size = torrent.info.length;
  }

  const number_of_pieces = Math.ceil(total_size / torrent.info["piece length"]);
  console.log(number_of_pieces, "number of pieces")
  return number_of_pieces;
}


console.dir(torrent, null, 2);

// Convert Uint8Array to Buffer then String
// const decoder = new TextDecoder("utf-8")
// const announceURL = decoder.decode(torrent.announce);

// dithing the buffer
export const announceURL = Buffer.from(torrent.announce).toString();
console.log(announceURL);

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
