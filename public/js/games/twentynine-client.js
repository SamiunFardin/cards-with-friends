/**
 * 29 Card Game Client UI Handler
 */
(function() {
  window.initTwentyNineUI = function(gameState, socket, roomCode) {
    const container = document.getElementById('game-table-container');
    container.innerHTML = `
      <div class="tn-container">
        <h2>29 Card Game</h2>
        <div class="tn-scoreboard">
          <div>Team A Points: <span id="tn-score-0">0</span></div>
          <div>Team B Points: <span id="tn-score-1">0</span></div>
        </div>
        <div class="tn-table">
          <div class="tn-trump-indicator" id="tn-trump-status">Trump: Hidden</div>
          <div id="tn-trick-area" class="cb-trick-area"></div>
          <div id="tn-my-hand" class="cb-hand"></div>
        </div>
      </div>
    `;
  };
})();
