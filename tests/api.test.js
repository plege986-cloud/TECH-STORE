'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const port=34000+Math.floor(Math.random()*1000);
const base=`http://127.0.0.1:${port}`;
test('REST API: каталог, валідація, створення і читання замовлення',async()=>{
 const child=spawn(process.execPath,['server.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,PORT:String(port)},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<40;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal(ready,true);
  const catalog=await (await fetch(base+'/api/products?q=mac')).json();assert.equal(catalog.length,1);assert.equal(catalog[0].price,39999);
  const invalid=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'A'})});assert.equal(invalid.status,400);
  const data={name:'Тестовий Покупець',phone:'+380501234567',email:'test@example.com',city:'Київ, відділення 1',delivery:'Нова пошта — у відділення',payment:'При отриманні',items:[{id:'macbook',quantity:1}]};
  const created=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(created.status,201);const order=await created.json();assert.equal(order.total,39999);
  const saved=await (await fetch(base+'/api/orders/'+order.id)).json();assert.equal(saved.items[0].quantity,1);assert.equal(saved.total,39999);
 }finally{child.kill();}
});
