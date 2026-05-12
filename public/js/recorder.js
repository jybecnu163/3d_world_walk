import {
    camera,
    clearCurrentRecording,
    controls,
    currentRecording,
    isRecording,
    isReplaying,
    isThirdPerson,
    setIsRecording,
    setIsReplaying,
    setThirdPersonState,
    updateButtons
} from './state.js';
import * as THREE from "three";
import {attachModelToCamera} from "./player.js";

// 私有状态（模块内可写，外部无需访问）
let recordStartTime = 0;
let lastRecordTime = 0;
let replayStartTime = 0;

// 每帧检查是否需要录制（由 main.js 调用）
export function tryRecordFrame() {
    if (!isRecording) return;
    const now = performance.now();
    if (now - lastRecordTime >= 100) {  // RECORD_INTERVAL = 100
        recordCurrentPoseWithTime();
        lastRecordTime = now;
    }
}

function recordCurrentPoseWithTime() {
    const t = performance.now() - recordStartTime;
    const pos = camera.position.clone();
    const rot = camera.quaternion.clone();
    currentRecording.push({
        time: t,
        pos: {x: pos.x, y: pos.y, z: pos.z},
        rot: [rot.x, rot.y, rot.z, rot.w]
    });
}

export function startRecording() {
    clearCurrentRecording();
    setIsRecording(true);
    const now = performance.now();
    recordStartTime = now;
    lastRecordTime = now;
    recordCurrentPoseWithTime();
}

export function stopRecording() {
    setIsRecording(false);
}

export function startPlayback() {
    if (currentRecording.length < 2) return;
    if (isThirdPerson) {
        // 回放时强制第一人称
        isThirdPerson = false;
        controls.lock();
        attachModelToCamera();
        setThirdPersonState(false);
    }
    setIsReplaying(true);
    replayStartTime = performance.now();
    controls.enabled = false;
}

export function stopPlayback() {
    setIsReplaying(false);
    controls.enabled = true;
}

export function applyReplay() {
    if (!isReplaying || currentRecording.length === 0) return;

    const now = performance.now();
    const elapsed = now - replayStartTime;

    if (elapsed > currentRecording[currentRecording.length - 1].time) {
        const last = currentRecording[currentRecording.length - 1];
        camera.position.set(last.pos.x, last.pos.y, last.pos.z);
        camera.quaternion.set(...last.rot);
        stopPlayback();
        updateButtons();
        return;
    }

    let i = 0;
    while (i < currentRecording.length - 1 && currentRecording[i + 1].time <= elapsed) i++;
    const p1 = currentRecording[i];
    const p2 = currentRecording[i + 1];
    const t = Math.min(Math.max((elapsed - p1.time) / (p2.time - p1.time), 0), 1);

    camera.position.set(
        p1.pos.x + (p2.pos.x - p1.pos.x) * t,
        p1.pos.y + (p2.pos.y - p1.pos.y) * t,
        p1.pos.z + (p2.pos.z - p1.pos.z) * t
    );

    const q1 = new THREE.Quaternion(p1.rot[0], p1.rot[1], p1.rot[2], p1.rot[3]);
    const q2 = new THREE.Quaternion(p2.rot[0], p2.rot[1], p2.rot[2], p2.rot[3]);
    camera.quaternion.copy(q1).slerp(q2, t);
}