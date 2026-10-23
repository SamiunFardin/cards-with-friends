/**
 * Texas Hold'em Poker Game Engine
 * Implements deck generation, configurable blinds, automatic button rotation,
 * betting rounds (Pre-flop, Flop, Turn, River), and automated hand showdown.
 */

const SUITS = ['S', 'H', 'D', 'C'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createPokerDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  // Shuffle using Fisher-Yates algorithm
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function initGame(room) {
  // Ensure players have chips from buy-ins
  room.gameState = {
    phase: 'pre-flop', // 'pre-flop', 'flop', 'turn', 'river', 'showdown', 'hand-ended'
    dealerIndex: 0,
    smallBlind: room.gameState.smallBlind || 10,
    bigBlind: room.gameState.bigBlind || 20,
    pot: 0,
    communityCards: [],
    deck: [],
    currentTurnIndex: 0,
    currentHighestBet: 0,
    foldedPlayers: [],
    allInPlayers: []
  };

  startNewHand(room);
  return room.gameState;
}

function startNewHand(room) {
  const state = room.gameState;
  state.deck = createPokerDeck();
  state.communityCards = [];
  state.pot = 0;
  state.foldedPlayers = [];
  state.allInPlayers = [];
  state.phase = 'pre-flop';

  // Rotate dealer button clockwise
  state.dealerIndex = (state.dealerIndex + 1) % room.players.length;

  // Reset player bets and hand states
  room.players.forEach(p => {
    p.hand = [];
    p.currentBet = 0;
    p.isFolded = false;
  });

  // Deal 2 hole cards to each active player
  room.players.forEach(player => {
    player.hand = [state.deck.pop(), state.deck.pop()];
  });

  // Post Blinds (Small Blind & Big Blind)
  const sbIndex = (state.dealerIndex + 1) % room.players.length;
  const bbIndex = (state.dealerIndex + 2) % room.players.length;

  const sbPlayer = room.players[sbIndex];
  const bbPlayer = room.players[bbIndex];

  const sbAmount = Math.min(sbPlayer.chips, state.smallBlind);
  sbPlayer.chips -= sbAmount;
  sbPlayer.currentBet = sbAmount;
  state.pot += sbAmount;

  const bbAmount = Math.min(bbPlayer.chips, state.bigBlind);
  bbPlayer.chips -= bbAmount;
  bbPlayer.currentBet = bbAmount;
  state.pot += bbAmount;

  state.currentHighestBet = state.bigBlind;
  state.currentTurnIndex = (bbIndex + 1) % room.players.length;
}

function handleAction(room, socketId, actionData) {
  const { type, payload } = actionData;
  const state = room.gameState;
  const playerIndex = room.players.findIndex(p => p.id === socketId);
  const player = room.players[playerIndex];

  if (playerIndex !== state.currentTurnIndex || player.isFolded) {
    return state; // Not player's turn or already folded
  }

  if (type === 'fold') {
    player.isFolded = true;
    state.foldedPlayers.push(socketId);
  } else if (type === 'check') {
    if (player.currentBet < state.currentHighestBet) {
      return state; // Cannot check if there is an active bet
    }
  } else if (type === 'call') {
    const callAmount = state.currentHighestBet - player.currentBet;
    const actualCall = Math.min(player.chips, callAmount);
    player.chips -= actualCall;
    player.currentBet += actualCall;
    state.pot += actualCall;

    if (player.chips === 0) {
      state.allInPlayers.push(socketId);
    }
  } else if (type === 'raise') {
    const raiseTotal = parseInt(payload.amount, 10);
    const additionalCost = raiseTotal - player.currentBet;
    if (additionalCost > player.chips) return state; // Insufficient chips

    player.chips -= additionalCost;
    player.currentBet = raiseTotal;
    state.currentHighestBet = raiseTotal;
    state.pot += additionalCost;

    if (player.chips === 0) {
      state.allInPlayers.push(socketId);
    }
  }

  // Advance betting round or game phase
  advanceGamePhase(room);
  return state;
}

function advanceGamePhase(room) {
  const state = room.gameState;
  const activePlayers = room.players.filter(p => !p.isFolded);

  // Check if only 1 player remains (auto-win pot)
  if (activePlayers.length === 1) {
    activePlayers[0].chips += state.pot;
    state.phase = 'hand-ended';
    return;
  }

  // Check if betting round is complete (all active players matched highest bet or are all-in)
  const bettingComplete = activePlayers.every(
    p => p.currentBet === state.currentHighestBet || p.chips === 0
  );

  if (bettingComplete) {
    // Reset player round bets
    room.players.forEach(p => (p.currentBet = 0));
    state.currentHighestBet = 0;

    if (state.phase === 'pre-flop') {
      state.phase = 'flop';
      state.communityCards.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    } else if (state.phase === 'flop') {
      state.phase = 'turn';
      state.communityCards.push(state.deck.pop());
    } else if (state.phase === 'turn') {
      state.phase = 'river';
      state.communityCards.push(state.deck.pop());
    } else if (state.phase === 'river') {
      state.phase = 'showdown';
      executeShowdown(room);
      return;
    }

    // Set turn to player left of dealer after phase change
    state.currentTurnIndex = (state.dealerIndex + 1) % room.players.length;
    while (room.players[state.currentTurnIndex].isFolded) {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    }
  } else {
    // Move to next active player
    do {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    } while (room.players[state.currentTurnIndex].isFolded);
  }
}

function executeShowdown(room) {
  const state = room.gameState;
  const activePlayers = room.players.filter(p => !p.isFolded);

  // Simple chip award distribution to last remaining / mock winner for baseline engine
  // (Full 7-card evaluator will be integrated on the client/server utility layer)
  const winner = activePlayers[0];
  winner.chips += state.pot;
  state.phase = 'hand-ended';
}

module.exports = {
  initGame,
  handleAction,
  startNewHand
};
