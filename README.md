# Torrent Client

**This is an incomplete project i'm working on. the code is sloppy right now and i'm planning to rewrite it.**

## what am i building?

i'm building a **bittorrent client** that can download files from torrent networks. i've implemented the core bittorrent protocol to communicate with trackers and peers, download pieces of files, and put them back together.

what i've learned about the bittorrent protocol so far:
- how to parse torrent files and decode bencode
- udp tracker communication protocol
- peer-to-peer networking and handshaking
- piece-based file downloading and assembly
- bittorrent message handling (choke/unchoke, interested, bitfield, piece requests)

## what's working so far

1. **torrent file parsing** (`src/index.js`)
   - i can decode `.torrent` files using bencode
   - extract torrent metadata (name, announce url, info hash, piece length)
   - calculate total number of pieces and file sizes
   - handle both single-file and multi-file torrents

2. **udp tracker communication** (`src/tracker.js`)
   - implemented the udp tracker protocol
   - send connection and announce requests
   - receive peer lists from trackers
   - basic tracker response validation

3. **peer connections** (`src/tracker.js`)
   - tcp connections to discovered peers
   - bittorrent handshake implementation
   - message parsing (bitfield, choke/unchoke, interested, piece messages)
   - piece request and download management
   - basic progress tracking and piece assembly

4. **file assembly** (`assemble.js`)
   - reconstruct complete files from downloaded pieces
   - handle missing pieces by filling with placeholder data
   - auto-detect torrent completion percentage
   - create playable video files even with partial downloads
   - support multiple piece file formats

5. **analysis utilities** (`utils/`)
   - `analyze_torrent_structure.js`: analyze multi-file torrents and find main video files
   - `decode_torrent.js`: detailed torrent file inspection and piece mapping


## what's broken or missing

1. **no dht support**
   - only works with udp trackers
   - can't discover peers through distributed hash table
   - limited to tracker-announced peers

2. **no peer exchange (pex)**
   - can't discover peers from other connected peers
   - reduces peer discovery capabilities

3. **basic download strategy**
   - downloads pieces randomly
   - no rarest-first or endgame mode
   - no piece prioritization for streaming
   - no pause/resume functionality

4. **no upload capability**
   - pure leecher implementation
   - can't seed files to other peers
   - no choking/unchoking algorithm for uploads

5. **limited error handling**
   - basic connection error handling
   - no piece verification (sha-1 hash checking)
   - no automatic retry mechanisms

6. **performance issues**
   - single-threaded piece assembly
   - no disk i/o optimization
   - memory usage not optimized for large files

7. **missing protocol features**
   - no magnet link support
   - no encryption/obfuscation
   - no fast extension support
   - no bandwidth limiting

## dependencies i'm using

- `bencode`: for encoding/decoding torrent files
- node.js built-in modules: `crypto`, `dgram`, `net`, `fs`, `url`

## how to run this

1. **start downloading a torrent:**
   ```bash
   pnpm install & pnpm start
   ```
   (currently hardcoded to download whatever torrent i specify in index.js)

2. **analyze a torrent structure:**
   ```bash
   node utils/analyze_torrent_structure.js
   ```

3. **assemble downloaded pieces:**
   ```bash
   node assemble.js
   ```

## what happens when i run it

the client will:
1. parse the torrent file and extract metadata
2. connect to the udp tracker and get peer list
3. connect to peers via tcp and perform handshakes
4. download pieces and save them as `pieces/piece_X_complete.bin`

## what i want to improve when rewriting

right now my download approach is pretty inefficient even though it looks like it has concurrency. here's what's actually happening:

- i connect to multiple peers simultaneously which is not a problem
- but each peer downloads pieces one at a time, waiting for each piece to complete before requesting the next one
- this means if one peer is slow, it's not utilizing the full bandwidth potential
- fast peers basically sit idle while waiting for slow peers to finish their pieces

### what i want to do instead

- create a list of download tasks (functions that return basically list of func for each piece)
- use a queue system to run multiple piece downloads simultaneously across all available peers
- instead of "peer 1 gets piece 5, peer 2 gets piece 6", it should be "best available peer gets next needed piece"
- this way fast peers can grab more pieces while slow peers work on their current piece and it will dramatically improve download speeds and bandwidth utilization