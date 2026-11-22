"use strict";
const products = [
  {id:'macbook',name:'Apple MacBook Air 13” M2',brand:'Apple',price:39999,desc:'8 / 256 ГБ · Space Gray',image:'macbook.png'},
  {id:'asus',name:'ASUS Zenbook 14 OLED',brand:'ASUS',price:43999,desc:'Core Ultra 5 · 16 / 512 ГБ',image:'asus.png'},
  {id:'monitor',name:'Dell UltraSharp U2722D',brand:'Dell',price:16499,desc:'27” · IPS · QHD · 60 Гц',image:'monitor.png'},
  {id:'mouse',name:'Logitech MX Master 3S',brand:'Logitech',price:4499,desc:'Bluetooth · 8000 DPI',image:'mouse.png'}
];
const $ = selector => document.querySelector(selector);
const money = value => Number(value).toLocaleString('uk-UA') + ' ₴';
// Fallback for browsers that restrict storage on local HTML files.
let fallbackQty = 0;
function getQty() {
  try { return Math.max(0, Number(localStorage.getItem('techQty') ?? '0') || 0); }
  catch (_) { return fallbackQty; }
}
function setQty(value) {
  const qty = Math.max(0, Math.floor(Number(value) || 0));
  fallbackQty = qty;
  try { localStorage.setItem('techQty', String(qty)); } catch (_) { /* file:// fallback */ }
}
function addToCart(qty = 1) {
  setQty(getQty() + qty);
  // Query parameter preserves the new quantity even when browser storage is blocked.
  location.href = 'cart.html?added=' + encodeURIComponent(String(getQty()));
}
const macbook = products[0];
function card(product) {
  const target = product.id === 'macbook' ? 'product.html' : 'catalog.html';
  return `<article class="product-card"><a href="${target}"><img src="assets/${product.image}" alt="${product.name}"></a><span class="status">В наявності</span><h3>${product.name}</h3><div class="muted">${product.desc}</div><div class="price">${money(product.price)}</div><a class="btn" href="${target}">${product.id === 'macbook' ? 'Переглянути товар' : 'До каталогу'}</a></article>`;
}
async function renderCatalog() {
  const target = $('#products');
  if (!target) return;
  const brand = $('#brand').value;
  const maxPrice = Number($('#maxprice').value);
  const query = $('#query').value.trim().toLocaleLowerCase('uk-UA');
  let found;
  try {
    const params = new URLSearchParams({q:query,brand,maxPrice:String(maxPrice)});
    const response = await fetch('/api/products?' + params);
    if (!response.ok) throw new Error('Помилка отримання каталогу');
    found = await response.json();
  } catch (error) { target.textContent = 'Не вдалося завантажити товари. Перевірте підключення до сервера.'; return; }
  target.innerHTML = found.length ? found.map(card).join('') : '<p class="empty-result" role="status">За вашим запитом товарів не знайдено. Змініть фільтри або скиньте їх.</p>';
  $('#count').textContent = `${found.length} товар(ів)`;
}
function initCatalog() {
  if (!$('#products')) return;
  const params = new URLSearchParams(location.search);
  if (params.has('q')) $('#query').value = params.get('q');
  const update = event => { if (event) event.preventDefault(); renderCatalog(); };
  $('#filters').addEventListener('submit', update);
  $('#searchform').addEventListener('submit', update);
  $('#query').addEventListener('input', renderCatalog);
  $('#reset').addEventListener('click', () => { $('#filters').reset(); $('#query').value = ''; renderCatalog(); });
  renderCatalog();
}
function initNavigation() {
  document.querySelectorAll('.header-search').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        location.href = 'catalog.html?q=' + encodeURIComponent(input.value.trim());
      }
    });
  });
}
function initCart() {
  const add = $('#addcart');
  if (add) add.addEventListener('click', event => {
    event.preventDefault(); addToCart(1);
  });
  if (!$('#cartqty')) return;
  const params = new URLSearchParams(location.search);
  if (params.has('added')) {
    const added = Number(params.get('added'));
    if (Number.isInteger(added) && added > 0 && added <= 999) setQty(added);
    history.replaceState(null, '', location.pathname);
  }
  const update = () => {
    const qty = getQty();
    $('#cartqty').textContent = qty;
    $('#carttotal').textContent = money(qty * macbook.price);
    $('#cartcontent').classList.toggle('hide', qty === 0);
    $('#emptycart').classList.toggle('hide', qty !== 0);
    $('#minus').disabled = qty <= 1;
  };
  $('#plus').addEventListener('click', () => { setQty(getQty() + 1); update(); });
  $('#minus').addEventListener('click', () => { setQty(Math.max(1, getQty() - 1)); update(); });
  $('#remove').addEventListener('click', () => { setQty(0); update(); });
  update();
}
const fieldMessages = {
  fullname: 'Введіть ім’я та прізвище (щонайменше два слова).',
  phone: 'Введіть коректний номер телефону, наприклад +380501234567.',
  email: 'Введіть коректну електронну адресу, наприклад name@example.com.',
  city: 'Вкажіть місто та відділення або адресу доставки.'
};
function validField(input) {
  const value = input.value.trim();
  switch (input.id) {
    case 'fullname': return value.split(/\s+/).filter(Boolean).length >= 2 && value.length >= 5;
    case 'phone': return /^\+?\d{10,15}$/.test(value.replace(/[\s()-]/g, ''));
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'city': return value.length >= 4;
    default: return true;
  }
}
function showFieldError(input) {
  const valid = validField(input);
  input.setAttribute('aria-invalid', String(!valid));
  let error = document.getElementById(input.id + '-error');
  if (!error) {
    error = document.createElement('small');
    error.id = input.id + '-error';
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    input.insertAdjacentElement('afterend', error);
    input.setAttribute('aria-describedby', error.id);
  }
  error.textContent = valid ? '' : fieldMessages[input.id];
  return valid;
}
function initCheckout() {
  const form = $('#checkoutform');
  if (!form) return;
  const total = $('#checkouttotal');
  total.textContent = money(getQty() * macbook.price);
  const fields = ['fullname', 'phone', 'email', 'city'].map(id => document.getElementById(id));
  fields.forEach(input => {
    input.addEventListener('blur', () => showFieldError(input));
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') showFieldError(input); });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const results = fields.map(showFieldError);
    const summary = $('#form-summary');
    if (getQty() === 0) {
      summary.textContent = 'Кошик порожній. Спочатку додайте товар.';
      summary.classList.remove('hide'); return;
    }
    if (results.some(ok => !ok)) {
      summary.textContent = 'Перевірте обов’язкові поля та виправте помилки нижче.';
      summary.classList.remove('hide');
      fields[results.indexOf(false)].focus(); return;
    }
    summary.classList.add('hide');
    const button = form.querySelector('button[type=submit]'); button.disabled = true;
    try {
      const selects = form.querySelectorAll('select');
      const response = await fetch('/api/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#fullname').value.trim(),phone:$('#phone').value.trim(),email:$('#email').value.trim(),city:$('#city').value.trim(),delivery:selects[0].value,payment:selects[1].value,items:[{id:'macbook',quantity:getQty()}]})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Помилка замовлення');
      setQty(0); location.href = 'confirmation.html?id=' + encodeURIComponent(result.id);
    } catch (error) { summary.textContent = error.message; summary.classList.remove('hide'); button.disabled = false; }
  });
}
async function initConfirmation() {
  if (!$('#confirmation')) return;
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!Number.isInteger(id) || id < 1) { $('#confirmation').textContent = 'Замовлення не знайдено.'; return; }
  try {
    const response = await fetch('/api/orders/' + id);
    if (!response.ok) throw new Error('Замовлення не знайдено');
    const order = await response.json();
    $('#confirmqty').textContent = order.items.reduce((sum,item)=>sum+item.quantity,0);
    $('#confirmtotal').textContent = money(order.total);
    $('#confirmname').textContent = order.customer;
    $('#confirmemail').textContent = order.email;
    $('#confirmcity').textContent = order.address;
    $('#confirmdelivery').textContent = order.delivery;
    $('#confirmpayment').textContent = order.payment;
    const number = document.querySelector('#ordernumber');
    if (number) number.textContent = '№ TS-' + String(order.id).padStart(4,'0');
  } catch (error) { $('#confirmation').textContent = error.message; }
}
document.addEventListener('DOMContentLoaded', () => {
  initNavigation(); initCatalog(); initCart(); initCheckout(); initConfirmation();
});
