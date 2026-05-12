import {loadMap, loadMapList} from './mapLoader.js';
import {openItemEditor} from './itemEditor.js';
import {getAllItems, getItemById, loadItemDefinitions} from './items.js';
import {clearCurrentRecording, clearRecordingForMap} from './state.js';

let editorItems = [], editingMapId = null;
let selectedTool = 'wall';
let currentPathPoints = [];


let editorGridSize = 30;
let selectedItemId = null, selectedItemData = null;
let globalDrawMode = 'place'; // 全局绘制模式，由侧边栏的清除/物品按钮控制
const editorCanvas = document.getElementById('editor-canvas');
const editorCtx = editorCanvas.getContext('2d');
let isDrawing = false;
let drawMode = null; // 'place' or 'erase'
let lastCell = null, hoverCell = null;


// 侧边栏初始化
const sidebar = document.getElementById('editor-sidebar');
if (!sidebar) {
    const sb = document.createElement('div');
    sb.id = 'editor-sidebar';
    sb.style = 'width:180px;background:#2a2a3e;overflow-y:auto;padding:5px;color:white;';
    document.getElementById('editor-grid').prepend(sb);
}
const sidebarEl = document.getElementById('editor-sidebar');


async function initSidebar() {
    await loadItemDefinitions(); // 重新加载后端物品数据
    const items = getAllItems();

    let html = '<button id="btn-new-item" class="btn" style="margin:4px 0; width:100%;">+ 新增物品</button>';
    html += `<div class="item-entry erase-entry" style="cursor:pointer;padding:2px 4px;border-radius:4px;background:#555;margin-top:4px;color:#f88;">🧹 清除物品</div>`;

    if (items.length === 0) {
        html += '<div style="color:#888; padding:10px; text-align:center;">暂无物品，请点击上方按钮新建</div>';
    } else {
        // 构建分类树
        const tree = {};
        items.forEach(item => {
            const cat = item.category || '未分类';
            if (!tree[cat]) tree[cat] = [];
            tree[cat].push(item);
        });
        for (const [cat, catItems] of Object.entries(tree)) {
            html += `<div style="font-weight:bold;margin:6px 0 2px;">${cat}</div>`;
            catItems.forEach(item => {
                html += `<div class="item-entry" data-id="${item.id}" style="cursor:pointer;padding:2px 4px;border-radius:4px;">${item.icon || '📦'} ${item.name}</div>`;
            });
        }
    }

    sidebarEl.innerHTML = html;
    // 绑定新增物品按钮
    document.getElementById('btn-new-item').onclick = () => openItemEditor();

    // 绑定普通物品点击
    document.querySelectorAll('.item-entry:not(.erase-entry)').forEach(el => {
        el.addEventListener('click', (e) => {
            const id = el.dataset.id;
            selectedItemId = id;
            selectedItemData = items.find(i => i.id === id);
            globalDrawMode = 'place';          // 切换到放置模式
            document.querySelectorAll('.item-entry').forEach(e => e.style.background = '');
            el.style.background = '#4a6fa5';
        });
        el.addEventListener('dblclick', (e) => {
            const id = el.dataset.id;
            openItemEditor(id);
        });
    });

    // 绑定清除物品点击
    document.querySelectorAll('.erase-entry').forEach(el => {
        el.addEventListener('click', () => {
            selectedItemId = null;
            selectedItemData = null;
            globalDrawMode = 'erase';          // 切换到擦除模式
            document.querySelectorAll('.item-entry').forEach(e => e.style.background = '');
            el.style.background = '#a33';      // 红色高亮
        });
    });

}

// 工具切换
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTool = btn.dataset.type;
        if (selectedTool !== 'road') {
            currentPathPoints = [];
            drawEditorGrid();
        }
    });
});

// 画笔参数
function getBrushParams() {
    const height = parseFloat(document.getElementById('item-height').value) || 2.5;
    const color = document.getElementById('item-color').value;
    const sizeStr = document.getElementById('item-size').value.trim();
    let w = 1, d = 1, radius = 0.5, width = 1;
    if (selectedTool === 'wall' || selectedTool === 'building') {
        const parts = sizeStr.split(',').map(s => parseFloat(s));
        w = parts[0] || 1;
        d = parts[1] || 0.3;
    } else if (selectedTool === 'pillar') {
        radius = parseFloat(sizeStr) || 0.5;
    } else if (selectedTool === 'road') {
        width = parseFloat(sizeStr) || 1;
    }
    return {height, color, w, d, radius, width};
}

function parseColor(hex) {
    return parseInt(hex.replace('#', '0x'));
}

