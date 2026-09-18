const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let currentGame = 'jenga';
let gameObjects = {};

// 1. 젠가 블록 생성 (안정화 유격 적용)
function createJengaBlocks() {
  const blocks = {};
  const blockWidth = 3;
  const blockHeight = 0.6;
  let idCount = 0;

  for (let floor = 0; floor < 18; floor++) {
    const isEven = floor % 2 === 0;
    // Y축 높이 간격을 0.6 -> 0.62로 미세하게 늘려 층간 겹침 방지
    const y = floor * 0.62 + blockHeight / 2 + 0.1;

    for (let i = 0; i < 3; i++) {
      const id = `jenga_${idCount++}`;
      // 가로 간격을 1.0 -> 1.05로 미세하게 늘려 옆 블록과의 충돌 방지
      const offset = (i - 1) * 1.05;

      let x = 0, z = 0, rotY = 0;

      if (isEven) {
        x = 0;
        z = offset;
        rotY = 0;
      } else {
        x = offset;
        z = 0;
        rotY = Math.PI / 2;
      }

      blocks[id] = {
        id,
        type: 'jenga_block',
        x, y, z,
        rotX: 0, rotY, rotZ: 0,
        color: 0xd2b48c
      };
    }
  }
  return blocks;
}

// 2. 클래식 보드게임 생성
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

gameObjects = createJengaBlocks();

io.on('connection', (socket) => {
  console.log('플레이어 접속:', socket.id);

  socket.emit('init-game', { game: currentGame, objects: gameObjects });

  socket.on('change-game', (gameType) => {
    currentGame = gameType;
    if (gameType === 'jenga') {
      gameObjects = createJengaBlocks();
    } else if (gameType === 'classic') {
      gameObjects = createClassicBoardObjects();
    }
    io.emit('init-game', { game: currentGame, objects: gameObjects });
  });

  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      Object.assign(gameObjects[data.id], data);
      socket.broadcast.emit('update-object', data);
    }
  });

  socket.on('reset-game', () => {
    if (currentGame === 'jenga') {
      gameObjects = createJengaBlocks();
    } else if (currentGame === 'classic') {
      gameObjects = createClassicBoardObjects();
    }
    io.emit('init-game', { game: currentGame, objects: gameObjects });
  });

  socket.on('disconnect', () => {
    console.log('플레이어 접속 해제:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
