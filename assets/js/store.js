/* ============================================================
   SAGERO CREATIONS — Public storefront
   No login required — real customers browsing this site aren't
   signed into anything. Products and orders both talk directly
   to Supabase using the public anon key.
============================================================ */

let STORE_PRODUCTS = [];
let CART = [];

function money(n){ return 'KES ' + Math.round(n).toLocaleString(); }

/* ---------------- LOAD PRODUCTS ---------------- */
async function loadStoreProducts(){
  if(!SagoBackend?.isConfigured()){
    showToast('Store isn\u2019t connected yet — check back soon', 'error');
    return;
  }
  const { data, error } = await SagoBackend.getClient()
    .from('products').select('*').eq('status', 'Active').order('created_at', { ascending:false });
  if(error){ showToast('Could not load products: ' + error.message, 'error'); return; }
  STORE_PRODUCTS = data || [];
  renderCategories();
  populateFilterDropdown();
  applyFiltersAndSort();
  renderBestSellers();
  renderFlashSale();
}
function populateFilterDropdown(){
  const cats = [...new Set(STORE_PRODUCTS.map(p=>p.category))];
  const select = document.getElementById('filterCategory');
  select.innerHTML = '<option value="all">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

/* ---------------- CATEGORIES ---------------- */
const CATEGORY_ICONS = {
  'Phone Case':'ri-shield-check-line', 'Screen Protector':'ri-focus-3-line', 'Charger':'ri-flashlight-line',
  'Charging Cable':'ri-plug-line', 'Earphones':'ri-headphone-line', 'Power Bank':'ri-battery-charge-line',
  'Memory Card':'ri-sd-card-line', 'Bluetooth Speaker':'ri-speaker-line', 'Phone Stand':'ri-tablet-line', 'Other':'ri-shopping-bag-3-line',
};
function renderCategories(){
  const cats = [...new Set(STORE_PRODUCTS.map(p=>p.category))];
  const list = cats.length ? cats : Object.keys(CATEGORY_ICONS).slice(0,6);
  document.getElementById('categoryGrid').innerHTML = list.map(c => `
    <a class="cat-tile" href="#shop" onclick="filterByCategory('${c}')">
      <div class="cat-tile-icon"><i class="${CATEGORY_ICONS[c] || 'ri-shopping-bag-3-line'}"></i></div>
      <span>${c}</span>
    </a>`).join('');
}
function filterByCategory(cat){
  document.getElementById('filterCategory').value = cat;
  applyFiltersAndSort();
}
function applyFiltersAndSort(){
  const cat = document.getElementById('filterCategory').value;
  const sort = document.getElementById('filterSort').value;
  const discountOnly = document.getElementById('filterDiscount').checked;

  let list = [...STORE_PRODUCTS];
  if(cat !== 'all') list = list.filter(p => p.category === cat);
  if(discountOnly) list = list.filter(p => p.compare_at_price && p.compare_at_price > p.price);

  if(sort === 'price_low') list.sort((a,b) => a.price - b.price);
  else if(sort === 'price_high') list.sort((a,b) => b.price - a.price);
  else list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  document.getElementById('newArrivalsGrid').innerHTML = list.map(productCardHTML).join('') || emptyProductsHTML();
  animateProductCards();
}

/* ---------------- PRODUCT CARDS ---------------- */
function productCardHTML(p){
  const hasDiscount = p.compare_at_price && p.compare_at_price > p.price;
  const badge = hasDiscount ? `-${Math.round((1 - p.price/p.compare_at_price)*100)}%` : p.badge;
  const wished = WISHLIST.includes(p.id);
  return `
    <div class="product-card">
      <div class="product-media" onclick="openProductDetail('${p.id}')" style="cursor:pointer;">
        ${badge ? `<span class="product-badge ${hasDiscount?'discount':''}">${badge}</span>` : ''}
        <span class="product-wish ${wished?'active':''}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')"><i class="${wished?'ri-heart-fill':'ri-heart-line'}"></i></span>
        ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : `<i class="${p.icon || 'ri-shopping-bag-3-line'}"></i>`}
      </div>
      <div class="product-body">
        <b onclick="openProductDetail('${p.id}')" style="cursor:pointer;">${p.name}</b>
        <div class="product-price">
          <span class="now">${money(p.price)}</span>
          ${hasDiscount ? `<span class="was">${money(p.compare_at_price)}</span>` : ''}
        </div>
        <button class="add-cart-btn" onclick="addToCart('${p.id}')"><i class="ri-shopping-bag-3-line"></i>Add to cart</button>
      </div>
    </div>`;
}
function emptyProductsHTML(){
  return `<div style="grid-column:1/-1; text-align:center; padding:50px; color:#8A90A3;"><i class="ri-store-2-line" style="font-size:32px; display:block; margin-bottom:10px;"></i>No products available right now — check back soon.</div>`;
}
function renderBestSellers(){
  const list = STORE_PRODUCTS.filter(p=>p.is_bestseller);
  document.getElementById('bestSellersGrid').innerHTML = list.map(productCardHTML).join('') || `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#8A90A3;">No bestsellers marked yet.</div>`;
}
function renderFlashSale(){
  const hasDiscounts = STORE_PRODUCTS.some(p => p.compare_at_price && p.compare_at_price > p.price);
  document.getElementById('flashsale').style.display = hasDiscounts ? 'block' : 'none';
}

/* ---------------- CART ---------------- */
function loadCart(){
  try{ CART = JSON.parse(sessionStorage.getItem('sagero_store_cart') || '[]'); }catch(e){ CART = []; }
  renderCartBadge();
}
function persistCart(){ sessionStorage.setItem('sagero_store_cart', JSON.stringify(CART)); }

function addToCart(productId){
  const p = STORE_PRODUCTS.find(x=>x.id===productId);
  if(!p) return;
  const existing = CART.find(c=>c.product_id===productId);
  if(existing) existing.qty += 1;
  else CART.push({ product_id:p.id, name:p.name, price:p.price, icon:p.icon, qty:1 });
  persistCart();
  renderCartBadge();
  showToast(p.name + ' added to cart', 'success');
}
function updateCartQty(productId, delta){
  const item = CART.find(c=>c.product_id===productId);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) CART = CART.filter(c=>c.product_id!==productId);
  persistCart();
  renderCartBadge();
  renderCartItems();
}
function removeFromCart(productId){
  CART = CART.filter(c=>c.product_id!==productId);
  persistCart();
  renderCartBadge();
  renderCartItems();
}
function cartTotal(){ return CART.reduce((s,c)=>s+c.price*c.qty, 0); }
function cartCount(){ return CART.reduce((s,c)=>s+c.qty, 0); }

