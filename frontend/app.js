/**
 * Builddy SaaS Scaffold — Frontend App
 * Auth client, API client, router, dark mode, toast notifications.
 *
 * Modification Points:
 *   // {{API_METHODS_INSERTION_POINT}}  — Add custom API methods here
 *   // {{RENDER_INSERTION_POINT}}       — Add custom page renderers here
 */

(function () {
  "use strict";

  const API_BASE = "/api";
  const TOKEN_KEY = "builddy_access_token";
  const REFRESH_KEY = "builddy_refresh_token";
  const USER_KEY = "builddy_user";

  // --- Toast ---
  function showToast(msg, type = "info", dur = 4000) {
    const c = document.getElementById("toastContainer");
    const colors = { success: "bg-green-500", error: "bg-red-500", info: "bg-blue-500", warning: "bg-yellow-500 text-black" };
    const t = document.createElement("div");
    t.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg toast-enter`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add("toast-exit"); setTimeout(() => t.remove(), 300); }, dur);
  }

  // --- Auth ---
  const Auth = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
    getUser: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
    setTokens: (a, r) => { localStorage.setItem(TOKEN_KEY, a); if (r) localStorage.setItem(REFRESH_KEY, r); },
    setUser: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
    clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(USER_KEY); },
    isAuthenticated: () => { try { const p=JSON.parse(atob((Auth.getToken()||"").split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); return p.exp > Date.now()/1000; } catch { return false; } },
    login: async (email, pw) => {
      const r = await fetch(`${API_BASE}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password:pw}) });
      const d = await r.json(); if (!r.ok||!d.success) throw new Error(d.error||"Login failed");
      Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data;
    },
    register: async ({email,password,name}) => {
      const r = await fetch(`${API_BASE}/auth/register`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,name}) });
      const d = await r.json(); if (!r.ok||!d.success) throw new Error(d.error||"Registration failed");
      Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data;
    },
    refresh: async () => {
      const rt = Auth.getRefreshToken(); if (!rt) { Auth.clear(); return null; }
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refreshToken:rt}) });
        const d = await r.json(); if (!r.ok||!d.success) { Auth.clear(); return null; }
        Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data.accessToken;
      } catch { Auth.clear(); return null; }
    },
    logout: async () => { try { await fetch(`${API_BASE}/auth/logout`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${Auth.getToken()}`}, body:JSON.stringify({refreshToken:Auth.getRefreshToken()}) }); } catch {} Auth.clear(); },
  };

  // --- API Client ---
  async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const config = { headers, ...options };
    if (config.body && typeof config.body === "object") config.body = JSON.stringify(config.body);
    let response = await fetch(`${API_BASE}${endpoint}`, config);
    if (response.status === 401) {
      const newToken = await Auth.refresh();
      if (newToken) { config.headers["Authorization"] = `Bearer ${newToken}`; response = await fetch(`${API_BASE}${endpoint}`, config); }
      else { Auth.clear(); window.location.href = "/login"; throw new Error("Session expired"); }
    }
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  const api = {
    getItems: (page=1) => apiFetch(`/items?page=${page}`),
    getItem: (id) => apiFetch(`/items/${id}`),
    createItem: (data) => apiFetch("/items", { method: "POST", body: data }),
    updateItem: (id, data) => apiFetch(`/items/${id}`, { method: "PUT", body: data }),
    deleteItem: (id) => apiFetch(`/items/${id}`, { method: "DELETE" }),
    getProfile: () => apiFetch("/auth/me"),
    health: () => apiFetch("/health"),
    // {{API_METHODS_INSERTION_POINT}}
    // Add your custom API methods above this comment.
  };

  // --- Router ---
  const pages = {};
  let currentPage = "dashboard";
  function registerPage(name, renderer) { pages[name] = renderer; }
  async function navigateTo(page) {
    currentPage = page;
    document.getElementById("pageTitle").textContent = page.charAt(0).toUpperCase() + page.slice(1);
    document.querySelectorAll(".nav-link").forEach((l) => {
      const active = l.dataset.page === page;
      l.className = active ? "nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-white bg-blue-600 dark:bg-blue-500 font-medium"
        : "nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
    });
    if (pages[page]) await pages[page](); else renderDashboard();
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.add("hidden");
  }

  // --- Page Renderers ---
  async function renderDashboard() {
    const main = document.getElementById("mainContent");
    try {
      const result = await api.getItems();
      const items = result.data || [];
      main.innerHTML = `<div class="animate-fade-in">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Total Items</p><p class="text-3xl font-bold mt-1">${result.pagination?.total||items.length}</p></div>
          <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Plan</p><p class="text-3xl font-bold mt-1">Free</p></div>
          <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Status</p><p class="text-3xl font-bold mt-1 text-green-500">Active</p></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700"><h3 class="font-semibold">Recent Items</h3></div>
          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            ${items.length===0?'<p class="p-4 text-gray-500 text-center">No items yet</p>':items.map(i=>`<div class="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50"><div><p class="font-medium">${esc(i.name)}</p><p class="text-sm text-gray-500">ID: ${i.id}</p></div><button onclick="window.__deleteItem(${i.id})" class="text-red-400 hover:text-red-600 p-2">&#128465;</button></div>`).join("")}
          </div></div></div>`;
    } catch (err) { main.innerHTML = `<div class="text-center py-20"><p class="text-red-500 text-lg">${esc(err.message)}</p></div>`; }
  }

  async function renderSettings() {
    const main = document.getElementById("mainContent");
    try {
      const p = await api.getProfile();
      main.innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
        <h3 class="text-lg font-semibold mb-4">Profile Settings</h3>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Name</label><input id="settingsName" type="text" value="${esc(p.data.name||"")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" value="${esc(p.data.email)}" disabled class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 cursor-not-allowed" /></div>
          <button id="saveSettingsBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Save Changes</button>
        </div></div></div>`;
      document.getElementById("saveSettingsBtn")?.addEventListener("click", () => showToast("Settings saved!","success"));
    } catch (err) { main.innerHTML = `<div class="text-center py-20"><p class="text-red-500">${esc(err.message)}</p></div>`; }
  }

  async function renderBilling() {
    document.getElementById("mainContent").innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
      <h3 class="text-lg font-semibold mb-4">Billing & Subscription</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="border border-blue-500 rounded-xl p-6 text-center bg-blue-50 dark:bg-blue-900/20"><p class="text-lg font-bold">Free</p><p class="text-2xl font-bold mt-2">$0/mo</p><p class="text-sm text-gray-500 mt-2">Current plan</p></div>
        <div class="border border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 cursor-pointer"><p class="text-lg font-bold">Pro</p><p class="text-2xl font-bold mt-2">$19/mo</p><button class="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">Upgrade</button></div>
      </div></div></div>`;
  }

  async function renderApiKeys() {
    const main = document.getElementById("mainContent");
    main.innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
      <h3 class="text-lg font-semibold mb-4">API Keys</h3>
      <div class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-4"><code class="flex-1 text-sm font-mono truncate" id="apiKeyDisplay">Loading...</code><button id="copyKeyBtn" class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Copy</button></div>
      <button id="regenKeyBtn" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">Regenerate Key</button>
    </div></div>`;
    try { const p = await api.getProfile(); document.getElementById("apiKeyDisplay").textContent = p.data.api_key || "No key"; } catch {}
    document.getElementById("copyKeyBtn")?.addEventListener("click", () => { navigator.clipboard.writeText(document.getElementById("apiKeyDisplay").textContent).then(() => showToast("Copied!","success")); });
  }

  registerPage("dashboard", renderDashboard);
  registerPage("settings", renderSettings);
  registerPage("billing", renderBilling);
  registerPage("apikeys", renderApiKeys);
  // {{RENDER_INSERTION_POINT}}
  // Add your custom page renderers above this comment.

  // --- Dark Mode ---
  function initDarkMode() {
    const toggle = document.getElementById("darkToggle"), icon = document.getElementById("darkIcon");
    if (localStorage.getItem("builddy-dark")==="false") { document.documentElement.classList.remove("dark"); icon.textContent="\u2600"; }
    toggle.addEventListener("click", () => { const d=document.documentElement.classList.toggle("dark"); localStorage.setItem("builddy-dark",d); icon.textContent=d?"\u263E":"\u2600"; });
  }

  function esc(s) { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
  window.__deleteItem = async (id) => { if(!confirm("Delete?")) return; try { await api.deleteItem(id); showToast("Deleted","success"); navigateTo("dashboard"); } catch(e) { showToast(e.message,"error"); } };

  async function init() {
    initDarkMode();
    document.querySelectorAll(".nav-link").forEach((l) => l.addEventListener("click", (e) => { e.preventDefault(); navigateTo(l.dataset.page); }));
    document.getElementById("menuToggle")?.addEventListener("click", () => { document.getElementById("sidebar").classList.toggle("open"); document.getElementById("sidebarOverlay").classList.toggle("hidden"); });
    document.getElementById("sidebarOverlay")?.addEventListener("click", () => { document.getElementById("sidebar").classList.remove("open"); document.getElementById("sidebarOverlay").classList.add("hidden"); });
    document.getElementById("logoutBtn")?.addEventListener("click", async () => { await Auth.logout(); window.location.reload(); });

    if (Auth.isAuthenticated()) {
      const u = Auth.getUser();
      if (u) { document.getElementById("userName").textContent = u.name||u.email||"User"; document.getElementById("userEmail").textContent = u.email||""; document.getElementById("userAvatar").textContent = (u.name||u.email||"U")[0].toUpperCase(); }
      navigateTo("dashboard");
    } else {
      document.getElementById("mainContent").innerHTML = `<div class="flex flex-col items-center justify-center py-20 animate-fade-in"><div class="text-6xl mb-4">&#128274;</div><p class="text-gray-500 text-lg mb-4">Please log in</p><a href="/login" class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Login</a></div>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.BuilddyApp = { api, Auth, showToast, navigateTo, registerPage };
})();
