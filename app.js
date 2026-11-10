// All Contribute frontend: fullscreen 3D game boots immediately; menus live
// in dialogs (Esc opens the pause menu). The world is server-authoritative:
// edits go through /api/world/place|break and paint only from the server echo.
const $ = (id) => document.getElementById(id);

// ---- Settings + server selection ------------------------------------------------
// `render` is the whole look switch: "flat" paints every block its registry
// colour and shows colour swatches for items; "detailed" uses the textures,
// 3D models and item icons an author published. Changing it re-takes effect on
// the next Join (vlox textures are compiled when the world is created).
// Opening the page from a machine's own address — localhost, 127.x, a LAN
// address — means that machine's dev Worker is the API you mean; a page served
// over https can only reach the published Worker (http would be mixed content).
// Local hosting includes a LAN address: opening the game from
// http://192.168.1.20:8000 has to be able to reach that machine's API.
const isLocalPage = /^(localhost|127\.|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(location.hostname);
const DEFAULT_SETTINGS = { server: isLocalPage ? "local" : "global", serverId: "global", sens: 5, fov: 80, distance: 900, speed: 8, render: "detailed" };
// Ten quick-select slots: keys 1-9 then 0.
const HOTBAR_SLOTS = 10;
let settings = { ...DEFAULT_SETTINGS };
try {
  const raw = JSON.parse(localStorage.getItem("ac_settings") || "{}");
  if (raw && typeof raw === "object") settings = { ...settings, ...raw };
} catch { /* defaults */ }
// The API choice is not a setting any more: a page served from a machine's own
// address (localhost, 127.x, a LAN address) talks to that machine's dev Worker;
// any other page can only reach the published Worker. Opening
// http://127.0.0.1:8000 and signing into a dev account is then enough — there is
// no hidden switch to find first.
settings.server = isLocalPage ? "local" : "global";
if (typeof settings.serverId !== "string" || !settings.serverId) settings.serverId = "global";
if (!["flat", "detailed"].includes(settings.render)) settings.render = "detailed";
delete settings.mode; delete settings.flySpeed; // legacy keys from older builds
function saveSettings() { localStorage.setItem("ac_settings", JSON.stringify(settings)); }
// A private server belongs to the device that created it. The token is random
// and lives only in this browser; the API keeps its SHA-256 hash, so a leaked
// row never hands out the key. Sent on every request as `X-AC-Device`.
if (!/^[0-9a-f]{32,}$/.test(String(settings.device || ""))) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  settings.device = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  saveSettings();
}
// `ac_api_port` lets the offline proof harness run the local worker on a
// spare port when the dev API already owns 8787; it only ever applies on a
// localhost page (same gate as the local server choice itself).
let API_BASE = settings.server === "local" && isLocalPage
  ? `http://${location.hostname}:${Number(localStorage.getItem("ac_api_port")) || 8787}`
  : "https://all-contrib.all-contrib.workers.dev";
