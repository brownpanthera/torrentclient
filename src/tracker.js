import dgram, { Socket } from "dgram"
import crypto from "crypto"
import { URL } from "url"

export function connectionReq(announceURL){
    const randomNumber = crypto.randomBytes(4).readUInt32BE();
    const buff = Buffer.alloc(16)
    buff.writeUInt32BE(0x417, 0);
    buff.writeUint32BE(0x27101980, 4);
    buff.writeUInt32BE(0, 8);
    buff.writeUInt32BE(randomNumber, 12)

    const url = new URL(announceURL)

    // sendin udp req to tracker
    const socket = dgram.createSocket('udp4')
    socket.send(buff, 0, buff.length, url.port, url.host, ()=> {
        console.log(`sent connection req to ${url.hostname}, ${url.port}`)
    })    

    // extracting the res which comes same as req
    socket.on
}