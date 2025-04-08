import dgram, { Socket } from "dgram"
import crypto from "crypto"
import { URL } from "url"
import { infoHash, torrentFileSize } from "./index.js"

function validateResponse(condition, errorMessage) {
    if (!condition) {
        console.error(errorMessage);
        process.exit(1);
    }
}

export function connectionReq(announceURL){
    const randomNumber = crypto.randomBytes(4).readUInt32BE();
    const buff = Buffer.alloc(16)
    buff.writeUInt32BE(0x417, 0); // magic constant of 4bytes
    buff.writeUint32BE(0x27101980, 4); // another magic constant of 4bytes
    buff.writeUInt32BE(0, 8); // action ID
    buff.writeUInt32BE(randomNumber, 12) // random transaction ID

    const url = new URL(announceURL)

    // sendin udp req to tracker
    const socket = dgram.createSocket('udp4')
    socket.send(buff, 0, buff.length, url.port, url.hostname, ()=> {
        console.log(`sent connection req to ${url.hostname}, ${url.port}`)
    }) 

    // console.log("sending buffer", buff.toString("hex"));

    socket.on("error", (err)=>{
        console.err("socet error ", err)
    })
    
    
    // extracting the res which is same as req
    socket.on("message", (msg, rinfo) => {
        console.log(rinfo)
        const actionID = msg.readUInt32BE(0);
        const transactionID = msg.readUInt32BE(4);
        const connectionID = msg.readBigUInt64BE(8);

        console.log(msg.length)
    
        validateResponse(!(msg.length < 16), "Error: Packet size is smaller than expected.");
        validateResponse(transactionID === randomNumber, "Error: Transaction ID does not match the one that was generated.");
        validateResponse(actionID === 0, "Unexpected Action ID, expected a connection response.");

        console.table({ actionID, transactionID, connectionID });

        console.log(infoHash)
        console.log(torrentFileSize())
        socket.close()

        announceReq(announceURL, connectionID)
    });
    
}


function announceReq(announceURL, connectionID){
    const announceTransactionID = crypto.randomBytes(4).readUint32BE();
    const peerID = crypto.randomBytes(20) 
    const requestBuff = Buffer.alloc(98)

    requestBuff.writeBigUInt64BE(BigInt(connectionID), 0);
    requestBuff.writeUInt32BE(1, 8)
    requestBuff.writeUInt32BE(announceTransactionID, 12)
    requestBuff.copy(infoHash, 16)
    requestBuff.copy(peerID, 36)
    requestBuff.writeBigUInt64BE(BigInt(0), 56)
    requestBuff.writeBigUInt64BE(BigInt(torrentFileSize()), 64)
    requestBuff.writeBigUInt64BE(BigInt(0), 48)
    requestBuff.writeUint32BE(2, 80)
    requestBuff.writeUInt32BE(0, 84)
    requestBuff.writeUInt32BE(crypto.randomInt(0, 2 ** 32), 88)
    requestBuff.writeInt32BE(-1, 92);
    requestBuff.writeUInt16BE(6881, 96);

    const client = dgram.createSocket("udp4")
    const {hostname, port} = new URL(announceURL)

    client.send(requestBuff, 0, requestBuff.length, port, hostname, (err)=> {
        if(err) console.error("Error sending req", err)
            else console.log("Announce Req send")
    })

    client.on("message", (msg, rinfo) => {
    const actionID = msg.readUInt32BE(0);
    const transactionID = msg.readUInt32BE(4);
    const interval = msg.readUInt32BE(8);
    const leechers = msg.readUInt32BE(12);
    const seeders = msg.readUInt32BE(16);

    // console.log(listofPeers)

    if(actionID !== 1){
        console.error("unexpected action ID, expected announce res")
        return
    }

    // converting ip int to string
    let listofPeers = [];
    for(let i = 20; i < msg.length; i+=6){
        const ipofpeers = msg.readUInt32BE(i)
        const portofpeers = msg.readUInt16BE(i+4)

        const ip = [
            (ipofpeers >> 24) & 0xff,
            (ipofpeers >> 16) & 0xff,
            (ipofpeers >> 8) & 0xff,
            ipofpeers & 0xff
        ].join('.')
        listofPeers.push({ip: ip, port: portofpeers})
    }

    console.log(listofPeers)


    // console.log(actionID)
    // console.log(leechers)
    // console.log(seeders)
    console.log(msg.length)
    })
}
