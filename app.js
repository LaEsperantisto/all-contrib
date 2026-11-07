// All Contribute frontend: fullscreen 3D game boots immediately; menus live
// in dialogs (Esc opens the pause menu). The world is server-authoritative:
// edits go through /api/world/place|break and paint only from the server echo.
const $ = (id) => document.getElementById(id);

// ---- Settings + server selection ------------------------------------------------
const DEFAULT_SETTINGS = { server: "global", sens: 5, fov: 80, distance: 900, speed: 8 };
let settings = { ...DEFAULT_SETTINGS };
try {
  const raw = JSON.parse(localStorage.getItem("ac_settings") || "{}");
  if (raw && typeof raw === "object") settings = { ...settings, ...raw };
} catch { /* defaults */ }
if (!["global", "local"].includes(settings.server)) settings.server = "global";
delete settings.mode; delete settings.flySpeed; // legacy keys from older builds
function saveSettings() { localStorage.setItem("ac_settings", JSON.stringify(settings)); }
const isLocalPage = ["localhost", "127.0.0.1"].includes(location.hostname);
if (!isLocalPage) settings.server = "global"; // https page → http dev API is mixed content
let API_BASE = settings.server === "local" && isLocalPage
  ? "http://127.0.0.1:8787"
  : "https://all-contrib.all-contrib.workers.dev";
function updateServerChip() {
  const label = settings.server === "local" && isLocalPage ? "Server: local dev" : "Server: global";
  $("hud-server").textContent = label.toLowerCase();
  $("pause-server-chip").textContent = label;
  $("mm-server-chip").textContent = label;
}
// Sensitivity slider 1..10 → radians per pixel; FOV degrees → Babylon vertical rad.
const viewSettings = () => ({
  sensitivity: settings.sens * 0.00046,
  fov: settings.fov * Math.PI / 180 * 0.72,
  renderDistance: settings.distance,
  speed: settings.speed,
});

let username = localStorage.getItem("ac_username");
// Saved character colours (server-side, mirrored for presence frames).
const DEFAULT_APPEARANCE = { body_colour: "#3b6ea5", head_colour: "#d9a06b", accent_colour: "#2f8f4f", eye_colour: "#1d2430" };
let appearance = { ...DEFAULT_APPEARANCE };
let authenticated = false;
// Remove the old JavaScript-readable bearer token. Authentication now uses an HttpOnly cookie.
localStorage.removeItem("ac_token");
let authMode = "register";
let toastTimer;
let currentBlocks = [];
let currentItems = [];
let currentRecipes = [];
// Inventory is server-side per account: the shared-world economy (placement
// debits, breaking credits, crafting consumes) needs one authoritative copy.
let inventory = {};
let selectedItem = null;
// Health is server-owned (the WorldLive object applies mob damage and writes
// player_state.health); this is the mirror the HUD renders. 0 = dead.
const MAX_HEALTH = 20;
let health = MAX_HEALTH;
let dead = false;
let mobSnapshot = new Map(); // mob_id -> last snapshot, pruned every frame list

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
  const label = settings.server === "local" && isLocalPage ? "local dev" : "global";
  $("pause-server-chip").textContent = `Server: ${label}${online ? "" : " (offline)"}`;
}
function updateAccountChip(){
  const label = authenticated && username ? username : "not signed in";
  $("pause-account-chip").textContent = label;
  $("mm-account-chip").textContent = label;
  $("pause-account").textContent = authenticated && username ? "Account" : "Log in / Register";
}
// "Add test items" is an admin-only tool; the form stays hidden for everyone
// else (the handler also refuses, so a stale DOM cannot be used).
function isAdmin(){return authenticated&&String(username||"").toLowerCase()==="admin";}
function renderAdminTools(){
  $("add-item-form").hidden=!isAdmin();
  $("add-item-note").hidden=!isAdmin();
}
// Health bar: ten hearts, half hearts allowed (health is 0..20 server units).
function renderHealth(){
  const hearts=$("hud-health");
  if(!hearts)return;
  const full=Math.floor(health/2), half=health-full*2>=1?1:0;
  let out='<span class="hud-health-label">♥</span>';
  for(let i=0;i<10;i++)out+=`<span class="heart ${i<full?"full":i===full&&half?"half":"empty"}"></span>`;
  hearts.innerHTML=out;
  hearts.hidden=!dveView;
}
function showDeath(cause){
  dead=true;
  $("death-cause").textContent=cause||"The world got the better of you.";
  $("death-screen").hidden=false;
  if(dveView){dveView.releaseInput();dveView.setFrozen(true);}
  syncGrabBtn();
  renderHealth();
}
function hideDeath(){
  dead=false;
  $("death-screen").hidden=true;
  if(dveView)dveView.setFrozen(false);
}
$("death-respawn").addEventListener("click",async()=>{
  try{
    const data=await api("/api/player/respawn",{method:"POST",body:"{}"});
    health=Number(data.health)??MAX_HEALTH;
    hideDeath();
    if(dveView&&data.state)dveView.setPose(data.state);
    renderHealth();
    if(dveView)dveView.grabPointer();
    toast("Respawned — the world is unkind, try again.");
  }catch(err){toast(err.message,true);}
});
$("death-menu").addEventListener("click",()=>{
  hideDeath();
  $("death-screen").hidden=true;
  updateServerChip();updateAccountChip();
  $("main-menu").showModal();
  if(dveView)dveView.releaseInput();
  $("game").hidden=true;
  syncGrabBtn();
});
function setAuthenticatedUser(name){
  username=name;
  authenticated=true;
  localStorage.setItem("ac_username",name);
  updateAccountChip();
  renderInventory();
  renderCrafting();
  renderMyBlocks();
  renderMyItems();
  renderMyRecipes();
  renderAdminTools();
  migrateLegacyInventory().then(refreshInventory);
}
function clearAuthenticatedUser(){
  authenticated=false;
  username=null;
  localStorage.removeItem("ac_username");
  inventory={};
  selectedItem=null;
  updateAccountChip();
  renderInventory();
  renderCrafting();
  renderMyBlocks();
  renderMyItems();
  renderMyRecipes();
  renderAdminTools();
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

$("pause-account").addEventListener("click",openAccountDialog);
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
    const [blocks,items,recipes]=await Promise.all([api("/api/blocks"),api("/api/items"),api("/api/recipes")]);
    setConnection(true);
    currentBlocks=Array.isArray(blocks.blocks)?blocks.blocks:[];
    currentItems=Array.isArray(items.items)?items.items:[];
    currentRecipes=Array.isArray(recipes.recipes)?recipes.recipes:[];
    renderInventory();renderCrafting();renderMyBlocks();renderMyItems();renderMyRecipes();renderItemProgramSelect();
  }catch(err){
    setConnection(false);currentBlocks=[];currentItems=[];currentRecipes=[];
    renderInventory();$("crafting-list").innerHTML='<div class="empty">Recipes are unavailable until the API reconnects.</div>';
    renderMyBlocks();renderMyItems();renderMyRecipes();renderItemProgramSelect();
  }
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/;/g,"");}

