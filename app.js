const API_BASE = '/api';
let currentModalType = null;
let currentEditId = null;
let orderItemIndex = 0;
let cacheMembers = [];
let cacheProducts = [];

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function validatePhone(phone) {
    if (!phone) return false;
    return PHONE_PATTERN.test(phone);
}

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

function createTableRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach(cell => {
        const td = document.createElement('td');
        if (typeof cell === 'string' || typeof cell === 'number') {
            td.textContent = cell;
        } else if (cell.element) {
            td.appendChild(cell.element);
        }
        tr.appendChild(td);
    });
    return tr;
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
    cacheMembers = members;
    const container = document.getElementById('members-list');
    container.innerHTML = '';

    const table = document.createElement('table');
    const thead = document.createElement('tr');
    ['ID', '昵称', '手机', '余额', '积分', '注册时间', '操作'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        thead.appendChild(th);
    });
    table.appendChild(thead);

    members.forEach(m => {
        const editBtn = document.createElement('button');
        editBtn.textContent = '编辑';
        editBtn.onclick = () => editMember(m.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => deleteMember(m.id);

        const actionTd = document.createElement('div');
        actionTd.appendChild(editBtn);
        actionTd.appendChild(deleteBtn);

        const tr = createTableRow([
            m.id,
            m.nickname,
            m.phone,
            formatMoney(m.balance),
            m.points,
            m.created_at,
            { element: actionTd }
        ]);
        table.appendChild(tr);
    });

    container.appendChild(table);
}