function updateServerChip() {
  const label = settings.serverId !== "global"
    ? serverTitle(serverRows.find(s => s.id === settings.serverId) || { id: settings.serverId, name: settings.serverId, visibility: "private" })
    : (settings.server === "local" && isLocalPage ? "local dev" : "global");
  $("hud-server").textContent = `server: ${label}`.toLowerCase();
  $("pause-server-chip").textContent = `Server: ${label}`;
  $("mm-server-chip").textContent = `Server: ${label}`;
}
// ---- Servers: the global world plus worlds a player hosts ------------------
// A server is a scoped world: its own blocks, clock, mobs and spawn points.
// `global` is the shared world and needs no id anywhere, so an unconfigured
// client behaves exactly as before. Visibility decides who may reach it:
// private = this device's token, LAN = the same local network, public = anyone.
let serverRows = [];
let pendingServerDelete = null;
function serverTitle(s) {
  const v = s.visibility === "lan" ? "LAN" : s.visibility === "public" ? "public" : "private";
  if (s.id === "global") return "Global — everyone";
  return `${s.name} (${v})`;
}
// Which world a request is about. Omitted for the global world so old
// deployments and other clients keep working unchanged.
const srvQS = () => `&server=${encodeURIComponent(settings.serverId)}`;
const srvBody = (extra = {}) => ({ ...extra, server: settings.serverId });
async function refreshServers() {
  try {
    const d = await api("/api/servers");
    serverRows = Array.isArray(d.servers) ? d.servers : [];
  } catch { serverRows = []; }   // offline or not signed in: only the global world
  window.__servers = serverRows;   // the worlds this device can reach, by id
  renderServerPicker();
}
function renderServerPicker() {
  const sel = $("mm-server-list");
  if (!sel) return;
  const rows = [{ id: "global", visibility: "public" }, ...serverRows.filter(s => s.id !== "global")];
  sel.innerHTML = "";
  for (const s of rows) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = serverTitle(s);
    sel.appendChild(o);
  }
  if (!rows.some(s => s.id === settings.serverId)) settings.serverId = "global";
  sel.value = settings.serverId;
  const mine = serverRows.find(s => s.id === settings.serverId);
  const del = $("mm-server-delete");
  del.hidden = !(mine && mine.mine);
  del.textContent = pendingServerDelete === settings.serverId ? "Delete again to confirm" : "Delete";
  updateServerChip();
  updateJoinLabel();
}
function updateJoinLabel() {
  if (settings.serverId !== "global") { $("mm-join").textContent = `Join ${serverTitle({ id: settings.serverId, name: (serverRows.find(s => s.id === settings.serverId) || {}).name || settings.serverId, visibility: (serverRows.find(s => s.id === settings.serverId) || {}).visibility })}`; return; }
  $("mm-join").textContent = settings.server === "local" && isLocalPage ? "Join local server" : "Join global server";
}
const CS_NOTES = {
  private: "Only this browser can join it: the world is locked to a key kept in this device's storage. Nothing is shared, not even with your other devices.",
  lan: "Other devices on the same local network can see and join it. Open the game from that machine's address — for example http://192.168.1.20:8000 — and every device on that network reaches it.",
  public: "Anyone who can reach this site's API can see and join it. To carry the world traffic yourself, run the server on your own machine, open the game from its address, and forward port 8787 on your router to it.",
};
$("mm-server-list").addEventListener("change", () => {
  settings.serverId = $("mm-server-list").value;
  pendingServerDelete = null;
  saveSettings();
  liveReconnect();  // the pose socket is baked to a world at dial; it must follow the picker
  refreshInventory();  // the bag is per-world: switching worlds switches it
  renderServerPicker();
});
$("mm-server-create").addEventListener("click", () => {
  if (!authenticated) { toast("Log in to create a server.", true); return; }
  $("cs-name").value = "";
  // On a local run the machine IS the server and nobody else can reach it:
  // private is the honest default, and the note says where the world lives.
  $("cs-visibility").value = isLocalPage ? "private" : "public";
  $("cs-note").textContent = isLocalPage
    ? "This machine is the server: the world lives in its local database and stays on this computer."
    : CS_NOTES.public;
  $("create-server").showModal();
});
$("cs-visibility").addEventListener("change", () => { $("cs-note").textContent = CS_NOTES[$("cs-visibility").value] || ""; });
$("cs-cancel").addEventListener("click", () => $("create-server").close());
$("cs-create").addEventListener("click", async () => {
  const name = $("cs-name").value.trim();
  if (!name) { toast("Give the server a name.", true); return; }
  let r = null;
  try {
    r = await api("/api/servers", { method: "POST", body: JSON.stringify({ name, visibility: $("cs-visibility").value }) });
  } catch (err) { toast(err.message, true); return; }
  if (!r || !r.server) { toast((r && r.error) || "The server was not created.", true); return; }
  $("create-server").close();
  settings.serverId = r.server.id;
  saveSettings();
  liveReconnect();
  await refreshServers();
  toast(`Created “${r.server.name}”. Join when you are ready.`);
});
$("mm-server-delete").addEventListener("click", async () => {
  const id = settings.serverId;
  if (id === "global") return;
  if (pendingServerDelete !== id) { pendingServerDelete = id; renderServerPicker(); return; }  // two-step, no native confirm
  try {
    await api(`/api/servers/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) { toast(err.message, true); return; }
  pendingServerDelete = null;
  settings.serverId = "global";
  saveSettings();
  liveReconnect();
  await refreshServers();
  toast("Server deleted — its world is gone.");
});
// Sensitivity slider 1..10 → radians per pixel; FOV degrees → Babylon vertical rad.
const viewSettings = () => ({
  sensitivity: settings.sens * 0.00046,
  fov: settings.fov * Math.PI / 180 * 0.72,
  renderDistance: settings.distance,
  speed: settings.speed,
  render: settings.render,
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
// player_state.health); this is the mirror the HUD renders. 0 = dead. The object
// also sends a health frame when a socket's stored health is first loaded, so a
// join never starts from a guessed number.
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
    await api("/api/inventory/add", { method: "POST", body: JSON.stringify({ item_id: id, quantity, server: "global" }) }).catch(() => null);
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
    const data = await api(`/api/inventory?server=${encodeURIComponent(settings.serverId)}`);
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
  const headers={"Content-Type":"application/json","X-AC-Request":"1","X-AC-Device":settings.device,...(options.headers||{})};
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
  const label = authenticated && username
    ? (settings.serverId === "global" ? username : `${username} @ ${serverTitle(serverRows.find(s => s.id === settings.serverId) || { name: settings.serverId, visibility: "private" })}`)
    : "not signed in";
  $("pause-account-chip").textContent = label;
  $("mm-account-chip").textContent = label;
}
// The admin account is literally named "admin" — that exact username is the
// whole role. Inventory surgery (test items, −1, clear) is admin-only and the
// Worker enforces the same rule, so a tampered DOM cannot reach it.
function isAdmin(){return authenticated&&String(username||"") === "admin";}
// Who may run this world: the site admin anywhere, and the player who created
// the server you are standing on. The global world has no owner, so only the
// admin can dial it.
function ownsCurrentServer(){return settings.serverId!=="global"&&!!(serverRows.find(s=>s.id===settings.serverId)||{}).mine;}
function canControlWorld(){return isAdmin()||ownsCurrentServer();}
function renderAdminTools(){
  $("add-item-form").hidden=!isAdmin();
  $("add-item-note").hidden=!isAdmin();
  $("clear-inventory-button").hidden=!isAdmin();
  $("admin-resync").hidden=!canControlWorld();
  const owner=!isAdmin()&&ownsCurrentServer();
  $("admin-eyebrow").textContent=owner?"YOUR SERVER":"ADMIN";
  $("admin-title").textContent=owner?"Server settings":"Admin settings";
  renderTimePanel();
}
// The world's clock: `phase` 0..1 through the in-game day (0 = midnight), or
// null while the sun still runs it off each machine's wall clock. The live
// socket delivers it — at join and whenever the admin dials it.
let worldClock=null;
function applyClock(m){
  worldClock={phase:m&&m.phase===undefined?null:m.phase,running:!(m&&m.running===false)};
  if(dveView)dveView.setClock(worldClock.phase,worldClock.running);
  renderTimePanel();
}
const clockLabel=()=>{
  const t=dveView?dveView.clock:{phase:null,running:true,set:false};
  const phase=typeof t.phase==="number"?t.phase:null;
  if(phase===null)return"the sun's clock";
  const mins=Math.round(phase*24*60)%1440;
  return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}${t.running?"":" · stopped"}`;
};
function renderTimePanel(){
  const readout=$("time-readout");
  if(readout)readout.textContent=clockLabel();
  const freeze=$("time-freeze");
  if(freeze)freeze.textContent=(worldClock&&worldClock.running===false)?"Start the cycle":"Stop the cycle";
  const slider=$("time-slider");
  if(slider&&worldClock&&typeof worldClock.phase==="number")slider.value=String(worldClock.phase);
}
// Dial the clock. The Worker answers with the same shape the live socket
// broadcasts, so applying it here is idempotent — and it is what makes the
// admin's own screen change without waiting for the frame to come back.
async function setTime(body){
  if(!canControlWorld()){toast("Only the admin or the owner of this server can set the time of day.",true);return;}
  let r=null;
  try{r=await api("/api/time",{method:"POST",body:JSON.stringify(srvBody(body))});}
  catch(err){toast(err.message,true);return;}
  if(!r||r.ok!==true){toast(r&&(r.error||"The clock did not move."),true);return;}
  applyClock(r);
  toast(`Time of day: ${clockLabel()}.`);
}
// A push is only as good as the socket that carries it. The frame arrives when
// a socket opens and whenever the dial moves, but a client that happened to be
// mid-reconnect at that moment would keep the old sky forever — and only the
// admin's own screen would be right, because it made the request. So the phase
// is pulled as well as pushed: at join, on every reconnect, and whenever the
// admin opens the dial.
async function syncClock(){
  if(!dveView)return;
  try{applyClock(await api(`/api/time?server=${encodeURIComponent(settings.serverId)}`));}
  catch{/* keep whatever the socket last said */}
}
// Health bar: ten hearts, half hearts allowed (health is 0..20 server units).
function renderHealth(){
  const hearts=$("hud-health");
  if(!hearts)return;
  const full=Math.floor(health/2), half=health-full*2>=1?1:0;
  let out='<span class="hud-health-label">♥</span>';
  // "bare" not "empty": the generic .empty placeholder rule (padding, dashed
  // border) would otherwise inflate the unfilled hearts' border box.
  for(let i=0;i<10;i++)out+=`<span class="heart ${i<full?"full":i===full&&half?"half":"bare"}"></span>`;
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
    const data=await api("/api/player/respawn",{method:"POST",body:JSON.stringify(srvBody())});
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
  void refreshServers();
  $("main-menu").showModal();
  if(dveView)dveView.releaseInput();
  $("game").hidden=true;
  syncGrabBtn();
});
function liveReconnect(){
  // Presence identity is the login, and the world object only ever sees the
  // headers the socket arrived with. A socket opened before this login (or kept
  // after a logout) is still that guest, so re-handshake it: the close handler
  // dials a new one, which arrives carrying the session.
  if(!ws||ws.readyState>1)return;
  wsRetry=0;
  try{ws.close();}catch{}
}
// Joining reads your account before you have necessarily signed in, and the
// body built by that join is painted with the plain default colours. The look
// belongs to the account, so signing in mid-game has to repaint your own body
// with the saved colours, exactly like signing in refreshes your bag.
async function refreshSelfLook(){
  if(!dveView)return;
  try{
    const r=await api(`/api/player/state?server=${encodeURIComponent(settings.serverId)}`);
    if(r&&r.appearance){
      appearance={...DEFAULT_APPEARANCE,...r.appearance};
      dveView.setSelfAppearance(appearance);
    }
  }catch{}
}
function setAuthenticatedUser(name){
  username=name;
  authenticated=true;
  localStorage.setItem("ac_username",name);
  liveReconnect();
  updateAccountChip();
  renderInventory();
  renderCrafting();
  renderMyBlocks();
  renderMyItems();
  renderMyRecipes();
  renderAdminTools();
  refreshSelfLook();
  void refreshServers();   // your own worlds appear once you are signed in
  migrateLegacyInventory().then(refreshInventory);
}
function clearAuthenticatedUser(){
  authenticated=false;
  username=null;
  localStorage.removeItem("ac_username");
  liveReconnect();
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
// One Account button on the landing, exactly like the pause menu's: signed out
// it opens the auth form, signed in it opens the account dialog
// (openAccountDialog branches on `authenticated`). The auth form opens over
// the landing rather than replacing it: closing the landing would leave
// nowhere to press Join after signing in.
$("mm-account").addEventListener("click",openAccountDialog);
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
    setModelOptions(blocks.models);
    currentBlocks=Array.isArray(blocks.blocks)?blocks.blocks:[];
    currentItems=Array.isArray(items.items)?items.items:[];
    currentRecipes=Array.isArray(recipes.recipes)?recipes.recipes:[];
    renderDropItemOptions();
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
    await api("/api/inventory/add",{method:"POST",body:JSON.stringify(srvBody({item_id:id,quantity}))});
    $("add-item-id").value="";$("add-item-quantity").value="16";
    await refreshInventory();
    toast(`Added ${quantity} × ${id} to your inventory.`);
  }catch(err){toast(err.message,true);}
});
$("inventory-list").addEventListener("click",async e=>{
  const remove=e.target.closest("[data-remove-item]");
  if(remove){
    try{await api("/api/inventory/remove",{method:"POST",body:JSON.stringify(srvBody({item_id:remove.dataset.removeItem,quantity:1}))});await refreshInventory();}
    catch(err){toast(err.message,true);}
    return;
  }
  const row=e.target.closest("[data-item-id]");
  if(!row||!authenticated)return;
  selectItem(selectedItem===row.dataset.itemId?null:row.dataset.itemId);
});
$("clear-inventory-button").addEventListener("click",async()=>{
  if(!authenticated){openAuth("login");return;}
  try{await api("/api/inventory/clear",{method:"POST",body:JSON.stringify(srvBody())});await refreshInventory();toast("Inventory cleared.");}
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
// The colour of the item in hand — what other players see on your avatar's
// cube, and what third person paints on your own.
function heldColour(id){
  const meta=id?itemMeta(id):null;
  return meta&&/^#[0-9a-f]{6}$/i.test(String(meta.colour||""))?meta.colour:null;
}
// The uploaded icon of an item, when it has one: the same data-URL the bag
// cards show, used for the held HUD, the hand cube and the pose frames.
function iconUrl(id){
  const meta=id?itemMeta(id):null;
  return meta&&SAFE_IMAGE.test(meta.icon||"")?meta.icon:null;
}
// The Minecraft-style bottom-right readout: the selected item's own image
// (icon when the registry has one, its colour swatch otherwise) and name.
function paintHeldHud(){
  const id=selectedItem,meta=id?itemMeta(id):null;
  const name=$("hud-held-name"),icon=$("hud-held-icon");
  if(name)name.textContent=meta?`${meta.name}${KIND_LABEL[meta.kind]?` · ${KIND_LABEL[meta.kind]}`:""}`:(id||"no item");
  if(icon)icon.innerHTML=iconUrl(id)?`<img src="${iconUrl(id)}" alt="">`:
    `<span class="hud-held-swatch" style="background:${meta&&/^#[0-9a-f]{6}$/i.test(meta.colour||"")?meta.colour:"#999"}"></span>`;
}
function selectItem(id){
  selectedItem=id;
  renderInventory();renderHotbar();
  paintHeldHud();
  if(dveView)dveView.setSelfHeld(heldColour(id),iconUrl(id));
}
function renderInventory(){
  // The server returns the player's own arrangement (see /api/inventory), so
  // this list IS the order — the hotbar is just its first ten.
  const entries=Object.entries(inventory);
  const total=entries.reduce((sum,[,quantity])=>sum+quantity,0);
  $("inventory-total").textContent=`${total} item${total===1?"":"s"}`;
  renderHotbar();
  // Inventory tools (−1, clear) are admin-only; the server enforces the same
  // rule, this only keeps the controls out of a player's way.
  $("clear-inventory-button").hidden=!isAdmin();
  if(!entries.length){$("inventory-list").innerHTML=`<div class="empty">${authenticated?"Your inventory is empty. Break blocks in the world or add items above.":"Log in — your inventory lives on your account."}</div>`;return;}
  $("inventory-list").innerHTML=entries.map(([id,quantity])=>{
    const meta=itemMeta(id);const label=meta?meta.name:id;const colour=meta&&/^#[0-9a-f]{6}$/i.test(meta.colour)?meta.colour:"#64748b";
    const selected=id===selectedItem?" selected":"";
    const kind=meta?KIND_LABEL[meta.kind]||meta.kind:"unknown";
    const stats=meta?itemStatLine(meta):"not in the registry — it cannot be placed or used";
    return `<div class="inventory-item${selected}" data-item-id="${escapeAttr(id)}" draggable="true" title="Drag to arrange">${itemFace(meta,colour)}<div class="item-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small><small class="item-kind kind-${escapeAttr(kind)}">${escapeHtml(kind)}</small>${stats?`<small class="item-stats">${escapeHtml(stats)}</small>`:""}</div><span class="item-quantity">×${quantity}</span>${isAdmin()?`<button class="remove-item" type="button" data-remove-item="${escapeAttr(id)}" aria-label="Remove one ${escapeAttr(id)}">−1</button>`:""}</div>`;
  }).join("");
}

// An item's face: the uploaded icon when the player asked for icons, otherwise
// the registry colour swatch. Same switch as the world's flat-vs-textured look.
// Registry pictures are validated server-side to exactly this shape, so they
// can go straight into an attribute — escapeAttr strips ';', which would
// corrupt the data URL itself.
const SAFE_IMAGE=/^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
function itemFace(meta,colour){
  const icon=meta&&SAFE_IMAGE.test(meta.icon||"");
  return icon&&settings.render==="detailed"
    ? `<img class="item-icon" src="${meta.icon}" alt="">`
    : `<span class="swatch" style="background:${escapeAttr(colour)}"></span>`;
}

// Hotbar: the first ten stacks in the player's own arrangement, selectable
// with 1-9 then 0 (0 is the tenth) or a click, and rearranged by dragging.
function renderHotbar(){
  const entries=Object.entries(inventory).slice(0,HOTBAR_SLOTS);
  $("hotbar").innerHTML=entries.map(([id,quantity],i)=>{
    const meta=itemMeta(id);const colour=meta&&/^#[0-9a-f]{6}$/i.test(meta.colour)?meta.colour:"#64748b";
    const selected=id===selectedItem?" hotbar-selected":"";
    const glyph=meta&&meta.kind==="weapon"?"⚔":meta&&meta.kind==="tool"?"⛏":meta&&meta.kind==="food"?"✚":"";
    const label=meta?`${meta.name} — ${id}`:id;
    return `<div class="hotbar-slot${selected}" data-slot-id="${escapeAttr(id)}" draggable="true" title="${escapeAttr(label)}"><span class="hotbar-key">${(i+1)%10}</span>${itemFace(meta,colour)}${glyph?`<span class="hotbar-glyph">${glyph}</span>`:""}<span class="hotbar-qty">${quantity}</span></div>`;
  }).join("");
}
$("hotbar").addEventListener("click",e=>{
  const slot=e.target.closest("[data-slot-id]");
  if(slot)selectItem(slot.dataset.slotId===selectedItem?null:slot.dataset.slotId);
});

// ---- Drag to arrange ------------------------------------------------------
// One order, one gesture: bag cards and hotbar slots are the same list (the
// hotbar is its first ten), so a drag from either rearranges both. Dropping
// one stack on another swaps their places — predictable in a grid and in a
// fixed hotbar alike, and it keeps the hotbar's contents count stable.
let dragId=null;
function dropTarget(e){return e.target.closest?.("[data-item-id],[data-slot-id]");}
function clearDragMarks(){
  for(const el of document.querySelectorAll(".dragging,.drop-target"))el.classList.remove("dragging","drop-target");
}
async function swapStacks(a,b){
  const ids=Object.keys(inventory);
  const i=ids.indexOf(a),j=ids.indexOf(b);
  if(i<0||j<0||i===j)return;
  [ids[i],ids[j]]=[ids[j],ids[i]];
  // The object's key order IS the arrangement, so rebuild it in the new order.
  const next={};
  for(const key of ids)next[key]=inventory[key];
  inventory=next;
  renderInventory();renderCrafting();
  try{await api("/api/inventory/order",{method:"POST",body:JSON.stringify(srvBody({ids}))});}
  catch(error){toast(error.message,true);refreshInventory();}
}
for(const root of [$("inventory-list"),$("hotbar")]){
  root.addEventListener("dragstart",e=>{
    const el=dropTarget(e);
    if(!el){e.preventDefault();return;}
    dragId=el.dataset.itemId||el.dataset.slotId;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",dragId);
  });
  root.addEventListener("dragend",clearDragMarks);
  root.addEventListener("dragover",e=>{
    const el=dropTarget(e);
    if(!el||!dragId)return;
    e.preventDefault();
    e.dataTransfer.dropEffect="move";
    el.classList.add("drop-target");
  });
  root.addEventListener("dragleave",e=>{dropTarget(e)?.classList.remove("drop-target");});
  root.addEventListener("drop",e=>{
    const el=dropTarget(e);
    if(!el||!dragId)return;
    e.preventDefault();
    const target=el.dataset.itemId||el.dataset.slotId;
    clearDragMarks();
    const id=dragId;
    dragId=null;
    swapStacks(id,target);
  });
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
    const data=await api("/api/recipes/craft",{method:"POST",body:JSON.stringify(srvBody({recipe_id:button.dataset.craftId}))});
    await refreshInventory();
    toast(`Crafted ${data.quantity} × ${data.id}.`);
  }catch(err){toast(err.message,true);renderCrafting();}
});

