// import net from "net"

// const server = net.createServer((socket) => {
//     console.log('client connected')

//     socket.write('hello from the server\n')

//     socket.on('data', (data) => {
//         console.log('received from client:', data.toString());
//     });

//     socket.on('end', () => {
//         console.log('client dissconnected')
//     })

//     socket.on('error', (err) =>{
//         console.error('socket error', err)
//     })
// })

// server.listen(8080, ()=> {
//     console.log('server is listening on port')
// })


// Create an ArrayBuffer with a size in bytes
const buffer = new ArrayBuffer(16);
const int32View = new Int32Array(buffer);
// Produces Int32Array [0, 0, 0, 0]

int32View[1] = 42;
const sliced = new Int32Array(buffer.slice(4, 12));
// Produces Int32Array [42, 0]

console.log(sliced[0]);