// Inventory tools manage the account's server-side stacks.
$("add-item-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!authenticated){openAuth("login");toast("Log in to manage your inventory.");return;}
  if(!isAdmin()){toast("Only the admin account can add test items.",true);return;}
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
  selectItem(selectedItem===row.dataset.itemId?null:row.dataset.itemId);
});
$("clear-inventory-button").addEventListener("click",async()=>{
  if(!authenticated){openAuth("login");return;}
  try{await api("/api/inventory/clear",{method:"POST",body:"{}"});await refreshInventory();toast("Inventory cleared.");}
  catch(err){toast(err.message,true);}
});
function blockById(id){return currentBlocks.find(block=>block.id===id);}
function itemById(id){return currentItems.find(item=>item.id===id);}
// Inventory rows describe ITEMS. A stack keyed by a raw block id (older data)
// falls back to the block it resembles, so it still renders and can be placed.
function itemMeta(id){
  const item=itemById(id);
  if(item)return item;
  const block=blockById(id);
  return block?{id,name:block.name,colour:block.colour,kind:"block",place_block_id:block.id,damage:0,speed:1,heal:0,durability:0,is_builtin:1}:null;
}
const KIND_LABEL={block:"block",tool:"tool",weapon:"weapon",food:"food",material:"material"};
function itemStatLine(item){
  const bits=[];
  if(Number(item.damage)>0)bits.push(`damage ${Number(item.damage)}`);
  if(Number(item.speed)>1)bits.push(`mining ×${Number(item.speed)}`);
  if(Number(item.heal)>0)bits.push(`heals ${Number(item.heal)}`);
  if(Number(item.durability)>0)bits.push(`${Number(item.durability)} uses`);
  if(item.kind==="block")bits.push(`places ${item.place_block_id||"—"}`);
  return bits.join(" · ");
}
function selectItem(id){
  selectedItem=id;
  renderInventory();renderHotbar();
  const meta=id?itemMeta(id):null;
  $("hud-held").textContent=meta?`${meta.name}${KIND_LABEL[meta.kind]?` · ${KIND_LABEL[meta.kind]}`:""}`:(id||"no item");
}
function renderInventory(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b));
  const total=entries.reduce((sum,[,quantity])=>sum+quantity,0);
  $("inventory-total").textContent=`${total} item${total===1?"":"s"}`;
  renderHotbar();
  if(!entries.length){$("inventory-list").innerHTML=`<div class="empty">${authenticated?"Your inventory is empty. Break blocks in the world or add items above.":"Log in — your inventory lives on your account."}</div>`;return;}
  $("inventory-list").innerHTML=entries.map(([id,quantity])=>{
    const meta=itemMeta(id);const label=meta?meta.name:id;const colour=meta&&/^#[0-9a-f]{6}$/i.test(meta.colour)?meta.colour:"#64748b";
    const selected=id===selectedItem?" selected":"";
    const kind=meta?KIND_LABEL[meta.kind]||meta.kind:"unknown";
    const stats=meta?itemStatLine(meta):"not in the registry — it cannot be placed or used";
    return `<div class="inventory-item${selected}" data-item-id="${escapeAttr(id)}"><span class="swatch" style="background:${escapeAttr(colour)}"></span><div class="item-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small><small class="item-kind kind-${escapeAttr(kind)}">${escapeHtml(kind)}</small>${stats?`<small class="item-stats">${escapeHtml(stats)}</small>`:""}</div><span class="item-quantity">×${quantity}</span><button class="remove-item" type="button" data-remove-item="${escapeAttr(id)}" aria-label="Remove one ${escapeAttr(id)}">−1</button></div>`;
  }).join("");
}

// Hotbar: first nine stacks, selectable with 1–9 or a click while in game.
function renderHotbar(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b)).slice(0,9);
  $("hotbar").innerHTML=entries.map(([id,quantity],i)=>{
    const meta=itemMeta(id);const colour=meta&&/^#[0-9a-f]{6}$/i.test(meta.colour)?meta.colour:"#64748b";
    const selected=id===selectedItem?" hotbar-selected":"";
    const glyph=meta&&meta.kind==="weapon"?"⚔":meta&&meta.kind==="tool"?"⛏":meta&&meta.kind==="food"?"✚":"";
    const label=meta?`${meta.name} — ${id}`:id;
    return `<div class="hotbar-slot${selected}" data-slot-id="${escapeAttr(id)}" title="${escapeAttr(label)}"><span class="hotbar-key">${i+1}</span><span class="swatch" style="background:${escapeAttr(colour)}"></span>${glyph?`<span class="hotbar-glyph">${glyph}</span>`:""}<span class="hotbar-qty">${quantity}</span></div>`;
  }).join("");
}
$("hotbar").addEventListener("click",e=>{
  const slot=e.target.closest("[data-slot-id]");
  if(slot)selectItem(slot.dataset.slotId===selectedItem?null:slot.dataset.slotId);
});

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
  if(!recipes.length){$("crafting-list").innerHTML='<div class="empty">No recipes published yet. Create one in the Recipe Forge in the block manager.</div>';return;}
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

