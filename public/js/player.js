import * as THREE from 'three';

import {
    camera,
    currentGridSize,
    GRAVITY,
    keyState,
    player,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
    playerModel,
    playerPos,
    scene,
    setPlayerModel,
    wallColliders
} from './state.js';

export let playerModelHeight = 1.8; // 默认高度
/**
 * 计算玩家模型的真实高度（包围盒 Y 轴尺寸）
 * 应在模型创建/加载后调用一次，将结果缓存
 */
export function getPlayerModelHeight() {
    if (!playerModel) return 1.8; // 默认高度 1.8 米
    const box = new THREE.Box3().setFromObject(playerModel);
    return box.max.y - box.min.y;
}

// 地面支撑检测（使用 playerPos.y 作为脚底高度）
function getSupportYAt(fx, fz, footY) {
    let maxY = 0;
    for (const box of wallColliders) {
        if (fx >= box.min.x && fx <= box.max.x && fz >= box.min.z && fz <= box.max.z && footY >= box.max.y - 0.05)
            maxY = Math.max(maxY, box.max.y);
    }
    return maxY;
}

export function updateGroundState() {
    const fx = playerPos.x, fz = playerPos.z, footY = playerPos.y;
    const sup = getSupportYAt(fx, fz, footY);
    if (footY <= sup + 0.05) {
        playerPos.y = sup;
        player.verticalVelocity = 0;
        player.isOnGround = true;
        player.jumpCount = 0;
        player.groundY = sup;
    } else {
        player.isOnGround = false;
    }
}

// 碰撞检测
export function isColliding(px, pz) {
    const footY = playerPos.y;
    for (const box of wallColliders) {
        if (footY >= box.max.y - 0.01) continue;
        const e = box.clone().expandByScalar(PLAYER_RADIUS);
        if (px >= e.min.x && px <= e.max.x && pz >= e.min.z && pz <= e.max.z) return true;
    }
    return false;
}

// 应用水平位移（世界坐标系下的方向向量）
function applyMoveDisplacement(direction, delta) {
    direction.normalize().multiplyScalar(player.speed * delta);
    const newX = playerPos.x + direction.x;
    const newZ = playerPos.z + direction.z;
    if (!isColliding(newX, playerPos.z)) playerPos.x = newX;
    if (!isColliding(playerPos.x, newZ)) playerPos.z = newZ;
}

// 手动移动（调用时必须传入世界方向向量）
export function applyMoveWithDirection(delta, worldDir) {
    player.verticalVelocity -= GRAVITY * delta;
    playerPos.y += player.verticalVelocity * delta;
    updateGroundState();
    if (worldDir.length() > 0) {
        worldDir.normalize().multiplyScalar(player.speed * delta);
        const newX = playerPos.x + worldDir.x;
        const newZ = playerPos.z + worldDir.z;
        if (!isColliding(newX, playerPos.z)) playerPos.x = newX;
        if (!isColliding(playerPos.x, newZ)) playerPos.z = newZ;
    }
    updateGroundState();
}

// 自动行走移动
export function applyAutoMove(delta, worldDirection) {
    player.verticalVelocity -= GRAVITY * delta;
    playerPos.y += player.verticalVelocity * delta;
    updateGroundState();
    applyMoveDisplacement(worldDirection, delta);
    updateGroundState();
}

// 跳跃
export function jump() {
    if (player.jumpCount >= 2) return;
    const v1 = Math.sqrt(2 * GRAVITY * 0.5), v2 = Math.sqrt(2 * GRAVITY * 0.8);
    player.verticalVelocity = player.jumpCount === 0 ? v1 : v2;
    player.jumpCount++;
    player.isOnGround = false;
}

// 将模型从相机分离到世界
export function detachModelFromCamera() {
    if (!playerModel) return;
    if (playerModel.parent === camera) {
        // 获取模型的世界位置和朝向
        const worldPos = playerModel.getWorldPosition(new THREE.Vector3());
        const worldQuat = playerModel.getWorldQuaternion(new THREE.Quaternion());
        scene.add(playerModel);
        playerModel.position.copy(worldPos);
        // 只保留 Y 轴旋转，保持直立
        const euler = new THREE.Euler().setFromQuaternion(worldQuat);
        playerModel.rotation.set(0, euler.y, 0);
    }
}

