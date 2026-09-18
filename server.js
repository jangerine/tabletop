const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 정적 파일 제공 (public 폴더 내 index.html 서빙)
app.use(express.static(path.join(__dirname, 'public')));

// 🎲 보드게임 시작 시 판 위에 놓여있을 기본 말(오브젝트) 데이터
let gameObjects = {
  // 빨간팀 말 (큐브 & 토큰)
  red_cube: { id: 'red_cube', type: 'cube', x: -3, y: 0.5, z: -3, color: 0xef4444 },
  red_token: { id: 'red_token', type: 'token', x: -3, y: 0.15, z: -1, color: 0xef4444 },

  // 파란팀 말 (큐브 & 토큰)
  blue_cube: { id: 'blue_cube', type: 'cube', x: 3, y: 0.5, z: 3, color: 0x3b82f6 },
  blue_token: { id: 'blue_token', type: 'token', x: 3, y: 0.15, z: 1, color: 0x3b82f6 },

  // 중앙 공유 토큰 (노란색 & 초록색)
  yellow_token: { id: 'yellow_token', type: 'token', x: 0, y: 0.15, z: 0, color: 0xeab308 },
  green_token: { id: 'green_token', type: 'token', x: 1, y: 0.15, z: -1, color: 0x10b981 }
};

// 소켓 통신 연결 설정
io.on('connection', (socket) => {
  console.log('새 플레이어 접속:', socket.id);

  // 1. 새 접속자에게 현재 보드판 위의 모든 말 위치 전송
  socket.emit('init-state', gameObjects);

  // 2. 플레이어가 말을 움직였을 때 실시간 위치 공유
  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      // 서버 데이터 업데이트
      gameObjects[data.id].x = data.x;
      gameObjects[data.id].z = data.z;
      
      // 나를 제외한 다른 모든 플레이어에게 이동 좌표 방송(Broadcast)
      socket.broadcast.emit('update-object', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('플레이어 접속 해제:', socket.id);
  });
});

// 서버 실행
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 성공적으로 실행 중입니다.`);
});