// ---- Block workshop: publish, edit (own blocks), delete (own blocks) ----------
let editingBlockId=null;
const pendingDelete=new Set();
$("block-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a block.");return;}
  const rules={support:$("block-support").value,incompatibleWith:$("block-incompatible").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean)};
  const common={name:$("block-name").value,hardness:Number($("block-hardness").value),light:Number($("block-light").value),colour:$("block-colour").value,behaviour:$("block-behaviour").value,rules};
  try{
    if(editingBlockId){
      await api(`/api/blocks/${encodeURIComponent(editingBlockId)}`,{method:"PUT",body:JSON.stringify(common)});
      toast(`Block ${editingBlockId} updated.`);
      exitEditMode();
    }else{
      await api("/api/blocks",{method:"POST",body:JSON.stringify({...common,namespace:$("block-namespace").value,id:$("block-id").value})});
      toast("Block published to the registry. It becomes placeable immediately; textures reload on next visit.");
      e.target.reset();$("block-hardness").value=2;$("block-light").value=0;$("block-colour").value="#8b72e8";updateIdPreview();
    }
    await refreshRegistry();
  }
  catch(err){toast(err.message,true);}
});
function enterEditMode(block){
  editingBlockId=block.id;
  pendingDelete.clear();
  const parts=block.id.split(":");
  const namespace=block.id.startsWith("player:")?parts[2]:"";
  const localId=block.id.startsWith("player:")?parts.slice(3).join(":"):block.id;
  let rules={};try{rules=JSON.parse(block.rules_json||"{}");}catch{/* defaults below */}
  $("block-name").value=block.name;$("block-namespace").value=namespace;$("block-id").value=localId;
  $("block-hardness").value=block.hardness;$("block-light").value=block.light;$("block-colour").value=block.colour;
  $("block-behaviour").value=block.behaviour;$("block-support").value=rules.support||"solid";
  $("block-incompatible").value=(rules.incompatibleWith||[]).join(", ");
  $("block-namespace").readOnly=true;$("block-id").readOnly=true;
  $("block-edit-note").hidden=false;$("block-edit-id").textContent=block.id;
  $("block-form-title").textContent="Edit block";$("block-form-sub").textContent="Changes apply to the live registry.";
  $("block-submit").textContent="Save changes";
  $("block-form").scrollIntoView({behavior:"smooth",block:"center"});
}
function exitEditMode(){
  editingBlockId=null;
  $("block-namespace").readOnly=false;$("block-id").readOnly=false;
  $("block-edit-note").hidden=true;
  $("block-form-title").textContent="Block workshop";$("block-form-sub").textContent="Design a new block";
  $("block-submit").innerHTML='Publish block <span>＋</span>';
  $("block-form").reset();$("block-hardness").value=2;$("block-light").value=0;$("block-colour").value="#8b72e8";updateIdPreview();
}
// Live registry-ID preview: player:USERNAME:NAMESPACE:BLOCKNAME.
function updateIdPreview(){
  const user=(username||"you").toLowerCase();
  const ns=($("block-namespace").value.trim()||"myns").toLowerCase();
  const id=($("block-id").value.trim()||"starstone").toLowerCase();
  $("block-id-preview").textContent=`player:${user}:${ns}:${id}`;
}
$("block-namespace").addEventListener("input",updateIdPreview);
$("block-id").addEventListener("input",updateIdPreview);
$("block-edit-cancel").addEventListener("click",exitEditMode);
function renderMyBlocks(){
  const list=$("my-blocks-list");
  if(!authenticated){list.innerHTML='<div class="empty">Log in to manage your own blocks.</div>';return;}
  const mine=currentBlocks.filter(b=>String(b.creator||"").toLowerCase()===(username||"").toLowerCase());
  if(!mine.length){list.innerHTML='<div class="empty">You have not published any blocks yet.</div>';return;}
  list.innerHTML=mine.map(b=>{
    const pending=pendingDelete.has(b.id);
    return `<div class="registry-item"><span class="swatch" style="background:${escapeAttr(b.colour)}"></span><div class="item-info"><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.id)} · ${escapeHtml(b.behaviour)} · light ${Number(b.light)||0}</small></div><div class="my-block-actions"><button class="button button-outline" type="button" data-mb-edit="${escapeAttr(b.id)}">Edit</button><button class="button ${pending?"button-danger":"button-outline"}" type="button" data-mb-del="${escapeAttr(b.id)}">${pending?"Really delete?":"Delete"}</button></div></div>`;
  }).join("");
}
$("my-blocks-list").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-mb-edit]");
  if(edit){const block=blockById(edit.dataset.mbEdit);if(block)enterEditMode(block);return;}
  const del=e.target.closest("[data-mb-del]");
  if(!del)return;
  const id=del.dataset.mbDel;
  if(!pendingDelete.has(id)){pendingDelete.add(id);renderMyBlocks();return;} // two-step, no native confirm
  try{
    await api(`/api/blocks/${encodeURIComponent(id)}`,{method:"DELETE"});
    pendingDelete.delete(id);
    if(editingBlockId===id)exitEditMode();
    if(selectedItem===id)selectItem(null);
    await Promise.all([refreshRegistry(),refreshInventory()]);
    toast(`Block ${id} removed — placed copies cleared from the world.`);
  }catch(err){pendingDelete.delete(id);renderMyBlocks();toast(err.message,true);}
});

