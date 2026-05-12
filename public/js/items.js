// items.js - 物品定义管理
let itemDefinitions = []; // 扁平数组

export async function loadItemDefinitions() {
    const res = await fetch('/api/items');
    itemDefinitions = await res.json();
    return itemDefinitions;
}

export function getItemById(id) {
    return itemDefinitions.find(item => item.id === id);
}

export function getAllItems() {
    return itemDefinitions;
}