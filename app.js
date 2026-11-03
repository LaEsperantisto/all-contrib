// All Contribute frontend prototype.
const API_BASE = "https://all-contrib.all-contrib.workers.dev";
const $ = (id) => document.getElementById(id);
let username = localStorage.getItem("ac_username");
let authenticated = false;
// Remove the old JavaScript-readable bearer token. Authentication now uses an HttpOnly cookie.
localStorage.removeItem("ac_token");
let authMode = "register";
let toastTimer;
let currentBlocks = [];
let currentRecipes = [];
let inventory = loadInventory();

function inventoryKey() {
  return `ac_inventory_v1_${username ? username.toLowerCase() : "guest"}`;
}
function loadInventory() {
  try {
    const saved = JSON.parse(localStorage.getItem(inventoryKey()) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const clean = {};
    for (const [id, quantity] of Object.entries(saved)) {
      if (/^[a-z0-9_:-]{1,128}$/.test(id) && Number.isSafeInteger(quantity) && quantity > 0) clean[id] = quantity;
    }
    return clean;
  } catch {
    return {};
  }
}
function saveInventory() {
  try {
    localStorage.setItem(inventoryKey(), JSON.stringify(inventory));
  } catch {
    toast("Your browser could not save the inventory locally.", true);
  }
}
function changeInventory(id, amount) {
  const next = (inventory[id] || 0) + amount;
  if (next > 0) inventory[id] = next;
  else delete inventory[id];
  saveInventory();
  renderInventory();
  renderCrafting();
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
  inventory=loadInventory();
  updateAccountButton();
  renderInventory();
  renderCrafting();
}
function clearAuthenticatedUser(){
  authenticated=false;
  username=null;
  localStorage.removeItem("ac_username");
  inventory=loadInventory();
  updateAccountButton();
  renderInventory();
  renderCrafting();
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

// Inventory: browser-local and intentionally usable without an account for testing.
$("add-item-form").addEventListener("submit",e=>{
  e.preventDefault();
  const id=$("add-item-id").value.trim().toLowerCase();
  const quantity=Number($("add-item-quantity").value);
  if(!/^[a-z0-9_:-]{1,128}$/.test(id)){toast("Use 1–128 letters, numbers, underscores, colons or hyphens for the item ID.",true);return;}
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999){toast("Quantity must be between 1 and 999.",true);return;}
  changeInventory(id,quantity);$("add-item-id").value="";$("add-item-quantity").value="16";
  toast(`Added ${quantity} × ${id} to your inventory.`);
});
$("inventory-list").addEventListener("click",e=>{
  const button=e.target.closest("[data-remove-item]");
  if(!button)return;
  changeInventory(button.dataset.removeItem,-1);
});
$("clear-inventory-button").addEventListener("click",()=>{
  inventory={};saveInventory();renderInventory();renderCrafting();toast("Inventory cleared.");
});
function blockById(id){return currentBlocks.find(block=>block.id===id);}
function renderInventory(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b));
  const total=entries.reduce((sum,[,quantity])=>sum+quantity,0);
  $("inventory-total").textContent=`${total} item${total===1?"":"s"}`;
  if(!entries.length){$("inventory-list").innerHTML='<div class="empty">Your inventory is empty. Add an item ID above to begin.</div>';return;}
  $("inventory-list").innerHTML=entries.map(([id,quantity])=>{
    const block=blockById(id);const label=block?block.name:id;const colour=block&&/^#[0-9a-f]{6}$/i.test(block.colour)?block.colour:"#64748b";
    return `<div class="inventory-item"><span class="swatch" style="background:${escapeAttr(colour)}"></span><div class="item-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small></div><span class="item-quantity">×${quantity}</span><button class="remove-item" type="button" data-remove-item="${escapeAttr(id)}" aria-label="Remove one ${escapeAttr(id)}">−1</button></div>`;
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
  const craftable=recipes.filter(recipe=>missingIngredients(recipe).length===0&&Array.isArray(recipe.ingredients)&&recipe.ingredients.length>0).length;
  $("craftable-count").textContent=`${craftable} craftable`;
  if(!recipes.length){$("crafting-list").innerHTML='<div class="empty">No recipes published yet. Create one in the Recipe Forge below.</div>';return;}
  $("crafting-list").innerHTML=recipes.slice().reverse().map(recipe=>{
    const ingredients=Array.isArray(recipe.ingredients)?recipe.ingredients:[];
    const missing=missingIngredients(recipe);
    const grouped=Object.entries(ingredientRequirements(ingredients));
    const ingredientText=grouped.map(([id,quantity])=>`${quantity>1?`${quantity} × `:""}${escapeHtml(id)}`).join(" · ");
    const missingText=missing.length?`Missing: ${missing.map(([id,quantity])=>`${escapeHtml(id)} ×${quantity-(inventory[id]||0)}`).join(", ")}`:"Ready to craft";
    const quantity=Number(recipe.quantity)||1;
    const disabled=missing.length>0||ingredients.length===0;
    return `<div class="craft-recipe"><div class="craft-recipe-main"><div class="craft-recipe-icon">⚒</div><div class="item-info"><strong>${escapeHtml(recipe.name)}</strong><small>${ingredientText||"No ingredients defined"}</small><small class="craft-result">Produces ${quantity} × ${escapeHtml(recipe.result_id)}</small></div></div><div class="craft-recipe-action"><span class="craft-status ${disabled?"missing":"ready"}">${missing.length?missingText:(ingredients.length?"Ready to craft":"No ingredients")}</span><button class="button button-primary craft-button" type="button" data-craft-id="${escapeAttr(recipe.id)}" ${disabled?"disabled":""}>Craft</button></div></div>`;
  }).join("");
}
$("crafting-list").addEventListener("click",e=>{
  const button=e.target.closest("[data-craft-id]");if(!button||button.disabled)return;
  const recipe=currentRecipes.find(item=>item.id===button.dataset.craftId);if(!recipe)return;
  const ingredients=ingredientRequirements(recipe.ingredients);
  const missing=Object.entries(ingredients).filter(([id,needed])=>(inventory[id]||0)<needed);
  if(missing.length){toast("You do not have all the required ingredients.",true);renderCrafting();return;}
  for(const [id,needed] of Object.entries(ingredients))inventory[id]=(inventory[id]||0)-needed;
  for(const [id,quantity] of Object.entries(inventory))if(quantity<=0)delete inventory[id];
  const resultId=String(recipe.result_id||"").toLowerCase();
  const resultQuantity=Number(recipe.quantity)||1;
  inventory[resultId]=(inventory[resultId]||0)+resultQuantity;
  saveInventory();renderInventory();renderCrafting();
  toast(`Crafted ${resultQuantity} × ${resultId}.`);
});

$("block-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a block.");return;}
  const body={name:$("block-name").value,id:$("block-id").value,hardness:Number($("block-hardness").value),light:Number($("block-light").value),colour:$("block-colour").value,behaviour:$("block-behaviour").value};
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
$("play-button").addEventListener("click",()=>{toast("World demo: use WASD or arrow keys to move.");$("world-canvas").scrollIntoView({behavior:"smooth",block:"center"});});

