const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
app.use('/models', express.static(path.join(__dirname, 'models')));

const multer = require('multer');
const upload = multer({dest: path.join(__dirname, 'models')});

// 确保缩略图目录存在
const THUMBNAIL_DIR = path.join(__dirname, '../public/thumbnails');
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, {recursive: true});
}

// 辅助函数：将 Base64 保存为文件
async function saveThumbnailFromBase64(base64Data, mapId) {
    if (!base64Data) return null;
    // 去掉 data:image/png;base64, 前缀
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        console.error('无效的 Base64 图片数据');
        return null;
    }
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const fileName = `${mapId}.png`;  // 使用地图 ID 作为文件名
    const filePath = path.join(THUMBNAIL_DIR, fileName);
    fs.writeFileSync(filePath, imageBuffer);
    return `/thumbnails/${fileName}`; // 返回可访问的 URL
}

app.post('/api/upload-model', upload.single('model'), (req, res) => {
    if (!req.file) return res.status(400).json({error: 'No file'});
    const fileName = Date.now() + '_' + req.file.originalname;
    const newPath = path.join(__dirname, 'models', fileName);
    fs.renameSync(req.file.path, newPath);
    res.json({url: '/models/' + fileName});
});

const MAPS_DIR = path.join(__dirname, 'maps');
if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR);

app.use(express.json({limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/thumbnails', express.static(path.join(__dirname, '../public/thumbnails')));

// 获取所有地图列表
app.get('/api/maps', (req, res) => {
    const files = fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.json'));
    const maps = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, f), 'utf-8'));
        return {id: f.replace('.json', ''), name: data.name};
    });
    res.json(maps);
});

// 获取单个地图完整数据
app.get('/api/maps/:id', (req, res) => {
    const file = path.join(MAPS_DIR, req.params.id + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({error: 'Map not found'});
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
});

// 保存新地图
// 处理 POST /api/maps
app.post('/api/maps', async (req, res) => {
    try {
        const {name, gridSize, items, thumbnail} = req.body;

        // 1. 插入数据库（先获取自增 ID）
        const newMap = await db.Map.create({
            name,
            gridSize,
            items: JSON.stringify(items),  // 根据你的实际存储格式调整
            thumbnail_url: null  // 先占位
        });
        const mapId = newMap.id;

        // 2. 如果有缩略图，保存文件并更新 thumbnail_url
        let thumbnailUrl = null;
        if (thumbnail) {
            thumbnailUrl = await saveThumbnailFromBase64(thumbnail, mapId);
            if (thumbnailUrl) {
                await newMap.update({thumbnail_url: thumbnailUrl});
            }
        }

        res.json({id: mapId, thumbnailUrl});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: '保存失败'});
    }
});

// 处理 PUT /api/maps/:id
app.put('/api/maps/:id', async (req, res) => {
    try {
        const mapId = req.params.id;
        const {name, gridSize, items, thumbnail} = req.body;

        const map = await db.Map.findByPk(mapId);
        if (!map) {
            return res.status(404).json({error: '地图不存在'});
        }

        // 更新基本信息
        await map.update({
            name,
            gridSize,
            items: JSON.stringify(items)
        });

        // 如果有新的缩略图，覆盖保存（文件名仍用 mapId.png）
        if (thumbnail) {
            const thumbnailUrl = await saveThumbnailFromBase64(thumbnail, mapId);
            if (thumbnailUrl) {
                await map.update({thumbnail_url: thumbnailUrl});
            }
        }

        res.json({success: true});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: '更新失败'});
    }
});

// 物品定义存储目录
const ITEMS_DIR = path.join(__dirname, 'items');
if (!fs.existsSync(ITEMS_DIR)) fs.mkdirSync(ITEMS_DIR);

// 获取所有物品（返回扁平数组，前端自行组装树）
app.get('/api/items', (req, res) => {
    const files = fs.readdirSync(ITEMS_DIR).filter(f => f.endsWith('.json'));
    const items = files.map(f => JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf-8')));
    res.json(items);
});

// 获取单个物品
app.get('/api/items/:id', (req, res) => {
    const file = path.join(ITEMS_DIR, req.params.id + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({error: 'Item not found'});
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
});

// 新增物品
app.post('/api/items', (req, res) => {
    const item = req.body;
    if (!item.id) return res.status(400).json({error: 'Missing id'});
    const file = path.join(ITEMS_DIR, item.id + '.json');
    if (fs.existsSync(file)) return res.status(400).json({error: 'Item already exists'});
    fs.writeFileSync(file, JSON.stringify(item, null, 2));
    res.json({success: true});
});

// 更新物品
app.put('/api/items/:id', (req, res) => {
    const file = path.join(ITEMS_DIR, req.params.id + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({error: 'Item not found'});
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
    res.json({success: true});
});

// 删除物品
app.delete('/api/items/:id', (req, res) => {
    const file = path.join(ITEMS_DIR, req.params.id + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({error: 'Item not found'});
    fs.unlinkSync(file);
    res.json({success: true});
});


app.listen(PORT, () => {
    console.log('服务运行在 http://localhost:' + PORT);
});