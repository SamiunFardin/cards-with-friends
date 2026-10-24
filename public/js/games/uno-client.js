/**
 * UNO Show 'Em No Mercy Client UI Handler & Global Game Render Dispatcher
 */
(function() {
  window.initUnoUI = function(gameState, socket, roomCode) {
    const container = document.getElementById('game-table-container');
    container.innerHTML = `
      <div class="uno-container">
        <h2>UNO Show 'Em No Mercy</h2>
        <div class="uno-table">
          <div id="uno-discard-pile"></div>
          <button class="uno-btn-call" id="uno-call-btn">UNO!</button>
        </div>
        <div id="uno-my-hand" class="cb-hand"></div>
      </div>
    `;
    renderUno(gameState, socket, roomCode);
  };

  function renderUno(state, socket, roomCode) {
    // Uno-specific render logic on update
  }
})();

window.initGameUI = function(gameType, gameState, socket, roomCode) {
  if (gameType === 'callbridge' && window.initCallBridgeUI) {
    window.initCallBridgeUI(gameState, socket, roomCode);
  } else if (gameType === 'twentynine' && window.initTwentyNineUI) {
    window.initTwentyNineUI(gameState, socket, roomCode);
  } else if (gameType === 'poker' && window.initPokerUI) {
    window.initPokerUI(gameState, socket, roomCode);
  } else if (gameType === 'uno' && window.initUnoUI) {
    window.initUnoUI(gameState, socket, roomCode);
  }
};

window.renderGameUI = function(gameType, gameState, socket, roomCode) {
  if (gameType === 'callbridge' && window.initCallBridgeUI) {
    window.initCallBridgeUI(gameState, socket, roomCode);
  } else if (gameType === 'twentynine' && window.initTwentyNineUI) {
    window.initTwentyNineUI(gameState, socket, roomCode);
  } else if (gameType === 'poker' && window.initPokerUI) {
    window.initPokerUI(gameState, socket, roomCode);
  } else if (gameType === 'uno' && window.initUnoUI) {
    window.initUnoUI(gameState, socket, roomCode);
  }
};
