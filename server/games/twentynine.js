/**
 * 29 Card Game Engine
 * Implements 32-card deck, point scoring (J=3, 9=2, A=1, 10=1, last trick=1),
 * bidding (16-28), 7th card trump choice, void hand checks, royal pair (K+Q),
 * single hand calls, and full board bonus rules.
 */

const SUITS = ['S', 'H', 'D', 'C'];
const VALUES = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

// Point values for 29 Card Game
const CARD_POINTS = {
  'J': 3,
  '9': 2,
  'A': 1,
  '10': 1,
  'K': 0,
  'Q': 0,
  '8': 0,
  '7': 0
};

function create29Deck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, points: CARD_POINTS[value] });
    }
  }
  // Shuffle using Fisher-Yates
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
  const deck = create29Deck();

  // Assign teams if not set by host (Default: Team 0 = P1 & P3, Team 1 = P2 & P4)
  room.players.forEach((player, idx) => {
    if (player.team === undefined) {
      player.team = idx % 2;
    }
    player.hand = [];
    player.tricksWon = 0;
  });

  // Deal first 4 cards to each player
  room.players.forEach((player, idx) => {
    player.hand = deck.slice(idx * 4, (idx + 1) * 4);
  });

  room.gameState = {
    phase: 'bidding', // 'bidding', 'trump-selection', 'deal-remaining', 'playing', 'hand-discontinued', 'round-over'
    remainingDeck: deck.slice(16),
    currentTurnIndex: 0,
    highestBid: 15,
    highestBidderId: null,
    bids: {},
    trumpSuit: null,
    trumpIs7thCard: false,
    trumpRevealed: false,
    isSingleHand: false,
    singleCallerId: null,
    royalPairDeclared: false,
    royalPairTeam: null,
    currentTrick: [],
    leadSuit: null,
    teamPointsWon: { 0: 0, 1: 0 },
    tricksWonCount: { 0: 0, 1: 0 },
    tricksHistory: []
  };

  return room.gameState;
}

