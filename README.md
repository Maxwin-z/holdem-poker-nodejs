# 德州扑克 nodejs 版本

居家隔离，线上好友交流用。  
PC 界面，利于操作。可本地化部署，无需持久化存储。

## 运行

```
npm i
npm run build
pm2 start dist/src/server/app-server.js
```

## 开发

```
npm i
npm run start:web		# start react app
npm run watch-server	# start server
```

## 说明

核心算法：`src/server/utils/game-engine.ts`
