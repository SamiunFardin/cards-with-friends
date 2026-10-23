/**
 * Room Manager: Handles creation of rooms, participant limits, 
 * invite codes, and host-managed cash/chip requests for Poker.
 */

const rooms = new Map();

// Helper to generate a random 4-character uppercase room code (e.g., A7K2)
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function createRoom(gameType, hostSocketId, hostNickname) {
  const roomCode = generateRoomCode();
  
  // Enforce capacity limits based on game type
  let maxPlayers = 12;
  if (gameType === 'callbridge' || gameType === 'twentynine') {
    maxPlayers = 4;
  }

  const room = {
    roomCode,
    gameType,
    maxPlayers,
    hostSocketId,
    status: 'waiting', // waiting, playing, finished
    players: [
      {
        id: hostSocketId,
        nickname: hostNickname,
        isHost: true,
        chips: 0, // Used for Poker
        hand: [],
        score: 0
      }
    ],
    gameState: {}
  };

  rooms.set(roomCode, room);
  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function addPlayerToRoom(roomCode, socketId, nickname, buyInAmount = 0) {
  const room = rooms.get(roomCode);
  if (!room) return { success: false, message: 'Room not found.' };

  if (room.status !== 'waiting') {
    return { success: false, message: 'Game has already started.' };
  }

  if (room.players.length >= room.maxPlayers) {
    return { success: false, message: 'Room is full.' };
  }

  // Check duplicate socket
  if (room.players.some(p => p.id === socketId)) {
    return { success: false, message: 'Player already in room.' };
  }

  const player = {
    id: socketId,
    nickname,
    isHost: false,
    chips: buyInAmount,
    hand: [],
    score: 0
  };

  room.players.push(player);
  return { success: true, room };
}

function removePlayerFromRoom(socketId) {
  for (let [roomCode, room] of rooms.entries()) {
    const index = room.players.findIndex(p => p.id === socketId);
    if (index !== -1) {
      room.players.splice(index, 1);

      // If host left, assign new host if players remain
      if (room.hostSocketId === socketId && room.players.length > 0) {
        room.players[0].isHost = true;
        room.hostSocketId = room.players[0].id;
      }

      // If room is empty, delete it
      if (room.players.length === 0) {
        rooms.delete(roomCode);
        return { roomCode, deleted: true };
      }

      return { roomCode, deleted: false, room };
    }
  }
  return null;
}

module.exports = {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom
};
