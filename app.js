const API_BASE = '/api';
let currentModalType = null;
let currentEditId = null;
let orderItemIndex = 0;

async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    if (data) {
        options.body = JSON.stringify(data);
    }
    try {
        const response = await fetch(API_BASE + url, options);
        const result = await response.json();
        if (!response.ok) {
            alert('错误: ' + (result.error || '操作失败'));
            return null;
        }
        return result;
    } catch (e) {
        alert('网络错误: ' + e.message);
        return null;
    }
}

function formatMoney(fen) {
    return (fen / 100).toFixed(2) + ' 元';
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');

        if (btn.dataset.tab === 'members') loadMembers();
        if (btn.dataset.tab === 'products') loadProducts();
        if (btn.dataset.tab === 'recharge') loadMembersForSelect();
        if (btn.dataset.tab === 'order') { loadMembersForSelect(); loadProductsForOrder(); }
        if (btn.dataset.tab === 'exchange') loadMembersForSelect();
        if (btn.dataset.tab === 'sales') loadSales();
    });
});

async function loadMembers() {
    const members = await apiRequest('/members');
    if (!members) return;
    const container = document.getElementById('members-list');
    container.innerHTML = '<table><tr><th>ID</th><th>昵称</th><th>手机</th><th>余额</th><th>积分</th><th>注册时间</th><th>操作</th></tr>' +
        members.map(m => `<tr>
            <td>${m.id}</td>
            <td>${m.nickname}</td>
            <td>${m.phone}</td>
            <td>${formatMoney(m.balance)}</td>
            <td>${m.points}</td>
            <td>${m.created_at}</td>
            <td>
                <button onclick="editMember(${m.id})">编辑</button>
                <button onclick="deleteMember(${m.id})">删除</button>
            </td>
        </tr>`).join('') + '</table>';
}

async function addMember() {
    const nickname = document.getElementById('member-nickname').value.trim();
    const phone = document.getElementById('member-phone').value.trim();
    if (!nickname || !phone) {
        alert('请填写昵称和手机号');
        return;
    }
    const result = await apiRequest('/members', 'POST', { nickname, phone });
    if (result) {
        document.getElementById('member-nickname').value = '';
        document.getElementById('member-phone').value = '';
        loadMembers();
    }
}

async function editMember(id) {
    const members = await apiRequest('/members');
    const member = members.find(m => m.id === id);
    if (!member) return;
    currentModalType = 'member';
    currentEditId = id;
    document.getElementById('modal-title').textContent = '编辑会员';
    document.getElementById('modal-body').innerHTML = `
        <label>昵称: <input type="text" id="edit-nickname" value="${member.nickname}"></label><br>
        <label>手机: <input type="text" id="edit-phone" value="${member.phone}"></label>
    `;
    document.getElementById('modal').style.display = 'block';
}

async function deleteMember(id) {
    if (!confirm('确定删除该会员吗？')) return;
    const result = await apiRequest('/members/' + id, 'DELETE');
    if (result) loadMembers();
}

async function loadProducts() {
    const products = await apiRequest('/products');
    if (!products) return;
    const container = document.getElementById('products-list');
    container.innerHTML = '<table><tr><th>ID</th><th>商品名</th><th>类型</th><th>价格</th><th>状态</th><th>操作</th></tr>' +
        products.map(p => `<tr class="${p.status === '下架' ? 'offline' : ''}">
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.type}</td>
            <td>${formatMoney(p.price)}</td>
            <td>${p.status}</td>
            <td>
                <button onclick="editProduct(${p.id})">编辑</button>
                <button onclick="deleteProduct(${p.id})">删除</button>
            </td>
        </tr>`).join('') + '</table>';
}

async function addProduct() {
    const name = document.getElementById('product-name').value.trim();
    const type = document.getElementById('product-type').value;
    const price = parseInt(document.getElementById('product-price').value);
    const status = document.getElementById('product-status').value;
    if (!name || !price || price <= 0) {
        alert('请填写商品名和有效价格');
        return;
    }
    const result = await apiRequest('/products', 'POST', { name, type, price, status });
    if (result) {
        document.getElementById('product-name').value = '';
        document.getElementById('product-price').value = '';
        loadProducts();
    }
}

