const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let currentGame = 'dice';
let gameObjects = {};

// 1. 젠가 18층 물리 블록 생성
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

// 2. 주사위 & 피규어 보드 생성
function createDiceBoardObjects() {
  return {
    dice1: { id: 'dice1', type: 'dice', x: -1.5, y: 1, z: 0, color: 0xffffff },
    dice2: { id: 'dice2', type: 'dice', x: 1.5, y: 1, z: 0, color: 0xffffff },
    figure_red: { id: 'figure_red', type: 'figure', x: -3, y: 0.6, z: -3, color: 0xef4444 },
    figure_blue: { id: 'figure_blue', type: 'figure', x: 3, y: 0.6, z: 3, color: 0x3b82f6 },
    token_yellow: { id: 'token_yellow', type: 'token', x: -1, y: 0.2, z: 2, color: 0xeab308 },
    token_green: { id: 'token_green', type: 'token', x: 1, y: 0.2, z: 2, color: 0x10b981 }
  };
}

// 3. 플라잉 카드 보드 생성
function createFlyingCardObjects() {
  const objects = {};
  const suits = ['♠', '♥', '♦', '♣', '♠', '♥'];
  const values = ['A', 'K', 'Q', 'J', '10', '7'];
  
  for (let i = 0; i < 6; i++) {
    const id = `flying_card_${i}`;
    const row = Math.floor(i / 3);
    const col = i % 3;
    objects[id] = {
      id, type: 'flying_card',
      x: -2 + col * 2, y: 0.05, z: -1.5 + row * 3,
      suit: suits[i], value: values[i],
      color: (suits[i] === '♥' || suits[i] === '♦') ? '#ef4444' : '#1e293b'
    };
  }
  return objects;
}

gameObjects = createDiceBoardObjects();

// 소켓 통신 이벤트
io.on('connection', (socket) => {
  socket.emit('init-game-mode', { game: currentGame });
  socket.emit('init-physics-objects', gameObjects);

  // 모달 메뉴 변경 수신
  socket.on('change-game', (gameType) => {
    currentGame = gameType;
    if (gameType === 'jenga') gameObjects = createJengaBlocks();
    else if (gameType === 'dice') gameObjects = createDiceBoardObjects();
    else if (gameType === 'cards') gameObjects = createFlyingCardObjects();

    io.emit('init-game-mode', { game: gameType });
    io.emit('init-physics-objects', gameObjects);
  });

  // 물체 이동 및 회전 실시간 동기화
  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      Object.assign(gameObjects[data.id], data);
      socket.broadcast.emit('update-object', data);
    }
  });

  // 주사위 굴리기 신호
  socket.on('roll-dice', () => {
    io.emit('roll-dice-action');
  });

  // 카드 3D Flip 신호
  socket.on('flip-card', (cardId) => {
    io.emit('flip-card-action', { id: cardId });
  });

  // 판 초기화
  socket.on('reset-game', () => {
    if (currentGame === 'jenga') gameObjects = createJengaBlocks();
    else if (currentGame === 'dice') gameObjects = createDiceBoardObjects();
    else if (currentGame === 'cards') gameObjects = createFlyingCardObjects();

    io.emit('init-physics-objects', gameObjects);
  });
});

server.listen(PORT, () => {
  console.log(`TTS 서버 실행 중: 포트 ${PORT}`);
});
