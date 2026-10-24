/**
 * Call Bridge Client Game UI Handler
 */
(function() {
  window.initCallBridgeUI = function(gameState, socket, roomCode) {
    const container = document.getElementById('game-table-container');
    container.innerHTML = `
      <div class="cb-container">
        <h2>Call Bridge Table</h2>
        <div id="cb-bidding-area" class="cb-bidding-modal hidden">
          <h3>Choose Your Bid</h3>
          <div class="cb-bids-grid" id="cb-bids-buttons"></div>
        </div>
        <div class="cb-table">
          <div id="cb-trick-area" class="cb-trick-area"></div>
          <div id="cb-my-hand" class="cb-hand"></div>
        </div>
      </div>
    `;

    renderCallBridge(gameState, socket, roomCode);
  };

  function renderCallBridge(state, socket, roomCode) {
    const biddingArea = document.getElementById('cb-bidding-area');
    const bidsGrid = document.getElementById('cb-bids-buttons');
    const handContainer = document.getElementById('cb-my-hand');

    if (state.phase === 'bidding' || state.phase === 'rebidding') {
      biddingArea.classList.remove('hidden');
      bidsGrid.innerHTML = '';
      for (let i = 1; i <= 13; i++) {
        const btn = document.createElement('button');
        btn.className = 'cb-bid-btn';
        btn.innerText = i;
        btn.onclick = () => {
          const actionType = state.phase === 'bidding' ? 'submit-bid' : 'rebid';
          socket.emit('game-action', {
            roomCode,
            actionData: { type: actionType, payload: { bid: i } }
          });
          biddingArea.classList.add('hidden');
        };
        bidsGrid.appendChild(btn);
      }
    } else {
      biddingArea.classList.add('hidden');
    }
  }
})();