async function addMember() {
    const nickname = document.getElementById('member-nickname').value.trim();
    const phone = document.getElementById('member-phone').value.trim();
    if (!nickname || !phone) {
        alert('请填写昵称和手机号');
        return;
    }
    if (!validatePhone(phone)) {
        alert('手机号格式不正确');
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
    const member = cacheMembers.find(m => m.id === id);
    if (!member) return;
    currentModalType = 'member';
    currentEditId = id;
    document.getElementById('modal-title').textContent = '编辑会员';

    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    const label1 = document.createElement('label');
    label1.textContent = '昵称: ';
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.id = 'edit-nickname';
    input1.value = member.nickname;
    label1.appendChild(input1);
    body.appendChild(label1);
    body.appendChild(document.createElement('br'));

    const label2 = document.createElement('label');
    label2.textContent = '手机: ';
    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.id = 'edit-phone';
    input2.value = member.phone;
    label2.appendChild(input2);
    body.appendChild(label2);

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
    cacheProducts = products;
    const container = document.getElementById('products-list');
    container.innerHTML = '';

    const table = document.createElement('table');
    const thead = document.createElement('tr');
    ['ID', '商品名', '类型', '价格', '状态', '操作'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        thead.appendChild(th);
    });
    table.appendChild(thead);

    products.forEach(p => {
        const editBtn = document.createElement('button');
        editBtn.textContent = '编辑';
        editBtn.onclick = () => editProduct(p.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => deleteProduct(p.id);

        const actionTd = document.createElement('div');
        actionTd.appendChild(editBtn);
        actionTd.appendChild(deleteBtn);

        const tr = createTableRow([
            p.id,
            p.name,
            p.type,
            formatMoney(p.price),
            p.status,
            { element: actionTd }
        ]);
        if (p.status === '下架') {
            tr.classList.add('offline');
        }
        table.appendChild(tr);
    });

    container.appendChild(table);
}

async function addProduct() {
    const name = document.getElementById('product-name').value.trim();
    const type = document.getElementById('product-type').value;
    const priceInput = document.getElementById('product-price').value;
    const status = document.getElementById('product-status').value;
    const price = parseInt(priceInput);
    if (!name || isNaN(price) || price <= 0) {
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
    const product = cacheProducts.find(p => p.id === id);
    if (!product) return;
    currentModalType = 'product';
    currentEditId = id;
    document.getElementById('modal-title').textContent = '编辑商品';

    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    const label1 = document.createElement('label');
    label1.textContent = '商品名: ';
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.id = 'edit-name';
    input1.value = product.name;
    label1.appendChild(input1);
    body.appendChild(label1);
    body.appendChild(document.createElement('br'));

    const label2 = document.createElement('label');
    label2.textContent = '类型: ';
    const select2 = document.createElement('select');
    select2.id = 'edit-type';
    ['咖啡', '茶饮', '甜点', '轻食', '周边'].forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === product.type) opt.selected = true;
        select2.appendChild(opt);
    });
    label2.appendChild(select2);
    body.appendChild(label2);
    body.appendChild(document.createElement('br'));

    const label3 = document.createElement('label');
    label3.textContent = '价格: ';
    const input3 = document.createElement('input');
    input3.type = 'number';
    input3.id = 'edit-price';
    input3.value = product.price;
    label3.appendChild(input3);
    body.appendChild(label3);
    body.appendChild(document.createElement('br'));

    const label4 = document.createElement('label');
    label4.textContent = '状态: ';
    const select4 = document.createElement('select');
    select4.id = 'edit-status';
    ['上架', '下架'].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === product.status) opt.selected = true;
        select4.appendChild(opt);
    });
    label4.appendChild(select4);
    body.appendChild(label4);

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
        if (!validatePhone(phone)) {
            alert('手机号格式不正确');
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
        const priceInput = document.getElementById('edit-price').value;
        const status = document.getElementById('edit-status').value;
        const price = parseInt(priceInput);
        if (!name || isNaN(price) || price <= 0) {
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
    cacheMembers = members;
    ['recharge-member', 'order-member', 'exchange-member'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.nickname} (${m.phone}) 余额:${formatMoney(m.balance)} 积分:${m.points}`;
            el.appendChild(opt);
        });
    });
}

async function loadProductsForOrder() {
    const products = await apiRequest('/products');
    if (!products) return;
    cacheProducts = products;
    window.onlineProducts = products.filter(p => p.status === '上架');
}

async function recharge() {
    const memberId = parseInt(document.getElementById('recharge-member').value);
    const amountInput = document.getElementById('recharge-amount').value;
    const amount = parseInt(amountInput);
    if (!memberId || isNaN(amount) || amount <= 0) {
        alert('请选择会员并输入有效金额');
        return;
    }
    const result = await apiRequest('/recharge', 'POST', { member_id: memberId, amount });
    if (result) {
        const pointsGifted = Math.floor(amount / 10);
        const div = document.createElement('div');
        div.className = 'success';
        div.textContent = `充值成功！会员 ${result.nickname} 余额: ${formatMoney(result.balance)}, 积分: ${result.points} (赠送 ${pointsGifted} 积分)`;
        const container = document.getElementById('recharge-result');
        container.innerHTML = '';
        container.appendChild(div);
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

    const select = document.createElement('select');
    select.className = 'order-product';
    select.dataset.idx = idx;
    window.onlineProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.price = p.price;
        opt.textContent = `${p.name} - ${formatMoney(p.price)}`;
        select.appendChild(opt);
    });

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'order-quantity';
    input.min = '1';
    input.value = '1';
    input.dataset.idx = idx;

    const btn = document.createElement('button');
    btn.textContent = '删除';
    btn.onclick = () => removeOrderItem(idx);

    div.appendChild(select);
    div.appendChild(input);
    div.appendChild(btn);
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
        const quantityInput = div.querySelector('.order-quantity').value;
        const quantity = parseInt(quantityInput);
        if (!productId || isNaN(quantity) || quantity <= 0) {
            alert('请填写有效的商品数量');
            return;
        }
        const price = parseInt(div.querySelector('.order-product option:checked').dataset.price);
        items.push({ product_id: productId, quantity });
        total += price * quantity;
    }
    const result = await apiRequest('/order', 'POST', { member_id: memberId, items });
    if (result) {
        const div = document.createElement('div');
        div.className = 'success';
        div.innerHTML = `下单成功！订单号: ${escapeHtml(String(result.order_id))}, 金额: ${escapeHtml(formatMoney(result.total_amount))}, 获得积分: ${escapeHtml(String(result.points_earned))}<br>
             会员 ${escapeHtml(result.nickname)} 余额: ${escapeHtml(formatMoney(result.balance))}, 积分: ${escapeHtml(String(result.points))}`;
        const container = document.getElementById('order-result');
        container.innerHTML = '';
        container.appendChild(div);
        document.getElementById('order-items').innerHTML = '';
        orderItemIndex = 0;
        loadMembersForSelect();
    }
}

async function exchangePoints() {
    const memberId = parseInt(document.getElementById('exchange-member').value);
    const pointsInput = document.getElementById('exchange-points').value;
    const points = parseInt(pointsInput);
    if (!memberId || isNaN(points) || points <= 0 || points % 100 !== 0) {
        alert('请选择会员并输入100的整数倍积分');
        return;
    }
    const result = await apiRequest('/exchange', 'POST', { member_id: memberId, points });
    if (result) {
        const div = document.createElement('div');
        div.className = 'success';
        div.innerHTML = `兑换成功！${escapeHtml(String(points))} 积分兑换 ${escapeHtml(formatMoney(result.balance_added))}<br>
             会员 ${escapeHtml(result.nickname)} 余额: ${escapeHtml(formatMoney(result.balance))}, 积分: ${escapeHtml(String(result.points))}`;
        const container = document.getElementById('exchange-result');
        container.innerHTML = '';
        container.appendChild(div);
        document.getElementById('exchange-points').value = '';
        loadMembersForSelect();
    }
}

async function loadSales() {
    const sales = await apiRequest('/sales/monthly');
    if (!sales) return;
    const container = document.getElementById('sales-list');
    container.innerHTML = '';

    if (sales.length === 0) {
        const p = document.createElement('p');
        p.textContent = '本月暂无销售数据';
        container.appendChild(p);
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('tr');
    ['商品类型', '销售数量', '销售额'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        thead.appendChild(th);
    });
    table.appendChild(thead);

    let totalQty = 0;
    let totalAmt = 0;
    sales.forEach(s => {
        totalQty += s.total_quantity || 0;
        totalAmt += s.total_amount || 0;
        const tr = createTableRow([
            s.product_type,
            s.total_quantity,
            formatMoney(s.total_amount)
        ]);
        table.appendChild(tr);
    });

    const totalTr = createTableRow([
        '合计',
        totalQty,
        formatMoney(totalAmt)
    ]);
    totalTr.classList.add('total');
    table.appendChild(totalTr);

    container.appendChild(table);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

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
