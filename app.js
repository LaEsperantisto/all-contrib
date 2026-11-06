// All Contribute frontend prototype.
const API_BASE = ["localhost","127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8787"
  : "https://all-contrib.all-contrib.workers.dev";
const $ = (id) => document.getElementById(id);
let username = localStorage.getItem("ac_username");
let authenticated = false;
// Remove the old JavaScript-readable bearer token. Authentication now uses an HttpOnly cookie.
localStorage.removeItem("ac_token");
let authMode = "register";
let toastTimer;
let currentBlocks = [];
let currentRecipes = [];
// Inventory is server-side per account: the shared-world economy (placement
// debits, breaking credits, crafting consumes) needs one authoritative copy.
let inventory = {};
let selectedItem = null;

function legacyInventoryKey() {
  return `ac_inventory_v1_${username ? username.toLowerCase() : "guest"}`;
}
// Old browser-local stacks, uploaded to the account once.
function readLegacyInventory() {
  try {
    const saved = JSON.parse(localStorage.getItem(legacyInventoryKey()) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const clean = {};
    for (const [id, quantity] of Object.entries(saved)) {
      // Built-in blocks moved from "minecraft:" to "builtin:"; migrate old stacks.
      const fixed = id.startsWith("minecraft:") ? "builtin:" + id.slice("minecraft:".length) : id;
      if (/^[a-z0-9_:-]{1,128}$/.test(fixed) && Number.isSafeInteger(quantity) && quantity > 0) clean[fixed] = quantity;
    }
    return clean;
  } catch {
    return {};
  }
}
async function migrateLegacyInventory() {
  const flag = `ac_inventory_migrated_${(username || "").toLowerCase()}`;
  if (localStorage.getItem(flag)) return;
  const legacy = Object.entries(readLegacyInventory()).slice(0, 50);
  for (const [id, quantity] of legacy) {
    await api("/api/inventory/add", { method: "POST", body: JSON.stringify({ item_id: id, quantity }) }).catch(() => null);
  }
  localStorage.setItem(flag, "1");
  localStorage.removeItem(legacyInventoryKey());
  if (legacy.length) toast("Your previous browser inventory was moved onto your account.");
}
async function refreshInventory() {
  if (!authenticated) {
    inventory = {};
    selectedItem = null;
    renderInventory();
    renderCrafting();
    drawWorld();
    return;
  }
  try {
    const data = await api("/api/inventory");
    inventory = {};
    for (const row of data.inventory) inventory[row.item_id] = row.quantity;
    if (selectedItem && !(selectedItem in inventory)) selectedItem = null;
  } catch {
    // Keep the last known inventory; connection state is surfaced elsewhere.
  }
  renderInventory();
  renderCrafting();
  drawWorld();
}

function toast(message, error=false) {
  const el=$("toast"); el.textContent=message; el.className="toast show"+(error?" error":"");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className="toast",3200);
}
async function api(path, options={}) {
  const headers={"Content-Type":"application/json","X-AC-Request":"1",...(options.headers||{})};
  let response;
  try {
    response=await fetch(API_BASE+path,{
      ...options,
      headers,
      credentials:"include"
    });
  } catch {
    throw new Error("Cannot reach the API. Check the Worker deployment and your browser's cookie settings.");
  }
  const data=await response.json().catch(()=>({error:"Invalid server response"}));
  if(!response.ok){
    const error=new Error(data.error||`Request failed (${response.status})`);
    error.status=response.status;
    if(response.status===401 && path!=="/api/login" && path!=="/api/register") clearAuthenticatedUser();
    throw error;
  }
  return data;
}

function setConnection(online) {
  $("connection").classList.toggle("online",online);
  $("connection").innerHTML=`<i></i> ${online?"API ONLINE":"API OFFLINE"}`;
}
function updateAccountButton(){
  $("account-button").textContent=authenticated&&username?`${username} · Account`:"Log in";
}
function setAuthenticatedUser(name){
  username=name;
  authenticated=true;
  localStorage.setItem("ac_username",name);
  updateAccountButton();
  renderInventory();
  renderCrafting();
  migrateLegacyInventory().then(refreshInventory);
}
function clearAuthenticatedUser(){
  authenticated=false;
  username=null;
  localStorage.removeItem("ac_username");
  inventory={};
  selectedItem=null;
  updateAccountButton();
  renderInventory();
  renderCrafting();
  drawWorld();
}
function openAuth(mode="register"){
  authMode=mode; $("auth-title").textContent=mode==="register"?"Join the world":"Welcome back";
  $("auth-submit").textContent=mode==="register"?"Create account →":"Log in →";
  document.querySelectorAll(".auth-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("auth-message").textContent=""; $("auth-dialog").showModal();
}
async function restoreSession(){
  try{
    const data=await api("/api/me");
    setAuthenticatedUser(data.user.username);
  }catch(error){
    clearAuthenticatedUser();
    if(error.status!==401) console.warn("Could not restore the account session:",error);
  }
}
async function openAccountDialog(){
  if(!authenticated){openAuth("login");return;}
  $("account-dialog").showModal();
  await refreshSessions();
}
async function refreshSessions(){
  const list=$("sessions-list");
  list.innerHTML='<div class="empty">Loading active sessions…</div>';
  try{
    const data=await api("/api/sessions");
    if(!data.sessions.length){list.innerHTML='<div class="empty">No active sessions found.</div>';return;}
    list.innerHTML=data.sessions.map(session=>{
      const created=formatDate(session.created_at);
      const lastSeen=formatDate(session.last_seen_at);
      const device=escapeHtml(session.user_agent||"Unknown browser");
      const current=session.is_current;
      return `<div class="session-row"><div class="session-details"><strong>${current?"This device":"Signed-in device"} ${current?'<span class="current-session">CURRENT</span>':""}</strong><small>${device}</small><small>Signed in: ${created} · Last active: ${lastSeen}</small><small>Expires after inactivity: ${formatDate(session.idle_expires_at)} · Absolute expiry: ${formatDate(session.expires_at)}</small></div>${current?'<span class="session-current-label">Current</span>':`<button class="button button-outline revoke-session" type="button" data-revoke-session="${escapeAttr(session.session_id)}">Revoke</button>`}</div>`;
    }).join("");
  }catch(error){
    list.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;
    if(error.status===401){clearAuthenticatedUser();$("account-dialog").close();openAuth("login");}
  }
}
function formatDate(value){
  const date=typeof value==="number"?new Date(value):new Date(value);
  return Number.isNaN(date.getTime())?"Unknown":date.toLocaleString();
}

$("account-button").addEventListener("click",openAccountDialog);
$("logout-button").addEventListener("click",async()=>{
  const button=$("logout-button");button.disabled=true;
  try{
    await api("/api/logout",{method:"POST",body:"{}"});
    clearAuthenticatedUser();
    $("account-dialog").close();
    toast("This device has been logged out.");
  }catch(error){toast(error.message,true);}
  finally{button.disabled=false;}
});
$("sessions-list").addEventListener("click",async event=>{
  const button=event.target.closest("[data-revoke-session]");
  if(!button)return;
  button.disabled=true;
  try{
    await api(`/api/sessions/${encodeURIComponent(button.dataset.revokeSession)}`,{method:"DELETE"});
    toast("Session revoked.");
    await refreshSessions();
  }catch(error){toast(error.message,true);button.disabled=false;}
});
document.querySelectorAll(".auth-tabs button").forEach(b=>b.addEventListener("click",()=>openAuth(b.dataset.mode)));
$("auth-form").addEventListener("submit",async e=>{
  e.preventDefault(); const submit=$("auth-submit"); submit.disabled=true;
  try{
    const data=await api(`/api/${authMode}`,{method:"POST",body:JSON.stringify({username:$("auth-username").value,password:$("auth-password").value})});
    // Verify the browser accepted and returned the HttpOnly cookie before showing a logged-in state.
    const verified=await api("/api/me");
    setAuthenticatedUser(verified.user.username);
    $("auth-dialog").close();toast(`Welcome, ${data.username}!`);await refreshRegistry();
  }catch(err){
    $("auth-message").textContent=err.message;
    if(err.status===401 && /cookie|session/i.test(err.message)){
      $("auth-message").textContent="The browser did not retain the secure session cookie. Check third-party/partitioned cookie settings, or use a same-site custom domain for the API.";
    }
  }finally{submit.disabled=false;}
});

async function refreshRegistry(){
  try{
    const [blocks,recipes]=await Promise.all([api("/api/blocks"),api("/api/recipes")]);
    setConnection(true);
    currentBlocks=Array.isArray(blocks.blocks)?blocks.blocks:[];
    currentRecipes=Array.isArray(recipes.recipes)?recipes.recipes:[];
    renderBlocks(currentBlocks);renderRecipes(currentRecipes);renderInventory();renderCrafting();
    $("block-count").textContent=currentBlocks.length;$("recipe-count").textContent=currentRecipes.length;
  }catch(err){
    setConnection(false);currentBlocks=[];currentRecipes=[];
    $("blocks-list").innerHTML='<div class="empty">API unavailable — deploy the Worker to load registry.</div>';
    $("recipes-list").innerHTML='<div class="empty">API unavailable.</div>';
    renderInventory();$("crafting-list").innerHTML='<div class="empty">Recipes are unavailable until the API reconnects.</div>';
  }
}
function renderBlocks(items){
  $("blocks-total").textContent=items.length;
  $("blocks-list").innerHTML=items.length?items.slice().reverse().map(b=>`<div class="registry-item"><span class="swatch" style="background:${escapeAttr(b.colour)}"></span><div class="item-info"><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.id)} · ${escapeHtml(b.behaviour)}</small></div><span class="owner">${escapeHtml(b.creator)}</span></div>`).join(""):'<div class="empty">No blocks yet. Create the first one.</div>';
}
function renderRecipes(items){
  $("recipes-total").textContent=items.length;
  $("recipes-list").innerHTML=items.length?items.slice().reverse().map(r=>`<div class="registry-item"><span class="swatch" style="background:#b58a50"></span><div class="item-info"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml((r.ingredients||[]).join(" + "))} → ${escapeHtml(r.result_id)} ×${Number(r.quantity)||1}</small></div><span class="owner">${escapeHtml(r.creator)}</span></div>`).join(""):'<div class="empty">No recipes yet. Forge one.</div>';
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/;/g,"");}

// Inventory tools manage the account's server-side stacks.
$("add-item-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!authenticated){openAuth("login");toast("Log in to manage your inventory.");return;}
  const id=$("add-item-id").value.trim().toLowerCase();
  const quantity=Number($("add-item-quantity").value);
  if(!/^[a-z0-9_:-]{1,48}$/.test(id)){toast("Use 1–48 letters, numbers, underscores, colons or hyphens for the item ID.",true);return;}
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999){toast("Quantity must be between 1 and 999.",true);return;}
  try{
    await api("/api/inventory/add",{method:"POST",body:JSON.stringify({item_id:id,quantity})});
    $("add-item-id").value="";$("add-item-quantity").value="16";
    await refreshInventory();
    toast(`Added ${quantity} × ${id} to your inventory.`);
  }catch(err){toast(err.message,true);}
});
$("inventory-list").addEventListener("click",async e=>{
  const remove=e.target.closest("[data-remove-item]");
  if(remove){
    try{await api("/api/inventory/remove",{method:"POST",body:JSON.stringify({item_id:remove.dataset.removeItem,quantity:1})});await refreshInventory();}
    catch(err){toast(err.message,true);}
    return;
  }
  const row=e.target.closest("[data-item-id]");
  if(!row||!authenticated)return;
  selectedItem=selectedItem===row.dataset.itemId?null:row.dataset.itemId;
  renderInventory();drawWorld();
});
$("clear-inventory-button").addEventListener("click",async()=>{
  if(!authenticated){openAuth("login");return;}
  try{await api("/api/inventory/clear",{method:"POST",body:"{}"});await refreshInventory();toast("Inventory cleared.");}
  catch(err){toast(err.message,true);}
});
function blockById(id){return currentBlocks.find(block=>block.id===id);}
function renderInventory(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b));
  const total=entries.reduce((sum,[,quantity])=>sum+quantity,0);
  $("inventory-total").textContent=`${total} item${total===1?"":"s"}`;
  if(!entries.length){$("inventory-list").innerHTML=`<div class="empty">${authenticated?"Your inventory is empty. Break blocks in the world or add items above.":"Log in — your inventory lives on your account."}</div>`;return;}
  $("inventory-list").innerHTML=entries.map(([id,quantity])=>{
    const block=blockById(id);const label=block?block.name:id;const colour=block&&/^#[0-9a-f]{6}$/i.test(block.colour)?block.colour:"#64748b";
    const selected=id===selectedItem?" selected":"";
    return `<div class="inventory-item${selected}" data-item-id="${escapeAttr(id)}"><span class="swatch" style="background:${escapeAttr(colour)}"></span><div class="item-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small></div><span class="item-quantity">×${quantity}</span><button class="remove-item" type="button" data-remove-item="${escapeAttr(id)}" aria-label="Remove one ${escapeAttr(id)}">−1</button></div>`;
  }).join("");
}

