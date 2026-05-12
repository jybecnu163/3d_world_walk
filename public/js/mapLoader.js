import {MiniMap} from './minimap.js';
import {buildWorld, clearScene} from './world.js';
import {controls, isThirdPerson, setCurrentGridSize, setMiniMap, setThirdPersonState} from './state.js';
import {attachModelToCamera, repositionPlayerIfStuck} from './player.js';
import {setDynamicConfig, stopDynamics} from './dynamics.js';

export async function loadMapList() {
    const res = await fetch('/api/maps');
    const maps = await res.json();
    const list = document.getElementById('map-list');
    list.innerHTML = '';
    maps.forEach(m => {
        const card = document.createElement('div');
        card.className = 'map-card';

        const thumbUrl = m.thumbnail_url || '/thumbnail/default.png' || '';
        card.innerHTML = `
            <img src="${thumbUrl}" alt="${m.name}">
            <div class="name">${m.name}</div>
        `;

        // card.innerHTML = `<img src="" alt=""><div class="name">${m.name}</div>`;
        card.onclick = () => loadMap(m.id);
        list.appendChild(card);
    });
}

export async function loadMap(id) {
    stopDynamics();
    const res = await fetch('/api/maps/' + id);
    const data = await res.json();
    const state = await import('./state.js');

    // 保存当前地图的录制
    state.saveCurrentRecordingForMap(state.currentMapId);

    // 设置新地图ID和物品
    state.setCurrentMapId(data.id);
    state.setMapItems(data.items);

    // 加载新地图的录制
    state.loadRecordingForMap(data.id);
    // 存储网格大小
    setCurrentGridSize(data.gridSize || 30);
    // 构建世界
    clearScene();
    buildWorld(data.items);
    // 检查并重定位玩家
    repositionPlayerIfStuck();

    // 启动动态物品（可根据需要配置）
    setDynamicConfig({
        maxCount: 18,
        spawnInterval: 3000,
        lifeTime: 60000,
        itemPool: ['mushroom_red', 'rabbit_blocky'], // 你想要的随机物品ID
        spawnRadius: 12
    });
    // // 注意不传 enabled，或者传 false
    // startDynamics();

    const minimap = state.miniMap;
    if (minimap) {
        minimap.updateItems(data.items);
    } else {
        const mm = new MiniMap(document.getElementById('minimap'), data.items, 32);
        setMiniMap(mm);
    }

    // 切换地图或回放时重置视角
    if (isThirdPerson) {
        isThirdPerson = false;
        controls.lock();
        attachModelToCamera();
        setThirdPersonState(false);
    }
}