// Lightweight visual prototype, deliberately separate from DVE integration.
const canvas=$("world-canvas"),ctx=canvas.getContext("2d");
const tile=30, world={x:0,y:0}, palette=["#526d54","#5e795c","#6c825e","#3f594b","#7b8d65"];
function drawWorld(){
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const offsetX=(world.x*tile)%tile,offsetY=(world.y*tile)%tile;
  for(let y=-1;y<h/tile+2;y++)for(let x=-1;x<w/tile+2;x++){
    const gx=x+Math.floor(world.x),gy=y+Math.floor(world.y);
    const hash=Math.abs((gx*73856093)^(gy*19349663))%palette.length;
    ctx.fillStyle=palette[hash];ctx.fillRect(x*tile-offsetX,y*tile-offsetY,tile-1,tile-1);
    if((gx*17+gy*31)%19===0){ctx.fillStyle="#83976b";ctx.fillRect(x*tile-offsetX+7,y*tile-offsetY+6,5,5);}
    if((gx*11-gy*23)%37===0){ctx.fillStyle="#344d43";ctx.fillRect(x*tile-offsetX+18,y*tile-offsetY+18,8,8);}
  }
  ctx.fillStyle="#355e78";ctx.fillRect(w*.57,0,34,h);ctx.fillStyle="#467b92";ctx.fillRect(w*.57+8,0,8,h);
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?"#8e77e7":"#b3a0ff";ctx.fillRect(110+i*53,85+(i%3)*54,24,24);ctx.fillStyle="#d4caff";ctx.fillRect(115+i*53,90+(i%3)*54,6,6);}
  ctx.fillStyle="#161326";ctx.fillRect(w/2-11,h/2-11,23,23);ctx.fillStyle="#c5b7ff";ctx.fillRect(w/2-8,h/2-8,17,17);ctx.fillStyle="#fff";ctx.fillRect(w/2-3,h/2-4,5,5);
  $("player-position").textContent=`x ${world.x} · y ${world.y}`;
}
window.addEventListener("keydown",e=>{
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d","W","A","S","D"].includes(e.key)){
    if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;
    e.preventDefault();const k=e.key.toLowerCase();
    if(k==="w"||k==="arrowup")world.y--;if(k==="s"||k==="arrowdown")world.y++;
    if(k==="a"||k==="arrowleft")world.x--;if(k==="d"||k==="arrowright")world.x++;
    drawWorld();
  }
});

drawWorld();updateAccountButton();renderInventory();restoreSession();refreshRegistry();