// 将模型附着到相机下方（第一人称）
export function attachModelToCamera() {
    if (!playerModel) return;
    if (playerModel.parent !== camera) {
        if (playerModel.parent) playerModel.parent.remove(playerModel);
        camera.add(playerModel);
    }
    playerModel.position.set(0, -PLAYER_HEIGHT, 0.3); // 向下并稍微向前，以便看到腿和手臂
    playerModel.rotation.set(0, 0, 0);
    playerModel.visible = true;
}

// 更新第三人称下模型的世界位置和朝向
export function updatePlayerModelWorld() {
    if (!playerModel || playerModel.parent === camera) return;
    playerModel.position.copy(playerPos);
    // 模型 Y 轴旋转已在 main.js 中根据移动或镜头设置
}

// 初始化玩家模型（可传入自定义模型，若无则用积木人）
export function initPlayerModel(customModel = null) {
    let model = customModel;
    if (!model) {
        model = createDefaultPlayerModel();
    }
    setPlayerModel(model);
    scene.add(model);
    // 初始化时放在相机脚下
    updatePlayerModelPosition();
    // 计算并缓存高度
    playerModelHeight = getPlayerModelHeight();
    console.log('玩家模型高度:', playerModelHeight);
}

// 每帧更新玩家模型位置与朝向
export function updatePlayerModelPosition() {
    // 附着在相机时不需手动更新世界位置
    if (!playerModel || playerModel.parent === camera) return;
    playerModel.position.copy(playerPos);
    playerModel.rotation.y = camera.rotation.y;
}

// 显示/隐藏玩家模型（第一人称时隐藏自身，第三人称时显示）
export function setPlayerModelVisible(visible) {
    if (playerModel) {
        playerModel.visible = visible;
    }
}

export function createDefaultPlayerModel() {
    const group = new THREE.Group();

    // --- 身体 ---
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({color: 0x4488ff});
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    // --- 头部 ---
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({color: 0xffccaa});
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.15;
    head.castShadow = true;
    group.add(head);

    // --- 左臂 ---
    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const armMat = new THREE.MeshStandardMaterial({color: 0x4488ff});
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 0.8, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    // --- 右臂 ---
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 0.8, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // --- 左腿 ---
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legMat = new THREE.MeshStandardMaterial({color: 0x335599});
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.2, 0.3, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    // --- 右腿 ---
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.2, 0.3, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    return group;
}


export function repositionPlayerIfStuck() {
    const half = currentGridSize / 2;
    const margin = 1.5; // 安全边距

    function isPositionValid(x, z) {
        const saveY = camera.position.y;
        camera.position.y = PLAYER_HEIGHT;
        const colliding = isColliding(x, z);
        camera.position.y = saveY;
        return !colliding && x > -half + margin && x < half - margin && z > -half + margin && z < half - margin;
    }

    // 先检查当前是否合法
    if (isPositionValid(camera.position.x, camera.position.z)) return;

    // 随机搜索合法位置
    for (let i = 0; i < 1000; i++) {
        const range = half - margin;
        const x = (Math.random() * 2 - 1) * range;
        const z = (Math.random() * 2 - 1) * range;
        if (isPositionValid(x, z)) {
            camera.position.set(x, PLAYER_HEIGHT, z);
            return;
        }
    }
    // 极端情况：强制放到原点
    camera.position.set(0, PLAYER_HEIGHT, 0);
}

export function applyMove(delta) {
    player.verticalVelocity -= GRAVITY * delta;
    camera.position.y += player.verticalVelocity * delta;
    updateGroundState();

    // 读取键盘输入得到移动方向
    const moveDir = new THREE.Vector3();
    if (keyState.forward) moveDir.z -= 1;
    if (keyState.backward) moveDir.z += 1;
    if (keyState.left) moveDir.x -= 1;
    if (keyState.right) moveDir.x += 1;

    if (moveDir.length() > 0) {
        moveDir.normalize().applyQuaternion(camera.quaternion);
        applyMoveDisplacement(moveDir, delta);
    }
    updateGroundState();
}

