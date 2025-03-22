import fs from "node:fs";
import bencode from "bencode";
import dgram from "dgram"
import { URL } from "url";

import { connectionReq } from "./tracker.js";


const torrent = bencode.decode(fs.readFileSync('./torrents/puppy.torrent'));

// Convert Uint8Array to Buffer then String
const announceURL = Buffer.from(torrent.announce).toString()

console.log("Tracker URL", announceURL)
connectionReq(announceURL)
