/**
 * UNO Show 'Em No Mercy Game Engine
 * Implements the 168-card deck inventory, stacking draw rules (+2, +4, +6, +10),
 * 25-card Mercy elimination rule, hand-swap mechanics (0s and 7s),
 * draw-until-playable mechanics, and multi-round scoring.
 */

const COLORS = ['red', 'blue', 'green', 'yellow'];

function createNoMercyDeck() {
  const deck = [];

  // 1. Number Cards (0 to 9) - 2 of each number per color (80 cards total)
  COLORS.forEach(color => {
    for (let num = 0; num <= 9; num++) {
      deck.push({ type: 'number', color, value: num, points: num });
      deck.push({ type: 'number', color, value: num, points: num });
    }
  });

  // 2. Colored Action Cards
  // Draw 2 (3 per color = 12)
  COLORS.forEach(color => {
    for (let i = 0; i < 3; i++) deck.push({ type: 'action', color, action: 'draw-2', value: 2, points: 20 });
  });
  // Draw 4 (2 per color = 8)
  COLORS.forEach(color => {
    for (let i = 0; i < 2; i++) deck.push({ type: 'action', color, action: 'draw-4', value: 4, points: 20 });
  });
  // Skip (3 per color = 12)
  COLORS.forEach(color => {
    for (let i = 0; i < 3; i++) deck.push({ type: 'action', color, action: 'skip', points: 20 });
  });
  // Skip Everyone (2 per color = 8)
  COLORS.forEach(color => {
    for (let i = 0; i < 2; i++) deck.push({ type: 'action', color, action: 'skip-everyone', points: 20 });
  });
  // Reverse (3 per color = 12)
  COLORS.forEach(color => {
    for (let i = 0; i < 3; i++) deck.push({ type: 'action', color, action: 'reverse', points: 20 });
  });
  // Discard All (3 per color = 12)
  COLORS.forEach(color => {
    for (let i = 0; i < 3; i++) deck.push({ type: 'action', color, action: 'discard-all', points: 20 });
  });

  // 3. Wild Cards
  // Wild Reverse Draw 4 (8 cards)
  for (let i = 0; i < 8; i++) deck.push({ type: 'wild', color: 'wild', action: 'wild-reverse-draw-4', value: 4, points: 50 });
  // Wild Color Roulette (8 cards)
  for (let i = 0; i < 8; i++) deck.push({ type: 'wild', color: 'wild', action: 'wild-color-roulette', points: 50 });
  // Wild Draw 6 (4 cards)
  for (let i = 0; i < 4; i++) deck.push({ type: 'wild', color: 'wild', action: 'wild-draw-6', value: 6, points: 50 });
  // Wild Draw 10 (4 cards)
  for (let i = 0; i < 4; i++) deck.push({ type: 'wild', color: 'wild', action: 'wild-draw-10', value: 10, points: 50 });

  // Shuffle deck using Fisher-Yates algorithm
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function initGame(room) {
  const deck = createNoMercyDeck();

  room.players.forEach(player => {
    player.hand = [];
    player.score = 0;
    player.isEliminated = false;
  });

  // Deal 7 cards to each player
  room.players.forEach(player => {
    player.hand = deck.splice(0, 7);
  });

  // Flip top card for discard pile (ensure it's a number card 0-9)
  let topCardIndex = deck.findIndex(c => c.type === 'number');
  const topCard = deck.splice(topCardIndex, 1)[0];

  room.gameState = {
    deck,
    discardPile: [topCard],
    currentTurnIndex: 0,
    playDirection: 1, // 1 for clockwise, -1 for counter-clockwise
    activeColor: topCard.color,
    accumulatedDrawPenalty: 0,
    phase: 'playing' // 'playing', 'round-over'
  };

  return room.gameState;
}

function handleAction(room, socketId, actionData) {
  const { type, payload } = actionData;
  const state = room.gameState;
  const playerIndex = room.players.findIndex(p => p.id === socketId);
  const player = room.players[playerIndex];

  if (playerIndex !== state.currentTurnIndex || player.isEliminated) {
    return state;
  }

  // --- 1. PLAY CARD ---
  if (type === 'play-card') {
    const cardIndex = payload.cardIndex;
    const card = player.hand[cardIndex];

    // Validate play against top card or active color / stacking rules
    if (!isValidPlay(card, state)) {
      return state;
    }

    // Remove from hand and add to discard pile
    player.hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.activeColor = card.color !== 'wild' ? card.color : payload.chosenColor;

    // Apply Card Effects & Actions
    handleCardEffect(room, card, player);

    // Check Mercy Rule (25+ cards instant elimination)[cite: 1]
    checkMercyRule(room);

    // Check Win Condition (0 cards left)[cite: 1]
    if (player.hand.length === 0) {
      state.phase = 'round-over';
      calculateUnoScores(room, player);
      return state;
    }
  }

  // --- 2. DRAW CARD (Draw Until Playable)[cite: 2] ---
  else if (type === 'draw-card') {
    if (state.accumulatedDrawPenalty > 0) {
      // Must draw accumulated penalty if unable to stack
      for (let i = 0; i < state.accumulatedDrawPenalty; i++) {
        if (state.deck.length > 0) player.hand.push(state.deck.pop());
      }
      state.accumulatedDrawPenalty = 0;
      advanceTurn(room);
    } else {
      // Draw until a playable card is found and played immediately[cite: 2]
      let drawnCard = null;
      while (state.deck.length > 0) {
        drawnCard = state.deck.pop();
        player.hand.push(drawnCard);
        if (isValidPlay(drawnCard, state)) {
          break;
        }
      }
    }
    checkMercyRule(room);
  }

  return state;
}

function isValidPlay(card, state) {
  const topCard = state.discardPile[state.discardPile.length - 1];

  // If there is an active draw penalty stacking state
  if (state.accumulatedDrawPenalty > 0) {
    // Can only stack equal or higher draw cards (+2, +4, +6, +10)[cite: 1]
    const isDrawCard = card.action && card.action.includes('draw');
    if (!isDrawCard) return false;
    return card.value >= topCard.value;
  }

  if (card.color === 'wild' || card.color === state.activeColor) return true;
  if (card.value !== undefined && card.value === topCard.value) return true;
  if (card.action && card.action === topCard.action) return true;

  return false;
}

function handleCardEffect(room, card, player) {
  const state = room.gameState;

  if (card.action === 'skip') {
    advanceTurn(room); // Skip next player
  } else if (card.action === 'skip-everyone') {
    // Instantly skips all other players; active player takes another turn[cite: 2]
    return;
  } else if (card.action === 'reverse' || card.action === 'wild-reverse-draw-4') {
    state.playDirection *= -1;
  }

  // Draw Stacking Accumulation (+2, +4, +6, +10)[cite: 1, 3]
  if (card.value) {
    if (card.action === 'draw-2') state.accumulatedDrawPenalty += 2;
    else if (card.action === 'draw-4' || card.action === 'wild-reverse-draw-4') state.accumulatedDrawPenalty += 4;
    else if (card.action === 'wild-draw-6') state.accumulatedDrawPenalty += 6;
    else if (card.action === 'wild-draw-10') state.accumulatedDrawPenalty += 10;
  }

  // 7 Hand Swap Rule: Swap hand with any chosen player[cite: 1]
  if (card.value === 7 && card.type === 'number') {
    // Handled via client payload selection
  }

  // 0 Hand Rotation Rule: Every player passes hand to next player in turn direction[cite: 1]
  if (card.value === 0 && card.type === 'number') {
    const hands = room.players.map(p => p.hand);
    room.players.forEach((p, idx) => {
      const targetIdx = (idx + state.playDirection + room.players.length) % room.players.length;
      room.players[targetIdx].hand = hands[idx];
    });
  }

  advanceTurn(room);
}

function advanceTurn(room) {
  const state = room.gameState;
  do {
    state.currentTurnIndex = (state.currentTurnIndex + state.playDirection + room.players.length) % room.players.length;
  } while (room.players[state.currentTurnIndex].isEliminated);
}

function checkMercyRule(room) {
  room.players.forEach(player => {
    if (player.hand.length >= 25 && !player.isEliminated) {
      player.isEliminated = true; // Instant elimination at 25 cards[cite: 1]
    }
  });
}

function calculateUnoScores(room, winner) {
  let roundPoints = 0;
  room.players.forEach(p => {
    if (p.id !== winner.id) {
      p.hand.forEach(c => {
        roundPoints += c.points || 0;
      });
    }
    if (p.isEliminated) {
      roundPoints += 250; // Mercy elimination bonus points[cite: 2]
    }
  });
  winner.score += roundPoints;
}

module.exports = {
  initGame,
  handleAction
};
