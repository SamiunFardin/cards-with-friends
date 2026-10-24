/**
 * Texas Hold'em Poker Client UI Handler
 */
(function() {
  window.initPokerUI = function(gameState, socket, roomCode) {
    const container = document.getElementById('game-table-container');
    container.innerHTML = `
      <div class="poker-table">
        <div class="poker-pot">Pot: $<span id="poker-pot-val">0</span></div>
        <div id="poker-community-cards" class="poker-community"></div>
        <div id="poker-my-hand" class="cb-hand" style="bottom: 20px;"></div>
      </div>
      <div class="poker-controls">
        <button class="btn" id="poker-fold-btn">Fold</button>
        <button class="btn" id="poker-call-btn">Call / Check</button>
        <button class="btn" id="poker-raise-btn">Raise</button>
      </div>
    `;

    document.getElementById('poker-fold-btn').onclick = () => {
      socket.emit('game-action', { roomCode, actionData: { type: 'fold' } });
    };
    document.getElementById('poker-call-btn').onclick = () => {
      socket.emit('game-action', { roomCode, actionData: { type: 'call' } });
    };
  };
})();