// ---- Block workshop: publish, edit (own blocks), delete (own blocks) ----------
// Reads an uploaded picture and resamples it to the size the game actually
// draws at (16x16 for a block face, 32x32 for an item icon), centred square
// crop, nearest neighbour so pixel art stays crisp. Small data URLs keep the
// registry payload every player downloads on join tiny.
function readImageFile(file, size){
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;}
    if(!/^image\//.test(file.type)){reject(new Error("Pick a PNG or JPEG image."));return;}
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d");
      ctx.imageSmoothingEnabled=false;
      const side=Math.min(img.width,img.height);
      ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,size,size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("That image could not be read."));};
    img.src=url;
  });
}

// One file input + preview + clear button. Picking a file stores the data URL
// and shows it; clear drops it back to "no image published".
function wireImageField(inputId,previewId,clearId,size){
  const input=$(inputId),preview=$(previewId),clear=$(clearId);
  let value=null;
  const paint=()=>{
    preview.src=value||"";
    preview.hidden=!value;
    clear.hidden=!value;
    input.value="";
  };
  input.addEventListener("change",async()=>{
    try{value=await readImageFile(input.files[0],size);paint();}
    catch(err){toast(err.message,true);input.value="";}
  });
  clear.addEventListener("click",()=>{value=null;paint();});
  return { value:()=>value, set:v=>{value=v||null;paint();} };
}
// The extra parts a block can publish: textures (a block's own, plus optional
// top and bottom faces), one of the shipped voxel models, and an optional Lua
// script. The model list comes from the Worker, so the dropdown can only ever
// offer what the renderer understands.
const blockTextureField=wireImageField("block-texture","block-texture-preview","block-texture-clear",16);
const blockTextureTopField=wireImageField("block-texture-top","block-texture-top-preview","block-texture-top-clear",16);
const blockTextureBottomField=wireImageField("block-texture-bottom","block-texture-bottom-preview","block-texture-bottom-clear",16);
const itemIconField=wireImageField("item-icon","item-icon-preview","item-icon-clear",32);
// ---- Lua editor: vendored Monaco over the block-script textarea ----------
// The textarea stays as the fallback: if the vendor payload ever fails to
// load, the workshop works exactly as before. The accessors below are the
// ONLY readers/writers of the script value; they hit whichever surface is live.
let blockEditor=null;
let editorMountTried=false;
let scriptCheckTimer=0;
function scriptValue(){return blockEditor?blockEditor.getValue():$("block-script").value;}
function setScriptValue(v){if(blockEditor)blockEditor.setValue(v||"");else $("block-script").value=v||"";}
// The script surface, one entry per host function the Worker actually answers
// (mirrors setHost() in backend/src/lua.ts; s28studio diffs the two). Fed to
// Monaco completions + hover and to the visible table under the editor.
const SCRIPT_API = Object.freeze([
  { sig: "player", kind: "var", desc: "Name of the player who triggered the script." },
  { sig: "key", kind: "var", desc: "Menu option key from on_choice; nil elsewhere." },
  { sig: "x, y, z", kind: "var", desc: "Coordinates of the block the script runs on." },
  { sig: "on_interact(player)", kind: "hook", desc: "Runs when a player presses E on this block." },
  { sig: "on_choice(key, player)", kind: "hook", desc: "Runs when the player picks a menu option." },
  { sig: "on_break(player)", kind: "hook", desc: "Runs when a player breaks this block." },
  { sig: "state_get(key)", desc: "Read a saved variable (nil when never set)." },
  { sig: "state_set(key, value)", desc: "Save nil, a string, a number or a boolean for this block." },
  { sig: "menu(title, options)", desc: "Show the player up to 12 buttons; the pick arrives in on_choice(key, player)." },
  { sig: "beam(colour)", desc: "Flash a beam of that colour from the block (#rrggbb or a name)." },
  { sig: "toast(message)", desc: "Show a small message on the player's screen." },
  { sig: "log(message)", desc: "Write a line to this block's script log (admin-visible)." },
  { sig: "get_player_position()", desc: "Returns {x, y, z} where the player stands." },
  { sig: "set_player_position(x, y, z)", desc: "Move the player to that spot." },
  { sig: "set_player_respawn_position(x, y, z)", desc: "Set where the player respawns." },
  { sig: "give_item(id, qty)", desc: "Add an item to the player's inventory; returns the new stack count." },
  { sig: "take_item(id, qty)", desc: "Remove items from the player's inventory; returns how many were taken." },
  { sig: "item_count(id)", desc: "How many of that item the player carries." },
  { sig: "inv_add(id, qty)", desc: "Add an item to this block's own stored inventory; returns the new count." },
  { sig: "inv_take(id, qty)", desc: "Remove from this block's stored inventory; returns how many were taken." },
  { sig: "inv_count(id)", desc: "How many of that item the block stores." },
  { sig: "inv_list()", desc: "Table of item id -> quantity for this block's stored inventory." },
  { sig: "tonumber(value[, base])", desc: "Number of a value, or nil." },
  { sig: "tostring(value)", desc: "Readable text form of a value." },
  { sig: "type(value)", desc: "\"nil\", \"boolean\", \"number\" or \"string\"." },
  { sig: "pairs(table)", desc: "Iterate every key of a table." },
  { sig: "ipairs(table)", desc: "Iterate a table in 1..n order." },
  { sig: "math.floor / ceil / abs / sqrt / min / max / random / randomseed", desc: "The maths subset the sandbox allows." },
  { sig: "string.len / upper / lower / sub / rep / find / format", desc: "The string subset the sandbox allows (no match/gsub/gmatch)." },
  { sig: "table.insert / remove / concat", desc: "The table subset the sandbox allows (no sort)." },
]);
self.SCRIPT_API = SCRIPT_API;
let scriptApiProvider = null;
let scriptHoverProvider = null;
function apiName(e) { return e.sig.split(/[ (\/]/)[0]; }
function registerScriptApiProviders() {
  const m = self.monaco;
  scriptApiProvider = {
    provideCompletionItems(model, position) {
      const word = model.getWordAtPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: (word && word.startColumn) || position.column, endColumn: (word && word.endColumn) || position.column };
      const items = SCRIPT_API.map(e => ({
        label: apiName(e), kind: e.kind === "var" ? m.languages.CompletionItemKind.Variable
          : e.kind === "hook" ? m.languages.CompletionItemKind.Event : m.languages.CompletionItemKind.Function,
        insertText: apiName(e), detail: e.sig, documentation: e.desc, range }));
      return { suggestions: items };
    },
  };
  scriptHoverProvider = {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const e = SCRIPT_API.find(a => apiName(a) === word.word);
      if (!e) return null;
      return { range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn },
        contents: [{ value: "`" + e.sig + "` — " + e.desc }] };
    },
  };
  m.languages.registerCompletionItemProvider("lua", scriptApiProvider);
  m.languages.registerHoverProvider("lua", scriptHoverProvider);
  self.scriptApiProvider = scriptApiProvider; // s28studio fires provideCompletionItems directly
