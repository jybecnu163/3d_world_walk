import {camera, currentRecording} from './state.js';
import * as THREE from "three";
import {getItemById} from './items.js';

export class MiniMap {
    constructor(canvas, items, worldSize = 32) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = items;
        this.worldSize = worldSize;
        this.scale = canvas.width / worldSize;
    }

    updateItems(items) {
        this.items = items;
    }

    draw(camPos, camRotY, dynamicObjects = []) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        ctx.clearRect(0, 0, w, w);
        ctx.fillStyle = 'rgba(20,30,20,0.8)';
        ctx.fillRect(0, 0, w, w);

        for (const item of this.items) {
            if (item.type === 'item') {
                const def = getItemById(item.itemId);
                if (!def) continue;

                const gw = def.gridSize?.[0] || 1;
                const gd = def.gridSize?.[1] || 1;
                const halfW = gw / 2, halfD = gd / 2;
                const p1 = this.toMini(item.x - halfW, item.z - halfD);
                const p2 = this.toMini(item.x + halfW, item.z + halfD);

                // 颜色：GLB 用紫色，普通物品取第一个方块颜色，否则灰色
                let colorHex;
                if (def.type === 'glb') {
                    colorHex = '#8a2be2';               // 紫色标识 GLB 模型
                } else if (def.blocks && def.blocks[0]?.color) {
                    colorHex = '#' + def.blocks[0].color.toString(16).padStart(6, '0');
                } else {
                    colorHex = '#888888';
                }

                this.ctx.fillStyle = colorHex;
                this.ctx.fillRect(
                    Math.min(p1.x, p2.x), Math.min(p1.y, p2.y),
                    Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)
                );
            } else if (item.type === 'wall' || item.type === 'building') {
                const hw = item.w / 2, hd = item.d / 2;
                const p1 = this.toMini(item.x - hw, item.z - hd);
                const p2 = this.toMini(item.x + hw, item.z + hd);
                ctx.fillStyle = '#' + item.color.toString(16).padStart(6, '0');
                ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
            } else if (item.type === 'pillar' || item.type === 'tree') {
                const p = this.toMini(item.x, item.z);
                ctx.fillStyle = '#888';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (item.type === 'road' && item.path) {
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.beginPath();
                const first = this.toMini(item.path[0][0], item.path[0][1]);
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < item.path.length; i++) {
                    const pt = this.toMini(item.path[i][0], item.path[i][1]);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }
        }

        // 录制路径
        if (currentRecording.length > 1) {
            ctx.strokeStyle = 'rgba(255,215,0,0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const f = this.toMini(currentRecording[0].pos.x, currentRecording[0].pos.z);
            ctx.moveTo(f.x, f.y);
            for (let i = 1; i < currentRecording.length; i++) {
                const p = this.toMini(currentRecording[i].pos.x, currentRecording[i].pos.z);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // 玩家位置
        const pp = this.toMini(camPos.x, camPos.z);
        ctx.fillStyle = '#ff5050';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

// 绘制方向（使用相机前方向量，自适应坐标系）
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const target = new THREE.Vector3().copy(camPos).addScaledVector(forward, 3);
        const targetMini = this.toMini(target.x, target.z);
        const dx = targetMini.x - pp.x;
        const dy = targetMini.y - pp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.1) {
            const sx = dx / dist * 8;
            const sy = dy / dist * 8;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(pp.x, pp.y);
            ctx.lineTo(pp.x + sx, pp.y + sy);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 箭头尖端
            ctx.beginPath();
            ctx.arc(pp.x + sx, pp.y + sy, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // 绘制动态物品
        dynamicObjects.forEach(obj => {
            const p = this.toMini(obj.position.x, obj.position.z);
            ctx.fillStyle = '#ffdd00AA';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

    }

    toMini(wx, wz) {
        const x = (wx + this.worldSize / 2) * this.scale;
        const y = this.canvas.height - (wz + this.worldSize / 2) * this.scale;
        return {x, y};
        //
        // const x = (wx + this.worldSize / 2) * this.scale;
        // const y = (wz + this.worldSize / 2) * this.scale;  // 移除 canvas.height - ，使 Z 正向对应屏幕下方
        // return {x, y};
    }


}