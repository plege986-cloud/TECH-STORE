'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = __dirname;
const db = new DatabaseSync(path.join(root, 'store.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), description TEXT NOT NULL, image TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 10);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL, delivery TEXT NOT NULL, payment TEXT NOT NULL, total INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (order_id INTEGER NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL);`);
const seed = [
 ['macbook','Apple MacBook Air 13” M2','Apple',39999,'8 / 256 ГБ · Space Gray','macbook.png'],
 ['asus','ASUS Zenbook 14 OLED','ASUS',43999,'Core Ultra 5 · 16 / 512 ГБ','asus.png'],
 ['monitor','Dell UltraSharp U2722D','Dell',16499,'27” · IPS · QHD · 60 Гц','monitor.png'],
 ['mouse','Logitech MX Master 3S','Logitech',4499,'Bluetooth · 8000 DPI','mouse.png']
];
const insert = db.prepare('INSERT OR IGNORE INTO products(id,name,brand,price,description,image) VALUES(?,?,?,?,?,?)');
for (const p of seed) insert.run(...p);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};
function json(res, status, data) { const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body); }
function fail(res, status, message){json(res,status,{error:message});}
function parseBody(req){return new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>16000){reject(new Error('Завеликий запит'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(body));}catch{reject(new Error('Некоректний JSON'));}});req.on('error',reject);});}
const orderQuery = db.prepare('SELECT * FROM orders WHERE id=?');
function orderDetails(id){const order=orderQuery.get(id);if(!order)return null;return {...order,items:db.prepare('SELECT p.name,oi.product_id,oi.quantity,oi.unit_price FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?').all(id)};}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/health' && req.method==='GET')return json(res,200,{status:'ok',database:'sqlite'});
  if(url.pathname==='/api/products' && req.method==='GET'){
   let rows=db.prepare('SELECT id,name,brand,price,description AS desc,image,stock FROM products').all();
   const q=(url.searchParams.get('q')||'').toLocaleLowerCase('uk-UA');const brand=url.searchParams.get('brand')||'all';const max=Number(url.searchParams.get('maxPrice')||'999999999');
   rows=rows.filter(p=>(brand==='all'||p.brand===brand)&&p.price<=max&&(p.name+' '+p.desc).toLocaleLowerCase('uk-UA').includes(q));return json(res,200,rows);
  }
  const productMatch=url.pathname.match(/^\/api\/products\/([\w-]+)$/);
  if(productMatch && req.method==='GET'){const p=db.prepare('SELECT id,name,brand,price,description AS desc,image,stock FROM products WHERE id=?').get(productMatch[1]);return p?json(res,200,p):fail(res,404,'Товар не знайдено');}
  if(url.pathname==='/api/orders' && req.method==='POST'){
   let b;try{b=await parseBody(req);}catch(e){return fail(res,400,e.message);}
   if(!b||typeof b!=='object')return fail(res,400,'Некоректні дані');
   const {name,phone,email,city,delivery,payment,items}=b;
   if(typeof name!=='string'||name.trim().split(/\s+/).length<2||name.trim().length<5)return fail(res,400,'Вкажіть ім’я та прізвище');
   if(typeof phone!=='string'||!/^\+?\d{10,15}$/.test(phone.replace(/[\s()-]/g,'')))return fail(res,400,'Некоректний телефон');
   if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(res,400,'Некоректний email');
   if(typeof city!=='string'||city.trim().length<4)return fail(res,400,'Вкажіть адресу доставки');
   if(!['Нова пошта — у відділення','Кур’єрська доставка'].includes(delivery))return fail(res,400,'Некоректна доставка');
   if(!['При отриманні','Карткою'].includes(payment))return fail(res,400,'Некоректна оплата');
   if(!Array.isArray(items)||items.length<1||items.length>20)return fail(res,400,'Кошик порожній');
   const validated=[];let total=0;
   for(const item of items){if(!item||typeof item.id!=='string'||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)return fail(res,400,'Некоректна кількість');const p=db.prepare('SELECT * FROM products WHERE id=?').get(item.id);if(!p)return fail(res,404,'Товар не знайдено');if(item.quantity>p.stock)return fail(res,409,'Недостатньо товару на складі');validated.push({id:p.id,quantity:item.quantity,price:p.price});total+=p.price*item.quantity;}
   db.exec('BEGIN IMMEDIATE');let id;
   try{const result=db.prepare('INSERT INTO orders(customer,phone,email,address,delivery,payment,total) VALUES(?,?,?,?,?,?,?)').run(name.trim(),phone.trim(),email.trim(),city.trim(),delivery,payment,total);id=Number(result.lastInsertRowid);for(const item of validated){const update=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(item.quantity,item.id,item.quantity);if(update.changes!==1)throw new Error('Недостатньо товару');db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(?,?,?,?)').run(id,item.id,item.quantity,item.price);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');return fail(res,409,e.message);}
   return json(res,201,{id,total});
  }
  const orderMatch=url.pathname.match(/^\/api\/orders\/(\d+)$/);
  if(orderMatch&&req.method==='GET'){const order=orderDetails(Number(orderMatch[1]));return order?json(res,200,order):fail(res,404,'Замовлення не знайдено');}
  if(url.pathname.startsWith('/api/'))return fail(res,404,'Маршрут не знайдено');
  if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Метод не підтримується');
  const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
  const filepath=path.resolve(root,'.'+relative);
  if(!filepath.startsWith(root+path.sep))return fail(res,403,'Доступ заборонено');
  const stat=fs.existsSync(filepath)?fs.statSync(filepath):null;
  if(!stat||!stat.isFile()||!mime[path.extname(filepath)])return fail(res,404,'Файл не знайдено');
  res.writeHead(200,{'Content-Type':mime[path.extname(filepath)],'X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')return res.end();fs.createReadStream(filepath).pipe(res);
 }catch(e){console.error(e);if(!res.headersSent)fail(res,500,'Помилка сервера');else res.end();}
});
const port=Number(process.env.PORT)||3000;
server.listen(port,'0.0.0.0',()=>console.log(`TECH STORE: http://localhost:${port}`));
