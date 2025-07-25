import { io } from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';
export const socket = io('https://casualclashbackend.onrender.com'); // Change to your backend URL if needed

// Utility to mirror a cell index for the opponent's perspective
export function mirrorCell(cellIndex, columns, rows) {
  // Given a cellIndex, columns, and rows, return the mirrored index
  const row = Math.floor(cellIndex / columns);
  const col = cellIndex % columns;
  const mirroredRow = rows - 1 - row;
  const mirroredCol = columns - 1 - col;
  return mirroredRow * columns + mirroredCol;
}

// Emit an action: { cell, className, actionType: 'add' | 'remove' }
// Queue for actions before socket is connected
const emitQueue = [];
let isConnected = false;

socket.on('connect', () => {
  isConnected = true;
  // Flush queued emits
  while (emitQueue.length > 0) {
    const { cell, className, actionType } = emitQueue.shift();
    socket.emit('action', { cell, className, actionType, senderId: socket.id });
  }
});

export function emitAction(cell, className, actionType) {
  if(className === 'bullet'){
    className= 'opponent-bullet'; // Ensure opponent's bullet class is used
  }
  if (isConnected && socket.id) {
    socket.emit('action', { cell, className, actionType, senderId: socket.id });
  } else {
    emitQueue.push({ cell, className, actionType });
  }
}

// Listen for actions from the server
// socket.on('action', (action) => {
//   // Ignore actions from self
//   if (action.senderId && action.senderId === socket.id) return;
//   // action: { cell, className, actionType, senderId }
//   // You should mirror the cell index for the opponent's perspective
//   // Example: handleOpponentAction(action)
//   console.log('Received action from server:', action);
// });
