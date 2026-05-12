// itemEditor.js
import * as THREE from 'three';
import {loadItemDefinitions} from './items.js';

let currentEditId = null;
let previewGroup;
let previewRenderer, previewScene, previewCamera;

export function openItemEditor(itemId = null) {
    currentEditId = itemId;
    // 移除已有蒙层
    const existing = document.getElementById('item-editor-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'item-editor-overlay';
    overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:120;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#1e1e2f;padding:20px;border-radius:12px;width:750px;color:white;display:flex;gap:20px;">
            <div style="flex:1;">
                <h3>${itemId ? '编辑物品' : '新增物品'}</h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <input id="i-id" placeholder="物品ID（英文）" value="${itemId || ''}" ${itemId ? 'disabled' : ''} style="padding:6px;">
                    <input id="i-name" placeholder="名称" style="padding:6px;">
                    <input id="i-category" placeholder="分类 (例如 建筑/房屋)" style="padding:6px;">
                    <input id="i-icon" placeholder="图标 (emoji)" style="padding:6px;">
                    <div>
                        占格子数：<input id="i-gw" type="number" value="1" style="width:50px;padding:4px;"> x 
                        <input id="i-gd" type="number" value="1" style="width:50px;padding:4px;">
                    </div>
                    <div style="margin:8px 0;">组成方块：</div>
                    <div id="blocks-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"></div>
                    <button id="add-block-btn" class="btn" style="background:#4a6fa5;">+ 添加方块</button>
                </div>
                <div style="margin-top:16px;display:flex;gap:10px;">
                    <button id="save-item-btn" class="btn btn-primary">保存物品</button>
                    <button id="cancel-item-btn" class="btn" style="background:#555;">取消</button>
                </div>
            </div>
            <div>
                <canvas id="preview-canvas" width="300" height="300"></canvas>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 初始化3D预览
    initPreview();
    // 加载物品数据（编辑模式）
    if (itemId) {
        loadItemData(itemId);
    } else {
        addBlockRow(); // 默认添加一个方块
    }

    // 绑定事件
    document.getElementById('add-block-btn').addEventListener('click', addBlockRow);
    document.getElementById('save-item-btn').addEventListener('click', saveItem);
    document.getElementById('cancel-item-btn').addEventListener('click', () => {
        overlay.remove();
        if (previewRenderer) {
            previewRenderer.dispose();
            previewGroup = null;
            previewRenderer = null;
        }
    });

    // 方块列表的变化监听（重新构建预览）
    document.getElementById('blocks-list').addEventListener('change', updatePreviewFromBlocks);
    document.getElementById('blocks-list').addEventListener('input', updatePreviewFromBlocks);
}

// ========== 预览相关 ==========
function initPreview() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x333333);
    previewCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    previewCamera.position.set(3, 3, 3);
    previewCamera.lookAt(0, 0.5, 0);
    previewRenderer = new THREE.WebGLRenderer({canvas, antialias: true});
    previewGroup = new THREE.Group();
    previewScene.add(previewGroup);
    previewScene.add(new THREE.AmbientLight(0x404060));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 10, 5);
    previewScene.add(light);
    animatePreview();
}

function animatePreview() {
    requestAnimationFrame(animatePreview);
    if (!previewGroup) return;
    previewGroup.rotation.y += 0.005;
    if (previewRenderer && previewScene && previewCamera) {
        previewRenderer.render(previewScene, previewCamera);
    }
}