// 核心修正：鼠标坐标→网格
function getCellFromEvent(e) {
    const canvas = editorCanvas;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const mouseX = e.offsetX * scaleX;
    const mouseY = e.offsetY * scaleY;
    const cellSize = canvas.width / editorGridSize;
    const col = Math.floor(mouseX / cellSize);
    const row = Math.floor(mouseY / cellSize);
    if (col < 0 || col >= editorGridSize || row < 0 || row >= editorGridSize) return null;
    return {col, row};
}

function cellToWorld(col, row) {
    const half = editorGridSize / 2;
    return {
        x: col - half + 0.5,          // 保持不变
        z: half - row - 0.5           // 修改此行：row=0 → z=half-0.5（正北）
    };
}


function worldToScreen(wx, wz) {
    const cellSize = editorCanvas.width / editorGridSize;
    const half = editorGridSize / 2;
    return {
        x: (wx + half) * cellSize,
        y: editorCanvas.height - (wz + half) * cellSize
    };
}

// 放置物品（根据 selectedItemId）
function placeItemAt(col, row) {
    if (!selectedItemId) return;
    const def = getItemById(selectedItemId);
    if (!def) return;
    const world = cellToWorld(col, row);
    removeItemAtCell(col, row); // 移除该位置原有物品
    editorItems.push({
        type: 'item',
        itemId: selectedItemId,
        x: world.x,
        z: world.z,
        rotation: 0
    });
    drawEditorGrid(); // 立即重绘
}

function generateBorderWalls(gs) {
    const h = 3, color = 0xaaaaaa, d = 0.5, half = gs / 2;
    return [
        {type: 'wall', x: 0, z: -half + d / 2, w: gs, d, h, color},
        {type: 'wall', x: 0, z: half - d / 2, w: gs, d, h, color},
        {type: 'wall', x: -half + d / 2, z: 0, w: d, d: gs, h, color},
        {type: 'wall', x: half - d / 2, z: 0, w: d, d: gs, h, color}
    ];
}

function drawEditorGrid() {

    const size = editorCanvas.width;
    const cell = size / editorGridSize;
    const ctx = editorCtx;
    ctx.clearRect(0, 0, size, size);

    // 绘制网格线
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= editorGridSize; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(size, i * cell);
        ctx.stroke();
    }

    // 绘制所有地图物品
    for (const item of editorItems) {
        if (item.type === 'road') {
            if (item.path && item.path.length > 1) {
                const pts = item.path.map(([wx, wz]) => {
                    const sc = worldToScreen(wx, wz);
                    return [sc.x, sc.y];
                });
                ctx.strokeStyle = '#' + (item.color || 0x444444).toString(16).padStart(6, '0');
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i][0], pts[i][1]);
                }
                ctx.stroke();
            }
            continue;
        }

        // 普通物品（类型为 'item'）
        if (item.type === 'item') {
            const def = getItemById(item.itemId);
            if (!def) continue;
            const gw = def.gridSize?.[0] || 1;
            const gd = def.gridSize?.[1] || 1;
            const halfW = gw / 2;
            const halfD = gd / 2;
            const sc = worldToScreen(item.x, item.z);
            const pw = gw * cell;
            const pd = gd * cell;
            // 取第一个方块颜色作为预览色
            const color = (def.blocks && def.blocks[0]?.color) || '#888888';
            ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
            ctx.fillRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
            // 显示物品名称简写
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(def.name || item.itemId, sc.x, sc.y);
        }
    }

    // 绘制当前选中物品的预览（鼠标悬停格子）
    if (hoverCell && selectedItemData && selectedItemId && globalDrawMode !== 'erase') {
        const cellSize = editorCanvas.width / editorGridSize;
        if (drawMode === 'erase') {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.fillRect(hoverCell.col * cellSize, hoverCell.row * cellSize, cellSize, cellSize);
        } else if (selectedItemData && selectedItemId) {
            const gw = selectedItemData.gridSize?.[0] || 1;
            const gd = selectedItemData.gridSize?.[1] || 1;
            const world = cellToWorld(hoverCell.col, hoverCell.row);
            const sc = worldToScreen(world.x, world.z);
            const pw = gw * cellSize;
            const pd = gd * cellSize;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
        }
    }

    // 绘制鼠标悬停格子的十字准线
    if (hoverCell) {
        if (drawMode === 'erase') {
            // 擦除模式：显示红色半透明方格
            const cellSize = editorCanvas.width / editorGridSize;
            const x = hoverCell.col * cellSize;
            const y = hoverCell.row * cellSize;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.fillRect(x, y, cellSize, cellSize);
        } else if (selectedItemData && selectedItemId) {
            const x = hoverCell.col * cell + cell / 2;
            const y = hoverCell.row * cell + cell / 2;
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - 6, y);
            ctx.lineTo(x + 6, y);
            ctx.moveTo(x, y - 6);
            ctx.lineTo(x, y + 6);
            ctx.stroke();
        }
    }

    // 绘制道路预览点（若有）
    if (currentPathPoints && currentPathPoints.length > 0) {
        // ... 与原来道路预览相同
        // 道路预览
        if (selectedTool === 'road' && currentPathPoints.length > 0) {
            editorCtx.fillStyle = '#ff0';
            currentPathPoints.forEach(pt => {
                const sc = worldToScreen(pt.x, pt.z);
                editorCtx.beginPath();
                editorCtx.arc(sc.x, sc.y, 4, 0, Math.PI * 2);
                editorCtx.fill();
            });
            if (currentPathPoints.length > 1) {
                editorCtx.strokeStyle = '#ff0';
                editorCtx.lineWidth = 2;
                editorCtx.beginPath();
                currentPathPoints.forEach((pt, i) => {
                    const sc = worldToScreen(pt.x, pt.z);
                    if (i === 0) editorCtx.moveTo(sc.x, sc.y);
                    else editorCtx.lineTo(sc.x, sc.y);
                });
                editorCtx.stroke();
            }
        }
    }
}

