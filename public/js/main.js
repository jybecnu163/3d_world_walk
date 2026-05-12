import * as THREE from 'three';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {loadMap, loadMapList} from './mapLoader.js';

import {dynamicObjects, startDynamics, stopDynamics, updateDynamics} from './dynamics.js';
// 添加导入
import {getAutoMoveDirection, isAutoWalkingActive, startAutoWalk, stopAutoWalk} from './autoWalk.js';

import {
    camera,
    controls,
    currentRecording,
    isRecording,
    isReplaying,
    isThirdPerson,
    keyState,
    miniMap,
    PLAYER_HEIGHT,
    playerModel,
    playerPos,
    scene,
    setCamera,
    setControls,
    setRenderer,
    setThirdPersonState,
    thirdPersonPitch,
    thirdPersonYaw,
    updateButtons
} from './state.js';
import {clearScene} from './world.js';
import {applyReplay, startPlayback, startRecording, stopPlayback, stopRecording, tryRecordFrame} from './recorder.js';
import {
    applyAutoMove,
    applyMoveWithDirection,
    attachModelToCamera,
    detachModelFromCamera,
    getPlayerModelHeight,
    initPlayerModel,
    jump,
    updatePlayerModelWorld
} from './player.js';
import {openEditor} from './editor.js';

import {loadItemDefinitions} from './items.js';

let dynamicsEnabled = false;
const delta = 0.016;
// 第三视角时 镜头到人的距离
const thirdPersonDistance = 1;
// 第三视角时 镜头的高度
const thirdPersonHeight = 2;
// 第三视角时 鼠标灵敏度
const sensitivity = 0.005;

let mouseLeftDown = false;
let lastMouseX = 0, lastMouseY = 0;

const thirdPersonOffset = new THREE.Vector3(0, 2.5, -3.5); // 后上方偏移

function syncFirstPersonCamera() {
    camera.position.set(playerPos.x, playerPos.y + PLAYER_HEIGHT, playerPos.z);
    // 注意：这里不修改 playerPos，playerPos 由移动函数更新
}

function updateThirdPersonCameraByRaycaster() {
    const yaw = thirdPersonYaw;// 水平距离
    const pitch = thirdPersonPitch;// 垂直高度
    // 计算摄像机理想位置
    /**
     * dir 表示从角色指向摄像机的方向（单位向量）。它的三个分量采用球坐标系转换：
     *
     * yaw（水平偏航角）：控制方向在 XZ 平面上的指向。
     * Math.sin(yaw) 和 Math.cos(yaw) 给出水平面上的投影长度（半径为1）。
     * pitch（俯仰角）：控制垂直高度。
     * Math.cos(pitch) 是水平半径的缩放因子（当俯仰很大时，水平分量减小）。
     * -Math.sin(pitch) 是垂直分量，负号使得pitch 为负时 Y 为正（即俯视时摄像机在上方）。
     *
     * 直观理解：
     * X 分量 = 水平方向（依赖 yaw）× 水平缩放（cos(pitch)）
     * Y 分量 = 垂直方向，由 pitch 控制，负号保持俯视时摄像机在上方
     * Z 分量 = 水平方向（依赖 yaw）× 水平缩放（cos(pitch)）
     * 因此 dir 是一个从角色脚底指向理想摄像机位置的单位方向向量
     */
    const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
    );
    // yaw  水平旋转角   pitch 俯仰角
    // 射线防穿墙（简化）
    /**
     * playerPos.clone().add(new THREE.Vector3(0, 0.8, 0))
     * playerPos 是角色脚底世界坐标。
     * .clone() 创建一个副本，避免修改原坐标。
     * .add(0, 0.8, 0) 将起点抬高 0.8 米，大约到角色胸口或头部位置。
     * 作用：射线从角色上半身发出，检测从角色到摄像机之间是否有障碍物。
     * dir.clone().negate()
     * dir 是从角色指向摄像机的方向。
     * .negate() 反转方向，变为从摄像机指向角色。
     *
     * 这里实际作为射线的方向？需要注意：Raycaster 的方向是从起点沿方向投射。因为起点是角色胸口，方向是 dir.negate()（即从角色指向摄像机的反方向 → 从角色指向远离摄像机？不对）。
     *
     * 仔细看：dir 是角色→摄像机方向，dir.negate() 是摄像机→角色方向。射线起点在角色胸口，方向是摄像机→角色，那么这个射线是从角色胸口向摄像机方向的反方向投射，永远不会碰到摄像机。这似乎逻辑反了。
     */
    const raycaster = new THREE.Raycaster(
        playerPos.clone().add(new THREE.Vector3(0, getPlayerModelHeight, 0)),// 起点
        dir.clone().negate(), // 方向（反转）
        0,// 射线的最小检测距离
        thirdPersonDistance * getPlayerModelHeight + 1// 射线的最大检测距离
    );
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && !isNaN(intersects[0].point.x)) {
        camera.position.copy(intersects[0].point).addScaledVector(dir, 0.3);
    } else {
        const idealPos = playerPos.clone()
            .addScaledVector(dir, -thirdPersonDistance * getPlayerModelHeight)
            .add(new THREE.Vector3(0, thirdPersonHeight * getPlayerModelHeight, 0));

        camera.position.copy(idealPos);
    }
    // console.log("camera.position ", camera.position)
    // console.log(playerPos)

    camera.lookAt(playerPos.x, playerPos.y + 1.0, playerPos.z);
}

