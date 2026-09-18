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

// ===== 1. 젠가 18층 물리 블록 생성 =====
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

// ===== 2. 클래식 보드: 주사위, 피규어, 플라잉 카드, 토큰 생성 =====
function createClassicBoardObjects() {
  const objects = {
    dice1: { id: 'dice1', type: 'dice', x: -1.5, y: 1, z: 0, color: 0xffffff },
    dice2: { id: 'dice2', type: 'dice', x: 1.5, y: 1, z: 0, color: 0xffffff },
    figure_red: { id: 'figure_red', type: 'figure', x: -3, y: 0.6, z: -3, color: 0xef4444 },
    figure_blue: { id: 'figure_blue', type: 'figure', x: 3, y: 0.6, z: 3, color: 0x3b82f6 },
    token_yellow: { id: 'token_yellow', type: 'token', x: 0, y: 0.15, z: 2, color: 0xeab308 },
    token_green: { id: 'token_green', type: 'token', x: 1.5, y: 0.15, z: 2, color: 0x10b981 }
  };

  // 테이블 위 3D 플라잉 카드 4장 배치
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', 'K', 'Q', 'J'];
  for (let i = 0; i < 4; i++) {
    const id = `flying_card_${i}`;
    objects[id] = {
      id, type: 'flying_card',
      x: -2.2 + i * 1.5, y: 0.2, z: -1,
      suit: suits[i], value: values[i],
      color: (suits[i] === '♥' || suits[i] === '♦') ? '#ef4444' : '#1e293b'
    };
  }

  return objects;
}

gameObjects = createClassicBoardObjects();

// ===== 소켓 통신 핸들러 =====
io.on('connection', (socket) => {
  socket.emit('init-game-mode', { game: currentGame });
  socket.emit('init-physics-objects', gameObjects);

  // 게임 종류 변경
  socket.on('change-game', (gameType) => {
    currentGame = gameType;
    if (gameType === 'jenga') gameObjects = createJengaBlocks();
    else if (gameType === 'classic') gameObjects = createClassicBoardObjects();

    io.emit('init-game-mode', { game: gameType });
    io.emit('init-physics-objects', gameObjects);
  });

  // 기물/카드 3D 위치 및 회전 동기화
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

  // 카드 공중 3D Flip 뒤집기 동기화
  socket.on('flip-card', (cardId) => {
    io.emit('flip-card-action', { id: cardId });
  });

  // 게임 판 초기화
  socket.on('reset-game', () => {
    if (currentGame === 'jenga') gameObjects = createJengaBlocks();
    else if (currentGame === 'classic') gameObjects = createClassicBoardObjects();

    io.emit('init-physics-objects', gameObjects);
  });
});

server.listen(PORT, () => {
  console.log(`테이블탑 시뮬레이터 서버 실행 중: 포트 ${PORT}`);
});