// Recipe ingredients are an array of IDs. Duplicate IDs represent multiple units.
function ingredientRequirements(ingredients){
  const required={};
  for(const id of Array.isArray(ingredients)?ingredients:[])required[id]=(required[id]||0)+1;
  return required;
}
function missingIngredients(recipe){
  return Object.entries(ingredientRequirements(recipe.ingredients)).filter(([id,needed])=>(inventory[id]||0)<needed);
}
function renderCrafting(){
  const recipes=currentRecipes;
  const craftable=authenticated?recipes.filter(recipe=>missingIngredients(recipe).length===0&&Array.isArray(recipe.ingredients)&&recipe.ingredients.length>0).length:0;
  $("craftable-count").textContent=`${craftable} craftable`;
  if(!recipes.length){$("crafting-list").innerHTML='<div class="empty">No recipes published yet. Create one in the Recipe Forge below.</div>';return;}
  $("crafting-list").innerHTML=recipes.slice().reverse().map(recipe=>{
    const ingredients=Array.isArray(recipe.ingredients)?recipe.ingredients:[];
    const missing=missingIngredients(recipe);
    const grouped=Object.entries(ingredientRequirements(ingredients));
    const ingredientText=grouped.map(([id,quantity])=>`${quantity>1?`${quantity} × `:""}${escapeHtml(id)}`).join(" · ");
    const missingText=missing.length?`Missing: ${missing.map(([id,quantity])=>`${escapeHtml(id)} ×${quantity-(inventory[id]||0)}`).join(", ")}`:"Ready to craft";
    const quantity=Number(recipe.quantity)||1;
    const disabled=missing.length>0||ingredients.length===0||!authenticated;
    const status=!authenticated?"Log in to craft":(missing.length?missingText:(ingredients.length?"Ready to craft":"No ingredients"));
    return `<div class="craft-recipe"><div class="craft-recipe-main"><div class="craft-recipe-icon">⚒</div><div class="item-info"><strong>${escapeHtml(recipe.name)}</strong><small>${ingredientText||"No ingredients defined"}</small><small class="craft-result">Produces ${quantity} × ${escapeHtml(recipe.result_id)}</small></div></div><div class="craft-recipe-action"><span class="craft-status ${disabled?"missing":"ready"}">${status}</span><button class="button button-primary craft-button" type="button" data-craft-id="${escapeAttr(recipe.id)}" ${disabled?"disabled":""}>Craft</button></div></div>`;
  }).join("");
}
$("crafting-list").addEventListener("click",async e=>{
  const button=e.target.closest("[data-craft-id]");if(!button||button.disabled)return;
  if(!authenticated){openAuth("login");return;}
  try{
    const data=await api("/api/recipes/craft",{method:"POST",body:JSON.stringify({recipe_id:button.dataset.craftId})});
    await refreshInventory();
    toast(`Crafted ${data.quantity} × ${data.id}.`);
  }catch(err){toast(err.message,true);renderCrafting();}
});

