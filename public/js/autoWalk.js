// autoWalk.js
import {camera, isReplaying} from './state.js';
import {isColliding} from './player.js';

let isAutoWalking = false;
let planner = null;       // 路径规划函数，每帧调用，返回 { targetX, targetZ } 或 { dx, dz } 或 null

let avoidanceTimer = 0;          // 避障剩余帧数
let avoidanceDir = 0;           // 1 或 -1，表示左转或右转

function predictCollision(forwardX, forwardZ, distance) {
    const testX = camera.position.x + forwardX * distance;
    const testZ = camera.position.z + forwardZ * distance;
    return isColliding(testX, testZ);
}

// 获取绕行方向（世界坐标），side = 1 为右转，-1 为左转
function getPerpendicularDirection(forward, side) {
    const perpX = -forward.z * side;
    const perpZ = forward.x * side;
    return {x: perpX, z: perpZ};
}

export function startAutoWalk(planFn) {
    if (isAutoWalking || isReplaying) return;
    planner = planFn;
    isAutoWalking = true;
    console.log('自动行走已启动');
}

export function stopAutoWalk() {
    if (!isAutoWalking) return;
    isAutoWalking = false;
    planner = null;
    console.log('自动行走已停止');
}

export function isAutoWalkingActive() {
    return isAutoWalking;
}

// 每帧由 main.js 调用，返回世界坐标系下的归一化水平方向 Vector3，若无法移动则返回 null
export function getAutoMoveDirection(delta) {
    if (!isAutoWalking || !planner) {
        stopAutoWalk();
        return null;
    }
    try {
        const result = planner();
        if (!result) {
            stopAutoWalk();
            return null;
        }
        // 新增：等待信号
        if (result.wait) {
            return {x: 0, z: 0};   // 原地不动
        }

        const playerPos = camera.position;
        let dx = 0, dz = 0;

        if (result.targetX !== undefined && result.targetZ !== undefined) {
            // 目标点模式
            const toX = result.targetX - playerPos.x;
            const toZ = result.targetZ - playerPos.z;
            const dist = Math.sqrt(toX * toX + toZ * toZ);
            if (dist < 0.3) {         // 到达目标，停止
                stopAutoWalk();
                return null;
            }
            dx = toX / dist;
            dz = toZ / dist;
        } else if (result.dx !== undefined && result.dz !== undefined) {
            // 直接方向模式
            const len = Math.sqrt(result.dx * result.dx + result.dz * result.dz);
            if (len < 0.01) {
                stopAutoWalk();
                return null;
            }
            dx = result.dx / len;
            dz = result.dz / len;
        } else {
            stopAutoWalk();
            return null;
        }
        return {x: dx, z: dz};
    } catch (e) {
        console.error('自动行走规划函数出错:', e);
        stopAutoWalk();
        return null;
    }
}