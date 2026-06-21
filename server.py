import http.server
import socketserver
import sqlite3
import json
import os
import urllib.parse
import re

PORT = 5193
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'cafe.db')
ENABLE_LOG = True
PHONE_PATTERN = re.compile(r'^1[3-9]\d{9}$')


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def validate_phone(phone):
    if not phone:
        return False
    return bool(PHONE_PATTERN.match(phone))


def init_db():
    conn = get_db_connection()
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS members
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  nickname TEXT NOT NULL,
                  phone TEXT NOT NULL UNIQUE,
                  balance INTEGER NOT NULL DEFAULT 0,
                  points INTEGER NOT NULL DEFAULT 0,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    c.execute('''CREATE TABLE IF NOT EXISTS products
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  type TEXT NOT NULL,
                  price INTEGER NOT NULL,
                  status TEXT NOT NULL DEFAULT '上架',
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    c.execute('''CREATE TABLE IF NOT EXISTS orders
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  member_id INTEGER NOT NULL,
                  total_amount INTEGER NOT NULL,
                  points_earned INTEGER NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (member_id) REFERENCES members(id))''')

    c.execute('''CREATE TABLE IF NOT EXISTS order_items
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  order_id INTEGER NOT NULL,
                  product_id INTEGER NOT NULL,
                  product_name TEXT NOT NULL,
                  product_type TEXT NOT NULL,
                  price INTEGER NOT NULL,
                  quantity INTEGER NOT NULL,
                  subtotal INTEGER NOT NULL,
                  FOREIGN KEY (order_id) REFERENCES orders(id),
                  FOREIGN KEY (product_id) REFERENCES products(id))''')

    c.execute('''CREATE TABLE IF NOT EXISTS recharge_records
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  member_id INTEGER NOT NULL,
                  amount INTEGER NOT NULL,
                  points_gifted INTEGER NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (member_id) REFERENCES members(id))''')

    c.execute('''CREATE TABLE IF NOT EXISTS exchange_records
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  member_id INTEGER NOT NULL,
                  points_spent INTEGER NOT NULL,
                  balance_added INTEGER NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (member_id) REFERENCES members(id))''')

    conn.commit()
    conn.close()


def json_response(handler, data, status=200):
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))


def static_response(handler, filename, content_type):
    filepath = os.path.join(BASE_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'rb') as f:
            content = f.read()
        handler.send_response(200)
        handler.send_header('Content-Type', content_type)
        handler.end_headers()
        handler.wfile.write(content)
    else:
        handler.send_response(404)
        handler.end_headers()
        handler.wfile.write(b'Not Found')


def parse_path_id(path):
    try:
        return int(path.split('/')[-1])
    except (ValueError, IndexError):
        return None


class CafeHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/':
            static_response(self, 'index.html', 'text/html; charset=utf-8')
            return
        elif path == '/app.js':
            static_response(self, 'app.js', 'application/javascript; charset=utf-8')
            return
        elif path == '/style.css':
            static_response(self, 'style.css', 'text/css; charset=utf-8')
            return
        elif path == '/api/members':
            self.list_members()
            return
        elif path == '/api/products':
            self.list_products()
            return
        elif path == '/api/sales/monthly':
            self.get_monthly_sales()
            return
        else:
            json_response(self, {'error': 'Not Found'}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            json_response(self, {'error': '请求体格式错误'}, 400)
            return

        if path == '/api/members':
            self.create_member(data)
        elif path == '/api/products':
            self.create_product(data)
        elif path == '/api/recharge':
            self.recharge(data)
        elif path == '/api/order':
            self.create_order(data)
        elif path == '/api/exchange':
            self.exchange_points(data)
        else:
            json_response(self, {'error': 'Not Found'}, 404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            json_response(self, {'error': '请求体格式错误'}, 400)
            return

        if path.startswith('/api/members/'):
            member_id = parse_path_id(path)
            if member_id is None:
                json_response(self, {'error': '无效的会员ID'}, 400)
                return
            self.update_member(member_id, data)
        elif path.startswith('/api/products/'):
            product_id = parse_path_id(path)
            if product_id is None:
                json_response(self, {'error': '无效的商品ID'}, 400)
                return
            self.update_product(product_id, data)
        else:
            json_response(self, {'error': 'Not Found'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/members/'):
            member_id = parse_path_id(path)
            if member_id is None:
                json_response(self, {'error': '无效的会员ID'}, 400)
                return
            self.delete_member(member_id)
        elif path.startswith('/api/products/'):
            product_id = parse_path_id(path)
            if product_id is None:
                json_response(self, {'error': '无效的商品ID'}, 400)
                return
            self.delete_product(product_id)
        else:
            json_response(self, {'error': 'Not Found'}, 404)

    def list_members(self):
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM members ORDER BY created_at DESC')
        members = c.fetchall()
        columns = [desc[0] for desc in c.description]
        result = [dict(zip(columns, row)) for row in members]
        conn.close()
        json_response(self, result)

    def create_member(self, data):
        if not data.get('nickname') or not data.get('phone'):
            json_response(self, {'error': '昵称和手机不能为空'}, 400)
            return
        if not validate_phone(data.get('phone')):
            json_response(self, {'error': '手机号格式不正确'}, 400)
            return
        try:
            conn = get_db_connection()
            c = conn.cursor()
            c.execute('INSERT INTO members (nickname, phone, balance, points) VALUES (?, ?, 0, 0)',
                      (data['nickname'], data['phone']))
            conn.commit()
            member_id = c.lastrowid
            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            columns = [desc[0] for desc in c.description]
            result = dict(zip(columns, member))
            conn.close()
            json_response(self, result)
        except sqlite3.IntegrityError:
            json_response(self, {'error': '该手机号已存在'}, 400)

    def update_member(self, member_id, data):
        if not data.get('nickname') or not data.get('phone'):
            json_response(self, {'error': '昵称和手机不能为空'}, 400)
            return
        if not validate_phone(data.get('phone')):
            json_response(self, {'error': '手机号格式不正确'}, 400)
            return
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('UPDATE members SET nickname = ?, phone = ? WHERE id = ?',
                  (data['nickname'], data['phone'], member_id))
        conn.commit()
        if c.rowcount == 0:
            conn.close()
            json_response(self, {'error': '会员不存在'}, 404)
            return
        c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
        member = c.fetchone()
        columns = [desc[0] for desc in c.description]
        result = dict(zip(columns, member))
        conn.close()
        json_response(self, result)

    def delete_member(self, member_id):
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute('DELETE FROM members WHERE id = ?', (member_id,))
            conn.commit()
            affected = c.rowcount
            conn.close()
            if affected == 0:
                json_response(self, {'error': '会员不存在'}, 404)
            else:
                json_response(self, {'success': True})
        except sqlite3.IntegrityError:
            conn.close()
            json_response(self, {'error': '该会员存在关联记录，无法删除'}, 400)

    def list_products(self):
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM products ORDER BY type, name')
        products = c.fetchall()
        columns = [desc[0] for desc in c.description]
        result = [dict(zip(columns, row)) for row in products]
        conn.close()
        json_response(self, result)

    def create_product(self, data):
        if not data.get('name') or not data.get('type') or not data.get('price'):
            json_response(self, {'error': '商品名、类型、价格不能为空'}, 400)
            return
        if data['type'] not in ['咖啡', '茶饮', '甜点', '轻食', '周边']:
            json_response(self, {'error': '商品类型必须是：咖啡、茶饮、甜点、轻食、周边'}, 400)
            return
        if not isinstance(data['price'], int) or data['price'] <= 0:
            json_response(self, {'error': '价格必须是正整数分'}, 400)
            return
        conn = get_db_connection()
        c = conn.cursor()
        status = data.get('status', '上架')
        if status not in ['上架', '下架']:
            status = '上架'
        c.execute('INSERT INTO products (name, type, price, status) VALUES (?, ?, ?, ?)',
                  (data['name'], data['type'], data['price'], status))
        conn.commit()
        product_id = c.lastrowid
        c.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        product = c.fetchone()
        columns = [desc[0] for desc in c.description]
        result = dict(zip(columns, product))
        conn.close()
        json_response(self, result)

    def update_product(self, product_id, data):
        if not data.get('name') or not data.get('type') or not data.get('price'):
            json_response(self, {'error': '商品名、类型、价格不能为空'}, 400)
            return
        if data['type'] not in ['咖啡', '茶饮', '甜点', '轻食', '周边']:
            json_response(self, {'error': '商品类型必须是：咖啡、茶饮、甜点、轻食、周边'}, 400)
            return
        if not isinstance(data['price'], int) or data['price'] <= 0:
            json_response(self, {'error': '价格必须是正整数分'}, 400)
            return
        conn = get_db_connection()
        c = conn.cursor()
        status = data.get('status', '上架')
        if status not in ['上架', '下架']:
            status = '上架'
        c.execute('UPDATE products SET name = ?, type = ?, price = ?, status = ? WHERE id = ?',
                  (data['name'], data['type'], data['price'], status, product_id))
        conn.commit()
        if c.rowcount == 0:
            conn.close()
            json_response(self, {'error': '商品不存在'}, 404)
            return
        c.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        product = c.fetchone()
        columns = [desc[0] for desc in c.description]
        result = dict(zip(columns, product))
        conn.close()
        json_response(self, result)

    def delete_product(self, product_id):
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute('DELETE FROM products WHERE id = ?', (product_id,))
            conn.commit()
            affected = c.rowcount
            conn.close()
            if affected == 0:
                json_response(self, {'error': '商品不存在'}, 404)
            else:
                json_response(self, {'success': True})
        except sqlite3.IntegrityError:
            conn.close()
            json_response(self, {'error': '该商品存在关联记录，无法删除'}, 400)

    def recharge(self, data):
        member_id = data.get('member_id')
        amount = data.get('amount')
        if not member_id or not amount:
            json_response(self, {'error': '会员ID和充值金额不能为空'}, 400)
            return
        if not isinstance(amount, int) or amount <= 0:
            json_response(self, {'error': '充值金额必须是正整数分'}, 400)
            return
        points_gifted = amount // 10
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            if not member:
                conn.close()
                json_response(self, {'error': '会员不存在'}, 404)
                return
            c.execute('UPDATE members SET balance = balance + ?, points = points + ? WHERE id = ?',
                      (amount, points_gifted, member_id))
            c.execute('INSERT INTO recharge_records (member_id, amount, points_gifted) VALUES (?, ?, ?)',
                      (member_id, amount, points_gifted))
            conn.commit()
            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            columns = [desc[0] for desc in c.description]
            result = dict(zip(columns, member))
            conn.close()
            json_response(self, result)
        except Exception as e:
            conn.rollback()
            conn.close()
            json_response(self, {'error': f'充值失败: {str(e)}'}, 500)

    def create_order(self, data):
        member_id = data.get('member_id')
        items = data.get('items', [])
        if not member_id or not items:
            json_response(self, {'error': '会员ID和商品不能为空'}, 400)
            return
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            if not member:
                raise ValueError('会员不存在')
            member_dict = dict(zip([desc[0] for desc in c.description], member))

            total_amount = 0
            order_items = []
            for item in items:
                product_id = item.get('product_id')
                quantity = item.get('quantity', 1)
                c.execute('SELECT * FROM products WHERE id = ?', (product_id,))
                product = c.fetchone()
                if not product:
                    raise ValueError(f'商品ID {product_id} 不存在')
                product_dict = dict(zip([desc[0] for desc in c.description], product))
                if product_dict['status'] != '上架':
                    raise ValueError(f'商品 {product_dict["name"]} 已下架，不能下单')
                if not isinstance(quantity, int) or quantity <= 0:
                    raise ValueError('商品数量必须是正整数')
                subtotal = product_dict['price'] * quantity
                total_amount += subtotal
                order_items.append({
                    'product_id': product_id,
                    'product_name': product_dict['name'],
                    'product_type': product_dict['type'],
                    'price': product_dict['price'],
                    'quantity': quantity,
                    'subtotal': subtotal
                })

            if member_dict['balance'] < total_amount:
                shortage = total_amount - member_dict['balance']
                raise ValueError(f'余额不足，还差 {shortage} 分')

            points_earned = total_amount // 100

            c.execute('UPDATE members SET balance = balance - ?, points = points + ? WHERE id = ?',
                      (total_amount, points_earned, member_id))

            c.execute('INSERT INTO orders (member_id, total_amount, points_earned) VALUES (?, ?, ?)',
                      (member_id, total_amount, points_earned))
            order_id = c.lastrowid

            for item in order_items:
                c.execute('''INSERT INTO order_items 
                            (order_id, product_id, product_name, product_type, price, quantity, subtotal)
                            VALUES (?, ?, ?, ?, ?, ?, ?)''',
                          (order_id, item['product_id'], item['product_name'], item['product_type'],
                           item['price'], item['quantity'], item['subtotal']))

            conn.commit()

            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            columns = [desc[0] for desc in c.description]
            result = dict(zip(columns, member))
            result['order_id'] = order_id
            result['total_amount'] = total_amount
            result['points_earned'] = points_earned
            conn.close()
            json_response(self, result)
        except ValueError as e:
            conn.rollback()
            conn.close()
            json_response(self, {'error': str(e)}, 400)
        except Exception as e:
            conn.rollback()
            conn.close()
            json_response(self, {'error': f'下单失败: {str(e)}'}, 500)

    def exchange_points(self, data):
        member_id = data.get('member_id')
        points = data.get('points')
        if not member_id or not points:
            json_response(self, {'error': '会员ID和积分不能为空'}, 400)
            return
        if not isinstance(points, int) or points <= 0 or points % 100 != 0:
            json_response(self, {'error': '兑换积分必须是100的正整数倍'}, 400)
            return
        balance_added = (points // 100) * 1000
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            if not member:
                raise ValueError('会员不存在')
            member_dict = dict(zip([desc[0] for desc in c.description], member))
            if member_dict['points'] < points:
                shortage = points - member_dict['points']
                raise ValueError(f'积分不足，还差 {shortage} 积分')

            c.execute('UPDATE members SET points = points - ?, balance = balance + ? WHERE id = ?',
                      (points, balance_added, member_id))
            c.execute('INSERT INTO exchange_records (member_id, points_spent, balance_added) VALUES (?, ?, ?)',
                      (member_id, points, balance_added))
            conn.commit()

            c.execute('SELECT * FROM members WHERE id = ?', (member_id,))
            member = c.fetchone()
            columns = [desc[0] for desc in c.description]
            result = dict(zip(columns, member))
            result['balance_added'] = balance_added
            conn.close()
            json_response(self, result)
        except ValueError as e:
            conn.rollback()
            conn.close()
            json_response(self, {'error': str(e)}, 400)
        except Exception as e:
            conn.rollback()
            conn.close()
            json_response(self, {'error': f'兑换失败: {str(e)}'}, 500)

    def get_monthly_sales(self):
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''SELECT oi.product_type, 
                     SUM(oi.quantity) as total_quantity,
                     SUM(oi.subtotal) as total_amount
                     FROM order_items oi
                     JOIN orders o ON oi.order_id = o.id
                     WHERE strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')
                     GROUP BY oi.product_type
                     ORDER BY total_amount DESC''')
        rows = c.fetchall()
        columns = [desc[0] for desc in c.description]
        result = [dict(zip(columns, row)) for row in rows]
        conn.close()
        json_response(self, result)

    def log_message(self, format, *args):
        if ENABLE_LOG:
            super().log_message(format, *args)


if __name__ == '__main__':
    init_db()
    with socketserver.TCPServer(('', PORT), CafeHandler) as httpd:
        print(f'Serving at http://localhost:{PORT}')
        httpd.serve_forever()
