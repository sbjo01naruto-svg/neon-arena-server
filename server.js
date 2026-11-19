const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.get('/', (req, res) => res.send('Game server is running'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const players = {};
io.on('connection', (socket) => {
  players[socket.id] = { x: 0, z: 0 };
  io.emit('count', Object.keys(players).length);
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('count', Object.keys(players).length);
  });
});

server.listen(process.env.PORT || 3000, () => console.log('running'));