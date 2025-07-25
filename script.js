import { emitAction, socket, mirrorCell } from './socket.js';
let columns, rows, cells = [];
let playerIndex = null;
let myScore = 0;
let opponentScore = 0;
let canPlay = true;

// Add result section for scores
// Toast notification helper
function showToast(message, duration = 3000) {
    let toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

window.addEventListener('DOMContentLoaded', () => {
    // Listen for userJoined event from server
    socket.on('userJoined', ({ userId, totalUsers }) => {
        showToast(`A new user joined! Total users: ${totalUsers}`);
        if(totalUsers === 2){
            emitAction(mirrorCell(playerIndex, columns, rows), 'opponent', 'add');
        }
    });
    const resultDiv = document.createElement('div');
    resultDiv.id = 'result';
    resultDiv.innerHTML = `<b>Your Score:</b> <span id="my-score">0</span> | <b>Opponent Score:</b> <span id="opponent-score">0</span>`;
    document.body.insertBefore(resultDiv, document.body.firstChild.nextSibling);

    // Listen for room full event from server
    socket.on('roomFull', () => {
        canPlay = false;
        document.getElementById('result').innerHTML = '<b>Room is full. You are a spectator.</b>';
        window.removeEventListener('keydown', keydownHandler);
        socket.disconnect();
    });

    const container = document.querySelector('.container');
    const cellSize = 25;
    const cellMargin = 0;
    const containerHeight = container.clientHeight;
    const containerWidth = container.clientWidth;
    columns = Math.floor(containerWidth / (cellSize + cellMargin));
    rows = Math.floor(containerHeight / cellSize);
    const cellTotal = (columns) * (rows);
    let filledHeight = 0;
    let count = 0;
    while (filledHeight < containerHeight) {
        console.log(`Adding cell ${count + 1}`);
        const cell = document.createElement('div');
        cell.className = 'cell';
        // cell.innerText = count + 1; // Optional: display cell number
        container.appendChild(cell);
        cells.push(cell);
        count++;
        if (count % cellTotal === 0) {
            filledHeight = container.scrollHeight;
        }
    }
    let start = ((rows - 1) * columns) + (Math.floor(Math.random() * columns));
    playerIndex = start;
    // Remove 'player' class from all cells before setting new position
    const isReload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    const resetReloadFlag = localStorage.getItem('resetReload');
    // console.log('isReload:', isReload, 'resetReloadFlag:', resetReloadFlag);
    if (isReload) {
        // Always clear all cell classes on reload
        cells.forEach((cell, idx) => {
            ['player', 'opponent', 'bullet'].forEach(className => {
                if (cell.classList.contains(className)) {
                    cell.classList.remove(className);
                    // emitAction(mirrorCell(idx, columns, rows), className, 'remove');
                }
            });
        });
        console.log('Cleared all cell classes on reload', resetReloadFlag);
        // Only emit reset if not reloading from reset
        if (!resetReloadFlag) {
            if (canPlay) {
                console.log('Emitting reset action on reload');
                socket.emit('action', { type: 'reset', senderId: socket.id });
                //    emitAction(mirrorCell(playerIndex, columns, rows), 'opponent', 'add');
            }
        } else {
            localStorage.removeItem('resetReload');
        }
    }

    if (canPlay) {
        cells[playerIndex].classList.add('player');
        emitAction(mirrorCell(playerIndex, columns, rows), 'opponent', 'add');
    }
    // Listen for left/right arrow key presses
    function keydownHandler(e) {
        if (!canPlay || playerIndex === null) return;
        let newIndex = playerIndex;
        if (e.key === 'ArrowLeft') {
            if (playerIndex % columns !== 0) {
                newIndex = playerIndex - 1;
                emitAction(mirrorCell(playerIndex, columns, rows), 'opponent', 'remove');
                emitAction(mirrorCell(newIndex, columns, rows), 'opponent', 'add');
            }
        } else if (e.key === 'ArrowRight') {
            if ((playerIndex + 1) % columns !== 0) {
                newIndex = playerIndex + 1;
                emitAction(mirrorCell(playerIndex, columns, rows), 'opponent', 'remove');
                emitAction(mirrorCell(newIndex, columns, rows), 'opponent', 'add');
            }
        } else if (e.key === 'ArrowUp') {
            shootBullet();
            return;
        } else {
            return;
        }
        if (newIndex !== playerIndex) {
            cells[playerIndex].classList.remove('player');
            cells[newIndex].classList.add('player');
            playerIndex = newIndex;
        }
    }
    window.addEventListener('keydown', keydownHandler);

    function shootBullet() {
        let bulletTimeout = null;
        let bulletIndex = playerIndex - columns;
        let prevIndex = null;
        function propagate() {
            if (bulletIndex >= 0) {
                if (prevIndex !== null) {
                    cells[prevIndex].classList.remove('bullet');
                    emitAction(mirrorCell(prevIndex, columns, rows), 'bullet', 'remove');
                }
                // Check for opponent
                if (cells[bulletIndex].classList.contains('opponent')) {
                    cells[bulletIndex].classList.remove('opponent');
                    cells[bulletIndex].classList.add('bullet');
                    emitAction(mirrorCell(bulletIndex, columns, rows), 'player', 'remove');
                    emitAction(mirrorCell(bulletIndex, columns, rows), 'bullet', 'add');
                    setTimeout(() => {
                        cells[bulletIndex].classList.remove('bullet');
                        emitAction(mirrorCell(bulletIndex, columns, rows), 'bullet', 'remove');
                        clearTimeout(bulletTimeout);
                    }, 100);
                    myScore += 20;
                    document.getElementById('my-score').textContent = myScore;
                    socket.emit('action', { type: 'score', score: 20, senderId: socket.id });
                    checkGameEnd();
                    return;
                }
                cells[bulletIndex].classList.add('bullet');
                emitAction(mirrorCell(bulletIndex, columns, rows), 'bullet', 'add');
                prevIndex = bulletIndex;
                bulletIndex -= columns;
                bulletTimeout = setTimeout(propagate, 50); // Adjust speed as needed
            } else if (prevIndex !== null) {
                cells[prevIndex].classList.remove('bullet');
                emitAction(mirrorCell(prevIndex, columns, rows), 'bullet', 'remove');
                // User breached opponent's defense, increase score and emit
                myScore++;
                document.getElementById('my-score').textContent = myScore;
                socket.emit('action', { type: 'score', senderId: socket.id });
                checkGameEnd();
                clearTimeout(bulletTimeout);
                bulletTimeout = null;
            }
        }
        propagate();
    }

    // End game if score difference > 10
    function checkGameEnd() {
        if (Math.abs(myScore - opponentScore) > 10) {
            let winnerMsg, loserMsg;
            if (myScore > opponentScore) {
                winnerMsg = (myScore - opponentScore > 15) ? 'Opponent down!' : 'You win!';
                loserMsg = (myScore - opponentScore > 15) ? 'You were crushed!' : 'You lose!';
            } else {
                winnerMsg = 'Opponent wins!';
                loserMsg = 'You lose!';
            }
            const resultDiv = document.getElementById('result');
            if (!resultDiv.innerHTML.includes('Game Over')) {
                resultDiv.innerHTML += `<br><b>Game Over:</b> ${winnerMsg}<br><i>Reload the page to start playing again.</i>`;
                window.removeEventListener('keydown', keydownHandler);
                emitAction(null, null, null); // flush any pending emits
                socket.emit('action', { type: 'gameover', loserMsg, senderId: socket.id });
            }
        }
    }

    // Handle incoming actions from the server (from opponent)
    socket.on('action', (action) => {
        if (action.senderId && action.senderId === socket.id) return;
        if (action.type === 'reset') {
            // Set flag so we don't emit reset again on reload
            localStorage.setItem('resetReload', 'true');
            window.location.reload();
            return;
        }
        if (action.type === 'score') {
            // Opponent breached your defense, increase their score
            opponentScore += action.score || 1; // Default to 1 if no score provided
            document.getElementById('opponent-score').textContent = opponentScore;
            checkGameEnd();
            return;
        }
        if (action.type === 'gameover' && (action.winnerMsg || action.loserMsg)) {
            // Show loserMsg if present, otherwise fallback to winnerMsg
            const msg = action.loserMsg || 'Game Over';
            const resultDiv = document.getElementById('result');
            if (!resultDiv.innerHTML.includes('Game Over')) {
                resultDiv.innerHTML += `<br><b>Game Over:</b> ${msg}<br><i>Reload the page to start playing again.</i>`;
                window.removeEventListener('keydown', keydownHandler);
            }
            return;
        }
        // Mirror the cell index to get the correct cell for this user's perspective
        if (action.className === 'opponent') {
            console.log('Received opponent action:', action, action.senderId);
        }
        const cellIndex = action.cell;
        if (!cells[cellIndex]) return;
        if (action.actionType === 'add') {
            cells[cellIndex].classList.add(action.className);
        } else if (action.actionType === 'remove') {
            cells[cellIndex].classList.remove(action.className);
        }
    });

});