self.scriptHoverProvider = scriptHoverProvider; // ... and provideHover
}
function renderScriptApiReference() {
  const rows = $("script-api-rows");
  if (!rows) return;
  rows.innerHTML = "";
  for (const e of SCRIPT_API) {
    const tr = document.createElement("tr");
    const c1 = document.createElement("td"); c1.textContent = e.sig; c1.className = "api-sig";
    const c2 = document.createElement("td"); c2.textContent = e.desc;
    tr.append(c1, c2); rows.append(tr);
  }
}
renderScriptApiReference();
async function mountBlockEditor(){
  if(editorMountTried)return;editorMountTried=true;
  try{
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="/vendor/monaco/vs/loader.js";s.onload=res;s.onerror=()=>rej(new Error("vendor load failed"));document.head.appendChild(s);});
    const base=location.origin+"/vendor/monaco/vs/";
    self.MonacoEnvironment={getWorkerUrl:()=> "data:text/javascript;charset=utf-8,"+encodeURIComponent("self.MonacoEnvironment={baseUrl:'"+base+"'};importScripts('"+base+"base/worker/workerMain.js');")};
    await new Promise((res,rej)=>{self.require.config({paths:{vs:base.replace(/\/$/,"")}});self.require(["vs/editor/editor.main"],res,()=>rej(new Error("amd load failed")));});
    registerScriptApiProviders(); // completions + hover ride the SCRIPT_API table
    const host=$("block-script-editor");
    blockEditor=self.monaco.editor.create(host,{value:$("block-script").value,language:"lua",theme:"vs-dark",automaticLayout:true,minimap:{enabled:false},scrollBeyondLastLine:false,fixedOverflow:true,fontSize:12,lineHeight:1.55,renderLineHighlight:"none",contextmenu:false});
    $("block-script").hidden=true;host.hidden=false;
    blockEditor.onDidChangeModelContent(()=>{clearTimeout(scriptCheckTimer);scriptCheckTimer=setTimeout(checkScriptDraft,500);});
    checkScriptDraft();
  }catch{blockEditor=null;const n=$("block-editor-notice");if(n)n.hidden=false;/* textarea keeps working; say why */}
}
async function checkScriptDraft(){
  if(!blockEditor||!authenticated)return;
  const src=blockEditor.getValue();
  const model=blockEditor.getModel();
  if(!src.trim()){self.monaco.editor.setModelMarkers(model,"ac-lua",[]);return;}
  try{
    const res=await api("/api/block/script-check",{method:"POST",body:JSON.stringify({script:src})});
    self.monaco.editor.setModelMarkers(model,"ac-lua",res&&res.ok?[]:[{
      startLineNumber:(res&&res.line)||1,endLineNumber:(res&&res.line)||1,
      severity:self.monaco.MarkerSeverity.Error,message:(res&&res.error)||"Syntax error."}]);
  }catch{/* unreachable server: leave the last markers; submit still validates */}
}
// Opening Studio mounts the syntax editor eagerly: the old `focusin` trigger
// meant the first click into the Script field showed the plain textarea,
// then swapped under the cursor - the "simple text box" complaint.
// (mountBlockEditor's own editorMountTried guard makes repeat opens free.)
function openStudio(){mountBlockEditor();$("studio-dialog").showModal();}
$("block-form").addEventListener("focusin",mountBlockEditor,{once:true});
function resetBlockAppearance(){
  blockTextureField.set(null);
  blockTextureTopField.set(null);
  blockTextureBottomField.set(null);
  $("block-model").value="";setScriptValue("");
}
function modelLabel(model){
  return model.replace(/^dve_/,"").replace(/_/g," ").replace(/\b[a-z]/g,c=>c.toUpperCase());
}
function setModelOptions(models){
  const list=Array.isArray(models)?models:[];
  $("block-model").innerHTML='<option value="">Full cube (default)</option>'+
    list.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(modelLabel(m))}</option>`).join("");
}
// The drop dropdown: every known item, empty value = the implicit default.
// The current selection survives registry refreshes (an edit in progress
// must not lose its chosen drop when a background refresh lands).
function renderDropItemOptions(){
  const sel=$("block-drop-item");if(!sel)return;
  const keep=sel.value;
  sel.innerHTML='<option value="">Default (the programming item)</option>'+
    currentItems.map(i=>`<option value="${escapeAttr(i.id)}">${escapeHtml(i.name)}</option>`).join("");
  if([...sel.options].some(o=>o.value===keep))sel.value=keep;
}
let editingBlockId=null;
const pendingDelete=new Set();
$("block-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!authenticated){openAuth("login");toast("Log in to publish a block.");return;}
  const splitIds=v=>v.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const rules={below:$("block-below").value,belowIds:splitIds($("block-below-ids").value),incompatibleWith:splitIds($("block-incompatible").value)};
  const common={name:$("block-name").value,hardness:Number($("block-hardness").value),light:Number($("block-light").value),colour:$("block-colour").value,behaviour:$("block-behaviour").value,pass_through:$("block-pass").checked,climbable:$("block-climb").checked,rules,
    texture:blockTextureField.value(),texture_top:blockTextureTopField.value(),texture_bottom:blockTextureBottomField.value(),model:$("block-model").value||null,script:scriptValue().trim()||null,
    drop_item_id:$("block-drop-item").value||null,drop_qty:Number($("block-drop-qty").value)||1};
  try{
    if(editingBlockId){
      await api(`/api/blocks/${encodeURIComponent(editingBlockId)}`,{method:"PUT",body:JSON.stringify(common)});
      toast(`Block ${editingBlockId} updated.`);
      exitEditMode();
    }else{
      await api("/api/blocks",{method:"POST",body:JSON.stringify({...common,namespace:$("block-namespace").value,id:$("block-id").value})});
      toast("Block published to the registry. It becomes placeable immediately; textures reload on next visit.");
      e.target.reset();$("block-hardness").value=2;$("block-light").value=0;$("block-colour").value="#8b72e8";$("block-pass").checked=false;$("block-climb").checked=false;resetBlockAppearance();updateIdPreview();$("block-drop-item").value="";$("block-drop-qty").value=1;
    }
    await refreshRegistry();
  }
  catch(err){toast(err.message,true);}
});
$("block-climb").addEventListener("change",()=>{if($("block-climb").checked)$("block-pass").checked=true;});
function enterEditMode(block){
  editingBlockId=block.id;
  pendingDelete.clear();
  const parts=block.id.split(":");
  const namespace=block.id.startsWith("player:")?parts[2]:"";
  const localId=block.id.startsWith("player:")?parts.slice(3).join(":"):block.id;
  const rules=block.rules&&typeof block.rules==="object"?block.rules:{};
  $("block-name").value=block.name;$("block-namespace").value=namespace;$("block-id").value=localId;
  $("block-hardness").value=block.hardness;$("block-light").value=block.light;$("block-colour").value=block.colour;$("block-pass").checked=!!block.pass_through;$("block-climb").checked=!!block.climbable;
  $("block-behaviour").value=block.behaviour;$("block-below").value=rules.below||"any";
  $("block-below-ids").value=(rules.belowIds||[]).join(", ");
  $("block-incompatible").value=(rules.incompatibleWith||[]).join(", ");
  blockTextureField.set(block.texture||null);
  blockTextureTopField.set(block.texture_top||null);
  blockTextureBottomField.set(block.texture_bottom||null);
  $("block-model").value=block.model||"";setScriptValue(block.script||"");
  $("block-drop-item").value=block.drop_item_id||"";$("block-drop-qty").value=block.drop_qty??1;
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
  $("block-form").reset();$("block-hardness").value=2;$("block-light").value=0;$("block-colour").value="#8b72e8";$("block-pass").checked=false;$("block-climb").checked=false;resetBlockAppearance();updateIdPreview();
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
    return `<div class="registry-item">${swatchHtml(b.colour,b.texture)}<div class="item-info"><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.id)} · ${escapeHtml(b.behaviour)} · light ${Number(b.light)||0}${b.script?" · scripted":""}</small></div><div class="my-block-actions"><button class="button button-outline" type="button" data-mb-edit="${escapeAttr(b.id)}">Edit</button><button class="button ${pending?"button-danger":"button-outline"}" type="button" data-mb-del="${escapeAttr(b.id)}">${pending?"Really delete?":"Delete"}</button></div></div>`;
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
    icon:itemIconField.value(),
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
      itemIconField.set(null);
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
  itemIconField.set(item.icon||null);
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
  itemIconField.set(null);
  updateItemFormKind();updateItemIdPreview();
}
$("item-edit-cancel").addEventListener("click",exitItemEdit);
// The Studio list swatch: the published picture when there is one, otherwise
// the flat colour it falls back to.
function swatchHtml(colour,image){
  return image&&SAFE_IMAGE.test(image)?`<span class="swatch"><img class="pixel-art" src="${image}" alt=""></span>`
    :`<span class="swatch" style="background:${escapeAttr(colour)}"></span>`;
}
function renderMyItems(){
  const list=$("my-items-list");
  if(!authenticated){list.innerHTML='<div class="empty">Log in to manage your own items.</div>';return;}
  const mine=currentItems.filter(it=>String(it.creator||"").toLowerCase()===(username||"").toLowerCase());
  if(!mine.length){list.innerHTML='<div class="empty">You have not published any items yet.</div>';return;}
  list.innerHTML=mine.map(it=>{
    const pending=pendingItemDelete.has(it.id);
    const stats=itemStatLine(it);
    return `<div class="registry-item">${swatchHtml(it.colour,it.icon)}<div class="item-info"><strong>${escapeHtml(it.name)}</strong><small>${escapeHtml(it.id)} · ${escapeHtml(KIND_LABEL[it.kind]||it.kind)}${stats?` · ${escapeHtml(stats)}`:""}</small></div><div class="my-block-actions"><button class="button button-outline" type="button" data-mi-edit="${escapeAttr(it.id)}">Edit</button><button class="button ${pending?"button-danger":"button-outline"}" type="button" data-mi-del="${escapeAttr(it.id)}">${pending?"Really delete?":"Delete"}</button></div></div>`;
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
  $("set-sensitivity").value=settings.sens;$("set-sensitivity-out").textContent=settings.sens;
  $("set-fov").value=settings.fov;$("set-fov-out").textContent=settings.fov+"°";
  $("set-distance").value=settings.distance;$("set-distance-out").textContent=settings.distance;
  $("set-speed").value=settings.speed;$("set-speed-out").textContent=settings.speed;
  $("set-render").value=settings.render;
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
  void refreshServers();
  $("main-menu").showModal();
  $("pause-dialog").close();
  if(dveView)dveView.releaseInput();
  $("game").hidden=true;
  syncGrabBtn();
});
$("pause-inventory").addEventListener("click",openInventoryDialog);
$("pause-studio").addEventListener("click",openStudio);
// The admin settings live in their own dialog, opened with + by the admin
// account alone; the pause menu stays the same for everybody else. Opening it
// re-reads the clock, so an admin whose socket once missed a push still sees the
// truth the moment they look.
function openAdminPanel(){
  if(!canControlWorld()){toast("Only the admin or the owner of this server has these settings.",true);return false;}
  // Re-read the labels here: at sign-in the server list may not have arrived
  // yet, and an owner who booted straight into their own world would otherwise
  // wear the admin's labels and lose the resync button.
  renderAdminTools();
  renderTimePanel();
  $("admin-panel").showModal();
  void syncClock();
  return true;
}
$("admin-resync").addEventListener("click",resyncWorld);
// The admin's dial: four buttons for the key moments of the day, a slider for
// anywhere in between, and a switch that freezes the cycle wherever it stands.
// Dialling never changes whether the cycle runs — an admin stopped at midnight
// who drags to dawn wants dawn stopped, and "Stop the cycle" is the only thing
// that starts it again. Stopping captures the phase first: with the sun still
// running there is no phase stored, and a stopped clock with no phase would
// simply keep running.
const runningNow=()=>!(worldClock&&worldClock.running===false);
for(const button of document.querySelectorAll("#admin-panel [data-time]"))button.addEventListener("click",()=>setTime({phase:Number(button.dataset.time),running:runningNow()}));
$("time-slider").addEventListener("change",e=>setTime({phase:Number(e.target.value),running:runningNow()}));
$("time-freeze").addEventListener("click",()=>{
  // Resume keeps the stored phase and restarts the period from this moment, so
  // the day carries on from where it stopped instead of jumping to the sun.
  if(runningNow())setTime({phase:dveView?dveView.clock.phase:0.5,running:false});
  else setTime({running:true});
});
$("time-sun").addEventListener("click",()=>setTime({reset:true}));
$("hud-menu").addEventListener("click",openPause);
// Look changes the block/item artwork, which the world compiles when it is
// created — so it applies on the next join, not mid-world.
$("set-render").addEventListener("change",()=>{
  settings.render=$("set-render").value==="detailed"?"detailed":"flat";
  saveSettings();
  toast(`Look: ${settings.render==="detailed"?"textures and models":"flat colours"}. Leave and rejoin to see it.`);
});
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
$("settings-reset").addEventListener("click",()=>{settings={...DEFAULT_SETTINGS};saveSettings();syncSettingsInputs();if(dveView)dveView.setSettings(viewSettings());});

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
    if(dveView)dveView.setSelfAppearance(appearance); // so does your own body
    toast("Character saved.");
  }catch(err){toast(err.message,true);}
});
function openCharacterDialog(){renderCharacterPreview();$("character-dialog").showModal();}
$("hud-character").addEventListener("click",openCharacterDialog);
$("hud-inventory").addEventListener("click",openInventoryDialog);
$("hud-studio").addEventListener("click",openStudio);
// Third person (Backspace or this button) swings the camera behind your own
// body. It is a camera only: where the body is, what the crosshair picks and
// what the pose frames report all keep coming from the eye camera.
function toggleThirdPerson(){
  if(!dveView)return;
  const on=dveView.setThirdPerson(!dveView.thirdPerson);
  $("hud-third").firstChild.nodeValue=on?"First person ":"Third person ";
}
$("hud-third").addEventListener("click",toggleThirdPerson);
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
let headSeq=0,ws=null,wsRetry=0,hadSocket=false,dveView=null,dveMod=null,joinedServerId=null;
let worldBeams=[];
let lastBeamStamp="";
let wsBeamSeq=0; // counts ws-delivered beam frames; catches in-flight poll races
const lastWsFailed=()=>ws&&(ws.readyState===2||ws.readyState===3);
function cellBlock(x,y,z){const o=worldEdits.get(`${x},${y},${z}`);return o!==undefined?o:dveMod.baseBlock(x,y,z);}
// Single funnel for world edits: paint the voxel in the 3D view.
function noteEdit(x,y,z,blockId){
  worldEdits.set(`${x},${y},${z}`,blockId);
  if(!dveView)return;
  // The edit log outlives the blocks it names: a custom block published in one
  // session and deleted later still has log rows, and the engine throws on a
  // block id its palette never met. Skip the paint, keep the bookkeeping.
  if(!dveView.knowsBlock(blockId))return;
  dveView.applyEdit(x,y,z,blockId);
}
async function loadWorldAll(){
  const S=dveMod.SLAB;
  try{
    const data=await api(`/api/world?x0=${S.X0}&y0=${S.Y0}&z0=${S.Z0}&x1=${S.X1-1}&y1=${S.Y1-1}&z1=${S.Z1-1}&since=${headSeq}${srvQS()}`);
    for(const edit of data.edits)noteEdit(edit.x,edit.y,edit.z,edit.block_id);
    for(const entry of data.log)noteEdit(entry.x,entry.y,entry.z,entry.block_id);
    // Light columns switched on by scripted blocks: cached because this runs
    // before the view exists on first join, then replayed into it.
    worldBeams=Array.isArray(data.beams)?data.beams:[];
    lastBeamStamp=data.beamStamp||"";
    if(dveView)for(const b of worldBeams)dveView.setBeam(b.x,b.y,b.z,b.colour);
    headSeq=Math.max(headSeq,data.head);
    setConnection(true);
  }catch(err){
    setConnection(false);
    // A refused world is not a dropped connection: the join handler has to say
    // so, or a private world would simply look like an empty one.
    if(err&&err.status===403)throw err;
  }
}
// Rebuild this client's world from the server's snapshot. The live socket can
// leave us holding cells the database never had (a frame for a block that was
// deleted from the registry before it landed, a half-received batch), and no
// frame can take those away — only the snapshot says "nothing here". So: drop
// the overlay, re-read it, then paint every cell we believed in that the
// snapshot does not mention back to plain terrain.
async function rebuildWorldFromSnapshot(){
  if(!dveMod)return;
  const known=new Map(worldEdits);
  worldEdits.clear();
  try{await loadWorldAll();}catch{return;}   // refused or offline: nothing to reconcile against
  for(const key of known.keys()){
    if(worldEdits.has(key))continue;
    const [x,y,z]=key.split(",").map(Number);
    if(dveView)dveView.applyEdit(x,y,z,dveMod.baseBlock(x,y,z));
  }
  // Ask the engine which columns it is drawing, not which ones we last read. A
  // column whose removal frame never arrived is absent from worldBeams while it
  // is still glowing on screen; a repair that trusted our own list would leave
  // it there forever.
  for(const [x,y,z] of (dveView?dveView.beamCells():[]))
    if(!worldBeams.some(n=>n.x===x&&n.y===y&&n.z===z))dveView.setBeam(x,y,z,null);
  // The generator paints cells that stream in later, so its edit mirror has to
  // come from the snapshot too.
  if(dveView&&dveView.reloadGeneratorEdits)dveView.reloadGeneratorEdits();
  // Same reason as the world: the clock push that moved while this socket was
  // down is never replayed, so ask for it.
  void syncClock();
}
// Admin repair switch: ask the Worker to re-run the edit table (prune derived
// rows that lost their cell, replay every surviving cell, and send a `resync`
// frame that makes each client call rebuildWorldFromSnapshot).
async function resyncWorld(){
  if(!canControlWorld()){toast("Only the admin or the owner of this server can resync the world.",true);return;}
  const button=$("admin-resync");
  button.disabled=true;
  try{
    const r=await api("/api/world/resync",{method:"POST",body:JSON.stringify(srvBody())});
    const stale=r&&r.stale?r.stale:{log:0,state:0,beams:0,inv:0};
    const cleared=(Number(stale.log)||0)+(Number(stale.state)||0)+(Number(stale.beams)||0)+(Number(stale.inv)||0);
    toast(`World resynced: ${r.replayed} cells replayed, ${cleared} stale rows cleared.`);
  }catch(err){toast(err.message,true);}
  button.disabled=false;
}
function connectLive(){
  ws=new WebSocket(API_BASE.replace(/^http/,"ws")+"/api/world/live?server="+encodeURIComponent(settings.serverId));
  ws.onopen=()=>{
    // Anything the world changed while the socket was down is invisible to us:
    // no edit frame, no beam removal, no roster. The snapshot is the only thing
    // that can take a stale cell or light column away, so re-take it.
    const reconnected=hadSocket;
    hadSocket=true;wsRetry=0;setConnection(true);sendPresence(true);
    if(reconnected)rebuildWorldFromSnapshot();
  };
  ws.onmessage=event=>{let m=null;try{m=JSON.parse(event.data);}catch{return;}try{
    if(m.type==="edit")noteEdit(m.x,m.y,m.z,m.block_id);
    else if(m.type==="roster"){for(const p of m.players||[])if(dveView&&p.name!==username){p.heldIcon=iconUrl(p.heldItem);dveView.setRemote(p);}}
    else if(m.type==="pose"&&dveView&&m.name!==username){m.heldIcon=iconUrl(m.heldItem);dveView.setRemote(m);}
    else if(m.type==="leave"&&dveView)dveView.removeRemote(m.name);
    else if(m.type==="mobs"&&dveView)applyMobSnapshot(m.mobs||[]);
    // A body was just struck: flash it white on every screen, including for the
    // attacker, so a swing that connected is obvious without a health bar.
    else if(m.type==="hit"&&dveView){
      if(m.what==="mob")dveView.flashMob(m.id);
      else if(m.id!==username)dveView.flashPlayer(m.id);
    }
    else if(m.type==="down"&&dveView)dveView.setDown(m.name,true);
    else if(m.type==="up"&&dveView)dveView.setDown(m.name,false);
    else if(m.type==="beam"&&dveView){wsBeamSeq++;dveView.setBeam(m.x,m.y,m.z,m.colour||null);}
    // A block script moved this player. Keep the look, replace the body; the
    // server has already written the position, so the next presence frame just
    // confirms where the client now stands.
    else if(m.type==="move"&&dveView&&m.name===username)dveView.setPose({x:m.x,y:m.y,z:m.z,yaw:dveView.pose.yaw,pitch:dveView.pose.pitch});
    else if(m.type==="health")applyHealth(m);
    else if(m.type==="hurt")applyHealth(m);
    else if(m.type==="died")applyDeath(m);
    else if(m.type==="respawn")applyRespawn(m);
    // The admin dialled the world's clock (or handed it back to the sun).
    else if(m.type==="time")applyClock(m);
    // The admin re-ran the edit table: rebuild from the snapshot.
    else if(m.type==="resync")rebuildWorldFromSnapshot();
  }catch(error){
    // A frame that is not JSON is nothing; a frame that parsed and then broke
    // the view is a bug that used to be invisible - the pose branch once threw
    // for every player, and the screen simply never showed anybody.
    console.warn("live "+(m&&m.type)+" frame failed:",error);
  }};
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
  // `pitch` tilts other players' heads; `held` is the colour of the item in
  // hand, so you can tell who is holding a pick, a sword or nothing.
  const held=heldColour(selectedItem);
  try{ws.send(JSON.stringify({type:"pose",name:username||"someone",x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,held,...(selectedItem?{heldItem:selectedItem}:{}),appearance,vx,vy,vz}));}catch{/* racing a close */}
}
setInterval(sendPresence,250);

// ---- Mobs + health ------------------------------------------------------------
// The WorldLive object simulates mobs and owns health; this client renders the
// snapshot and reports attacks. `mobs` arrives ~4 Hz with the full live list.
// The kinds the world object spawns; a `died` frame naming one of these came
// from a mob, anything else is a player's username.
const MOB_KINDS=new Set(["zombie","pig","slime"]);
function applyMobSnapshot(list){
  const seen=new Set();
  for(const mob of list){
    seen.add(mob.id);
    dveView.setMob(mob.id,mob.kind||"slime",Number(mob.x)||0,Number(mob.y)||0,Number(mob.z)||0,Number(mob.yaw)||0,mob.hostile===true,Number(mob.hp));
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
  // `by` is a mob kind when the world object killed you, and the attacker's
  // username when another player did.
  const by=m&&m.by?String(m.by):"";
  const cause=by?(MOB_KINDS.has(by)?`A ${by.replace(/_/g," ")} got you.`:`${by} got you.`):null;
  showDeath(cause);
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
// Left-click aimed at a body is an attack, not a block break. Mobs and other
// players are both valid targets — whoever the crosshair is nearest. What you
// hold only changes the damage and reach, and the object decides both: holding
// nothing swingable punches with your fists.
function attackUnderCrosshair(){
  if(!ws||ws.readyState!==1||dead||!dveView)return false;
  if(!dveView.pickMob||!dveView.pickPlayer)return false;
  const mob=dveView.pickMob();
  const player=dveView.pickPlayer();
  if(player&&player.name!==username&&(!mob||player.distance<=mob.distance)){
    try{ws.send(JSON.stringify({type:"attack",target:player.name,item_id:selectedItem||""}));}catch{/* racing a close */}
    return true;
  }
  if(!mob)return false;
  try{ws.send(JSON.stringify({type:"attack",mob_id:mob.id,item_id:selectedItem||""}));}catch{/* racing a close */}
  return true;
}
// ---- Scripted blocks (E) -----------------------------------------------------
// A block can carry a Lua script (the beacon ships one). E runs the script's
// `on_interact` on the block under the crosshair: the answer is a toast, a
// short message, or a menu whose options run `on_choice`. Every rule lives on
// the Worker; the client only draws what comes back.
let interactTarget=null;
async function interactUnderCrosshair(){
  if(!authenticated){openAuth("login");toast("Log in to use scripted blocks.");return;}
  if(dead||!dveView)return;
  let hit=null;
  try{hit=await dveView.pickCenter();}catch{/* pick failed: nothing to ask */}
  if(!hit||!hit.position)return;
  const x=hit.position.x|0,y=hit.position.y|0,z=hit.position.z|0;
  let r=null;
  try{r=await api("/api/block/interact",{method:"POST",body:JSON.stringify(srvBody({x,y,z}))});}
  catch(err){toast(err.message,true);return;}
  if(!r||r.ok!==true){
    // Silence is right for an ordinary block ("unscripted") or empty air, but a
    // script that fails to run is the author's bug: say so, or the player just
    // presses E on a block that looks dead.
    if(r&&r.reason==="script-error")toast(`That block's script is broken: ${r.error||"it failed to run"}.`,true);
    return;
  }
  for(const t of (r.toasts||[]))toast(t);
  if(r.items)await refreshInventory();
  if(r.menu&&r.menu.length){
    interactTarget={x,y,z};
    $("interact-title").textContent=r.title||String(r.name||"Block");
    $("interact-options").innerHTML=r.menu.map(o=>`<button class="button button-outline full" type="button" data-choice="${escapeAttr(o.key)}">${escapeHtml(o.label)}</button>`).join("");
    // A menu is aimed with a cursor, not with the crosshair: hand the mouse
    // back before opening it. Closing any dialog grabs it again.
    if(document.pointerLockElement)document.exitPointerLock();
    $("interact-dialog").showModal();
  }
}
$("interact-options").addEventListener("click",async e=>{
  const b=e.target.closest("[data-choice]");
  if(!b||!interactTarget)return;
  const {x,y,z}=interactTarget;
  $("interact-dialog").close();
  try{
    const r=await api("/api/block/interact",{method:"POST",body:JSON.stringify(srvBody({x,y,z,key:b.dataset.choice}))});
    if(r&&r.reason==="script-error")toast(`That block's script is broken: ${r.error||"it failed to run"}.`,true);
    for(const t of (r&&r.toasts)||[])toast(t);
    // The script may have taken items out of, or put them into, this player's
    // bag — the toast says so, but the numbers come from the server.
    if(r&&r.items)await refreshInventory();
  }catch(err){toast(err.message,true);}
});