$("block-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a block.");return;}
  const body={name:$("block-name").value,id:$("block-id").value,hardness:Number($("block-hardness").value),light:Number($("block-light").value),colour:$("block-colour").value,behaviour:$("block-behaviour").value,rules:{support:$("block-support").value,incompatibleWith:$("block-incompatible").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)}};
  try{await api("/api/blocks",{method:"POST",body:JSON.stringify(body)});toast("Block published to the registry.");e.target.reset();$("block-hardness").value=2;$("block-light").value=0;$("block-colour").value="#8b72e8";await refreshRegistry();}
  catch(err){toast(err.message,true);}
});
$("recipe-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a recipe.");return;}
  const body={name:$("recipe-name").value,ingredients:$("recipe-ingredients").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean),result_id:$("recipe-result").value.trim().toLowerCase(),quantity:Number($("recipe-quantity").value)};
  try{await api("/api/recipes",{method:"POST",body:JSON.stringify(body)});toast("Recipe published.");e.target.reset();$("recipe-quantity").value=1;await refreshRegistry();}
  catch(err){toast(err.message,true);}
});
$("refresh-button").addEventListener("click",refreshRegistry);
$("creator-button").addEventListener("click",()=>$("studio").scrollIntoView({behavior:"smooth"}));
$("play-button").addEventListener("click",()=>{toast("Shared world: WASD moves, click places your selected item, right-click or Shift-click breaks.");$("world-canvas").scrollIntoView({behavior:"smooth",block:"center"});});

