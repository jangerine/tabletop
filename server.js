const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let currentGame = 'jenga'; // 'jenga', 'classic', 'onecard'
let gameObjects = {};

// 1. 젠가 생성
function createJengaBlocks() {
  const blocks = {};
  let idCount = 0;
  for (let floor = 0; floor < 18; floor++) {
    const isEven = floor % 2 === 0;
    const y = floor * 0.62 + 0.4;
    for (let i = 0; i < 3; i++) {
      const id = `jenga_${idCount++}`;
      const offset = (i - 1) * 1.05;
      blocks[id] = {
        id, type: 'jenga_block',
        x: isEven ? 0 : offset, y, z: isEven ? offset : 0,
        rotY: isEven ? 0 : Math.PI / 2, color: 0xd2b48c
      };
    }
  }
  return blocks;
}

// 2. 클래식 보드 생성 (주사위 및 말)
function createClassicObjects() {
  return {
    dice1: { id: 'dice1', type: 'dice', x: -2, y: 1, z: 0, color: 0xffffff },
    dice2: { id: 'dice2', type: 'dice', x: 2, y: 1, z: 0, color: 0xffffff },
    red_pawn: { id: 'red_pawn', type: 'token', x: -3, y: 0.5, z: -3, color: 0xef4444 },
    blue_pawn: { id: 'blue_pawn', type: 'token', x: 3, y: 0.5, z: 3, color: 0x3b82f6 }
  };
}

// 3. 원카드 상태
let players = [];
let currentTurnIndex = 0;
let drawDeck = [];
let discardPile = [];
let playerHands = {};

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  let id = 0;
  for (let s of suits) {
    for (let v of values) {
      deck.push({ id: `card_${id++}`, suit: s, value: v, color: (s==='♥'||s==='♦')?'#ef4444':'#1e293b' });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function initOneCard() {
  drawDeck = createDeck();
  discardPile = [drawDeck.pop()];
  playerHands = {};
  players.forEach(pId => { playerHands[pId] = drawDeck.splice(0, 7); });
  broadcastOneCardState();
}

function broadcastOneCardState() {
  players.forEach(pId => {
    io.to(pId).emit('update-onecard-state', {
      myHand: playerHands[pId] || [],
      topCard: discardPile[discardPile.length - 1],
      isMyTurn: players[currentTurnIndex] === pId
    });
  });
}

gameObjects = createJengaBlocks();

io.on('connection', (socket) => {
  players.push(socket.id);
  socket.emit('init-game-mode', { game: currentGame });
  if (currentGame !== 'onecard') socket.emit('init-objects', gameObjects);
  else broadcastOneCardState();

  socket.on('change-game', (game) => {
    currentGame = game;
    if (game === 'jenga') gameObjects = createJengaBlocks();
    else if (game === 'classic') gameObjects = createClassicObjects();
    else if (game === 'onecard') initOneCard();
    
    io.emit('init-game-mode', { game });
    if (game !== 'onecard') io.emit('init-objects', gameObjects);
  });

  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      Object.assign(gameObjects[data.id], data);
      socket.broadcast.emit('update-object', data);
    }
  });

  socket.on('play-card', (cardId) => {
    if (currentGame !== 'onecard' || players[currentTurnIndex] !== socket.id) return;
    const hand = playerHands[socket.id] || [];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      discardPile.push(hand.splice(idx, 1)[0]);
      currentTurnIndex = (currentTurnIndex + 1) % players.length;
      broadcastOneCardState();
    }
  });

  socket.on('draw-card', () => {
    if (currentGame !== 'onecard' || players[currentTurnIndex] !== socket.id) return;
    if (drawDeck.length > 0) playerHands[socket.id].push(drawDeck.pop());
    currentTurnIndex = (currentTurnIndex + 1) % players.length;
    broadcastOneCardState();
  });

  socket.on('reset-game', () => {
    if (currentGame === 'jenga') gameObjects = createJengaBlocks();
    else if (currentGame === 'classic') gameObjects = createClassicObjects();
    else if (currentGame === 'onecard') initOneCard();
    
    if (currentGame !== 'onecard') io.emit('init-objects', gameObjects);
  });

  socket.on('disconnect', () => {
    players = players.filter(id => id !== socket.id);
    delete playerHands[socket.id];
  });
});

server.listen(PORT, () => console.log(`TTS Server running on port ${PORT}`));