function updateThirdPersonCamera() {
    const modelHeight = getPlayerModelHeight();
    const distance = modelHeight * 0.8;
    const height = modelHeight * 1.3;
    const yaw = thirdPersonYaw;   // 直接使用导入的变量，每次取最新值

    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cameraPos = playerPos.clone()
        .addScaledVector(forward, -distance)
        .add(new THREE.Vector3(0, height, 0));

    camera.position.copy(cameraPos);
    const lookAtTarget = playerPos.clone().add(new THREE.Vector3(0, modelHeight * 0.88, 0));
    camera.lookAt(lookAtTarget);
}

/**
 * 固定视角，不能用鼠标移动方向
 */
function thirdPersonFixCamera() {
    // 获取角色模型真实高度（若未加载则用默认 1.8）
    const modelHeight = getPlayerModelHeight();

    // 距离 = 模型高度 * 1  （水平距离为 1 倍身高）
    const distance = modelHeight * 0.8;
    // 高度 = 模型高度 * 2  （摄像机垂直高度为 2 倍身高）
    const height = modelHeight * 1.3;
    const yaw = thirdPersonYaw;

    // 计算水平后方方向
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

    // 摄像机理想位置 = 角色脚底 + 后方水平距离 + 向上垂直高度
    const cameraPos = playerPos.clone()
        .addScaledVector(forward, -distance)
        .add(new THREE.Vector3(0, height, 0));

    camera.position.copy(cameraPos);

    // 摄像机看向角色胸部高度（模型高度 60% 处），自然俯视
    const lookAtTarget = playerPos.clone().add(new THREE.Vector3(0, modelHeight * 0.88, 0));
    camera.lookAt(lookAtTarget);
}

// 在 animate 之前调用
loadItemDefinitions();

// 挂载全局函数供 editor 使用
window.loadMapList = loadMapList;
window.loadMap = loadMap;

// 录制/回放按钮事件
document.getElementById('btn-record').onclick = () => {
    if (!isRecording && !isReplaying) {
        startRecording();
        updateButtons();
    }
};
document.getElementById('btn-stop').onclick = () => {
    if (isRecording) {
        stopRecording();
        updateButtons();
    } else if (isReplaying) {
        stopPlayback();
        updateButtons();
    }
};
document.getElementById('btn-play').onclick = () => {
    if (!isRecording && !isReplaying && currentRecording.length >= 2) {
        startPlayback();
        updateButtons();
    }
};

window.addEventListener('mousedown', (e) => {
    if (isThirdPerson && e.button === 0) {
        mouseLeftDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
    }
});
window.addEventListener('mouseup', (e) => {
    if (isThirdPerson && e.button === 0) {
        mouseLeftDown = false;
    }
});
window.addEventListener('mousemove', (e) => {
    if (!isThirdPerson) return;
    // 如果 lastMouse 未初始化（刚进入第三人称），先记录当前位置，避免跳变
    if (lastMouseX === 0 && lastMouseY === 0) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
    }
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    const newYaw = thirdPersonYaw - dx * sensitivity;
    const newPitch = thirdPersonPitch - dy * sensitivity;
    const clampedPitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, newPitch));
    setThirdPersonState(true, newYaw, clampedPitch);
});