// Food: right-click (or F) with a food item selected eats one unit.
async function eatSelected(){
  const meta=selectedItem?itemMeta(selectedItem):null;
  if(!meta||meta.kind!=="food"){toast("Select a food item to eat.",true);return;}
  if(health>=MAX_HEALTH){toast("You are already at full health.",true);return;}
  try{
    const data=await api("/api/player/eat",{method:"POST",body:JSON.stringify({item_id:selectedItem,...srvBody()})});
    health=Math.max(0,Math.min(MAX_HEALTH,Number(data.health)||health));
    renderHealth();
    await refreshInventory();
    toast(`Ate ${meta.name}.`);
  }catch(err){toast(err.message,true);}
}
// While the socket is down, polling (since=headSeq) fills the gap. While it is
// UP, light columns are the one thing a lost broadcast frame never heals: the
// log replay carries edits but not beams. So the same 4 s beat also asks the
// cheap stamp endpoint — only when the stamp moved does the (≤400 row) beam
// list get re-diffed against what the engine is actually drawing.
setInterval(()=>{if(!ws||ws.readyState>1)loadWorldAll();else void beamCatchup();},4000);
// The engine's moving window: when the 256-cell slab steps to a new origin,
// this fetch must cover the new window too — edits there predate this
// session and never arrive over the socket. The snapshot query is
// window-scoped, so one loadWorldAll pulls exactly what shifted in.
window.addEventListener("ac-window-shift", () => { if(dveMod) void loadWorldAll(); });
async function beamCatchup(){
  const seq=wsBeamSeq;
  let data=null;
  try{data=await api(`/api/world/beams?server=${encodeURIComponent(settings.serverId)}`);}
  catch(err){if(err&&err.status===403)return;return;}
  if(!data||!Array.isArray(data.beams)||data.beamStamp===lastBeamStamp)return;
  // A ws beam frame landed while this list was in flight: the frames are the
  // fresher signal, so drop this batch instead of repainting a stale beam.
  if(wsBeamSeq!==seq)return;
  lastBeamStamp=data.beamStamp;
  worldBeams=data.beams;
  if(!dveView)return;
  // Ask the engine what it is drawing, not what we last read — a column whose
  // removal frame never arrived is absent from worldBeams but still glowing.
  for(const [x,y,z] of dveView.beamCells())
    if(!worldBeams.some(n=>n.x===x&&n.y===y&&n.z===z))dveView.setBeam(x,y,z,null);
  for(const b of worldBeams)dveView.setBeam(b.x,b.y,b.z,b.colour);
}

