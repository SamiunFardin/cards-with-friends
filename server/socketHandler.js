/**
 * Socket Handler: Manages all real-time Socket.IO event listeners,
 * room routing, player join/leave, and event dispatching to game modules.
 */

const roomManager = require('./roomManager');

// Import game modules (we will build these next)
const callBridgeGame = require('./games/callbridge');
const twentyNineGame = require('./games/twentynine');
const pokerGame = require('./games/poker');
const unoGame = require('./games/uno');

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // 1. Create Room Event
    socket.on('create-room', ({ gameType, nickname }) => {
      const room = roomManager.createRoom(gameType, socket.id, nickname);
      socket.join(room.roomCode);
      
      socket.emit('room-created', {
        roomCode: room.roomCode,
        gameType: room.gameType,
        players: room.players
      });
    });

    // 2. Join Room Event (Supports QR code / link joins)
    socket.on('join-room', ({ roomCode, nickname, buyInAmount }) => {
      const result = roomManager.addPlayerToRoom(roomCode, socket.id, nickname, buyInAmount || 0);
      
      if (!result.success) {
        socket.emit('error-message', { message: result.message });
        return;
      }

      const room = result.room;
      socket.join(room.roomCode);

      // Notify all players in room about updated player list
      io.to(room.roomCode).emit('update-players', {
        players: room.players
      });
    });

    // 3. Start Game Event (Triggered by Host)
    socket.on('start-game', ({ roomCode }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id) return;

      room.status = 'playing';

      // Initialize specific game state based on gameType
      if (room.gameType === 'callbridge') {
        callBridgeGame.initGame(room);
      } else if (room.gameType === 'twentynine') {
        twentyNineGame.initGame(room);
      } else if (room.gameType === 'poker') {
        pokerGame.initGame(room);
      } else if (room.gameType === 'uno') {
        unoGame.initGame(room);
      }

      io.to(roomCode).emit('game-started', {
        gameType: room.gameType,
        gameState: room.gameState
      });
    });

    // 4. Handle Game Specific Actions
    socket.on('game-action', ({ roomCode, actionData }) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || room.status !== 'playing') return;

      let updatedState = null;

      if (room.gameType === 'callbridge') {
        updatedState = callBridgeGame.handleAction(room, socket.id, actionData);
      } else if (room.gameType === 'twentynine') {
        updatedState = twentyNineGame.handleAction(room, socket.id, actionData);
      } else if (room.gameType === 'poker') {
        updatedState = pokerGame.handleAction(room, socket.id, actionData);
      } else if (room.gameType === 'uno') {
        updatedState = unoGame.handleAction(room, socket.id, actionData);
      }

      if (updatedState) {
        io.to(roomCode).emit('game-update', updatedState);
      }
    });

    // 5. Disconnect Handler
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      const leaveResult = roomManager.removePlayerFromRoom(socket.id);
      
      if (leaveResult && !leaveResult.deleted) {
        io.to(leaveResult.roomCode).emit('update-players', {
          players: leaveResult.room.players
        });
      }
    });
  });
}

exports = module.exports = setupSocketHandlers;