function handleAction(room, socketId, actionData) {
  const { type, payload } = actionData;
  const state = room.gameState;
  const playerIndex = room.players.findIndex(p => p.id === socketId);

  // --- 1. BIDDING PHASE (16 to 28) ---
  if (state.phase === 'bidding' && type === 'submit-bid') {
    const bid = parseInt(payload.bid, 10);
    if (bid > state.highestBid && bid <= 28) {
      state.highestBid = bid;
      state.highestBidderId = socketId;
      state.bids[socketId] = bid;
    }

    // Check if bidding phase concluded
    if (payload.pass || Object.keys(state.bids).length === room.players.length) {
      if (!state.highestBidderId) state.highestBidderId = room.players[0].id;
      state.phase = 'trump-selection';
      state.currentTurnIndex = room.players.findIndex(p => p.id === state.highestBidderId);
    } else {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    }
  }

  // --- 2. TRUMP SELECTION ---
  else if (state.phase === 'trump-selection' && socketId === state.highestBidderId && type === 'select-trump') {
    if (payload.use7thCard) {
      state.trumpIs7thCard = true;
      // 7th card of trump-setter is card at index 2 of remaining deal
      const trumpSetterIndex = room.players.findIndex(p => p.id === socketId);
      const 7thCard = state.remainingDeck[trumpSetterIndex * 4 + 2];
      state.trumpSuit = 7thCard.suit;
    } else {
      state.trumpSuit = payload.suit;
    }

    // Deal remaining 4 cards to each player (8 cards total per player)
    room.players.forEach((player, idx) => {
      const extraCards = state.remainingDeck.slice(idx * 4, (idx + 1) * 4);
      player.hand.push(...extraCards);
    });

    // --- VOID HAND CHECK 1: Trump-setter has NO point cards in other 7 cards ---
    const trumpSetter = room.players.find(p => p.id === state.highestBidderId);
    const pointCardsInHand = trumpSetter.hand.filter(c => c.points > 0).length;
    if (pointCardsInHand === 0) {
      state.phase = 'hand-discontinued';
      state.discontinueReason = 'Trump setter has no point cards (J, 9, A, 10). Hand voided.';
      return state;
    }

    // --- VOID HAND CHECK 2: Either team has ZERO trump cards total ---
    const team0Trumps = room.players.filter(p => p.team === 0).flatMap(p => p.hand).filter(c => c.suit === state.trumpSuit).length;
    const team1Trumps = room.players.filter(p => p.team === 1).flatMap(p => p.hand).filter(c => c.suit === state.trumpSuit).length;

    if (team0Trumps === 0 || team1Trumps === 0) {
      state.phase = 'hand-discontinued';
      state.discontinueReason = 'A team holds zero trump cards across all 16 cards. Hand voided.';
      return state;
    }

    state.phase = 'playing';
    state.currentTurnIndex = 0;
  }

  // --- 3. OPTIONAL SINGLE HAND CALL ---
  else if (state.phase === 'playing' && type === 'call-single') {
    state.isSingleHand = true;
    state.singleCallerId = socketId;
  }

  // --- 4. TRICK PLAYING & ROYAL PAIR ---
  else if (state.phase === 'playing' && type === 'play-card') {
    const cardPlayed = payload.card;
    const player = room.players[playerIndex];

    const cardIndex = player.hand.findIndex(c => c.suit === cardPlayed.suit && c.value === cardPlayed.value);
    if (cardIndex === -1) return state;

    // Reveal Trump Request
    if (payload.revealTrump && !state.trumpRevealed) {
      state.trumpRevealed = true;
    }

    // Royal Pair Validation: Check if player holds K + Q of Trump and neither card played prior
    if (type === 'declare-royal-pair' && state.trumpRevealed && !state.royalPairDeclared) {
      const hasK = player.hand.some(c => c.suit === state.trumpSuit && c.value === 'K');
      const hasQ = player.hand.some(c => c.suit === state.trumpSuit && c.value === 'Q');
      if (hasK && hasQ) {
        state.royalPairDeclared = true;
        state.royalPairTeam = player.team;
        // Adjust target bid threshold by +/- 4
        const biddingTeam = room.players.find(p => p.id === state.highestBidderId).team;
        if (player.team === biddingTeam) {
          state.highestBid = Math.max(16, state.highestBid - 4);
        } else {
          state.highestBid = Math.min(28, state.highestBid + 4);
        }
      }
    }

    // Follow Suit Rule Enforcement
    if (state.currentTrick.length > 0) {
      const hasLeadSuit = player.hand.some(c => c.suit === state.leadSuit);
      if (hasLeadSuit && cardPlayed.suit !== state.leadSuit) {
        return state;
      }
    } else {
      state.leadSuit = cardPlayed.suit;
    }

    player.hand.splice(cardIndex, 1);
    state.currentTrick.push({ playerId: socketId, team: player.team, card: cardPlayed });

    // Trick Evaluation after 4 cards
    if (state.currentTrick.length === 4) {
      const winner = evaluate29Trick(state.currentTrick, state.leadSuit, state.trumpSuit, state.trumpRevealed);
      const trickPoints = state.currentTrick.reduce((sum, item) => sum + item.card.points, 0);

      state.teamPointsWon[winner.team] += trickPoints;
      state.tricksWonCount[winner.team] += 1;

      // 1 Extra Point for Last (8th) Trick
      if (room.players[0].hand.length === 0) {
        state.teamPointsWon[winner.team] += 1;
        state.phase = 'round-over';
        calculate29FinalScores(room);
      } else {
        state.currentTrick = [];
        state.leadSuit = null;
        state.currentTurnIndex = room.players.findIndex(p => p.id === winner.playerId);
      }
    } else {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % room.players.length;
    }
  }

  return state;
}

function evaluate29Trick(trick, leadSuit, trumpSuit, trumpRevealed) {
  let winningPlay = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const play = trick[i];
    
    // Trump suit takes priority if revealed
    if (trumpRevealed && play.card.suit === trumpSuit && winningPlay.card.suit !== trumpSuit) {
      winningPlay = play;
    } else if (play.card.suit === winningPlay.card.suit) {
      if (cardRank(play.card.value) > cardRank(winningPlay.card.value)) {
        winningPlay = play;
      }
    }
  }
  return winningPlay;
}

function calculate29FinalScores(room) {
  const state = room.gameState;
  const bidder = room.players.find(p => p.id === state.highestBidderId);
  const biddingTeam = bidder.team;
  const opposingTeam = biddingTeam === 0 ? 1 : 0;

  const pointsMade = state.teamPointsWon[biddingTeam];
  const target = state.highestBid;

  let gamePointsDelta = 1;
  if (state.isSingleHand) gamePointsDelta = 2; // Single Hand Call = 2 Points

  // Full Board Bonus: Winning all 8 tricks adds +1 extra game point
  if (state.tricksWonCount[biddingTeam] === 8) {
    gamePointsDelta += 1;
  }

  room.players.forEach(p => {
    if (pointsMade >= target) {
      if (p.team === biddingTeam) p.score += gamePointsDelta;
      else p.score -= gamePointsDelta;
    } else {
      if (p.team === biddingTeam) p.score -= gamePointsDelta;
      else p.score += gamePointsDelta;
    }
  });
}

module.exports = {
  initGame,
  handleAction
};