async function worldAction(button,x,y,z){
  if(!authenticated){openAuth("login");toast("Log in to build in the shared world.");return;}
  try{
    if(button===2){
      const data=await api("/api/world/break",{method:"POST",body:JSON.stringify(srvBody({x,y,z}))});
      // A scripted block can speak as it dies, and its store comes out with it:
      // the toast says what actually landed in the bag, not a guess — the
      // declared drop quantity included, and no phantom line when the block
      // drops nothing at all (base-terrain-only blocks).
      const bits=[data.dropped?`Broke ${data.dropped} at ${x} ${y} ${z}`:`Broke that at ${x} ${y} ${z}`];
      const got=[...(data.dropped?[`${data.drop_qty??1} ${data.dropped}`]:[]),...(data.contents||[]).map(c=>`${c.qty} ${c.item}`)];
      if(got.length)bits.push(`+${got.join(", ")}`);
      const said=((data.toasts||[]).join(" ")).trim();
      toast(said?`${bits.join(" — ")} — ${said}`:`${bits.join(" — ")}.`);
    }else{
      if(!selectedItem){toast("Pick an item from your inventory or hotbar first.",true);return;}
      await api("/api/world/place",{method:"POST",body:JSON.stringify(srvBody({x,y,z,item_id:selectedItem}))});
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
const KEYS_HELP = 'In game: <b>WASD</b> move · <b>Arrow keys</b> look · <b>Shift</b> sprint · mouse look · <b>Space</b> jump · <b>1–9,0</b> hotbar · hold <b>left-click</b> to mine · click a mob to attack · <b>right-click</b> place · <b>E</b> use block · <b>F</b> eat · <b>C</b> character · <b>I</b> inventory · <b>B</b> studio · <b>+</b> admin settings · <b>Backspace</b> third person · <b>Esc</b> menu';
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

// A session-less tab still must not share a spawn column with another one.
const guestSeed = "guest-" + Math.random().toString(36).slice(2, 10);

async function initGameView(){
  if(!window.WebGLRenderingContext)throw new Error("WebGL unavailable in this browser");
  joinedServerId=settings.serverId;   // the world this engine instance was born for
  showJoinHelp();
  let spawn=null;
  try{
    const r=await api(`/api/player/state?server=${encodeURIComponent(settings.serverId)}`);
    spawn=r.state;
    if(r.appearance)appearance={...DEFAULT_APPEARANCE,...r.appearance};
  }catch{/* default spawn on surface */}
  dveView=await dveMod.createDVEView($("game-canvas"),currentBlocks,API_BASE,{
    settings:viewSettings(),
    serverId:settings.serverId,
    cellAt:(x,y,z)=>cellBlock(x,y,z),
    spawn:spawn||undefined,
    // No saved position: pick a spawn column of our own so two players who
    // join at the same moment do not stand inside each other (and an account
    // without a session still gets a column to itself).
    spawnSeed:username?String(username).toLowerCase():guestSeed,
  });
  // Beams were fetched before the view existed; paint them now.
  for(const b of worldBeams)if(b&&b.colour)dveView.setBeam(b.x,b.y,b.z,b.colour);
  // Third person needs a body coloured like the account, before the player
  // ever presses the key — and it holds whatever is selected.
  dveView.setSelfAppearance(appearance);
  dveView.setSelfHeld(heldColour(selectedItem),iconUrl(selectedItem));
  paintHeldHud();
  // The clock usually arrives before this view exists (the socket opens first),
  // so the sky is dialled here too rather than waiting for the next change.
  if(worldClock)dveView.setClock(worldClock.phase,worldClock.running);
  void syncClock();
  $("game-loading-text").hidden=true;
  syncLoadingOverlay();
  // The object owns the number: it revives a player whose stored row says 0
  // ("a new socket is a new life"), so the client waits for the health frame
  // instead of reading the stored row and parking the body behind the death
  // screen for a death the server already overruled.
  hideDeath();
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
    try{await api("/api/player/state",{method:"POST",body:JSON.stringify(srvBody({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch}))});}catch{/* retried next tick */}
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
// Left = hold to mine. The bar under the crosshair fills over
// 0.25 + hardness/speed seconds (speed = the selected item's speed, floor 1);
// completing the bar POSTs the break, releasing early just cancels it.
// Bedrock-grade hardness (500+) sits at 99.9% forever — it is unbreakable —
// and the server refuses any break under 200 ms, so the bar is the authority,
// not decoration. Right = click to place, unchanged.
let downAt=null,downButton=0,mining=null;
const MINE_RECHECK=150;
const gameCanvas=$("game-canvas");
gameCanvas.addEventListener("contextmenu",e=>e.preventDefault());
gameCanvas.addEventListener("pointerdown",async e=>{
  downAt={x:e.clientX,y:e.clientY,t:Date.now()};downButton=e.button;
  if(e.button!==0||dead||!dveView)return;
  // A body under the crosshair takes the hit, not the pickaxe.
  if(attackUnderCrosshair()){downAt=null;return;}
  let hit=null;
  try{hit=await dveView.pickCenter();}catch{/* pick failed: nothing to dig */return;}
  if(!hit||!hit.position)return;
  const x=hit.position.x|0,y=hit.position.y|0,z=hit.position.z|0;
  const S=dveMod.SLAB;
  if(x<S.X0||x>=S.X1||y<S.Y0||y>=S.Y1||z<S.Z0||z>=S.Z1)return;
  const id=cellBlock(x,y,z);
  if(!id||id==="air")return;
  mining={x,y,z,t0:performance.now(),nextCheck:performance.now()+MINE_RECHECK,
    hardness:Number(blockById(id)?.hardness)||2,done:false};
  $("mine-bar").hidden=false;
  requestAnimationFrame(miningTick);
});
gameCanvas.addEventListener("pointermove",e=>{
  // Dragging to look (unlocked pointer) abandons the dig.
  if(mining&&downAt&&Math.abs(e.clientX-downAt.x)+Math.abs(e.clientY-downAt.y)>=8)stopMining();
});
gameCanvas.addEventListener("pointerup",async e=>{
  if(!downAt||e.button!==downButton){downAt=null;return;}
  const moved=Math.abs(e.clientX-downAt.x)+Math.abs(e.clientY-downAt.y);
  const quick=Date.now()-downAt.t<600;
  downAt=null;
  if(e.button===0){stopMining();return;} // release early: the bar dies, nothing POSTs
  if(!dveView||moved>=8||!quick||e.button>2)return;
  await placeAction();
});
function stopMining(){
  mining=null;
  const bar=$("mine-bar");
  bar.hidden=true;bar.firstElementChild.style.width="0";
}
function miningTick(){
  if(!mining||mining.done)return;
  const fill=$("mine-bar").firstElementChild;
  const now=performance.now();
  // The target must stay under the crosshair: re-pick on a throttle and let
  // the answer cancel the dig if the aim (or the block) moved out from under.
  if(now>=mining.nextCheck){
    mining.nextCheck=now+MINE_RECHECK;
    const m=mining;
    dveView.pickCenter().then(hit=>{
      if(mining!==m)return;
      if(!hit||!hit.position||(hit.position.x|0)!==m.x||(hit.position.y|0)!==m.y||(hit.position.z|0)!==m.z)stopMining();
    }).catch(()=>{if(mining===m)stopMining();});
  }
  if(mining.hardness>=500){fill.style.width="99.9%";}
  else{
    const speed=Math.max(1,Number(itemMeta(selectedItem)?.speed)||1);
    const p=(now-mining.t0)/(250+mining.hardness/speed*1000);
    if(p>=1){
      const m=mining;m.done=true;stopMining();
      void worldAction(2,m.x,m.y,m.z);
      return;
    }
    fill.style.width=`${(p*100).toFixed(1)}%`;
  }
  requestAnimationFrame(miningTick);
}
async function placeAction(){
  if(dead){toast("You are dead — respawn first.",true);return;}
  let hit=null;
  try{hit=await dveView.pickCenter();}catch{/* pick failed: treat as nothing in reach */}
  if(!hit||!hit.position){toast("Nothing in reach — aim the crosshair at a block.",true);return;}
  const cell=hit.normalPosition; // place onto the adjacent face
  const x=cell.x|0,y=cell.y|0,z=cell.z|0;
  const S=dveMod.SLAB;
  if(x<S.X0||x>=S.X1||y<S.Y0||y>=S.Y1||z<S.Z0||z>=S.Z1){toast("That is outside the world.",true);return;}
  if(dveView.bodyCellOverlap(x,y,z)){toast("That block would be inside you.",true);return;}
  await worldAction(0,x,y,z);
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
  if(e.key==="b"||e.key==="B"){e.preventDefault();if(document.pointerLockElement)document.exitPointerLock();openStudio();return;}
  if(e.key==="f"||e.key==="F"){e.preventDefault();eatSelected();return;}
  if(e.key==="e"||e.key==="E"){e.preventDefault();interactUnderCrosshair();return;}
  // Backspace would otherwise walk the tab back through history.
  if(e.key==="Backspace"){e.preventDefault();toggleThirdPerson();return;}
  // Admin settings: "+" is Shift+"=" on a standard keyboard, so both are the
  // same door. Only the admin account has a door: for anyone else the key does
  // nothing at all, and the Worker refuses the requests behind it anyway.
  if(e.key==="+"||e.key==="="){e.preventDefault();if(openAdminPanel()&&document.pointerLockElement)document.exitPointerLock();return;}
  // Ten hotbar slots: 1-9 then 0 for the tenth.
  if(/^Digit[0-9]$/.test(e.code)){
    const slot=e.code==="Digit0"?9:Number(e.code.slice(5))-1;
    if(slot>=HOTBAR_SLOTS)return;
    const entries=Object.entries(inventory).slice(0,HOTBAR_SLOTS);
    const entry=entries[slot];
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
  updateJoinLabel();
  void refreshServers();
  $("main-menu").addEventListener("cancel", e => e.preventDefault()); // landing stays until Join
  $("mm-join").addEventListener("click", async () => {
    // The landing is where you sign in now, so a Join press by a signed-out
    // player must ask for the session instead of opening an empty world.
    if(!authenticated){openAuth("login");toast("Log in first — the world remembers where you stand.");return;}
    $("main-menu").close();
    $("game").hidden = false;
    if (dveView) {           // returning from the game to the menu and back
      if (settings.serverId === joinedServerId) {
        dveView.resize();
        dveView.grabPointer();
        return;
      }
      // A different world: the running engine — its generator worker (born
      // with the old world id in its URL hash), its edit mirror, its socket
      // world and its Babylon scene — belongs to the world we left. Joining
      // on top of it just stacked the two worlds' edits on one screen. The
      // honest reset is a fresh page; ac_autojoin presses Join again once
      // the new page has restored the session.
      sessionStorage.setItem("ac_autojoin", "1");
      location.reload();
      return;
    }
    try {
      // The revision map has to be fresh or every bundle below is requested by
      // a stale hash and the browser serves an old engine from cache. The map
      // itself is a few hundred bytes, so bust it per page load and let the
      // hashed bundles keep their long-lived caching.
      // Absolute page-origin URLs: app.js itself may be served from a CDN, and
      // relative specifiers here would resolve against the CDN - dve-view.js
      // then spawns its workers from the CDN URL, and cross-origin Worker()
      // is a SecurityError. The engine always comes from the site's own origin.
      const localBase = location.href.replace(/[^/]*$/, "");
      const { DVE_REV } = await import(`${localBase}dve/dist/rev.js?n=${Date.now()}`);
      dveMod = await import(`${localBase}dve/dist/dve-view.js?h=${DVE_REV["dve-view.js"]}`);
      await refreshRegistry();      // textures come from the block registry
      await loadWorldAll();         // player edits made before this session
      await initGameView();
      dveView.grabPointer();        // cursor goes to the game (user gesture)
    } catch (err) {
      // A private or LAN world answers 403 when this device does not qualify;
      // say which and fall back to the shared world instead of an empty one.
      if (err.status === 403 && settings.serverId !== "global") {
        toast(err.message === "lan" ? "That world only lets devices on its local network in — back to the global world." : "That world is private to the device that made it — back to the global world.", true);
        settings.serverId = "global";
        saveSettings();
        liveReconnect();
        renderServerPicker();
        try {
          await refreshRegistry();
          await loadWorldAll();
          await initGameView();
          dveView.grabPointer();
          return;
        } catch { /* the shared world failed too */ }
      }
      failGame(err);
      $("game").hidden = true;
      $("main-menu").showModal();
    }
  });
  $("mm-settings").addEventListener("click", () => { syncSettingsInputs(); $("settings-dialog").showModal(); });
  $("main-menu").showModal();
  // Join after a world-switch reload (see the Join handler): the flag is set
  // only by that switch, so this never auto-boots the game for a cold visit.
  if (sessionStorage.getItem("ac_autojoin") === "1") {
    sessionStorage.removeItem("ac_autojoin");
    void restoreSession().then(() => { if (authenticated) $("mm-join").click(); });
  }
}
boot();