// 键盘事件
window.addEventListener('keydown', e => {
    if (document.getElementById('item-editor-overlay') ||
        document.getElementById('editor-overlay').style.display === 'flex') return;

    if (e.code === 'KeyV' && controls.isLocked) {
        e.preventDefault();
        if (!isThirdPerson) {
            // 即将进入第三人称：确保玩家位置已更新到 playerPos（第一人称时 playerPos 应跟随摄像机）
            // 注意：第一人称移动时 playerPos 应靠 applyMoveWithDirection 更新，这里直接使用 playerPos
            controls.unlock();
            // 先将模型从相机分离（此时模型会保留在当前位置，直立）
            detachModelFromCamera();
            // 设置初始第三人称相机水平方向与当前相机一致
            const initYaw = camera.rotation.y;
            setThirdPersonState(true, initYaw, -0.3);

            // 重置鼠标坐标，防止进入时镜头跳变
            lastMouseX = 0;
            lastMouseY = 0;

            // 立即更新摄像机到身后
            updateThirdPersonCamera();
            // 立即设置模型位置为 playerPos，并直立朝向
            if (playerModel) {
                playerModel.position.copy(playerPos);
                playerModel.rotation.set(0, initYaw, 0);
            }
        } else {
            controls.lock();
            attachModelToCamera();
            setThirdPersonState(false);
        }
        return;
    } else if (e.code === 'KeyI' && controls.isLocked) {
        e.preventDefault();
        dynamicsEnabled = !dynamicsEnabled;
        if (dynamicsEnabled) {
            startDynamics();
        } else {
            stopDynamics();
        }
        return;
    } else if (e.code === 'KeyR' && !isRecording && !isReplaying) {
        startRecording();
        updateButtons();
        e.preventDefault();
    } else if (e.code === 'KeyT') {
        if (isRecording) {
            stopRecording();
        } else if (isReplaying) {
            stopPlayback();
        }
        updateButtons();
        e.preventDefault();
    } else if (e.code === 'KeyY' && !isRecording && !isReplaying && currentRecording.length >= 2) {
        startPlayback();
        updateButtons();
        e.preventDefault();
    } else if (e.code === 'Space') {
        jump();
        e.preventDefault();
    }
    if (isReplaying) return;
    switch (e.code) {
        case 'KeyU':
            if (isAutoWalkingActive()) {
                stopAutoWalk();
            } else {
                // 规划函数：每帧寻找最近的动态物品
                const planFn = () => {
                    if (dynamicObjects.length === 0) {
                        return {wait: true};          // 原地等待
                    }
                    const playerPos = cam.position; // cam 是你初始化时创建的相机变量
                    let nearest = null;
                    let minDist = Infinity;
                    dynamicObjects.forEach(obj => {
                        const dx = obj.position.x - playerPos.x;
                        const dz = obj.position.z - playerPos.z;
                        const dist = dx * dx + dz * dz;
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = obj;
                        }
                    });
                    if (!nearest) return null;
                    return {targetX: nearest.position.x, targetZ: nearest.position.z};
                };
                startAutoWalk(planFn);
            }
            e.preventDefault();
            break;
        case 'KeyW':
        case 'ArrowUp':
            if (isAutoWalkingActive()) stopAutoWalk();
            import('./state.js').then(m => m.keyState.forward = true);
            e.preventDefault();
            break;
        case 'KeyS':
        case 'ArrowDown':
            if (isAutoWalkingActive()) stopAutoWalk();
            import('./state.js').then(m => m.keyState.backward = true);
            e.preventDefault();
            break;
        case 'KeyA':
        case 'ArrowLeft':
            if (isAutoWalkingActive()) stopAutoWalk();
            import('./state.js').then(m => m.keyState.left = true);
            e.preventDefault();
            break;
        case 'KeyD':
        case 'ArrowRight':
            if (isAutoWalkingActive()) stopAutoWalk();
            import('./state.js').then(m => m.keyState.right = true);
            e.preventDefault();
            break;
    }
});
window.addEventListener('keyup', e => {
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            import('./state.js').then(m => m.keyState.forward = false);
            e.preventDefault();
            break;
        case 'KeyS':
        case 'ArrowDown':
            import('./state.js').then(m => m.keyState.backward = false);
            e.preventDefault();
            break;
        case 'KeyA':
        case 'ArrowLeft':
            import('./state.js').then(m => m.keyState.left = false);
            e.preventDefault();
            break;
        case 'KeyD':
        case 'ArrowRight':
            import('./state.js').then(m => m.keyState.right = false);
            e.preventDefault();
            break;
    }
});

// 锁定/解锁
const blocker = document.getElementById('blocker');
blocker.onclick = () => {
    if (!isReplaying) controls.lock();
};

// 初始化
const cam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
cam.position.set(2, 1.6, 2);
cam.rotation.y = Math.PI;   // 让相机朝向 +Z 方向（北方）

