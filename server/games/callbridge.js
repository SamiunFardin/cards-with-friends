/**
 * Call Bridge Game Engine
 * Implements deck dealing, bidding, under-call re-bidding rules,
 * suit-following trick evaluation, and custom scoring logic.
 */

const SUITS = ['S', 'H', 'D', 'C']; // Spades (Trump), Hearts, Diamonds, Clubs
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
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

function cardRank(value) {
  return VALUES.indexOf(value);
}

function initGame(room) {
  const deck = createDeck();
  const numPlayers = room.players.length; // Exactly 4 players

  // Deal 13 cards to each player
  room.players.forEach((player, index) => {
    player.hand = deck.slice(index * 13, (index + 1) * 13);
    player.bid = 0;
    player.tricksWon = 0;
  });

  room.gameState = {
    phase: 'bidding', // 'bidding', 'rebidding', 'playing', 'round-over'
    currentTurnIndex: 0,
    bids: {},
    totalBids: 0,
    isUnderCall: false,
    rebidDone: false,
    currentTrick: [], // { playerId, card }
    leadSuit: null,
    tricksHistory: [],
    dealerIndex: 0
  };

  return room.gameState;
}

function handleAction(room, socketId, actionData) {
  const { type, payload } = actionData;
  const state = room.gameState;
  const playerIndex = room.players.findIndex(p => p.id === socketId);

  if (playerIndex !== state.currentTurnIndex && type !== 'rebid') {
    return state; // Not player's turn
  }

  // --- 1. BIDDING PHASE ---
  if (state.phase === 'bidding' && type === 'submit-bid') {
    const bidValue = parseInt(payload.bid, 10);
    if (bidValue < 1 || bidValue > 13) return state;

    room.players[playerIndex].bid = bidValue;
    state.bids[socketId] = bidValue;

    // Check if all players have submitted initial bids
    if (Object.keys(state.bids).length === room.players.length) {
      state.totalBids = Object.values(state.bids).reduce((a, b) => a + b, 0);

      // Under-Call Safeguard: If sum of bids < 13 and re-bidding hasn't occurred yet
      if (state.totalBids < 13 && !state.rebidDone) {
        state.phase = 'rebidding';
        state.isUnderCall = true;
      } else {
        // Transition to active gameplay
        state.phase = 'playing';
        state.currentTurnIndex = (state.dealerIndex + 1) % room.players.length;
      }
    } else {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    }
  }

  // --- 2. RE-BIDDING PHASE (Under-Call Triggered) ---
  else if (state.phase === 'rebidding' && type === 'rebid') {
    const newBid = parseInt(payload.bid, 10);
    const originalBid = room.players[playerIndex].bid;

    // Players can keep or raise bid, but cannot lower
    if (newBid >= originalBid && newBid <= 13) {
      room.players[playerIndex].bid = newBid;
      state.bids[socketId] = newBid;
    }

    // Check if all players completed re-bidding submission
    const rebidCounts = payload.reBidsCompletedCount || Object.keys(state.bids).length;
    if (rebidCounts === room.players.length) {
      state.totalBids = Object.values(state.bids).reduce((a, b) => a + b, 0);
      state.rebidDone = true;
      state.isUnderCall = state.totalBids < 13;
      state.phase = 'playing';
      state.currentTurnIndex = (state.dealerIndex + 1) % room.players.length;
    }
  }

  // --- 3. ACTIVE TRICK PLAYING PHASE ---
  else if (state.phase === 'playing' && type === 'play-card') {
    const cardPlayed = payload.card;
    const playerHand = room.players[playerIndex].hand;

    // Validate card existence in hand
    const cardIndex = playerHand.findIndex(
      c => c.suit === cardPlayed.suit && c.value === cardPlayed.value
    );
    if (cardIndex === -1) return state;

    // Enforce Suit-Following Rule
    if (state.currentTrick.length > 0) {
      const hasLeadSuit = playerHand.some(c => c.suit === state.leadSuit);
      if (hasLeadSuit && cardPlayed.suit !== state.leadSuit) {
        return state; // Must follow suit if available
      }
    } else {
      state.leadSuit = cardPlayed.suit;
    }

    // Play card from hand into current trick
    playerHand.splice(cardIndex, 1);
    state.currentTrick.push({ playerId: socketId, card: cardPlayed });

    // Trick Evaluation after all 4 players play
    if (state.currentTrick.length === room.players.length) {
      const winnerId = evaluateTrickWinner(state.currentTrick, state.leadSuit);
      const winner = room.players.find(p => p.id === winnerId);
      winner.tricksWon += 1;

      state.tricksHistory.push({
        trick: [...state.currentTrick],
        winnerId
      });

      state.currentTrick = [];
      state.leadSuit = null;
      state.currentTurnIndex = room.players.findIndex(p => p.id === winnerId);

      // Check for End of Round (all 13 cards played)
      if (room.players[0].hand.length === 0) {
        state.phase = 'round-over';
        calculateRoundScores(room);
      }
    } else {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    }
  }

  return state;
}

// Determines winner of a 4-card trick (Spades 'S' are permanent Trumps)
function evaluateTrickWinner(trick, leadSuit) {
  let winningCard = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const candidate = trick[i];
    const currentBest = winningCard;

    if (candidate.card.suit === 'S' && currentBest.card.suit !== 'S') {
      winningCard = candidate;
    } else if (candidate.card.suit === currentBest.card.suit) {
      if (cardRank(candidate.card.value) > cardRank(currentBest.card.value)) {
        winningCard = candidate;
      }
    }
  }
  return winningCard.playerId;
}

// Custom Scoring Calculation Engine
function calculateRoundScores(room) {
  const isUnderCall = room.gameState.isUnderCall;

  room.players.forEach(player => {
    const bid = player.bid;
    const won = player.tricksWon;

    // 1. Grand Slam (All 13 tricks won)
    if (won === 13) {
      player.score += 20;
    }
    // 2. High Bid Bonus (Bid 8 or more and fulfilled)
    else if (bid >= 8 && won >= bid) {
      player.score += 13;
    }
    // 3. Exact Bid or +1 Grace Margin (Standard Match)
    else if (won === bid || won === bid + 1) {
      player.score += bid;
    }
    // 4. Under-Call Over-Trick Penalty (Winning > bid + 1 under under-call)
    else if (isUnderCall && won > bid + 1) {
      player.score -= bid;
    }
    // 5. Normal Over-Trick Penalty
    else if (!isUnderCall && won > bid + 1) {
      player.score -= bid;
    }
    // 6. Failed Bid (Under-trick loss)
    else if (won < bid) {
      player.score -= bid;
    }
  });
}

module.exports = {
  initGame,
  handleAction
};