// ---- Item forge: publish, edit, delete (own items) ---------------------------
// The item IS the behaviour: kind + programme. A "block" item names the block
// it places (its programme); tools/weapons/food carry stats. No code, ever.
let editingItemId=null;
const pendingItemDelete=new Set();
function itemFormTitle(){
  $("item-form-title").textContent=editingItemId?"Edit item":"Item forge";
  $("item-form-sub").textContent=editingItemId?"Changes apply to the live registry.":"Program an item: what it does when used";
  $("item-submit").innerHTML=editingItemId?"Save changes":'Publish item <span>＋</span>';
}
function updateItemFormKind(){
  const kind=$("item-kind").value;
  $("item-program").hidden=kind!=="block";
  const show=(rowId,on)=>{$(rowId).hidden=!on;};
  show("item-damage-row",kind==="weapon"||kind==="tool");
  show("item-speed-row",kind==="tool"||kind==="weapon");
  show("item-heal-row",kind==="food");
  show("item-durability-row",kind==="tool"||kind==="weapon");
  updateItemIdPreview();
}
function renderItemProgramSelect(){
  const select=$("item-place-block");
  if(!select)return;
  const current=select.value;
  const options=currentBlocks.filter(b=>b.id!=="builtin:bedrock").map(b=>`<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)} — ${escapeAttr(b.id)}</option>`).join("");
  select.innerHTML=options||'<option value="">No blocks in the registry yet</option>';
  if(current&&[...select.options].some(o=>o.value===current))select.value=current;
}
$("item-kind").addEventListener("change",updateItemFormKind);
updateItemFormKind(); // show the right stat rows before the first edit
function updateItemIdPreview(){
  const user=(username||"you").toLowerCase();
  const ns=($("item-namespace").value.trim()||"myns").toLowerCase();
  const id=($("item-id").value.trim()||"starbrick").toLowerCase();
  $("item-id-preview").textContent=`player:${user}:${ns}:${id}`;
}
$("item-namespace").addEventListener("input",updateItemIdPreview);
$("item-id").addEventListener("input",updateItemIdPreview);
$("item-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!authenticated){openAuth("login");toast("Log in to publish an item.");return;}
  const kind=$("item-kind").value;
  const body={
    name:$("item-name").value,kind,colour:$("item-colour").value,
    place_block_id:kind==="block"?$("item-place-block").value:null,
    damage:Number($("item-damage").value)||0,
    speed:Number($("item-speed").value)||1,
    heal:Number($("item-heal").value)||0,
    durability:Number($("item-durability").value)||0,
  };
  if(kind==="block"&&!body.place_block_id){toast("Pick the block this item places.",true);return;}
  try{
    if(editingItemId){
      await api(`/api/items/${encodeURIComponent(editingItemId)}`,{method:"PUT",body:JSON.stringify(body)});
      toast(`Item “${body.name}” updated.`);
      exitItemEdit();
    }else{
      await api("/api/items",{method:"POST",body:JSON.stringify({...body,namespace:$("item-namespace").value,id:$("item-id").value})});
      toast("Item published. Craft or obtain it, then use it in the world.");
      e.target.reset();$("item-colour").value="#c9a35f";$("item-kind").value="block";$("item-speed").value=1;
      $("item-damage").value=0;$("item-heal").value=0;$("item-durability").value=0;
      updateItemFormKind();updateItemIdPreview();
    }
    await refreshRegistry();
    await refreshInventory();
  }
  catch(err){toast(err.message,true);}
});
function enterItemEdit(item){
  editingItemId=item.id;
  pendingItemDelete.clear();
  const parts=item.id.split(":");
  const namespace=item.id.startsWith("player:")?parts[2]:"";
  const localId=item.id.startsWith("player:")?parts.slice(3).join(":"):item.id;
  $("item-name").value=item.name;$("item-namespace").value=namespace;$("item-id").value=localId;
  $("item-kind").value=item.kind;
  renderItemProgramSelect();
  if(item.place_block_id)$("item-place-block").value=item.place_block_id;
  $("item-damage").value=Number(item.damage)||0;$("item-speed").value=Number(item.speed)||1;
  $("item-heal").value=Number(item.heal)||0;$("item-durability").value=Number(item.durability)||0;
  $("item-colour").value=/^#[0-9a-f]{6}$/i.test(item.colour)?item.colour:"#c9a35f";
  updateItemFormKind();
  $("item-namespace").readOnly=true;$("item-id").readOnly=true;
  $("item-edit-note").hidden=false;$("item-edit-id").textContent=item.id;
  itemFormTitle();
  $("item-form").scrollIntoView({behavior:"smooth",block:"center"});
}
function exitItemEdit(){
  editingItemId=null;
  $("item-namespace").readOnly=false;$("item-id").readOnly=false;
  $("item-edit-note").hidden=true;
  itemFormTitle();
  $("item-form").reset();
  $("item-colour").value="#c9a35f";$("item-kind").value="block";$("item-speed").value=1;
  $("item-damage").value=0;$("item-heal").value=0;$("item-durability").value=0;
  updateItemFormKind();updateItemIdPreview();
}
$("item-edit-cancel").addEventListener("click",exitItemEdit);
function renderMyItems(){
  const list=$("my-items-list");
  if(!authenticated){list.innerHTML='<div class="empty">Log in to manage your own items.</div>';return;}
  const mine=currentItems.filter(it=>String(it.creator||"").toLowerCase()===(username||"").toLowerCase());
  if(!mine.length){list.innerHTML='<div class="empty">You have not published any items yet.</div>';return;}
  list.innerHTML=mine.map(it=>{
    const pending=pendingItemDelete.has(it.id);
    const stats=itemStatLine(it);
    return `<div class="registry-item"><span class="swatch" style="background:${escapeAttr(it.colour)}"></span><div class="item-info"><strong>${escapeHtml(it.name)}</strong><small>${escapeHtml(it.id)} · ${escapeHtml(KIND_LABEL[it.kind]||it.kind)}${stats?` · ${escapeHtml(stats)}`:""}</small></div><div class="my-block-actions"><button class="button button-outline" type="button" data-mi-edit="${escapeAttr(it.id)}">Edit</button><button class="button ${pending?"button-danger":"button-outline"}" type="button" data-mi-del="${escapeAttr(it.id)}">${pending?"Really delete?":"Delete"}</button></div></div>`;
  }).join("");
}
$("my-items-list").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-mi-edit]");
  if(edit){const item=itemById(edit.dataset.miEdit);if(item)enterItemEdit(item);return;}
  const del=e.target.closest("[data-mi-del]");
  if(!del)return;
  const id=del.dataset.miDel;
  if(!pendingItemDelete.has(id)){pendingItemDelete.add(id);renderMyItems();return;} // two-step
  try{
    await api(`/api/items/${encodeURIComponent(id)}`,{method:"DELETE"});
    pendingItemDelete.delete(id);
    if(editingItemId===id)exitItemEdit();
    if(selectedItem===id)selectItem(null);
    await Promise.all([refreshRegistry(),refreshInventory()]);
    toast(`Item ${id} removed.`);
  }catch(err){pendingItemDelete.delete(id);renderMyItems();toast(err.message,true);}
});

