const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state: roomId -> { code, language, users }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { code: '', language: 'javascript', users: new Set() });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ roomId, username }) => {
    currentRoom = roomId;
    socket.join(roomId);

    const room = getRoom(roomId);
    room.users.add(username || socket.id);

    // Send current room state to the new user
    socket.emit('room-state', {
      code: room.code,
      language: room.language,
      userCount: room.users.size,
    });

    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      userCount: room.users.size,
    });
  });

  socket.on('code-change', ({ roomId, code }) => {
    const room = getRoom(roomId);
    room.code = code;
    // Broadcast to everyone else in the room
    socket.to(roomId).emit('code-update', { code });
  });

  socket.on('language-change', ({ roomId, language }) => {
    const room = getRoom(roomId);
    room.language = language;
    // Broadcast language change to all in the room (including sender)
    io.to(roomId).emit('language-update', { language });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      io.to(currentRoom).emit('user-left', { userCount: room.users.size });
      // Clean up empty rooms
      if (room.users.size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CodeTogether running at http://localhost:${PORT}`);
});
