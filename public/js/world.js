import * as THREE from 'three';
import {scene, wallColliders} from './state.js';
import {getItemById} from './items.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

export function createGlbItem(def, x, z, rotation = 0) {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(def.modelUrl, (gltf) => {
        const model = gltf.scene;

        // 计算原始包围盒
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`GLB ${def.id} 原始尺寸:`, size);

        // 根据 gridSize 计算缩放比例
        const targetWidth = def.gridSize?.[0] || 1;
        const targetDepth = def.gridSize?.[1] || 1;
        const maxOriginal = Math.max(size.x, size.z);
        const scaleFactor = Math.min(targetWidth, targetDepth) / maxOriginal; // 保持比例，取较小的一边适配

        model.scale.setScalar(scaleFactor);
        console.log(`缩放比例: ${scaleFactor}`);

        // 重新计算缩放后的包围盒，用于放置
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledSize = new THREE.Vector3();
        scaledBox.getSize(scaledSize);

        // 将模型底部对齐地面 (y=0)
        const bottomY = scaledBox.min.y;
        model.position.set(x, -bottomY, z);
        model.rotation.y = rotation;

        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(model);

        // 碰撞盒使用缩放后的包围盒
        if (def.collide) {
            const collideBox = new THREE.Box3().setFromObject(model);
            wallColliders.push(collideBox);
        }
    }, undefined, (err) => {
        console.error('模型加载失败:', err);
    });
}

function createWall(d) {
    const color = typeof d.color === 'number' ? d.color : parseInt(d.color);
    const geo = new THREE.BoxGeometry(d.w, d.h, d.d);
    const mat = new THREE.MeshStandardMaterial({color, roughness: 0.7});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, d.h / 2, d.z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    wallColliders.push(new THREE.Box3(
        new THREE.Vector3(d.x - d.w / 2, 0, d.z - d.d / 2),
        new THREE.Vector3(d.x + d.w / 2, d.h, d.z + d.d / 2)
    ));
}

function createPillar(d) {
    const color = typeof d.color === 'number' ? d.color : parseInt(d.color);
    const r = d.radius || 0.5;
    const geo = new THREE.CylinderGeometry(r, r, d.h, 8);
    const mat = new THREE.MeshStandardMaterial({color});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, d.h / 2, d.z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    wallColliders.push(new THREE.Box3(
        new THREE.Vector3(d.x - r, 0, d.z - r),
        new THREE.Vector3(d.x + r, d.h, d.z + r)
    ));
}

function createTree(d) {
    const group = new THREE.Group();
    const tGeo = new THREE.CylinderGeometry(0.1, 0.15, d.h, 8);
    const tMat = new THREE.MeshStandardMaterial({color: 0x8b5a2b});
    group.add(new THREE.Mesh(tGeo, tMat)).position.y = d.h / 2;
    for (let i = 0; i < 3; i++) {
        const cGeo = new THREE.ConeGeometry(0.6 - i * 0.15, 0.8, 8);
        const cMat = new THREE.MeshStandardMaterial({color: parseInt(d.color) || 0x2e8b57});
        group.add(new THREE.Mesh(cGeo, cMat)).position.y = d.h * 0.6 + i * 0.5;
    }
    group.position.set(d.x, 0, d.z);
    scene.add(group);
    wallColliders.push(new THREE.Box3(
        new THREE.Vector3(d.x - 0.2, 0, d.z - 0.2),
        new THREE.Vector3(d.x + 0.2, d.h * 0.8, d.z + 0.2)
    ));
}

function createBuilding(d) {
    const color = typeof d.color === 'number' ? d.color : parseInt(d.color);
    const geo = new THREE.BoxGeometry(d.w, d.h, d.d);
    const mat = new THREE.MeshStandardMaterial({color});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, d.h / 2, d.z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    wallColliders.push(new THREE.Box3(
        new THREE.Vector3(d.x - d.w / 2, 0, d.z - d.d / 2),
        new THREE.Vector3(d.x + d.w / 2, d.h, d.z + d.d / 2)
    ));
}

function createRoad(d) {
    if (!d.path || d.path.length < 2) return;
    const pts = d.path.map(([x, z]) => new THREE.Vector3(x, 0.01, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 64, (d.width || 1) / 2, 4, false);
    const mat = new THREE.MeshStandardMaterial({color: parseInt(d.color) || 0x444444});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
}

export function clearScene() {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    scene.add(new THREE.AmbientLight(0x404060));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    scene.add(sun);
    const g = new THREE.PlaneGeometry(30, 30);
    const m = new THREE.MeshStandardMaterial({color: 0x3a6b3a});
    const ground = new THREE.Mesh(g, m);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

export function buildWorld(items) {
    wallColliders.length = 0;
    items.forEach(item => {
        // console.log(`处理物品:`, item);
        if (item.type === 'item') {
            const def = getItemById(item.itemId);
            if (!def) return;
            if (def.type === 'glb') {
                createGlbItem(def, item.x, item.z, item.rotation || 0);
            } else {
                createItemFromDef(def, item.x, item.z, item.rotation || 0);
            }
        } else if (item.type === 'road') {
            createRoad(item);
        } else if (item.type === 'wall') {
            // 兼容旧数据（如果有）
            createWall(item);
        } else if (item.type === 'tree') {
            createTree(item);
        } else if (item.type === 'pillar') {
            createPillar(item);
        } else if (item.type === 'building') {
            createBuilding(item);
        }
        // 其他类型保持向后兼容
    });
}

export function createItemFromDef(def, x, z, rotation) {
    const group = new THREE.Group();
    def.blocks.forEach(block => {
        let geometry, material;
        const color = parseInt(block.color);
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
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(block.x || 0, block.y || 0, block.z || 0);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        // 碰撞盒处理（只计算标记为 collide 的方块）
        if (block.collide) {
            const hw = (block.w / 2) || 0.5, hh = (block.h / 2) || 0.5, hd = (block.d / 2) || 0.5;
            const box = new THREE.Box3(
                new THREE.Vector3(x + (block.x || 0) - hw, (block.y || 0) - hh, z + (block.z || 0) - hd),
                new THREE.Vector3(x + (block.x || 0) + hw, (block.y || 0) + hh, z + (block.z || 0) + hd)
            );
            wallColliders.push(box);
        }
    });
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);
}