// ---- Recipes: publish, edit (own recipes), delete (own recipes) --------------
let editingRecipeId=null;
const pendingRecipeDelete=new Set();
function recipeFormTitle(){
  $("recipe-form-title").textContent=editingRecipeId?"Edit recipe":"Recipe forge";
  $("recipe-form-sub").textContent=editingRecipeId?"Changes apply to the live registry.":"Make something new";
  $("recipe-submit").innerHTML=editingRecipeId?"Save changes":'Publish recipe <span>＋</span>';
}
function enterRecipeEdit(recipe){
  editingRecipeId=recipe.id;
  pendingRecipeDelete.clear();
  $("recipe-name").value=recipe.name;
  $("recipe-ingredients").value=(recipe.ingredients||[]).join(", ");
  $("recipe-result").value=recipe.result_id;
  $("recipe-quantity").value=Number(recipe.quantity)||1;
  $("recipe-edit-note").hidden=false;$("recipe-edit-id").textContent=recipe.name;
  recipeFormTitle();
  $("recipe-form").scrollIntoView({behavior:"smooth",block:"center"});
}
function exitRecipeEdit(){
  editingRecipeId=null;
  $("recipe-edit-note").hidden=true;
  recipeFormTitle();
  $("recipe-form").reset();$("recipe-quantity").value=1;
}
$("recipe-edit-cancel").addEventListener("click",exitRecipeEdit);
$("recipe-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a recipe.");return;}
  const body={name:$("recipe-name").value,ingredients:$("recipe-ingredients").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean),result_id:$("recipe-result").value.trim().toLowerCase(),quantity:Number($("recipe-quantity").value)};
  try{
    if(editingRecipeId){
      await api(`/api/recipes/${encodeURIComponent(editingRecipeId)}`,{method:"PUT",body:JSON.stringify(body)});
      toast(`Recipe “${body.name}” updated.`);
      exitRecipeEdit();
    }else{
      await api("/api/recipes",{method:"POST",body:JSON.stringify(body)});
      toast("Recipe published.");
      e.target.reset();$("recipe-quantity").value=1;
    }
    await refreshRegistry();
  }
  catch(err){toast(err.message,true);}
});
function renderMyRecipes(){
  const list=$("my-recipes-list");
  if(!authenticated){list.innerHTML='<div class="empty">Log in to manage your own recipes.</div>';return;}
  const mine=currentRecipes.filter(r=>String(r.creator||"").toLowerCase()===(username||"").toLowerCase());
  if(!mine.length){list.innerHTML='<div class="empty">You have not published any recipes yet.</div>';return;}
  list.innerHTML=mine.map(r=>{
    const pending=pendingRecipeDelete.has(r.id);
    const ingredients=(r.ingredients||[]).join(", ");
    return `<div class="registry-item"><span class="swatch recipe-swatch">⚒</span><div class="item-info"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(ingredients)} → ${Number(r.quantity)||1} × ${escapeHtml(r.result_id)}</small></div><div class="my-block-actions"><button class="button button-outline" type="button" data-mr-edit="${escapeAttr(r.id)}">Edit</button><button class="button ${pending?"button-danger":"button-outline"}" type="button" data-mr-del="${escapeAttr(r.id)}">${pending?"Really delete?":"Delete"}</button></div></div>`;
  }).join("");
}
$("my-recipes-list").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-mr-edit]");
  if(edit){const recipe=currentRecipes.find(r=>r.id===edit.dataset.mrEdit);if(recipe)enterRecipeEdit(recipe);return;}
  const del=e.target.closest("[data-mr-del]");
  if(!del)return;
  const id=del.dataset.mrDel;
  if(!pendingRecipeDelete.has(id)){pendingRecipeDelete.add(id);renderMyRecipes();return;} // two-step, no native confirm
  try{
    await api(`/api/recipes/${encodeURIComponent(id)}`,{method:"DELETE"});
    pendingRecipeDelete.delete(id);
    if(editingRecipeId===id)exitRecipeEdit();
    await refreshRegistry();
    toast("Recipe removed.");
  }catch(err){pendingRecipeDelete.delete(id);renderMyRecipes();toast(err.message,true);}
});

// ---- Settings dialog -----------------------------------------------------------
function syncSettingsInputs(){
  const sel=$("set-server");
  sel.innerHTML='<option value="global">Global — all-contrib.all-contrib.workers.dev</option>';
  if(isLocalPage)sel.innerHTML+='<option value="local">Local dev — http://127.0.0.1:8787</option>';
  sel.value=settings.server;
  $("set-sensitivity").value=settings.sens;$("set-sensitivity-out").textContent=settings.sens;
  $("set-fov").value=settings.fov;$("set-fov-out").textContent=settings.fov+"°";
  $("set-distance").value=settings.distance;$("set-distance-out").textContent=settings.distance;
  $("set-speed").value=settings.speed;$("set-speed-out").textContent=settings.speed;
}

// ---- Pause menu ---------------------------------------------------------------
function openPause(){
  setConnection(!lastWsFailed()); // refresh chip text at open
  $("pause-dialog").showModal();
}
$("pause-resume").addEventListener("click",()=>$("pause-dialog").close());
$("pause-settings").addEventListener("click",()=>{syncSettingsInputs();$("settings-dialog").showModal();});
$("pause-mainmenu").addEventListener("click",()=>{
  // Open the landing first so the pause-close handler never re-grabs the
  // cursor, then tear the game screen down around the live engine.
  updateServerChip();updateAccountChip();
  $("main-menu").showModal();
  $("pause-dialog").close();
  if(dveView)dveView.releaseInput();
  $("game").hidden=true;
  syncGrabBtn();
});
$("pause-inventory").addEventListener("click",openInventoryDialog);
$("pause-studio").addEventListener("click",()=>$("studio-dialog").showModal());
$("hud-menu").addEventListener("click",openPause);
[["set-sensitivity","sens"],["set-fov","fov"],["set-distance","distance"],["set-speed","speed"]].forEach(([id,key])=>{
  $(id).addEventListener("input",()=>{
    settings[key]=Number($(id).value);saveSettings();
    $("set-sensitivity-out").textContent=settings.sens;
    $("set-fov-out").textContent=settings.fov+"°";
    $("set-distance-out").textContent=settings.distance;
    $("set-speed-out").textContent=settings.speed;
    if(dveView)dveView.setSettings(viewSettings());
  });
});
$("set-server").addEventListener("change",()=>{settings.server=$("set-server").value;saveSettings();location.reload();}); // fresh API_BASE, WS, session
$("settings-reset").addEventListener("click",()=>{settings={...DEFAULT_SETTINGS};if(!isLocalPage)settings.server="global";saveSettings();syncSettingsInputs();if(dveView)dveView.setSettings(viewSettings());});