// 鼠标事件绑定
editorCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;

    // 道路工具依然独立处理
    if (selectedTool === 'road') {
        currentPathPoints.push(cellToWorld(cell.col, cell.row));
        drawEditorGrid();
        return;
    }

    isDrawing = true;
    // 根据全局模式决定动作，而非鼠标按键
    drawMode = globalDrawMode;

    if (drawMode === 'place') {
        placeItemAt(cell.col, cell.row);
    } else if (drawMode === 'erase') {
        removeItemAtCell(cell.col, cell.row);
    }
    lastCell = cell;
    drawEditorGrid();
});

function removeItemAtCell(col, row) {
    const world = cellToWorld(col, row);
    editorItems = editorItems.filter(item => {
        if (item.type !== 'item') return true;
        const def = getItemById(item.itemId);
        const gw = def?.gridSize?.[0] || 1, gd = def?.gridSize?.[1] || 1;
        const dx = Math.abs(item.x - world.x);
        const dz = Math.abs(item.z - world.z);
        return dx > gw / 2 || dz > gd / 2;
    });
}

// 交互事件
editorCanvas.addEventListener('mousemove', (e) => {
    const cell = getCellFromEvent(e);
    hoverCell = cell;
    if (!cell) {
        drawEditorGrid();
        return;
    }

    // 刷新高亮
    if (!isDrawing || selectedTool === 'road') {
        drawEditorGrid();
    }

    if (!isDrawing || selectedTool === 'road') return;
    e.preventDefault();

    if (!lastCell || (lastCell.col === cell.col && lastCell.row === cell.row)) return;

    const cellsBetween = getCellsBetween(lastCell, cell);
    cellsBetween.forEach(c => {
        if (globalDrawMode === 'place') placeItemAt(c.col, c.row);
        else if (globalDrawMode === 'erase') removeItemAtCell(c.col, c.row);
    });
    lastCell = cell;
    drawEditorGrid();
});

editorCanvas.addEventListener('mouseleave', () => {
    hoverCell = null;
    drawEditorGrid();
});

editorCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;
    if (selectedTool === 'road') {
        currentPathPoints.push(cellToWorld(cell.col, cell.row));
        drawEditorGrid();
        return;
    }
    isDrawing = true;
    drawMode = e.button === 0 ? 'place' : (e.button === 2 ? 'erase' : null);
    if (!drawMode) return;
    if (drawMode === 'place') placeItemAt(cell.col, cell.row);
    else removeItemAtCell(cell.col, cell.row);
    lastCell = cell;
    drawEditorGrid();
});

window.addEventListener('mouseup', () => {
    isDrawing = false;
    drawMode = null;
    lastCell = null;
});

editorCanvas.addEventListener('contextmenu', e => e.preventDefault());

editorCanvas.addEventListener('dblclick', () => {
    if (selectedTool === 'road' && currentPathPoints.length >= 2) {
        const {width, color} = getBrushParams();
        editorItems.push({
            type: 'road',
            path: currentPathPoints.map(p => [p.x, p.z]),
            width,
            h: 0.05,
            color: parseColor(color)
        });
        currentPathPoints = [];
        drawEditorGrid();
    }
});

