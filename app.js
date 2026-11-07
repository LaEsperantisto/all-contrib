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
function setAuthenticatedUser(name){
  username=name;
  authenticated=true;
  localStorage.setItem("ac_username",name);
  updateAccountChip();
  renderInventory();
  renderCrafting();
  renderMyBlocks();
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
    const [blocks,recipes]=await Promise.all([api("/api/blocks"),api("/api/recipes")]);
    setConnection(true);
    currentBlocks=Array.isArray(blocks.blocks)?blocks.blocks:[];
    currentRecipes=Array.isArray(recipes.recipes)?recipes.recipes:[];
    renderInventory();renderCrafting();renderMyBlocks();
  }catch(err){
    setConnection(false);currentBlocks=[];currentRecipes=[];
    renderInventory();$("crafting-list").innerHTML='<div class="empty">Recipes are unavailable until the API reconnects.</div>';
    renderMyBlocks();
  }
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
  selectItem(selectedItem===row.dataset.itemId?null:row.dataset.itemId);
});
$("clear-inventory-button").addEventListener("click",async()=>{
  if(!authenticated){openAuth("login");return;}
  try{await api("/api/inventory/clear",{method:"POST",body:"{}"});await refreshInventory();toast("Inventory cleared.");}
  catch(err){toast(err.message,true);}
});
function blockById(id){return currentBlocks.find(block=>block.id===id);}
function selectItem(id){
  selectedItem=id;
  renderInventory();renderHotbar();
  $("hud-held").textContent=selectedItem?(blockById(selectedItem)||{name:selectedItem}).name:"no item";
}
function renderInventory(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b));
  const total=entries.reduce((sum,[,quantity])=>sum+quantity,0);
  $("inventory-total").textContent=`${total} item${total===1?"":"s"}`;
  renderHotbar();
  if(!entries.length){$("inventory-list").innerHTML=`<div class="empty">${authenticated?"Your inventory is empty. Break blocks in the world or add items above.":"Log in — your inventory lives on your account."}</div>`;return;}
  $("inventory-list").innerHTML=entries.map(([id,quantity])=>{
    const block=blockById(id);const label=block?block.name:id;const colour=block&&/^#[0-9a-f]{6}$/i.test(block.colour)?block.colour:"#64748b";
    const selected=id===selectedItem?" selected":"";
    return `<div class="inventory-item${selected}" data-item-id="${escapeAttr(id)}"><span class="swatch" style="background:${escapeAttr(colour)}"></span><div class="item-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small></div><span class="item-quantity">×${quantity}</span><button class="remove-item" type="button" data-remove-item="${escapeAttr(id)}" aria-label="Remove one ${escapeAttr(id)}">−1</button></div>`;
  }).join("");
}

// Hotbar: first nine stacks, selectable with 1–9 or a click while in game.
function renderHotbar(){
  const entries=Object.entries(inventory).sort(([a],[b])=>a.localeCompare(b)).slice(0,9);
  $("hotbar").innerHTML=entries.map(([id,quantity],i)=>{
    const block=blockById(id);const colour=block&&/^#[0-9a-f]{6}$/i.test(block.colour)?block.colour:"#64748b";
    const selected=id===selectedItem?" hotbar-selected":"";
    return `<div class="hotbar-slot${selected}" data-slot-id="${escapeAttr(id)}" title="${escapeAttr(block?block.name+" — "+id:id)}"><span class="hotbar-key">${i+1}</span><span class="swatch" style="background:${escapeAttr(colour)}"></span><span class="hotbar-qty">${quantity}</span></div>`;
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

$("recipe-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a recipe.");return;}
  const body={name:$("recipe-name").value,ingredients:$("recipe-ingredients").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean),result_id:$("recipe-result").value.trim().toLowerCase(),quantity:Number($("recipe-quantity").value)};
  try{await api("/api/recipes",{method:"POST",body:JSON.stringify(body)});toast("Recipe published.");e.target.reset();$("recipe-quantity").value=1;await refreshRegistry();}
  catch(err){toast(err.message,true);}
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
$("hud-inventory").addEventListener("click",openInventoryDialog);
$("hud-studio").addEventListener("click",()=>$("studio-dialog").showModal());
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("close",()=>{
  // Exiting any menu back into the game re-grabs the cursor (best effort:
  // Chrome may refuse right after an Esc-exit — the HUD button covers it).
  if(dveView&&!document.querySelector("dialog[open]"))dveView.grabPointer();
}));

// Cursor-grab button: visible only while the game is up and the cursor is
// free, so the player can hand the mouse back to the game after any release.
const grabBtn=$("hud-grab");
function syncGrabBtn(){grabBtn.hidden=!!document.pointerLockElement||!dveView||$("game").hidden;}
document.addEventListener("pointerlockchange",syncGrabBtn);
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
    else if(m.type==="roster")for(const p of m.players||[])if(dveView&&p.name!==username)dveView.setRemote(p.name,p.x,p.y,p.z,p.yaw);
    else if(m.type==="pose"&&dveView&&m.name!==username)dveView.setRemote(m.name,m.x,m.y,m.z,m.yaw);
    else if(m.type==="leave"&&dveView)dveView.removeRemote(m.name);
  }catch{/* ignore non-JSON frames */}};
  ws.onclose=()=>{setConnection(false);setTimeout(connectLive,Math.min(15000,500*2**wsRetry++));};
  ws.onerror=()=>{try{ws.close();}catch{/* already closed */}};
}
// Presence: advertise our pose ~4 Hz over the same socket (name identifies
// the player; the server fans poses out to everyone else).
let presenceAt=0;
function sendPresence(force){
  if(!ws||ws.readyState!==1||!dveView)return;
  const p=dveView.pose;
  if(!force&&Date.now()-presenceAt<250)return;
  presenceAt=Date.now();
  try{ws.send(JSON.stringify({type:"pose",name:username||"someone",x:p.x,y:p.y,z:p.z,yaw:p.yaw}));}catch{/* racing a close */}
}
setInterval(sendPresence,250);
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
async function initGameView(){
  if(!window.WebGLRenderingContext)throw new Error("WebGL unavailable in this browser");
  let spawn=null;
  try{const r=await api("/api/player/state");spawn=r.state;}catch{/* default spawn on surface */}
  dveView=await dveMod.createDVEView($("game-canvas"),currentBlocks,API_BASE,{
    settings:viewSettings(),
    cellAt:(x,y,z)=>cellBlock(x,y,z),
    spawn:spawn||undefined,
  });
  $("game-loading").hidden=true;
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
    if(document.pointerLockElement)document.exitPointerLock();
    else openPause();
    return;
  }
  if(e.key==="e"||e.key==="E"||e.key==="i"||e.key==="I"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();openInventoryDialog();return;}
  if(e.key==="b"||e.key==="B"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();$("studio-dialog").showModal();return;}
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
