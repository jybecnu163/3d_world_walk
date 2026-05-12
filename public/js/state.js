import * as THREE from 'three';

// 新增变量
export let currentGridSize = 30;

// 新增 setter
export function setCurrentGridSize(size) {
    currentGridSize = size;
}

export const scene = new THREE.Scene();
export let camera, renderer, controls;
export let miniMap;

export let currentMapId = null;
export let mapItems = [];
export let wallColliders = [];

// 录制与回放
// 原：export const recording = [];
export let currentRecording = [];
export const recordingStore = {};
export let isRecording = false;
export let isReplaying = false;
export let lastRecordTime = 0;
export let recordStartTime = 0;
export let replayStartTime = 0;
export const RECORD_INTERVAL = 100;

// 玩家物理常量
export const GRAVITY = 9.8;
export const PLAYER_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.45;

export const player = {
    speed: 5.0,
    radius: PLAYER_RADIUS,
    height: PLAYER_HEIGHT,
    verticalVelocity: 0,
    isOnGround: false,
    jumpCount: 0,
    groundY: 0
};

export const keyState = {forward: false, backward: false, left: false, right: false};

// 在现有导出变量附近添加
export let playerModel = null;

export function setPlayerModel(model) {
    playerModel = model;
}

export const playerPos = new THREE.Vector3(2, 0, 2);   // 玩家脚底位置（世界坐标）
export function setPlayerPos(x, y, z) {
    playerPos.set(x, y, z);
}

// 保存当前录制到指定地图ID
export function saveCurrentRecordingForMap(mapId) {
    if (!mapId) return;
    recordingStore[mapId] = [...currentRecording]; // 拷贝当前录制
}

// 加载指定地图ID的录制数据，并设置为当前录制
export function loadRecordingForMap(mapId) {
    const saved = recordingStore[mapId] || [];
    currentRecording.length = 0;  // 清空数组内容，保持引用不变
    saved.forEach(p => currentRecording.push(p));
}

// 清空指定地图的录制缓存（调用时传入 mapId）
export function clearRecordingForMap(mapId) {
    if (mapId) delete recordingStore[mapId];
}

export function setCurrentRecording(rec) {
    currentRecording = rec;
}

export function clearCurrentRecording() {
    currentRecording = [];
}

export function saveRecordingForMap(mapId, rec) {
    recordingStore[mapId] = rec;
}

export function getRecordingForMap(mapId) {
    return recordingStore[mapId] || [];
}

export function setCamera(cam) {
    camera = cam;
}

export function setRenderer(r) {
    renderer = r;
}

export function setControls(ctrl) {
    controls = ctrl;
}

export function setMiniMap(mm) {
    miniMap = mm;
}

export function updateButtons() {
    document.getElementById('btn-record').classList.toggle('disabled', isRecording || isReplaying);
    document.getElementById('btn-stop').classList.toggle('disabled', !isRecording && !isReplaying);
    document.getElementById('btn-play').classList.toggle('disabled', currentRecording.length < 2 || isRecording || isReplaying);
    document.getElementById('status-text').textContent = isRecording ? '录制中' : isReplaying ? '回放中' : '就绪';
}

export function setCurrentMapId(id) {
    currentMapId = id;
}

export function setMapItems(items) {
    mapItems = items;
}

export function setIsRecording(value) {
    isRecording = value;
}

export function setIsReplaying(value) {
    isReplaying = value;
}

export function setRecordStartTime(value) {
    recordStartTime = value;
}

export function setLastRecordTime(value) {
    lastRecordTime = value;
}

export function setReplayStartTime(value) {
    replayStartTime = value;
}

export function clearRecording() {
    currentRecording.length = 0;
}


// 第三人称视角状态（由 main.js 设置）
export let isThirdPerson = false;
// 相机围绕角色的水平旋转角。
export let thirdPersonYaw = 0;
// 相机俯仰角（负值为俯视）。
export let thirdPersonPitch = -0.3; // 默认俯视（负值为向下看）
export function setThirdPersonState(third, yaw = 0, pitch = -0.3) {
    isThirdPerson = third;
    thirdPersonYaw = yaw;
    thirdPersonPitch = pitch;
}