// ---- Base terrain: MUST match backend/src/terrain.ts exactly -----------------
function hashU32(n){n=(n|0)^0x9e3779b9;n=Math.imul(n,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);n^=n>>>16;return n>>>0;}
function terrainHeight(x){return 10+(hashU32(Math.floor(x/4)^0x51ed2701)%6);}
function baseBlock(x,y){const h=terrainHeight(x);if(y<h)return "air";if(y===h)return "builtin:grass";if(y<=h+3)return "builtin:dirt";return "builtin:stone";}

// ---- Shared world: 2D view of the server grid (DVE renders the same data) ----
const canvas=$("world-canvas"),ctx=canvas.getContext("2d");
const TILE=30,COLS=Math.ceil(canvas.width/TILE)+1,ROWS=Math.ceil(canvas.height/TILE)+1;
const player={x:0,y:terrainHeight(0)-3};
const worldEdits=new Map();
let headSeq=0,ws=null,wsRetry=0,dveView=null,dveMod=null,dveBusy=false;
function cellBlock(x,y){const o=worldEdits.get(`${x},${y}`);return o!==undefined?o:baseBlock(x,y);}
const camX=()=>player.x-Math.floor(COLS/2);
const camY=()=>player.y-Math.floor(ROWS/2);
const TERRAIN_COLOURS={"builtin:grass":"#648b4d","builtin:dirt":"#79583f","builtin:stone":"#777b82"};
const stars=[];for(let i=0;i<60;i++)stars.push([Math.random()*canvas.width,Math.random()*canvas.height*.55,Math.random()*1.2+.2]);