async function editProduct(id) {
    const products = await apiRequest('/products');
    const product = products.find(p => p.id === id);
    if (!product) return;
    currentModalType = 'product';
    currentEditId = id;
    document.getElementById('modal-title').textContent = '编辑商品';
    document.getElementById('modal-body').innerHTML = `
        <label>商品名: <input type="text" id="edit-name" value="${product.name}"></label><br>
        <label>类型: 
            <select id="edit-type">
                <option value="咖啡" ${product.type === '咖啡' ? 'selected' : ''}>咖啡</option>
                <option value="茶饮" ${product.type === '茶饮' ? 'selected' : ''}>茶饮</option>
                <option value="甜点" ${product.type === '甜点' ? 'selected' : ''}>甜点</option>
                <option value="轻食" ${product.type === '轻食' ? 'selected' : ''}>轻食</option>
                <option value="周边" ${product.type === '周边' ? 'selected' : ''}>周边</option>
            </select>
        </label><br>
        <label>价格: <input type="number" id="edit-price" value="${product.price}"></label><br>
        <label>状态: 
            <select id="edit-status">
                <option value="上架" ${product.status === '上架' ? 'selected' : ''}>上架</option>
                <option value="下架" ${product.status === '下架' ? 'selected' : ''}>下架</option>
            </select>
        </label>
    `;
    document.getElementById('modal').style.display = 'block';
}

async function deleteProduct(id) {
    if (!confirm('确定删除该商品吗？')) return;
    const result = await apiRequest('/products/' + id, 'DELETE');
    if (result) loadProducts();
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
    currentModalType = null;
    currentEditId = null;
}

async function saveModal() {
    if (currentModalType === 'member') {
        const nickname = document.getElementById('edit-nickname').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        if (!nickname || !phone) {
            alert('请填写昵称和手机号');
            return;
        }
        const result = await apiRequest('/members/' + currentEditId, 'PUT', { nickname, phone });
        if (result) {
            closeModal();
            loadMembers();
        }
    } else if (currentModalType === 'product') {
        const name = document.getElementById('edit-name').value.trim();
        const type = document.getElementById('edit-type').value;
        const price = parseInt(document.getElementById('edit-price').value);
        const status = document.getElementById('edit-status').value;
        if (!name || !price || price <= 0) {
            alert('请填写商品名和有效价格');
            return;
        }
        const result = await apiRequest('/products/' + currentEditId, 'PUT', { name, type, price, status });
        if (result) {
            closeModal();
            loadProducts();
        }
    }
}

async function loadMembersForSelect() {
    const members = await apiRequest('/members');
    if (!members) return;
    const options = members.map(m => `<option value="${m.id}">${m.nickname} (${m.phone}) 余额:${formatMoney(m.balance)} 积分:${m.points}</option>`).join('');
    ['recharge-member', 'order-member', 'exchange-member'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
    });
}

async function loadProductsForOrder() {
    const products = await apiRequest('/products');
    if (!products) return;
    window.onlineProducts = products.filter(p => p.status === '上架');
}

async function recharge() {
    const memberId = parseInt(document.getElementById('recharge-member').value);
    const amount = parseInt(document.getElementById('recharge-amount').value);
    if (!memberId || !amount || amount <= 0) {
        alert('请选择会员并输入有效金额');
        return;
    }
    const result = await apiRequest('/recharge', 'POST', { member_id: memberId, amount });
    if (result) {
        const pointsGifted = Math.floor(amount / 10);
        document.getElementById('recharge-result').innerHTML =
            `<div class="success">充值成功！会员 ${result.nickname} 余额: ${formatMoney(result.balance)}, 积分: ${result.points} (赠送 ${pointsGifted} 积分)</div>`;
        document.getElementById('recharge-amount').value = '';
        loadMembersForSelect();
    }
}

