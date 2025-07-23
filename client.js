// client.js
import net from "net"

const client = net.createConnection({ port: 8080 }, () => {
  console.log('Connected to server!');

  // Send a message to the server
  client.write('Hello from client!');
});

// Receive data from server
client.on('data', (data) => {
  console.log('Received from server:', data.toString());

  // Close the connection after receiving data
  client.end();
});

// Handle connection close
client.on('end', () => {
  console.log('Disconnected from server');
});

// Handle errors
client.on('error', (err) => {
  console.error('Client error:', err);
});