function drawWorld(){
  ctx.fillStyle="#131a24";ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const[sx,sy,r]of stars){ctx.fillStyle=`rgba(230,242,255,${(r/4).toFixed(2)})`;ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();}
  const cx=camX(),cy=camY();
  for(let gy=0;gy<ROWS;gy++)for(let gx=0;gx<COLS;gx++){
    const id=cellBlock(cx+gx,cy+gy);
    if(id==="air")continue;
    const block=blockById(id);
    ctx.fillStyle=block&&/^#[0-9a-f]{6}$/i.test(block.colour)?block.colour:(TERRAIN_COLOURS[id]||"#4a5158");
    ctx.fillRect(gx*TILE,gy*TILE,TILE-1,TILE-1);
    if(block&&block.light>0){ctx.fillStyle=`rgba(255,240,170,${Math.min(.35,block.light/30).toFixed(2)})`;ctx.fillRect(gx*TILE,gy*TILE,TILE-1,TILE-1);}
  }
  ctx.fillStyle="rgba(197,183,255,.16)";ctx.fillRect((player.x-cx)*TILE,(player.y-cy)*TILE,TILE-1,TILE-1);
  ctx.fillStyle="#c5b7ff";ctx.fillRect((player.x-cx)*TILE+7,(player.y-cy)*TILE+7,TILE-14,TILE-14);
  ctx.fillStyle="#161326";ctx.fillRect((player.x-cx)*TILE+10,(player.y-cy)*TILE+10,TILE-20,TILE-20);
  $("player-position").textContent=`x ${player.x} · y ${player.y}`;
  $("selected-item").textContent=selectedItem?`using ${selectedItem}`:"no item selected";
}
async function loadWorld(){
  try{
    const data=await api(`/api/world?x0=${camX()-4}&y0=${camY()-4}&x1=${camX()+COLS+4}&y1=${camY()+ROWS+4}&since=${headSeq}`);
    for(const edit of data.edits)noteEdit(edit.x,edit.y,edit.block_id);
    for(const entry of data.log)noteEdit(entry.x,entry.y,entry.block_id);
    headSeq=Math.max(headSeq,data.head);
    setConnection(true);
  }catch{setConnection(false);}
  drawWorld();
}
// Single funnel for world edits so the 3D view (when open) mirrors the same
// server-authoritative state the 2D canvas shows.
function noteEdit(x,y,blockId){
  worldEdits.set(`${x},${y}`,blockId);
  if(dveView)dveView.applyEdit(x,y,blockId);
}
function connectLive(){
  ws=new WebSocket(API_BASE.replace(/^http/,"ws")+"/api/world/live");
  ws.onopen=()=>{wsRetry=0;};
  ws.onmessage=event=>{try{const m=JSON.parse(event.data);if(m.type==="edit"){noteEdit(m.x,m.y,m.block_id);drawWorld();}}catch{/* ignore non-JSON frames */}};
  ws.onclose=()=>{setTimeout(connectLive,Math.min(15000,500*2**wsRetry++));};
  ws.onerror=()=>{try{ws.close();}catch{/* already closed */}};
}
// While the socket is down, polling (since=headSeq) fills the gap.
setInterval(()=>{try{if(!ws||ws.readyState>1)loadWorld();}catch{loadWorld();}},4000);

