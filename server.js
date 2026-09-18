const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let currentGame = 'classic';
let gameObjects = {};

// ===== 1. 젠가 생성 =====
function createJengaBlocks() {
  const blocks = {};
  const blockHeight = 0.6;
  let idCount = 0;

  for (let floor = 0; floor < 18; floor++) {
    const isEven = floor % 2 === 0;
    const y = floor * 0.62 + blockHeight / 2 + 0.1;

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

// ===== 2. 클래식 체크보드 & 피규어/주사위 생성 =====
function createClassicBoardObjects() {
  return {
    dice1: { id: 'dice1', type: 'dice', x: -1.5, y: 1, z: 0, color: 0xffffff },
    dice2: { id: 'dice2', type: 'dice', x: 1.5, y: 1, z: 0, color: 0xffffff },
    figure_red: { id: 'figure_red', type: 'figure', x: -3, y: 0.6, z: -3, color: 0xef4444 },
    figure_blue: { id: 'figure_blue', type: 'figure', x: 3, y: 0.6, z: 3, color: 0x3b82f6 },
    token_yellow: { id: 'token_yellow', type: 'token', x: 0, y: 0.15, z: 0, color: 0xeab308 },
    token_green: { id: 'token_green', type: 'token', x: 1, y: 0.15, z: -1, color: 0x10b981 }
  };
}

// ===== 3. 원카드 로직 (셔플 기능 지원) =====
let players = [];
let currentTurnIndex = 0;
let turnDirection = 1;
let drawDeck = [];
let discardPile = [];
let playerHands = {};
let attackStack = 0;

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  let id = 0;
  for (let s of SUITS) {
    for (let v of VALUES) {
      let color = (s === '♥' || s === '♦') ? '#ef4444' : '#1e293b';
      deck.push({ id: `card_${id++}`, suit: s, value: v, color });
    }
  }
  return shuffleArray(deck);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initOneCardGame() {
  drawDeck = createDeck();
  discardPile = [];
  playerHands = {};
  attackStack = 0;
  currentTurnIndex = 0;
  turnDirection = 1;

  let topCard = drawDeck.pop();
  while (['A', '2', '7', 'J', 'Q', 'K'].includes(topCard.value)) {
    drawDeck.unshift(topCard);
    topCard = drawDeck.pop();
  }
  discardPile.push(topCard);

  players.forEach(pId => {
    playerHands[pId] = drawDeck.splice(0, 7);
  });

  broadcastOneCardState();
}

function broadcastOneCardState() {
  const topCard = discardPile[discardPile.length - 1];
  players.forEach((pId) => {
    io.to(pId).emit('update-onecard-state', {
      myHand: playerHands[pId] || [],
      topCard: topCard,
      currentTurnSocketId: players[currentTurnIndex],
      attackStack: attackStack
    });
  });
}

gameObjects = createClassicBoardObjects();

io.on('connection', (socket) => {
  players.push(socket.id);

  socket.emit('init-game-mode', { game: currentGame });
  if (currentGame !== 'onecard') {
    socket.emit('init-physics-objects', gameObjects);
  } else {
    if (Object.keys(playerHands).length === 0) initOneCardGame();
    else broadcastOneCardState();
  }

  socket.on('change-game', (gameType) => {
    currentGame = gameType;
    if (gameType === 'jenga') gameObjects = createJengaBlocks();
    else if (gameType === 'classic') gameObjects = createClassicBoardObjects();
    else if (gameType === 'onecard') initOneCardGame();

    io.emit('init-game-mode', { game: gameType });
    if (gameType !== 'onecard') io.emit('init-physics-objects', gameObjects);
  });

  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      Object.assign(gameObjects[data.id], data);
      socket.broadcast.emit('update-object', data);
    }
  });

  // 주사위 굴리기 신호 전파
  socket.on('roll-dice', () => {
    io.emit('roll-dice-action');
  });

  // 덱 셔플 신호 전파
  socket.on('shuffle-deck', () => {
    if (currentGame === 'onecard') {
      drawDeck = shuffleArray(drawDeck);
      io.emit('toast-message', { text: '🔀 덱을 깔끔하게 섞었습니다!' });
      broadcastOneCardState();
    }
  });

  socket.on('play-card', (cardId) => {
    if (currentGame !== 'onecard' || players[currentTurnIndex] !== socket.id) return;

    const hand = playerHands[socket.id] || [];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = hand[cardIndex];
    const topCard = discardPile[discardPile.length - 1];

    let isValid = false;
    if (attackStack > 0) {
      if (card.value === 'A' || card.value === '2') isValid = true;
    } else {
      if (card.suit === topCard.suit || card.value === topCard.value) isValid = true;
    }

    if (!isValid) return;

    hand.splice(cardIndex, 1);
    discardPile.push(card);

    if (hand.length === 0) {
      io.emit('game-over', { winner: socket.id });
      setTimeout(initOneCardGame, 4000);
      return;
    }

    let skipTurn = 1;
    if (card.value === '2') attackStack += 2;
    else if (card.value === 'A') attackStack += (card.suit === '♠' ? 5 : 3);
    else if (card.value === 'J') skipTurn = 2;
    else if (card.value === 'Q') turnDirection *= -1;
    else if (card.value === 'K') skipTurn = 0;

    currentTurnIndex = (currentTurnIndex + skipTurn * turnDirection + players.length * 100) % players.length;
    broadcastOneCardState();
  });

  socket.on('draw-card', () => {
    if (currentGame !== 'onecard' || players[currentTurnIndex] !== socket.id) return;

    if (drawDeck.length === 0) {
      const top = discardPile.pop();
      drawDeck = shuffleArray(discardPile);
      discardPile = [top];
    }

    const drawCount = attackStack > 0 ? attackStack : 1;
    attackStack = 0;

    for (let i = 0; i < drawCount; i++) {
      if (drawDeck.length > 0) playerHands[socket.id].push(drawDeck.pop());
    }

    currentTurnIndex = (currentTurnIndex + turnDirection + players.length * 100) % players.length;
    broadcastOneCardState();
  });

  socket.on('reset-game', () => {
    if (currentGame === 'jenga') gameObjects = createJengaBlocks();
    else if (currentGame === 'classic') gameObjects = createClassicBoardObjects();
    else if (currentGame === 'onecard') initOneCardGame();

    if (currentGame !== 'onecard') io.emit('init-physics-objects', gameObjects);
  });

  socket.on('disconnect', () => {
    players = players.filter(id => id !== socket.id);
    delete playerHands[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: 포트 ${PORT}`);
});