function openInventoryDialog(){
  refreshInventory();
  $("inventory-dialog").showModal();
}
// ---- Character menu ----------------------------------------------------------
// Colours are stored per account (POST /api/player/appearance) and ride every
// presence frame, so other players' avatars update live.
function renderCharacterPreview(){
  $("character-user").textContent=username||"not signed in";
  $("char-head").value=appearance.head_colour;
  $("char-body").value=appearance.body_colour;
  $("char-legs").value=appearance.accent_colour;
  $("char-eyes").value=appearance.eye_colour;
  const p=$("character-preview");
  p.style.setProperty("--head",appearance.head_colour);
  p.style.setProperty("--body",appearance.body_colour);
  p.style.setProperty("--legs",appearance.accent_colour);
  p.style.setProperty("--eyes",appearance.eye_colour);
}
function readCharacterInputs(){
  appearance={head_colour:$("char-head").value,body_colour:$("char-body").value,accent_colour:$("char-legs").value,eye_colour:$("char-eyes").value};
}
["char-head","char-body","char-legs","char-eyes"].forEach(id=>$(id).addEventListener("input",()=>{readCharacterInputs();renderCharacterPreview();}));
$("character-save").addEventListener("click",async()=>{
  if(!authenticated){openAuth("login");toast("Log in to save your character.");return;}
  readCharacterInputs();
  try{
    const r=await api("/api/player/appearance",{method:"POST",body:JSON.stringify(appearance)});
    if(r&&r.body_colour)appearance={...DEFAULT_APPEARANCE,...r};
    renderCharacterPreview();
    sendPresence(true); // others see the new colours immediately
    toast("Character saved.");
  }catch(err){toast(err.message,true);}
});
function openCharacterDialog(){renderCharacterPreview();$("character-dialog").showModal();}
$("hud-character").addEventListener("click",openCharacterDialog);
$("hud-inventory").addEventListener("click",openInventoryDialog);
$("hud-studio").addEventListener("click",()=>$("studio-dialog").showModal());
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("close",()=>{
  // Exiting any menu back into the game re-grabs the cursor (best effort:
  // Chrome may refuse right after an Esc-exit — the HUD button covers it).
  // Never while dead: the corpse keeps the cursor free for the death screen.
  if(dveView&&!document.querySelector("dialog[open]")&&$("death-screen").hidden)dveView.grabPointer();
}));

// Cursor-grab button: visible only while the game is up and the cursor is
// free, so the player can hand the mouse back to the game after any release.
const grabBtn=$("hud-grab");
function syncGrabBtn(){grabBtn.hidden=!!document.pointerLockElement||!dveView||$("game").hidden||!$("death-screen").hidden;}
document.addEventListener("pointerlockchange",()=>{
  syncGrabBtn();
  // Escape while playing: Chrome exits pointer lock and swallows the key, so
  // this is where "Esc opens the pause menu" has to be handled. Only when the
  // release was not caused by opening a menu or leaving the game screen — and
  // never when it was death releasing it (the death screen owns that moment).
  if(!document.pointerLockElement&&dveView&&!$("game").hidden&&$("death-screen").hidden&&!document.querySelector("dialog[open]"))openPause();
});
setInterval(syncGrabBtn,500);
grabBtn.addEventListener("click",()=>{if(dveView)dveView.grabPointer();});

// ---- Shared world: server-authoritative 3D edit state --------------------------
// Base terrain is generated identically by the server and the DVE terrain
// mirror (dve/src/world.js ← backend/src/terrain.ts); worldEdits overlays the
// player edits keyed "x,y,z" (block_id 'air' = dug out). The generator worker
// fetches the initial edits from the API itself; this map exists so the walk
// camera and live WS echo see the same state.
const worldEdits=new Map();
let headSeq=0,ws=null,wsRetry=0,dveView=null,dveMod=null;
const lastWsFailed=()=>ws&&(ws.readyState===2||ws.readyState===3);
function cellBlock(x,y,z){const o=worldEdits.get(`${x},${y},${z}`);return o!==undefined?o:dveMod.baseBlock(x,y,z);}
// Single funnel for world edits: paint the voxel in the 3D view.
function noteEdit(x,y,z,blockId){
  worldEdits.set(`${x},${y},${z}`,blockId);
  if(dveView)dveView.applyEdit(x,y,z,blockId);
}
async function loadWorldAll(){
  const S=dveMod.SLAB;
  try{
    const data=await api(`/api/world?x0=${S.X0}&y0=${S.Y0}&z0=${S.Z0}&x1=${S.X1-1}&y1=${S.Y1-1}&z1=${S.Z1-1}&since=${headSeq}`);
    for(const edit of data.edits)noteEdit(edit.x,edit.y,edit.z,edit.block_id);
    for(const entry of data.log)noteEdit(entry.x,entry.y,entry.z,entry.block_id);
    headSeq=Math.max(headSeq,data.head);
    setConnection(true);
  }catch{setConnection(false);}
}
function connectLive(){
  ws=new WebSocket(API_BASE.replace(/^http/,"ws")+"/api/world/live");
  ws.onopen=()=>{wsRetry=0;setConnection(true);sendPresence(true);};
  ws.onmessage=event=>{try{const m=JSON.parse(event.data);
    if(m.type==="edit")noteEdit(m.x,m.y,m.z,m.block_id);
    else if(m.type==="roster"){for(const p of m.players||[])if(dveView&&p.name!==username)dveView.setRemote(p.name,p.x,p.y,p.z,p.yaw,p.appearance,p.vx,p.vy,p.vz);}
    else if(m.type==="pose"&&dveView&&m.name!==username)dveView.setRemote(m.name,m.x,m.y,m.z,m.yaw,m.appearance,m.vx,m.vy,m.vz);
    else if(m.type==="leave"&&dveView)dveView.removeRemote(m.name);
    else if(m.type==="mobs"&&dveView)applyMobSnapshot(m.mobs||[]);
    else if(m.type==="health")applyHealth(m);
    else if(m.type==="hurt")applyHealth(m);
    else if(m.type==="died")applyDeath(m);
    else if(m.type==="respawn")applyRespawn(m);
  }catch{/* ignore non-JSON frames */}};
  ws.onclose=()=>{setConnection(false);setTimeout(connectLive,Math.min(15000,500*2**wsRetry++));};
  ws.onerror=()=>{try{ws.close();}catch{/* already closed */}};
}
// Presence: advertise our pose ~4 Hz over the same socket (name identifies
// the player; the server fans poses out to everyone else). Velocities ride
// along so receivers can dead-reckon between frames instead of stepping.
let presenceAt=0,lastPose=null;
function sendPresence(force){
  if(!ws||ws.readyState!==1||!dveView)return;
  const p=dveView.pose;
  const now=Date.now();
  if(!force&&now-presenceAt<250)return;
  let vx=0,vy=0,vz=0;
  if(lastPose){
    const dt=Math.max(0.05,(now-lastPose.t)/1000);
    vx=(p.x-lastPose.x)/dt;vy=(p.y-lastPose.y)/dt;vz=(p.z-lastPose.z)/dt;
  }
  lastPose={t:now,x:p.x,y:p.y,z:p.z};
  presenceAt=now;
  try{ws.send(JSON.stringify({type:"pose",name:username||"someone",x:p.x,y:p.y,z:p.z,yaw:p.yaw,appearance,vx,vy,vz}));}catch{/* racing a close */}
}
setInterval(sendPresence,250);

