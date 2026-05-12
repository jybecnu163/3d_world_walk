# 🌍 3D 世界漫游系统
一个基于 Three.js 与 Node.js 的交互式 3D 地图漫游与编辑平台，支持自定义地图、物品管理、动态世界元素、录制回放和自动寻路。

## ✨ 功能特点
### 🎮 第一人称 3D 漫游
WASD 移动、鼠标环顾、空格跳跃，支持碰撞、重力、上墙和边缘掉落。

### 🗺️ 地图管理
左侧地图列表，可新增、修改、另存为地图，地图自动保存为后端 JSON 文件。

### 🧱 可视化地图编辑器

网格绘制、拖拽连续放置、擦除物品

支持墙壁、柱子、树木、建筑、道路等物品

物品定义从后端加载，树形分类展示

自定义物品编辑器：组合方块或上传 GLB 模型

地图另存为、网格大小可调、边界墙自动生成

### 📦 物品定义系统
每个物品由 id、category、blocks 或 GLB 模型组成，支持多部件组合、占格数、碰撞设置，保存于 items/*.json。

### 🗺️ 实时小地图
显示静态物品、动态元素、录制路径、玩家位置与朝向。GLB 物品以紫色标识。

### ⏺️ 录制与回放
按 R 录制行走路径，T 停止，Y 回放。每个地图独立存储录制数据（前端缓存）。

### 🍄 动态物品系统
随机在玩家周围刷新蘑菇、兔子、小汽车等物品，有生命周期，可靠近自动拾取。

### 🚶 自动行走与避障
按 U 自动走向最近的动态物品，遇障碍智能绕行，没有目标时原地等待。

### 🧩 模块化前端代码
纯 JavaScript ES Module，按功能拆分文件，便于维护和扩展。

## 🛠️ 技术栈
前端：Three.js (r160)、PointerLockControls、DRACOLoader、GLTFLoader、原生 Canvas

后端：Node.js + Express，JSON 文件存储

地图数据：JSON 格式（保存于 maps/ 目录）

物品定义：JSON 格式（保存于 items/ 目录）

3D 模型：GLB 格式（支持 Draco 压缩）

## 📦 项目结构
```text
map-world/
├── package.json
├── server.js               # Express 服务器 & API
├── public/
│   ├── index.html          # 主页面
│   └── js/
│       ├── main.js         # 入口，动画循环
│       ├── state.js        # 全局状态
│       ├── minimap.js      # 小地图
│       ├── world.js        # 3D 场景构建
│       ├── recorder.js     # 录制/回放
│       ├── player.js       # 玩家移动、跳跃、碰撞
│       ├── editor.js       # 地图编辑器
│       ├── itemEditor.js   # 物品编辑器
│       ├── items.js        # 物品定义加载
│       ├── mapLoader.js    # 地图列表与切换
│       ├── dynamics.js     # 动态物品
│       └── autoWalk.js     # 自动行走与避障
├── items/                  # 物品定义 JSON（例如 mushroom_red.json）
├── maps/                   # 地图数据 JSON（自动创建）
└── models/                 # GLB 模型文件（可选）
```

## 🚀 快速开始
1. 环境要求
   Node.js ≥ 14.x

2. 安装依赖
   ```bash
   cd map-world
   npm install
   ```
3. 启动服务器
   ```bash
   node server.js
   ```
4. 打开浏览器
   访问 http://localhost:3000 即可进入 3D 世界。

## 📖 使用指南
### 🔐 锁定鼠标
点击屏幕中央的提示区域，锁定鼠标后即可控制视角。

### 🚶 移动控制
按键	功能
W A S D 或方向键	移动
鼠标	环顾四周
空格	跳跃（可二段跳）
R	开始/停止录制
T	停止录制/回放
Y	回放录制路径
U	自动行走至最近动态物品（再次按停止）
ESC	释放鼠标

### 🗺️ 地图管理
左侧面板：显示所有已保存地图，点击切换。

＋ 新增地图：打开编辑器，设定网格大小和地图名称。

✎ 修改当前地图：编辑已选中的地图。

另存为：将当前编辑的地图保存为副本。

### ✏️ 地图编辑器
选择网格大小、输入地图名称。

在左侧物品列表中选择物品（分类树展示），也可新增物品。

在网格上鼠标左键拖拽放置，右键拖拽擦除。

选择道路工具后可单击放置路径点，双击完成道路。

点击 保存地图 或 另存为 完成编辑。

### 🧩 自定义物品
在编辑器中点击「+ 新增物品」。
输入 ID、名称、分类、图标、占格子数。
添加组成方块（盒子、圆柱、圆锥、球），设置尺寸、颜色、位置、碰撞属性。
或选择“GLB 文件”模式，上传 .glb 模型。
保存后即可在地图上使用。

## 📡 API 接口
方法	路径	说明
GET	/api/maps	获取所有地图列表
GET	/api/maps/:id	获取单个地图完整数据
POST	/api/maps	创建新地图
PUT	/api/maps/:id	更新地图
GET	/api/items	获取所有物品定义
GET	/api/items/:id	获取单个物品定义
POST	/api/items	创建物品定义
PUT	/api/items/:id	更新物品定义
DELETE	/api/items/:id	删除物品定义
POST	/api/upload-model	上传 GLB 模型文件 (需要 multer)

## 📝 地图数据格式
每个地图文件保存在 maps/<id>.json，结构：

```json
{
"id": "xxxx",
"name": "村庄",
"gridSize": 30,
"items": [
{ "type": "item", "itemId": "mushroom_red", "x": 4.5, "z": -2.5, "rotation": 0 },
{ "type": "road", "path": [[0,0], [10,0]], "width": 1, "color": "0x444444" }
]
}
```

## 🧪 开发说明
添加新物品：在 items/ 下创建 JSON 文件，或通过内置物品编辑器实时添加。

替换 GLB 模型：上传至 models/ 目录，在物品定义中指定 modelUrl。

修改动态物品池：编辑 mapLoader.js 中的 itemPool 数组。

自定义路径规划：修改 main.js 中 KeyU 绑定的规划函数，或创建新的规划器。

## todo
1. 跳跃
2. 避障
3. 三人称视角(待完善)
4. 多人在线
5. 大图集与动态加载