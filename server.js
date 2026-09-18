const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let gameObjects = {}; // 보드판 위 전체 물체 관리
let cardCount = 0;

// 젠가 18층 타워 생성
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

io.on('connection', (socket) => {
  // 접속 시 현재 보드판 상태 전달 (초기엔 빈 상태)
  socket.emit('init-physics-objects', gameObjects);

  // 메뉴 버튼 누를 때 보드판에 기물 추가/생성
  socket.on('add-objects', (type) => {
    if (type === 'clear') {
      gameObjects = {};
    } else if (type === 'dice') {
      gameObjects['dice1'] = { id: 'dice1', type: 'dice', x: -1.5, y: 1, z: 0, color: 0xffffff };
      gameObjects['dice2'] = { id: 'dice2', type: 'dice', x: 1.5, y: 1, z: 0, color: 0xffffff };
    } else if (type === 'figures') {
      gameObjects['figure_red'] = { id: 'figure_red', type: 'figure', x: -2, y: 0.6, z: -2, color: 0xef4444 };
      gameObjects['figure_blue'] = { id: 'figure_blue', type: 'figure', x: 2, y: 0.6, z: 2, color: 0x3b82f6 };
      gameObjects['token_yellow'] = { id: 'token_yellow', type: 'token', x: -1, y: 0.2, z: 1, color: 0xeab308 };
      gameObjects['token_green'] = { id: 'token_green', type: 'token', x: 1, y: 0.2, z: 1, color: 0x10b981 };
    } else if (type === 'cards') {
      const suits = ['♠', '♥', '♦', '♣'];
      const values = ['A', 'K', 'Q', 'J'];
      for (let i = 0; i < 4; i++) {
        const id = `flying_card_${cardCount++}`;
        gameObjects[id] = {
          id, type: 'flying_card',
          x: -2.2 + i * 1.5, y: 0.05, z: 0,
          suit: suits[i % 4], value: values[i % 4],
          color: (suits[i % 4] === '♥' || suits[i % 4] === '♦') ? '#dc2626' : '#1e293b'
        };
      }
    } else if (type === 'jenga') {
      gameObjects = createJengaBlocks();
    }

    io.emit('init-physics-objects', gameObjects);
  });

  // 물체 이동 위치 동기화
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

  // 카드 공중 Flip 신호
  socket.on('flip-card', (cardId) => {
    io.emit('flip-card-action', { id: cardId });
  });

  // 판 전체 비우기
  socket.on('reset-game', () => {
    gameObjects = {};
    io.emit('init-physics-objects', gameObjects);
  });
});

server.listen(PORT, () => {
  console.log(`TTS 서버 실행 중: 포트 ${PORT}`);
});