function updatePreviewFromBlocks() {
    if (!previewGroup) return;
    // 清除旧模型
    while (previewGroup.children.length > 0) {
        previewGroup.remove(previewGroup.children[0]);
    }
    const blocks = getBlocksFromDOM();
    blocks.forEach(block => {
        let geometry;
        const color = parseInt(block.color) || 0xcccccc;
        const mat = new THREE.MeshStandardMaterial({color, roughness: 0.7});
        switch (block.type) {
            case 'box':
                geometry = new THREE.BoxGeometry(block.w, block.h, block.d);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(block.w / 2, block.w / 2, block.h, 8);
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(block.w / 2, block.h, 8);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(block.w / 2, 8, 8);
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(block.x || 0, block.y || 0, block.z || 0);
        previewGroup.add(mesh);
    });
}

// ========== 方块行交互 ==========
function addBlockRow() {
    const list = document.getElementById('blocks-list');
    const row = document.createElement('div');
    row.className = 'block-row';
    row.style = 'display:flex;align-items:center;gap:4px;';
    row.innerHTML = `
        <select class="block-type">
            <option value="box">盒子</option>
            <option value="cylinder">圆柱</option>
            <option value="cone">圆锥</option>
            <option value="sphere">球</option>
        </select>
        <input class="block-w" type="number" value="1" step="0.1" style="width:45px;" title="宽">
        <input class="block-h" type="number" value="1" step="0.1" style="width:45px;" title="高">
        <input class="block-d" type="number" value="1" step="0.1" style="width:45px;" title="深">
        <input class="block-x" type="number" value="0" step="0.1" style="width:40px;" title="X偏移">
        <input class="block-y" type="number" value="0.5" step="0.1" style="width:40px;" title="Y偏移">
        <input class="block-z" type="number" value="0" step="0.1" style="width:40px;" title="Z偏移">
        <input class="block-color" type="color" value="#cccccc" style="width:30px;">
        <label><input type="checkbox" class="block-collide" checked> 碰撞</label>
        <button class="delete-block-btn" style="background:#a33;color:white;border:none;border-radius:4px;cursor:pointer;">✕</button>
    `;
    row.querySelector('.delete-block-btn').addEventListener('click', () => {
        row.remove();
        updatePreviewFromBlocks();
    });
    list.appendChild(row);
    updatePreviewFromBlocks();
}

function getBlocksFromDOM() {
    const rows = document.querySelectorAll('.block-row');
    const blocks = [];
    rows.forEach(row => {
        blocks.push({
            type: row.querySelector('.block-type').value,
            w: parseFloat(row.querySelector('.block-w').value) || 1,
            h: parseFloat(row.querySelector('.block-h').value) || 1,
            d: parseFloat(row.querySelector('.block-d').value) || 1,
            x: parseFloat(row.querySelector('.block-x').value) || 0,
            y: parseFloat(row.querySelector('.block-y').value) || 0,
            z: parseFloat(row.querySelector('.block-z').value) || 0,
            color: row.querySelector('.block-color').value.replace('#', '0x'),
            collide: row.querySelector('.block-collide').checked
        });
    });
    return blocks;
}

async function loadItemData(id) {
    try {
        const res = await fetch('/api/items/' + id);
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('i-name').value = data.name || '';
        document.getElementById('i-category').value = data.category || '';
        document.getElementById('i-icon').value = data.icon || '';
        document.getElementById('i-gw').value = data.gridSize?.[0] || 1;
        document.getElementById('i-gd').value = data.gridSize?.[1] || 1;
        // 清空方块列表并重新生成
        const list = document.getElementById('blocks-list');
        list.innerHTML = '';
        (data.blocks || []).forEach(block => {
            addBlockRow();
            const lastRow = list.lastChild;
            lastRow.querySelector('.block-type').value = block.type || 'box';
            lastRow.querySelector('.block-w').value = block.w || 1;
            lastRow.querySelector('.block-h').value = block.h || 1;
            lastRow.querySelector('.block-d').value = block.d || 1;
            lastRow.querySelector('.block-x').value = block.x || 0;
            lastRow.querySelector('.block-y').value = block.y || 0;
            lastRow.querySelector('.block-z').value = block.z || 0;
            lastRow.querySelector('.block-color').value = '#' + (block.color || 'cccccc').toString(16).padStart(6, '0');
            lastRow.querySelector('.block-collide').checked = block.collide !== false;
        });
        updatePreviewFromBlocks();
    } catch (e) {
        console.error('加载物品数据失败', e);
    }
}

async function saveItem() {
    const id = document.getElementById('i-id').value.trim();
    if (!id) return alert('请输入物品ID');
    const name = document.getElementById('i-name').value.trim();
    const category = document.getElementById('i-category').value.trim();
    const icon = document.getElementById('i-icon').value.trim();
    const gridSize = [
        parseInt(document.getElementById('i-gw').value) || 1,
        parseInt(document.getElementById('i-gd').value) || 1
    ];
    const blocks = getBlocksFromDOM();
    if (blocks.length === 0) return alert('至少需要一个组成方块');

    const body = {id, name, category, icon, gridSize, blocks};
    const method = currentEditId ? 'PUT' : 'POST';
    const url = currentEditId ? `/api/items/${currentEditId}` : '/api/items';

    try {
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json();
            alert('保存失败: ' + (err.error || '未知错误'));
            return;
        }
        await loadItemDefinitions(); // 刷新全局物品缓存
        // 关闭蒙层
        document.getElementById('item-editor-overlay').remove();
        if (previewRenderer) {
            previewRenderer.dispose();
            previewGroup = null;
            previewRenderer = null;
        }
        // 通知物品列表刷新（调用外部初始化函数）
        if (typeof window.initSidebar === 'function') window.initSidebar();
    } catch (e) {
        alert('保存出错: ' + e.message);
    }
}