function renderCartBadge(){
  const badge = document.getElementById('cartBadge');
  const count = cartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}
function renderCartItems(){
  const wrap = document.getElementById('cartItemsWrap');
  const footer = document.getElementById('cartFooter');
  if(CART.length === 0){
    wrap.innerHTML = `<div class="cart-empty"><i class="ri-shopping-bag-3-line"></i>Your cart is empty</div>`;
    footer.style.display = 'none';
    return;
  }
  wrap.innerHTML = CART.map(c => `
    <div class="cart-item">
      <div class="cart-item-icon"><i class="${c.icon || 'ri-shopping-bag-3-line'}"></i></div>
      <div class="cart-item-body">
        <b>${c.name}</b>
        <div class="price">${money(c.price)}</div>
        <div class="qty-stepper">
          <button onclick="updateCartQty('${c.product_id}',-1)">−</button>
          <span>${c.qty}</span>
          <button onclick="updateCartQty('${c.product_id}',1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${c.product_id}')"><i class="ri-close-line"></i></button>
    </div>`).join('');
  footer.style.display = 'block';
  document.getElementById('cartTotal').textContent = money(cartTotal());
}
function openCart(){ renderCartItems(); document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartDrawer').classList.add('open'); }
function closeCart(){ document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartDrawer').classList.remove('open'); }

/* ---------------- CHECKOUT ---------------- */
function openCheckout(){
  if(CART.length === 0) return;
  appliedCoupon = null;
  document.getElementById('co-coupon').value = '';
  document.getElementById('couponFeedback').textContent = '';
  refreshCheckoutSummary();
  document.getElementById('checkoutOverlay').classList.add('open');
  document.getElementById('checkoutModal').style.display = 'block';
}
function closeCheckout(){
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.getElementById('checkoutModal').style.display = 'none';
}

async function submitOrder(e){
  e.preventDefault();
  const btn = document.getElementById('checkoutSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  const customer_name = document.getElementById('co-name').value.trim();
  const customer_phone = document.getElementById('co-phone').value.trim();
  const customer_email = document.getElementById('co-email').value.trim() || null;
  const notes = document.getElementById('co-notes').value.trim() || null;

  const items = CART.map(c => ({ name:c.name, qty:c.qty, unit_price:c.price }));
  const discount = couponDiscount();
  const total = cartTotal() - discount;
  const id = 'ORD-' + (7001 + Math.floor(Math.random()*8990));

  const orderRecord = { id, customer_name, customer_phone, customer_email, items, total, status:'Pending', payment_status:'Unpaid', payment_method:null, source:'Website', notes };
  if(appliedCoupon) orderRecord.notes = (notes ? notes + ' — ' : '') + `Coupon used: ${appliedCoupon.code} (−${money(discount)})`;

  const { error } = await SagoBackend.getClient().from('orders').insert(orderRecord);

  if(!error && appliedCoupon){
    await SagoBackend.getClient().from('coupons').update({ times_used: appliedCoupon.times_used + 1 }).eq('id', appliedCoupon.id);
  }

  btn.disabled = false;
  btn.textContent = 'Place Order';

  if(error){ showToast('Could not place order: ' + error.message, 'error'); return; }

  CART = [];
  appliedCoupon = null;
  persistCart();
  renderCartBadge();
  closeCheckout();
  closeCart();
  showToast(`Order placed! We\u2019ll be in touch at ${customer_phone}`, 'success');
  e.target.reset();
}

/* ---------------- TOAST ---------------- */
let toastTimer = null;
function showToast(msg, type){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3200);
}

/* ---------------- WISHLIST (device-local — no customer login exists) ---------------- */
let WISHLIST = [];
function loadWishlist(){
  try{ WISHLIST = JSON.parse(localStorage.getItem('sagero_store_wishlist') || '[]'); }catch(e){ WISHLIST = []; }
  renderWishlistBadge();
}
function persistWishlist(){ localStorage.setItem('sagero_store_wishlist', JSON.stringify(WISHLIST)); }
function toggleWishlist(productId){
  const p = STORE_PRODUCTS.find(x=>x.id===productId);
  if(WISHLIST.includes(productId)){
    WISHLIST = WISHLIST.filter(id=>id!==productId);
    showToast(p ? p.name + ' removed from wishlist' : 'Removed from wishlist', 'info');
  } else {
    WISHLIST.push(productId);
    showToast(p ? p.name + ' added to wishlist' : 'Added to wishlist', 'success');
  }
  persistWishlist();
  renderWishlistBadge();
  applyFiltersAndSort(); // refresh heart icon state on cards
  renderBestSellers();
}
function renderWishlistBadge(){
  const badge = document.getElementById('wishlistBadge');
  badge.textContent = WISHLIST.length;
  badge.style.display = WISHLIST.length > 0 ? 'flex' : 'none';
}
function renderWishlistItems(){
  const wrap = document.getElementById('wishlistItemsWrap');
  const items = STORE_PRODUCTS.filter(p => WISHLIST.includes(p.id));
  if(items.length === 0){
    wrap.innerHTML = `<div class="cart-empty"><i class="ri-heart-line"></i>Nothing saved yet</div>`;
    return;
  }
  wrap.innerHTML = items.map(p => `
    <div class="cart-item">
      <div class="cart-item-icon"><i class="${p.icon || 'ri-shopping-bag-3-line'}"></i></div>
      <div class="cart-item-body">
        <b>${p.name}</b>
        <div class="price">${money(p.price)}</div>
      </div>
      <button class="cart-item-remove" onclick="toggleWishlist('${p.id}'); renderWishlistItems();" data-tip="Remove"><i class="ri-close-line"></i></button>
    </div>`).join('');
}
function openWishlist(){ renderWishlistItems(); document.getElementById('wishlistOverlay').classList.add('open'); document.getElementById('wishlistDrawer').classList.add('open'); }
function closeWishlist(){ document.getElementById('wishlistOverlay').classList.remove('open'); document.getElementById('wishlistDrawer').classList.remove('open'); }

/* ---------------- PRODUCT DETAIL ---------------- */
function openProductDetail(productId){
  const p = STORE_PRODUCTS.find(x=>x.id===productId);
  if(!p) return;
  const hasDiscount = p.compare_at_price && p.compare_at_price > p.price;
  document.getElementById('detailBody').innerHTML = `
    <div class="product-media" style="border-radius:16px; margin-bottom:18px;">
      ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : `<i class="${p.icon || 'ri-shopping-bag-3-line'}" style="font-size:64px;"></i>`}
    </div>
    <div style="font-size:11.5px; font-weight:700; color:#4F46E5; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px;">${p.category}</div>
    <h3 style="font-size:20px; font-weight:800; margin-bottom:10px;">${p.name}</h3>
    <div class="product-price" style="margin-bottom:14px;">
      <span class="now" style="font-size:19px;">${money(p.price)}</span>
      ${hasDiscount ? `<span class="was">${money(p.compare_at_price)}</span>` : ''}
    </div>
    <p style="font-family:'Inter'; font-size:13.5px; color:#5B6072; line-height:1.6; margin-bottom:18px;">${p.description || 'No description added yet.'}</p>
    <div style="font-size:12.5px; color:${p.stock_qty>0?'#17803D':'#DD2E2E'}; font-weight:700; margin-bottom:18px;">
      <i class="${p.stock_qty>0?'ri-checkbox-circle-line':'ri-close-circle-line'}"></i> ${p.stock_qty>0 ? p.stock_qty+' in stock' : 'Out of stock'}
    </div>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-primary" style="flex:1; justify-content:center;" onclick="addToCart('${p.id}')" ${p.stock_qty<=0?'disabled style="opacity:.5;"':''}>Add to Cart</button>
      <button class="btn btn-outline" onclick="toggleWishlist('${p.id}')"><i class="${WISHLIST.includes(p.id)?'ri-heart-fill':'ri-heart-line'}"></i></button>
    </div>`;
  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailModal').style.display = 'block';
}
function closeProductDetail(){
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailModal').style.display = 'none';
}

/* ---------------- COUPONS ---------------- */
let appliedCoupon = null;
async function applyCoupon(){
  const code = document.getElementById('co-coupon').value.trim().toUpperCase();
  const feedback = document.getElementById('couponFeedback');
  if(!code){ feedback.textContent = ''; appliedCoupon = null; refreshCheckoutSummary(); return; }

  const { data, error } = await SagoBackend.getClient().from('coupons').select('*').eq('code', code).eq('active', true).single()
    .then(r=>r, ()=>({data:null, error:{message:'not found'}}));

  if(!data){
    feedback.textContent = 'Coupon not found or no longer active';
    feedback.style.color = '#DD2E2E';
    appliedCoupon = null;
    refreshCheckoutSummary();
    return;
  }
  if(data.expires_at && new Date(data.expires_at) < new Date()){
    feedback.textContent = 'This coupon has expired'; feedback.style.color = '#DD2E2E'; appliedCoupon = null; refreshCheckoutSummary(); return;
  }
  if(data.max_uses && data.times_used >= data.max_uses){
    feedback.textContent = 'This coupon has reached its usage limit'; feedback.style.color = '#DD2E2E'; appliedCoupon = null; refreshCheckoutSummary(); return;
  }
  if(data.min_order_total && cartTotal() < data.min_order_total){
    feedback.textContent = `Minimum order of ${money(data.min_order_total)} required`; feedback.style.color = '#DD2E2E'; appliedCoupon = null; refreshCheckoutSummary(); return;
  }
  appliedCoupon = data;
  feedback.textContent = `Applied — ${data.discount_type==='percent' ? data.discount_value+'% off' : money(data.discount_value)+' off'}`;
  feedback.style.color = '#17803D';
  refreshCheckoutSummary();
}
function couponDiscount(){
  if(!appliedCoupon) return 0;
  const subtotal = cartTotal();
  const discount = appliedCoupon.discount_type === 'percent' ? subtotal * (appliedCoupon.discount_value/100) : appliedCoupon.discount_value;
  return Math.min(discount, subtotal);
}
function refreshCheckoutSummary(){
  const discount = couponDiscount();
  const subtotal = cartTotal();
  let html = CART.map(c => `<div class="co-summary-row"><span>${c.qty}× ${c.name}</span><b>${money(c.price*c.qty)}</b></div>`).join('');
  if(discount > 0) html += `<div class="co-summary-row" style="color:#17803D;"><span>Coupon (${appliedCoupon.code})</span><b>−${money(discount)}</b></div>`;
  html += `<div class="co-summary-row" style="border-top:1px solid #E4E7F5; margin-top:6px; padding-top:8px; font-weight:800;"><span>Total</span><span>${money(subtotal - discount)}</span></div>`;
  document.getElementById('checkoutSummary').innerHTML = html;
}

/* ---------------- ORDER TRACKING ---------------- */
function openTrackOrder(){
  document.getElementById('trackResult').innerHTML = '';
  document.getElementById('trackOverlay').classList.add('open');
  document.getElementById('trackModal').style.display = 'block';
}
function closeTrackOrder(){
  document.getElementById('trackOverlay').classList.remove('open');
  document.getElementById('trackModal').style.display = 'none';
}
async function trackOrder(e){
  e.preventDefault();
  const id = document.getElementById('track-id').value.trim().toUpperCase();
  const phone = document.getElementById('track-phone').value.trim();
  const resultEl = document.getElementById('trackResult');
  resultEl.innerHTML = '<p style="font-size:12.5px; color:#8A90A3;">Looking up your order…</p>';

  const { data, error } = await SagoBackend.getClient().from('orders').select('*').eq('id', id).single()
    .then(r=>r, ()=>({data:null,error:{message:'not found'}}));

  if(!data || data.customer_phone !== phone){
    resultEl.innerHTML = '<p style="font-size:12.5px; color:#DD2E2E; font-weight:600;">No matching order found — check your order ID and phone number.</p>';
    return;
  }
  resultEl.innerHTML = `
    <div class="track-status">
      <div class="track-status-row"><span>Status</span><span class="status-pill ${data.status}">${data.status}</span></div>
      <div class="track-status-row"><span>Payment</span><b>${data.payment_status}</b></div>
      <div class="track-status-row"><span>Total</span><b>${money(data.total)}</b></div>
      <div class="track-status-row"><span>Placed</span><b>${new Date(data.created_at).toLocaleDateString()}</b></div>
    </div>`;
}

/* ---------------- REAL NEWSLETTER ---------------- */
async function submitNewsletter(e){
  e.preventDefault();
  const email = e.target.querySelector('input[type="email"]').value.trim();
  const { error } = await SagoBackend.getClient().from('newsletter_subscribers').insert({ email });
  if(error){
    if(error.code === '23505') showToast('You\u2019re already subscribed \u2014 thanks!', 'info');
    else showToast('Could not subscribe: ' + error.message, 'error');
    return;
  }
  showToast('Subscribed! We\u2019ll be in touch.', 'success');
  e.target.reset();
}

/* ---------------- GSAP ANIMATIONS ---------------- */
function initAnimations(){
  if(typeof gsap === 'undefined') return; // degrade gracefully if the CDN is blocked
  gsap.registerPlugin(ScrollTrigger);

  gsap.from('.hero .eyebrow, .hero h1, .hero p, .hero-actions', {
    y: 24, opacity: 0, duration: .7, stagger: .08, ease: 'power2.out',
  });
  gsap.from('.float-card', {
    scale: .5, opacity: 0, duration: .6, stagger: .1, delay: .3, ease: 'back.out(1.6)',
  });
  gsap.from('.hero-center-mark', { scale: .6, opacity: 0, duration: .6, ease: 'back.out(1.7)' });

  document.querySelectorAll('section').forEach(sec => {
    gsap.from(sec.querySelectorAll('.sec-head, .cat-grid, .trust-item, .flash, .newsletter'), {
      y: 30, opacity: 0, duration: .6, stagger: .06, ease: 'power2.out',
      scrollTrigger: { trigger: sec, start: 'top 82%' },
    });
  });
}
function animateProductCards(){
  if(typeof gsap === 'undefined') return;
  gsap.fromTo('.product-card', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .45, stagger: .05, ease: 'power2.out' });
}

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  loadCart();
  loadWishlist();
  await loadStoreProducts();
  initAnimations();
});