// ---- Mobs + health ------------------------------------------------------------
// The WorldLive object simulates mobs and owns health; this client renders the
// snapshot and reports attacks. `mobs` arrives ~4 Hz with the full live list.
function applyMobSnapshot(list){
  const seen=new Set();
  for(const mob of list){
    seen.add(mob.id);
    dveView.setMob(mob.id,mob.kind||"slime",Number(mob.x)||0,Number(mob.y)||0,Number(mob.z)||0,Number(mob.yaw)||0,mob.hostile===true);
  }
  for(const id of mobSnapshot.keys())if(!seen.has(id)){dveView.removeMob(id);mobSnapshot.delete(id);}
  for(const mob of list)mobSnapshot.set(mob.id,mob);
}
function applyHealth(m){
  const value=Number(m.health);
  const amount=Number(m.amount)||0;
  if(amount>0)flashDamage();
  // The object is authoritative: use its health when the frame carries it,
  // otherwise apply the reported damage locally until the health frame lands.
  health=Number.isFinite(value)?Math.max(0,Math.min(MAX_HEALTH,value)):Math.max(0,health-amount);
  if(health<=0){applyDeath(m);return;}
  if(dead)hideDeath();
  renderHealth();
}
function applyDeath(m){
  health=0;
  renderHealth();
  if(!dead)showDeath(m&&m.by?`A ${String(m.by).replace(/_/g," ")} got you.`:null);
}
function applyRespawn(m){
  health=Math.max(1,Math.min(MAX_HEALTH,Number(m.health)||MAX_HEALTH));
  hideDeath();
  if(m.state&&dveView)dveView.setPose(m.state);
  renderHealth();
}
function flashDamage(){
  const el=$("damage-flash");
  if(!el)return;
  el.classList.remove("hit");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("hit");
}
// Left-click with a weapon/tool aimed at a mob is an attack, not a block break.
function attackMobUnderCrosshair(){
  const meta=selectedItem?itemMeta(selectedItem):null;
  if(!meta||(meta.kind!=="weapon"&&meta.kind!=="tool"))return false;
  if(!dveView.pickMob)return false;
  const mob=dveView.pickMob();
  if(!mob)return false;
  if(ws&&ws.readyState===1){
    try{ws.send(JSON.stringify({type:"attack",mob_id:mob.id,item_id:selectedItem}));}catch{/* racing a close */}
    return true;
  }
  return false;
}
// Food: right-click (or F) with a food item selected eats one unit.
async function eatSelected(){
  const meta=selectedItem?itemMeta(selectedItem):null;
  if(!meta||meta.kind!=="food"){toast("Select a food item to eat.",true);return;}
  if(health>=MAX_HEALTH){toast("You are already at full health.",true);return;}
  try{
    const data=await api("/api/player/eat",{method:"POST",body:JSON.stringify({item_id:selectedItem})});
    health=Math.max(0,Math.min(MAX_HEALTH,Number(data.health)||health));
    renderHealth();
    await refreshInventory();
    toast(`Ate ${meta.name}.`);
  }catch(err){toast(err.message,true);}
}
// While the socket is down, polling (since=headSeq) fills the gap.
setInterval(()=>{if(!ws||ws.readyState>1)loadWorldAll();},4000);

async function worldAction(button,x,y,z){
  if(!authenticated){openAuth("login");toast("Log in to build in the shared world.");return;}
  try{
    if(button===2){
      const data=await api("/api/world/break",{method:"POST",body:JSON.stringify({x,y,z})});
      toast(`Broke ${data.dropped} at ${x} ${y} ${z} — +1 item.`);
    }else{
      if(!selectedItem){toast("Pick an item from your inventory or hotbar first.",true);return;}
      await api("/api/world/place",{method:"POST",body:JSON.stringify({x,y,z,item_id:selectedItem})});
      toast(`Placed ${selectedItem} at ${x} ${y} ${z}.`);
    }
    await refreshInventory();
  }catch(err){toast(err.message,true);}
}

// ---- Fullscreen 3D game (Divine Voxel Engine, ./dve/dist/) -------------------
// Server-authoritative: every click goes through /api/world/place|break and
// paints via the WS echo (noteEdit → applyEdit). The DVE module handles look
// (pointer lock or drag), WASD walking with gravity + Space jump, and picking.

// One source for the control brief: the join overlay and the Instructions menu
// (main menu + pause menu) both render this exact string.
const JOIN_HELP_MS = 10_000;
const KEYS_HELP = 'In game: <b>WASD</b> move · <b>Shift</b> sprint · mouse look · <b>Space</b> jump · <b>1–9</b> hotbar · left-click break/attack · right-click place · <b>F</b> eat · <b>C</b> character · <b>I</b> inventory · <b>B</b> studio · <b>Esc</b> menu';
$("join-help").innerHTML = KEYS_HELP;
$("instructions-body").innerHTML = KEYS_HELP;
let joinHelpTimer = null;
// The overlay is two independent things: the engine status line (hidden when
// the view is ready) and the control brief (hidden after JOIN_HELP_MS). The
// brief is a timer, not a load gate — a fast build must not trap it, a slow
// one must not hide it early — so the box itself only goes away when both are
// done.
function syncLoadingOverlay() { $("game-loading").hidden = $("game-loading-text").hidden && $("join-help").hidden; }
function showJoinHelp() {
  clearTimeout(joinHelpTimer);
  $("game-loading").hidden = false;
  $("game-loading-text").hidden = false;
  $("game-loading-text").textContent = "starting 3D engine…";
  $("join-help").hidden = false;
  joinHelpTimer = setTimeout(() => { $("join-help").hidden = true; syncLoadingOverlay(); }, JOIN_HELP_MS);
}
function openInstructions() { $("instructions-dialog").showModal(); }
$("mm-instructions").addEventListener("click", openInstructions);
$("pause-instructions").addEventListener("click", openInstructions);