function addOrderItem() {
    if (!window.onlineProducts || window.onlineProducts.length === 0) {
        alert('暂无上架商品');
        return;
    }
    const container = document.getElementById('order-items');
    const idx = orderItemIndex++;
    const div = document.createElement('div');
    div.className = 'order-item';
    div.id = 'order-item-' + idx;
    div.innerHTML = `
        <select class="order-product" data-idx="${idx}">
            ${window.onlineProducts.map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} - ${formatMoney(p.price)}</option>`).join('')}
        </select>
        <input type="number" class="order-quantity" min="1" value="1" data-idx="${idx}">
        <button onclick="removeOrderItem(${idx})">删除</button>
    `;
    container.appendChild(div);
}

function removeOrderItem(idx) {
    const el = document.getElementById('order-item-' + idx);
    if (el) el.remove();
}

async function submitOrder() {
    const memberId = parseInt(document.getElementById('order-member').value);
    const itemDivs = document.querySelectorAll('.order-item');
    if (!memberId || itemDivs.length === 0) {
        alert('请选择会员并添加商品');
        return;
    }
    const items = [];
    let total = 0;
    for (const div of itemDivs) {
        const productId = parseInt(div.querySelector('.order-product').value);
        const quantity = parseInt(div.querySelector('.order-quantity').value);
        if (!productId || !quantity || quantity <= 0) {
            alert('请填写有效的商品数量');
            return;
        }
        const price = parseInt(div.querySelector('.order-product option:checked').dataset.price);
        items.push({ product_id: productId, quantity });
        total += price * quantity;
    }
    const result = await apiRequest('/order', 'POST', { member_id: memberId, items });
    if (result) {
        document.getElementById('order-result').innerHTML =
            `<div class="success">下单成功！订单号: ${result.order_id}, 金额: ${formatMoney(result.total_amount)}, 获得积分: ${result.points_earned}<br>
             会员 ${result.nickname} 余额: ${formatMoney(result.balance)}, 积分: ${result.points}</div>`;
        document.getElementById('order-items').innerHTML = '';
        orderItemIndex = 0;
        loadMembersForSelect();
    }
}

async function exchangePoints() {
    const memberId = parseInt(document.getElementById('exchange-member').value);
    const points = parseInt(document.getElementById('exchange-points').value);
    if (!memberId || !points || points <= 0 || points % 100 !== 0) {
        alert('请选择会员并输入100的整数倍积分');
        return;
    }
    const result = await apiRequest('/exchange', 'POST', { member_id: memberId, points });
    if (result) {
        document.getElementById('exchange-result').innerHTML =
            `<div class="success">兑换成功！${points} 积分兑换 ${formatMoney(result.balance_added)}<br>
             会员 ${result.nickname} 余额: ${formatMoney(result.balance)}, 积分: ${result.points}</div>`;
        document.getElementById('exchange-points').value = '';
        loadMembersForSelect();
    }
}

async function loadSales() {
    const sales = await apiRequest('/sales/monthly');
    if (!sales) return;
    const container = document.getElementById('sales-list');
    if (sales.length === 0) {
        container.innerHTML = '<p>本月暂无销售数据</p>';
        return;
    }
    let totalQty = 0;
    let totalAmt = 0;
    container.innerHTML = '<table><tr><th>商品类型</th><th>销售数量</th><th>销售额</th></tr>' +
        sales.map(s => {
            totalQty += s.total_quantity || 0;
            totalAmt += s.total_amount || 0;
            return `<tr>
                <td>${s.product_type}</td>
                <td>${s.total_quantity}</td>
                <td>${formatMoney(s.total_amount)}</td>
            </tr>`;
        }).join('') +
        `<tr class="total">
            <td>合计</td>
            <td>${totalQty}</td>
            <td>${formatMoney(totalAmt)}</td>
        </tr></table>`;
}

window.onload = () => {
    loadMembers();
    loadProducts();
    loadMembersForSelect();
    loadProductsForOrder();
};

window.onclick = (e) => {
    const modal = document.getElementById('modal');
    if (e.target === modal) closeModal();
};