window.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('editor-overlay');
    if (overlay.style.display !== 'flex') return;
    if (e.code === 'Enter' && selectedTool === 'road' && currentPathPoints.length >= 2) {
        const {width, color} = getBrushParams();
        editorItems.push({
            type: 'road',
            path: currentPathPoints.map(p => [p.x, p.z]),
            width,
            h: 0.05,
            color: parseColor(color)
        });
        currentPathPoints = [];
        drawEditorGrid();
        e.preventDefault();
    }
});

function getCellsBetween(c1, c2) {
    const cells = [];
    let x0 = c1.col, y0 = c1.row;
    const x1 = c2.col, y1 = c2.row;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
        cells.push({col: x0, row: y0});
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
    return cells;
}

export function openEditor(isNew, mapData) {
    document.getElementById('editor-overlay').style.display = 'flex';
    if (!isNew && mapData) {
        editingMapId = mapData.id;
        document.getElementById('map-name').value = mapData.name;
        const gs = mapData.gridSize || 30;
        document.getElementById('grid-size').value = gs;
        editorGridSize = gs;
        editorItems = JSON.parse(JSON.stringify(mapData.items));
    } else {
        editingMapId = null;
        document.getElementById('map-name').value = '新地图';
        const gs = 30;
        document.getElementById('grid-size').value = gs;
        editorGridSize = gs;
        editorItems = generateBorderWalls(gs);
    }
    drawEditorGrid();

    document.getElementById('grid-size').onchange = () => {
        const newSize = parseInt(document.getElementById('grid-size').value) || 30;
        if (newSize !== editorGridSize) {
            if (confirm('更改网格大小将重置内部物品，确定吗？')) {
                editorGridSize = newSize;
                editorItems = generateBorderWalls(newSize);
                drawEditorGrid();
            } else {
                document.getElementById('grid-size').value = editorGridSize;
            }
        }
    };

    initSidebar().then(r => {
        console.log("加载物品数据失败")
    });
}

document.getElementById('btn-cancel-editor').onclick = () => {
    document.getElementById('editor-overlay').style.display = 'none';
};


// 辅助函数：截图并返回 Base64（可控制尺寸）
async function captureThumbnailBase64() {
    const canvasElement = document.getElementById('editor-canvas'); // 改成你的真实ID
    if (!canvasElement) {
        console.error('未找到画布容器，请检查ID是否正确');
        return null;
    }
    // 检查元素尺寸是否为0
    const rect = canvasElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        console.warn('画布容器尺寸为0，无法截图');
        return null;
    }
    try {
        const canvas = await html2canvas(canvasElement, {
            scale: 0.5,
            backgroundColor: '#ffffff'
        });
        return canvas.toDataURL('image/png');
    } catch (err) {
        console.error('截图失败:', err);
        return null;
    }
}

document.getElementById('btn-save-map').onclick = async () => {
    const name = document.getElementById('map-name').value;
    const items = editorItems;
    const thumbnailBase64 = await captureThumbnailBase64(); // 获取缩略图

    if (editingMapId) {
        // 更新地图（PUT）
        await fetch('/api/maps/' + editingMapId, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name,
                gridSize: editorGridSize,
                items,
                thumbnail: thumbnailBase64  // 新增字段
            })
        });
    } else {
        // 新建地图（POST）
        const res = await fetch('/api/maps', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name,
                gridSize: editorGridSize,
                items,
                thumbnail: thumbnailBase64  // 新增字段
            })
        });
        const {id} = await res.json();
        editingMapId = id;
    }
    document.getElementById('editor-overlay').style.display = 'none';
    await loadMapList();
    if (editingMapId) await loadMap(editingMapId);

    clearRecordingForMap(editingMapId);
    clearCurrentRecording();
};

// 另存为按钮
document.getElementById('btn-save-as').onclick = async () => {
    // 获取当前编辑的地图名称和物品
    const currentName = document.getElementById('map-name').value.trim() || '未命名地图';
    const newName = prompt('请输入新地图名称：', currentName + ' 副本');
    if (!newName || newName.trim() === '') return;

    const items = editorItems;
    const gridSize = editorGridSize;
    const thumbnailBase64 = await captureThumbnailBase64();

    try {
        const res = await fetch('/api/maps', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: newName.trim(),
                gridSize,
                items,
                thumbnail: thumbnailBase64
            })
        });
        if (!res.ok) {
            alert('另存失败，请稍后重试');
            return;
        }
        const {id} = await res.json();

        document.getElementById('editor-overlay').style.display = 'none';
        await loadMapList();
        await loadMap(id);
    } catch (e) {
        alert('另存出错: ' + e.message);
    }
};

window.initSidebar = initSidebar;