async function worldAction(button,x,y){
  if(!authenticated){openAuth("login");toast("Log in to build in the shared world.");return;}
  try{
    if(button===2||button===1){
      const data=await api("/api/world/break",{method:"POST",body:JSON.stringify({x,y})});
      toast(`Broke ${data.dropped} at ${x},${y} — +1 item.`);
    }else{
      if(!selectedItem){toast("Pick an item from your inventory first (click it).",true);return;}
      await api("/api/world/place",{method:"POST",body:JSON.stringify({x,y,item_id:selectedItem})});
      toast(`Placed ${selectedItem} at ${x},${y}.`);
    }
    await refreshInventory();
  }catch(err){toast(err.message,true);}
}
async function handleWorldPointer(button,clientX,clientY){
  const rect=canvas.getBoundingClientRect();
  const x=camX()+Math.floor((clientX-rect.left)*canvas.width/rect.width/TILE);
  const y=camY()+Math.floor((clientY-rect.top)*canvas.height/rect.height/TILE);
  await worldAction(button,x,y);
}
canvas.addEventListener("pointerdown",e=>handleWorldPointer(e.button,e.clientX,e.clientY));
canvas.addEventListener("contextmenu",e=>e.preventDefault());

let worldTimer;
window.addEventListener("keydown",e=>{
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d","W","A","S","D"].includes(e.key)){
    if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;
    e.preventDefault();const k=e.key.toLowerCase();
    if(k==="w"||k==="arrowup")player.y--;if(k==="s"||k==="arrowdown")player.y++;
    if(k==="a"||k==="arrowleft")player.x--;if(k==="d"||k==="arrowright")player.x++;
    drawWorld();clearTimeout(worldTimer);worldTimer=setTimeout(loadWorld,350);
  }
});

// ---- 3D view (Divine Voxel Engine, ./dve/dist/) ------------------------------
// The 3D view renders the SAME server world as a slab cross-section. All edits
// stay server-authoritative: clicks go through /api/world/place|break and come
// back as live edits, never as direct voxel paints.
$("open-3d-button").addEventListener("click",async()=>{
  const overlay=$("view3d");
  if(dveView){overlay.hidden=false;return;}
  if(dveBusy)return;
  dveBusy=true;overlay.hidden=false;$("view3d-status").textContent="starting engine…";
  try{
    if(!window.WebGLRenderingContext)throw new Error("WebGL unavailable in this browser");
    dveMod=await import("./dve/dist/dve-view.js");
    dveView=await dveMod.createDVEView($("view3d-canvas"),currentBlocks,API_BASE);
    $("view3d-status").textContent="live";
  }catch(err){
    dveView=null;
    $("view3d-status").textContent="3D view unavailable: "+(err&&err.message||err);
  }
  dveBusy=false;
});
$("view3d-close").addEventListener("click",()=>{$("view3d").hidden=true;});
$("view3d-canvas").addEventListener("contextmenu",e=>e.preventDefault());
$("view3d-canvas").addEventListener("pointerdown",async e=>{
  if(!dveView||e.button>2)return;
  const hit=await dveView.pickAt(e.clientX,e.clientY);
  if(!hit)return;
  const cell=(e.button===2||e.button===1)?hit.position:hit.normalPosition;
  const x=cell.x|0,y=dveMod.y2d(cell.y|0);
  if(x<dveMod.SLAB.X0||x>=dveMod.SLAB.X1||y<dveMod.SLAB.Y0||y>=dveMod.SLAB.Y1){
    toast("That face is outside the shared world window.",true);return;
  }
  await worldAction(e.button,x,y);
});

drawWorld();updateAccountButton();renderInventory();refreshRegistry().then(loadWorld);connectLive();restoreSession();
