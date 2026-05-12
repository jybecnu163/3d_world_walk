import * as THREE from 'three';
import {camera, scene, wallColliders} from './state.js';
import {getItemById} from './items.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import { currentGridSize } from './state.js';

export const dynamicObjects = []; // 当前场景中的动态物品 { object3D, definition, position, expireTime, id }
let dynamicTimer = null;
let config = {
    enabled: false,
    maxCount: 10,              // 最大同时存在数量
    spawnInterval: 5000,     // 生成间隔（毫秒）
    lifeTime: 60000,         // 存在时间（毫秒）
    itemPool: ['mushroom_red', 'rabbit_white'], // 要随机生成的物品ID
    spawnRadius: 50,          // 以玩家为中心的生成半径
    collectDistance: 2        // 新增：玩家距离多少米内自动拾取
};

// 根据定义创建组合物品（返回 THREE.Group）
function createItemFromDef(def, x, z, rotation = 0) {
    const group = new THREE.Group();
    (def.blocks || []).forEach(block => {
        let geometry, material;
        const color = parseInt(block.color) || 0xcccccc;
        material = new THREE.MeshStandardMaterial({color, roughness: 0.7});
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
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(block.x || 0, block.y || 0, block.z || 0);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
    });
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return group;
}

// 加载 GLB 模型（回调模式）
function createGlbItem(def, x, z, rotation, onLoaded) {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    loader.load(def.modelUrl, (gltf) => {
        const model = gltf.scene;
        // 缩放与位置调整（同 world.js 逻辑）
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetWidth = def.gridSize?.[0] || 1;
        const targetDepth = def.gridSize?.[1] || 1;
        const maxOriginal = Math.max(size.x, size.z);
        const scaleFactor = Math.min(targetWidth, targetDepth) / maxOriginal;
        model.scale.setScalar(scaleFactor);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const bottomY = scaledBox.min.y;
        model.position.set(x, -bottomY, z);
        model.rotation.y = rotation;
        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        if (onLoaded) onLoaded(model);
    });
}

// 更新配置
export function setDynamicConfig(newConfig) {
    Object.assign(config, newConfig);
}

// 开始动态系统
export function startDynamics() {
    console.log('startDynamics 被调用，当前 config:', config);
    clearTimeout(dynamicTimer);
    config.enabled = true;
    console.log('动态系统启动，开始调度生成...');
    scheduleNextSpawn();
}

// 停止动态系统
export function stopDynamics() {
    config.enabled = false;
    clearTimeout(dynamicTimer);
    removeAllDynamics();
    console.log('动态系统已停止');
}

// 清除所有动态物品
function removeAllDynamics() {
    dynamicObjects.forEach(obj => {
        scene.remove(obj.object3D);
        // 如果碰撞盒存在，从 wallColliders 移除（需记录碰撞盒）
    });
    dynamicObjects.length = 0;
}

// 生成一个动态物品
function spawnDynamicItem() {
    if (!config.enabled || dynamicObjects.length >= config.maxCount) {
        console.log('条件不满足：enabled=', config.enabled, 'maxCount=', config.maxCount);
        return;
    }

    const itemId = config.itemPool[Math.floor(Math.random() * config.itemPool.length)];
    console.log('随机选中物品 ID:', itemId);
    const def = getItemById(itemId);
    if (!def) {
        console.warn('物品定义未找到:', itemId);
        return;
    }

    const playerPos = camera.position;
    const half = currentGridSize / 2 - 1;   // 边界安全距离
    let x, z;
    let attempts = 0;
    const maxAttempts = 20;
    do {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * Math.min(config.spawnRadius, half * 0.8); // 保证不会超出地图
        x = playerPos.x + Math.cos(angle) * dist;
        z = playerPos.z + Math.sin(angle) * dist;
        // 强制钳制在地图内
        x = Math.max(-half, Math.min(half, x));
        z = Math.max(-half, Math.min(half, z));
        attempts++;
    } while (attempts < maxAttempts && isCollidingWithStatics(x, z, def));

    if (attempts === maxAttempts) {
        console.warn('为物品', def.id, '尝试', maxAttempts, '次均碰撞，放弃生成');
        return;
    }

    console.log(`尝试在 (${x.toFixed(2)}, ${z.toFixed(2)}) 生成 ${def.name}`);

    if (def.type === 'glb') {
        createGlbItem(def, x, z, 0, (model) => {
            scene.add(model);
            addDynamicObject(def, x, z, model);
        });
    } else {
        const group = createItemFromDef(def, x, z, 0);
        scene.add(group);
        addDynamicObject(def, x, z, group);
    }
}

function addDynamicObject(def, x, z, object3D) {
    const expireTime = performance.now() + config.lifeTime;
    console.log('添加动态物品，过期时间:', new Date(expireTime).toISOString());
    const dyn = {definition: def, position: new THREE.Vector3(x, 0, z), object3D, expireTime, id: def.id};
    dynamicObjects.push(dyn);
    scene.add(object3D);
    // 如果需要碰撞，可以添加临时碰撞盒，这里略（一般动态物品不阻挡玩家）
}

// 简单的碰撞检测：检查 (x,z) 点是否与静态物品碰撞
function isCollidingWithStatics(x, z, def) {
    // 检测与wallColliders中的盒体重叠
    const testBox = new THREE.Box3(
        new THREE.Vector3(x - 0.5, 0, z - 0.5),
        new THREE.Vector3(x + 0.5, 1, z + 0.5)
    );
    for (const box of wallColliders) {
        if (box.intersectsBox(testBox)) return true;
    }
    return false;
}

// 定时生成
function scheduleNextSpawn() {
    if (!config.enabled) return;
    console.log(`scheduleNextSpawn: 将在 ${config.spawnInterval}ms 后尝试生成`);
    dynamicTimer = setTimeout(() => {
        console.log('定时器触发，开始尝试生成');
        spawnDynamicItem();
        scheduleNextSpawn();
    }, config.spawnInterval);
}

// 每帧更新：移除过期物品
export function updateDynamics(now) {
    const playerPos = camera.position;
    const threshold = config.collectDistance;

    for (let i = dynamicObjects.length - 1; i >= 0; i--) {
        const obj = dynamicObjects[i];
        const d = new THREE.Vector3().copy(obj.position).distanceTo(playerPos);
        // console.log('距离动态物品', obj.id, '距离:', d);
        // 玩家靠近则拾取（移除物品）
        if (d < threshold) {
            scene.remove(obj.object3D);
            dynamicObjects.splice(i, 1);
            console.log('拾取动态物品:', obj.id);
            continue;  // 跳过后续过期判断
        }

        // 超时移除
        if (now > obj.expireTime) {
            scene.remove(obj.object3D);
            dynamicObjects.splice(i, 1);
        }
    }
}