async function initGameView(){
  if(!window.WebGLRenderingContext)throw new Error("WebGL unavailable in this browser");
  showJoinHelp();
  let spawn=null;
  try{
    const r=await api("/api/player/state");
    spawn=r.state;
    if(r.appearance)appearance={...DEFAULT_APPEARANCE,...r.appearance};
    if(Number.isFinite(Number(r.health))){health=Math.max(0,Math.min(MAX_HEALTH,Number(r.health)));}
  }catch{/* default spawn on surface */}
  dveView=await dveMod.createDVEView($("game-canvas"),currentBlocks,API_BASE,{
    settings:viewSettings(),
    cellAt:(x,y,z)=>cellBlock(x,y,z),
    spawn:spawn||undefined,
  });
  $("game-loading-text").hidden=true;
  syncLoadingOverlay();
  // A player who left while dead comes back dead: the object already ignores
  // their pose frames, so the client shows the death screen and parks the body.
  if(health<=0)applyDeath(null);else hideDeath();
  renderHealth();
  startStateSaver();
  // Presence: advertise ourselves and pull the current roster of players.
  if(ws&&ws.readyState===1){try{ws.send(JSON.stringify({type:"who"}));}catch{}sendPresence(true);}
}
// Persist position/look every 2s while the pose moves; restored on rejoin.
let stateTimer=null,lastSavedPose="";
function startStateSaver(){
  clearInterval(stateTimer);
  stateTimer=setInterval(async()=>{
    if(!authenticated||!dveView)return;
    const p=dveView.pose;
    const key=`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    if(key===lastSavedPose)return;
    lastSavedPose=key;
    try{await api("/api/player/state",{method:"POST",body:JSON.stringify({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch})});}catch{/* retried next tick */}
  },2000);
}
function failGame(err){
  // The engine never became ready, so the status line stays up; the control
  // brief still retires on its own timer.
  $("game-loading").hidden=false;
  $("game-loading-text").hidden=false;
  $("game-loading-text").textContent=`3D engine unavailable: ${err&&err.message||err}`;
}

// Look/move/jump physics live in the DVE module (pointer lock or drag, WASD,
// gravity + Space). This layer only handles clicks and UI keys.

// Click = action (break/place at the crosshair), press-and-move = look (the
// DVE module handles look via pointer lock or drag; a click without movement
// is the trigger here).
let downAt=null,downButton=0;
const gameCanvas=$("game-canvas");
gameCanvas.addEventListener("contextmenu",e=>e.preventDefault());
gameCanvas.addEventListener("pointerdown",e=>{downAt={x:e.clientX,y:e.clientY,t:Date.now()};downButton=e.button;});
gameCanvas.addEventListener("pointerup",async e=>{
  if(!downAt||e.button!==downButton){downAt=null;return;}
  const moved=Math.abs(e.clientX-downAt.x)+Math.abs(e.clientY-downAt.y);
  const quick=Date.now()-downAt.t<600;
  downAt=null;
  if(!dveView||moved>=8||!quick||e.button>2)return;
  // In-game axis: left = break, right = place.
  await gameAction(e.button===0?2:0);
});
async function gameAction(button){
  if(dead){toast("You are dead — respawn first.",true);return;}
  // Left-click aimed at a mob, holding a weapon or tool: attack, don't dig.
  if(button===2&&attackMobUnderCrosshair())return;
  let hit=null;
  try{hit=await dveView.pickCenter();}catch{/* pick failed: treat as nothing in reach */}
  if(!hit||!hit.position){toast("Nothing in reach — aim the crosshair at a block.",true);return;}
  const cell=button===0?hit.normalPosition:hit.position; // place: the adjacent face; break: the hit block
  const x=cell.x|0,y=cell.y|0,z=cell.z|0;
  const S=dveMod.SLAB;
  if(x<S.X0||x>=S.X1||y<S.Y0||y>=S.Y1||z<S.Z0||z>=S.Z1){toast("That is outside the world.",true);return;}
  if(button===0&&dveView.bodyCellOverlap(x,y,z)){toast("That block would be inside you.",true);return;}
  await worldAction(button,x,y,z);
}

// HUD: pose readout.
setInterval(()=>{
  if(dveView){
    const p=dveView.pose;
    $("hud-coords").textContent=`x ${Math.round(p.x)} · y ${Math.round(p.y)} · z ${Math.round(p.z)}`;
  }
},500);

// Game keyboard: hotbar 1–9, dialogs. (Look/move/jump keys live in the
// DVE module's own listeners; this layer only opens UI.)
document.addEventListener("keydown",e=>{
  if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;
  if(document.querySelector("dialog[open]")){
    if(e.key==="Escape")document.querySelector("dialog[open]").close(); // modals: Esc closes
    return;
  }
  if(e.key==="Escape"){
    // While the pointer is locked Chrome consumes Escape itself (it exits the
    // lock without firing a keydown), and the pointerlockchange handler opens
    // the pause menu there; this branch covers the unlocked case. A corpse has
    // nothing to pause: the death screen owns the keyboard until respawn.
    if($("death-screen").hidden)openPause();
    return;
  }
  if(e.key==="c"||e.key==="C"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();openCharacterDialog();return;}
  if(e.key==="i"||e.key==="I"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();openInventoryDialog();return;}
  if(e.key==="b"||e.key==="B"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();$("studio-dialog").showModal();return;}
  if(e.key==="f"||e.key==="F"){e.preventDefault();eatSelected();return;}
  if(/^Digit[1-9]$/.test(e.code)){
    const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b)).slice(0,9);
    const entry=entries[Number(e.code.slice(5))-1];
    if(!entry)return;
    selectItem(entry[0]===selectedItem?null:entry[0]);
  }
});

// ---- Boot: main menu first; Join starts the game -----------------------------
async function boot(){
  updateServerChip();
  updateAccountChip();
  restoreSession();
  connectLive();
  $("mm-join").textContent = settings.server === "local" && isLocalPage ? "Join local server" : "Join global server";
  $("main-menu").addEventListener("cancel", e => e.preventDefault()); // landing stays until Join
  $("mm-join").addEventListener("click", async () => {
    $("main-menu").close();
    $("game").hidden = false;
    if (dveView) {           // returning from the game to the menu and back
      dveView.resize();
      dveView.grabPointer();
      return;
    }
    try {
      const { DVE_REV } = await import("./dve/dist/rev.js");
      dveMod = await import(`./dve/dist/dve-view.js?h=${DVE_REV["dve-view.js"]}`);
      await refreshRegistry();      // textures come from the block registry
      await loadWorldAll();         // player edits made before this session
      await initGameView();
      dveView.grabPointer();        // cursor goes to the game (user gesture)
    } catch (err) {
      failGame(err);
      $("game").hidden = true;
      $("main-menu").showModal();
    }
  });
  $("mm-settings").addEventListener("click", () => { syncSettingsInputs(); $("settings-dialog").showModal(); });
  $("main-menu").showModal();
}
boot();
