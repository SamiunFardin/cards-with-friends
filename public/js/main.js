/**
 * Main Frontend Logic & Socket Event Handling with LocalStorage Persistence
 */
const socket = io();

let currentSelectedGame = null;
let currentRoomCode = null;

// Screen Elements
const screenLobby = document.getElementById('screen-lobby');
const screenRoom = document.getElementById('screen-room');
const screenGame = document.getElementById('screen-game');

// Input & Button Elements
const nicknameInput = document.getElementById('player-nickname');
const gameCards = document.querySelectorAll('.game-card');
const backToLobbyBtn = document.getElementById('back-to-lobby');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinRoomCodeInput = document.getElementById('join-room-code');
const pokerBuyinWrapper = document.getElementById('poker-buyin-wrapper');
const buyinAmountInput = document.getElementById('buyin-amount');

const waitingLobby = document.getElementById('waiting-lobby');
const displayRoomCode = document.getElementById('display-room-code');
const inviteLinkInput = document.getElementById('invite-link-input');
const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');
const maxPlayerCount = document.getElementById('max-player-count');
const startGameBtn = document.getElementById('start-game-btn');

// Restore saved session data from localStorage on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedNickname = localStorage.getItem('playerNickname');
  const savedRoomCode = localStorage.getItem('currentRoomCode');
  
  if (savedNickname) {
    nicknameInput.value = savedNickname;
  }
  if (savedRoomCode) {
    joinRoomCodeInput.value = savedRoomCode;
  }
});

// Game Selection
gameCards.forEach(card => {
  card.querySelector('.select-game-btn').addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      alert('Please enter a nickname first!');
      return;
    }
    localStorage.setItem('playerNickname', nickname);

    currentSelectedGame = card.dataset.game;
    document.getElementById('room-game-title').innerText = `Setup - ${currentSelectedGame.toUpperCase()}`;
    
    if (currentSelectedGame === 'poker') {
      pokerBuyinWrapper.classList.remove('hidden');
    } else {
      pokerBuyinWrapper.classList.add('hidden');
    }

    switchScreen(screenRoom);
  });
});

backToLobbyBtn.addEventListener('click', () => {
  switchScreen(screenLobby);
});

// Create Room
createRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('Please enter a nickname first!');
    return;
  }
  localStorage.setItem('playerNickname', nickname);
  socket.emit('create-room', { gameType: currentSelectedGame, nickname });
});

// Join Room
joinRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomCode = joinRoomCodeInput.value.trim().toUpperCase();
  const buyInAmount = parseInt(buyinAmountInput.value, 10) || 0;

  if (!nickname) {
    alert('Please enter a nickname first!');
    return;
  }

  if (!roomCode || roomCode.length !== 4) {
    alert('Please enter a valid 4-character room code.');
    return;
  }

  localStorage.setItem('playerNickname', nickname);
  localStorage.setItem('currentRoomCode', roomCode);

  socket.emit('join-room', { roomCode, nickname, buyInAmount });
});

// Socket Event Listeners
socket.on('room-created', ({ roomCode, gameType, players }) => {
  currentRoomCode = roomCode;
  localStorage.setItem('currentRoomCode', roomCode);
  updateWaitingLobby(roomCode, players, true);
});

socket.on('update-players', ({ players }) => {
  const isHost = players.find(p => p.id === socket.id)?.isHost || false;
  updateWaitingLobby(currentRoomCode, players, isHost);
});

socket.on('error-message', ({ message }) => {
  alert(message);
});

socket.on('game-started', ({ gameType, gameState }) => {
  switchScreen(screenGame);
  if (window.initGameUI) {
    window.initGameUI(gameType, gameState, socket, currentRoomCode);
  }
});

socket.on('game-update', (gameState) => {
  if (window.renderGameUI) {
    window.renderGameUI(currentSelectedGame, gameState, socket, currentRoomCode);
  }
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start-game', { roomCode: currentRoomCode });
});

function updateWaitingLobby(roomCode, players, isHost) {
  currentRoomCode = roomCode;
  localStorage.setItem('currentRoomCode', roomCode);
  waitingLobby.classList.remove('hidden');
  displayRoomCode.innerText = roomCode;
  
  const shareUrl = `${window.location.origin}?room=${roomCode}`;
  inviteLinkInput.value = shareUrl;
  new QRCode('qrcode-container', shareUrl);

  playerCount.innerText = players.length;
  playersList.innerHTML = players.map(p => `<li>${p.nickname} ${p.isHost ? '(Host)' : ''}</li>`).join('');

  if (isHost && players.length >= 2) {
    startGameBtn.classList.remove('hidden');
  } else {
    startGameBtn.classList.add('hidden');
  }
}

function switchScreen(targetScreen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  targetScreen.classList.add('active');
}
