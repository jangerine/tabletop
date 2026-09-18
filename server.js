const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let currentGame = 'onecard';
let gameObjects = {};

// ===== 1. 젠가 데이터 생성 =====
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

      let x = 0, z = 0, rotY = 0;
      if (isEven) {
        x = 0; z = offset; rotY = 0;
      } else {
        x = offset; z = 0; rotY = Math.PI / 2;
      }

      blocks[id] = {
        id, type: 'jenga_block',
        x, y, z, rotX: 0, rotY, rotZ: 0, color: 0xd2b48c
      };
    }
  }
  return blocks;
}

// ===== 2. 클래식 체크보드 데이터 생성 =====
function createClassicBoardObjects() {
  return {
    red_cube: { id: 'red_cube', type: 'cube', x: -3, y: 0.5, z: -3, color: 0xef4444 },
    red_token: { id: 'red_token', type: 'token', x: -3, y: 0.15, z: -1, color: 0xef4444 },
    blue_cube: { id: 'blue_cube', type: 'cube', x: 3, y: 0.5, z: 3, color: 0x3b82f6 },
    blue_token: { id: 'blue_token', type: 'token', x: 3, y: 0.15, z: 1, color: 0x3b82f6 },
    yellow_token: { id: 'yellow_token', type: 'token', x: 0, y: 0.15, z: 0, color: 0xeab308 },
    green_token: { id: 'green_token', type: 'token', x: 1, y: 0.15, z: -1, color: 0x10b981 }
  };
}

// ===== 3. 원카드 로직 =====
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
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

function getTopDiscardCard() {
  return discardPile[discardPile.length - 1];
}

function broadcastOneCardState() {
  const topCard = getTopDiscardCard();
  players.forEach((pId) => {
    io.to(pId).emit('update-onecard-state', {
      myHand: playerHands[pId] || [],
      topCard: topCard,
      currentTurnSocketId: players[currentTurnIndex],
      attackStack: attackStack
    });
  });
}

function nextTurn(step = 1) {
  if (players.length === 0) return;
  currentTurnIndex = (currentTurnIndex + step * turnDirection + players.length * 100) % players.length;
}

// ===== 소켓 통신 =====
io.on('connection', (socket) => {
  console.log('플레이어 접속:', socket.id);
  players.push(socket.id);

  socket.emit('init-game-mode', { game: currentGame });
  if (currentGame === 'jenga' || currentGame === 'classic') {
    socket.emit('init-physics-objects', gameObjects);
  } else if (currentGame === 'onecard') {
    if (Object.keys(playerHands).length === 0) initOneCardGame();
    else broadcastOneCardState();
  }

  socket.on('change-game', (gameType) => {
    currentGame = gameType;
    if (gameType === 'jenga') {
      gameObjects = createJengaBlocks();
      io.emit('init-game-mode', { game: 'jenga' });
      io.emit('init-physics-objects', gameObjects);
    } else if (gameType === 'classic') {
      gameObjects = createClassicBoardObjects();
      io.emit('init-game-mode', { game: 'classic' });
      io.emit('init-physics-objects', gameObjects);
    } else if (gameType === 'onecard') {
      initOneCardGame();
      io.emit('init-game-mode', { game: 'onecard' });
    }
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
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = hand[cardIndex];
    const topCard = getTopDiscardCard();

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

    nextTurn(skipTurn);
    broadcastOneCardState();
  });

  socket.on('draw-card', () => {
    if (currentGame !== 'onecard' || players[currentTurnIndex] !== socket.id) return;

    if (drawDeck.length === 0) {
      const top = discardPile.pop();
      drawDeck = discardPile;
      discardPile = [top];
    }

    const drawCount = attackStack > 0 ? attackStack : 1;
    attackStack = 0;

    for (let i = 0; i < drawCount; i++) {
      if (drawDeck.length > 0) {
        playerHands[socket.id].push(drawDeck.pop());
      }
    }

    nextTurn(1);
    broadcastOneCardState();
  });

  socket.on('shout-onecard', () => {
    io.emit('toast-message', { text: `📢 플레이어가 [원카드!]를 외쳤습니다!` });
  });

  socket.on('reset-game', () => {
    if (currentGame === 'jenga') {
      gameObjects = createJengaBlocks();
      io.emit('init-physics-objects', gameObjects);
    } else if (currentGame === 'classic') {
      gameObjects = createClassicBoardObjects();
      io.emit('init-physics-objects', gameObjects);
    } else if (currentGame === 'onecard') {
      initOneCardGame();
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(id => id !== socket.id);
    delete playerHands[socket.id];
    if (players.length > 0 && currentGame === 'onecard') {
      currentTurnIndex = currentTurnIndex % players.length;
      broadcastOneCardState();
    }
  });
});

server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