const rend = new THREE.WebGLRenderer({antialias: true});
rend.setSize(window.innerWidth, window.innerHeight);
rend.shadowMap.enabled = true;
document.getElementById('viewer-container').appendChild(rend.domElement);
const ctrl = new PointerLockControls(cam, document.getElementById('viewer-container'));
ctrl.addEventListener('lock', () => blocker.style.display = 'none');
ctrl.addEventListener('unlock', () => blocker.style.display = 'flex');

setCamera(cam);
setRenderer(rend);
setControls(ctrl);

clearScene();

// 编辑器按钮
document.getElementById('btn-new-map').onclick = () => openEditor(true);
document.getElementById('btn-edit-map').onclick = async () => {
    const state = await import('./state.js');
    if (!state.currentMapId) return alert('请先选择一个地图');
    const res = await fetch('/api/maps/' + state.currentMapId);
    openEditor(false, await res.json());
};

// 动画循环
function animate() {
    requestAnimationFrame(animate);   // 移到最顶部！

    const now = performance.now();
    const delta = 0.016;
    tryRecordFrame();

    if (isReplaying) {
        applyReplay();
    } else if (controls.isLocked || isThirdPerson) {   // 手动控制时
        let moveDir = new THREE.Vector3();
        if (keyState.forward || keyState.backward || keyState.left || keyState.right) {
            if (isThirdPerson) {
                const front = new THREE.Vector3(Math.sin(thirdPersonYaw), 0, Math.cos(thirdPersonYaw));
                const rightDir = new THREE.Vector3(-front.z, 0, front.x);
                if (keyState.forward) moveDir.addScaledVector(front, 1);
                if (keyState.backward) moveDir.addScaledVector(front, -1);
                if (keyState.left) moveDir.addScaledVector(rightDir, -1);
                if (keyState.right) moveDir.addScaledVector(rightDir, 1);
            } else {
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                camDir.y = 0;
                camDir.normalize();
                const camRight = new THREE.Vector3(-camDir.z, 0, camDir.x);
                if (keyState.forward) moveDir.addScaledVector(camDir, 1);
                if (keyState.backward) moveDir.addScaledVector(camDir, -1);
                if (keyState.left) moveDir.addScaledVector(camRight, -1);
                if (keyState.right) moveDir.addScaledVector(camRight, 1);
            }
        }

        // 移动处理（统一使用 applyMoveWithDirection，包含重力与碰撞）
        if (isAutoWalkingActive()) {
            const autoDir = getAutoMoveDirection(delta);
            if (autoDir) {
                applyAutoMove(delta, new THREE.Vector3(autoDir.x, 0, autoDir.z));
            } else {
                stopAutoWalk();
            }
        } else if (moveDir.length() > 0) {
            applyMoveWithDirection(delta, moveDir);
        } else {
            // 即使不移动也要更新重力
            applyMoveWithDirection(delta, new THREE.Vector3(0, 0, 0));
        }
    }

    // 摄像机同步
    if (!isThirdPerson && controls.isLocked) {
        syncFirstPersonCamera();
    } else if (isThirdPerson) {
        updateThirdPersonCamera();

        // 重新计算当前移动方向（与之前移动逻辑一致）
        let moveDir = new THREE.Vector3();
        if (keyState.forward || keyState.backward || keyState.left || keyState.right) {
            const front = new THREE.Vector3(Math.sin(thirdPersonYaw), 0, Math.cos(thirdPersonYaw));
            const rightDir = new THREE.Vector3(-front.z, 0, front.x);
            if (keyState.forward) moveDir.addScaledVector(front, 1);
            if (keyState.backward) moveDir.addScaledVector(front, -1);
            if (keyState.left) moveDir.addScaledVector(rightDir, -1);
            if (keyState.right) moveDir.addScaledVector(rightDir, 1);
        }

        const moving = moveDir.length() > 0;
        if (moving) {
            const angle = Math.atan2(moveDir.x, moveDir.z);
            if (playerModel) playerModel.rotation.y = angle;
        } else {
            // 静止时：未按住左键 → 角色随镜头转向；按住左键 → 角色保持不动
            if (!mouseLeftDown) {
                if (playerModel) playerModel.rotation.y = thirdPersonYaw;
            }
        }
        updatePlayerModelWorld();
    }

    // 更新动态物品
    updateDynamics(now);

    // 小地图
    if (miniMap) miniMap.draw(camera.position, camera.rotation.y, dynamicObjects);

    rend.render(scene, camera);
}

loadMapList().then(r => console.log('load map list over'));
initPlayerModel();
attachModelToCamera();  // 第一人称默认附着模型
animate();

window.addEventListener('resize', () => {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    rend.setSize(window.innerWidth, window.innerHeight);
});