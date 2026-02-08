// AKVIZITOR – MVP Shell (bez backendu)
// Data ukládáme lokálně + export/import JSON.
// Postup: Projekt → Sběr → (2D) → (3D) → Výstupy → Odhad

(function () {
  "use strict";

  // ---------- utils ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const fmtDateTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("cs-CZ");
    } catch {
      return iso;
    }
  };

  const safeId = () => {
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  };

  const downloadText = (filename, text, mime = "application/json") => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = reject;
      fr.readAsText(file);
    });

  // ---------- storage ----------
  const STORAGE_KEY = "akvizitor.projects.v1";

  function loadAllProjects() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveAllProjects(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function upsertProject(project) {
    const list = loadAllProjects();
    const idx = list.findIndex((p) => p.id === project.id);
    if (idx >= 0) list[idx] = project;
    else list.unshift(project);
    saveAllProjects(list);
  }

  function deleteProject(id) {
    const list = loadAllProjects().filter((p) => p.id !== id);
    saveAllProjects(list);
  }

  function getProjectById(id) {
    return loadAllProjects().find((p) => p.id === id) || null;
  }

  // ---------- app state ----------
  const state = {
    activeView: "project",
    currentProjectId: null,
    currentFloorId: null,
    photoRoomId: null,
    lastCalculation: null,
  };

  // ---------- elements ----------
  const tabs = $$(".tab");
  const views = {
    project: $("#view-project"),
    collect: $("#view-collect"),
    plan2d: $("#view-plan2d"),
    view3d: $("#view-view3d"),
    outputs: $("#view-outputs"),
    estimate: $("#view-estimate"),
  };

  const currentProjectPill = $("#currentProjectPill");
  const currentProjectTitle = $("#currentProjectTitle");
  const closeProjectBtn = $("#closeProjectBtn");

  const projectCreateForm = $("#projectCreateForm");
  const projName = $("#projName");
  const projType = $("#projType");
  const projAddress = $("#projAddress");
  const projectsList = $("#projectsList");
  const importProjectInput = $("#importProjectInput");
  const importStatus = $("#importStatus");

  const noProjectNotice = $("#noProjectNotice");
  const collectContent = $("#collectContent");
  const roomForm = $("#roomForm");
  const roomName = $("#roomName");
  const roomHeight = $("#roomHeight");
  const roomLen = $("#roomLen");
  const roomWid = $("#roomWid");
  const roomsList = $("#roomsList");
  const kpiRooms = $("#kpiRooms");
  const kpiArea = $("#kpiArea");
  const photosInput = $("#photosInput");
  const photosList = $("#photosList");

  const floorSelect = $("#floorSelect");
  const newFloorName = $("#newFloorName");
  const addFloorBtn = $("#addFloorBtn");
  const renameFloorBtn = $("#renameFloorBtn");
  const deleteFloorBtn = $("#deleteFloorBtn");
  const floorHint = $("#floorHint");

  const photoRoomSelect = $("#photoRoomSelect");

  const noProjectNoticeOutputs = $("#noProjectNoticeOutputs");
  const outputsContent = $("#outputsContent");
  const exportProjectBtn = $("#exportProjectBtn");
  const exportRoomsCsvBtn = $("#exportRoomsCsvBtn");
  const outputsSummary = $("#outputsSummary");

  const quickExportProjectBtn = $("#quickExportProjectBtn");
  const quickImportInput = $("#quickImportInput");

  const calcForm = $("#calculator-form");
  const resultBox = $("#result");
  const priceOutput = $("#priceOutput");
  const summaryOutput = $("#summaryOutput");
  const elType = $("#propertyType");
  const elArea = $("#area");
  const elLocality = $("#locality");
  const elCondition = $("#condition");
  const exportCalcBtn = $("#exportJsonBtn");
  const resetBtn = $("#resetBtn");
  const saveCalcToProjectBtn = $("#saveCalcToProjectBtn");
  const saveCalcStatus = $("#saveCalcStatus");

  const chkEls = $$("#checklist .chk");

  // ---------- navigation ----------
  function setActiveView(viewKey) {
    state.activeView = viewKey;
    tabs.forEach((b) => b.classList.toggle("is-active", b.dataset.view === viewKey));
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.hidden = k !== viewKey;
    });
    renderProjectPill();
    renderChecklist();
    if (viewKey === "project") renderProjectsList();
    if (viewKey === "collect") renderCollectView();
    if (viewKey === "outputs") renderOutputsView();
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });

  // ---------- project model ----------
  function newProject({ name, type, address }) {
    const now = new Date().toISOString();
    return {
      id: safeId(),
      meta: {
        name: name.trim(),
        type,
        address: String(address || "").trim(),
        createdAt: now,
        updatedAt: now,
        status: "draft",
      },
      floors: [{ id: safeId(), name: "Přízemí", rooms: [] }],
      media: {
        photos: [],
      },
      calc: null,
    };
  }

  function getCurrentProject() {
    if (!state.currentProjectId) return null;
    return getProjectById(state.currentProjectId);
  }

  function openProject(id) {
    const p = getProjectById(id);
    if (!p) return;
    state.currentProjectId = id;
    state.currentFloorId = p.floors?.[0]?.id || null;
    setActiveView("collect");
  }
  function closeProject() {
  state.currentProjectId = null;
  state.currentFloorId = null;
  state.photoRoomId = null;
  setActiveView("project");
  }
  if (closeProjectBtn) closeProjectBtn.addEventListener("click", closeProject);

  // ---------- floors helpers ----------
  function getCurrentFloor(project) {
    if (!project) return null;
    if (!state.currentFloorId) return project.floors?.[0] || null;
    return project.floors?.find(f => f.id === state.currentFloorId) || project.floors?.[0] || null;
  }

  function ensureFloorSelected(project) {
    if (!project) return;
    const exists = project.floors?.some(f => f.id === state.currentFloorId);
    if (!exists) state.currentFloorId = project.floors?.[0]?.id || null;
  }

  function addFloor(name) {
    const p = getCurrentProject();
    if (!p) return;
    const nm = String(name || "").trim();
    if (!nm) return;
    const floor = { id: safeId(), name: nm, rooms: [] };
    p.floors = p.floors || [];
    p.floors.push(floor);
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    state.currentFloorId = floor.id;
    renderCollectView();
  }

  function renameCurrentFloor() {
    const p = getCurrentProject();
    if (!p) return;
    ensureFloorSelected(p);
    const f = getCurrentFloor(p);
    if (!f) return;
    const nm = prompt("Nový název patra:", f.name);
    if (!nm) return;
    f.name = nm.trim();
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    renderCollectView();
  }

  function deleteCurrentFloor() {
    const p = getCurrentProject();
    if (!p) return;
    if ((p.floors || []).length <= 1) {
      alert("Musí zůstat alespoň jedno patro.");
      return;
    }
    ensureFloorSelected(p);
    const f = getCurrentFloor(p);
    if (!f) return;
    const ok = confirm(`Smazat patro "${f.name}" včetně jeho místností?`);
    if (!ok) return;
    const floorId = f.id;
    p.media.photos = (p.media.photos || []).filter(ph => ph.floorId !== floorId);
    p.floors = (p.floors || []).filter(x => x.id !== floorId);
    state.currentFloorId = p.floors[0].id;
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    renderCollectView();
  }

  function renderFloorControls(project) {
    if (!floorSelect || !project) return;
    ensureFloorSelected(project);
    floorSelect.innerHTML = (project.floors || []).map(f => {
      const sel = f.id === state.currentFloorId ? "selected" : "";
      return `<option value="${f.id}" ${sel}>${escapeHtml(f.name)}</option>`;
    }).join("");
    if (floorHint) {
      const f = getCurrentFloor(project);
      const rooms = f?.rooms || [];
      floorHint.textContent = f ? `Aktivní patro: ${f.name} · místností: ${rooms.length}` : "";
    }
    floorSelect.onchange = () => {
      state.currentFloorId = floorSelect.value;
      renderCollectView();
    };
    if (addFloorBtn) {
      addFloorBtn.onclick = () => {
        addFloor(newFloorName?.value || "");
        if (newFloorName) newFloorName.value = "";
      };
    }
    if (renameFloorBtn) renameFloorBtn.onclick = renameCurrentFloor;
    if (deleteFloorBtn) deleteFloorBtn.onclick = deleteCurrentFloor;
  }

  // ---------- render helpers ----------
  function renderProjectPill() {
    const p = getCurrentProject();
    if (!p) {
      if (currentProjectPill) currentProjectPill.hidden = true;
      if (currentProjectTitle) currentProjectTitle.textContent = "Bez projektu";
      return;
    }
    if (currentProjectPill) currentProjectPill.hidden = false;
    if (currentProjectTitle) currentProjectTitle.textContent = p.meta.name;
  }

  function renderProjectsList() {
    const list = loadAllProjects();
    if (!projectsList) return;
    if (!list.length) {
      projectsList.innerHTML = `<div class="placeholder">Zatím nemáš žádné projekty. Založ první projekt vlevo.</div>`;
      return;
    }
    projectsList.innerHTML = list
      .map((p) => {
        const subtitle = [p.meta.type ? `typ: ${p.meta.type}` : null, p.meta.address ? p.meta.address : null]
          .filter(Boolean)
          .join(" · ");
        const updated = p.meta.updatedAt ? fmtDateTime(p.meta.updatedAt) : "";
        const roomsCount = (p.floors || []).reduce((sum, f) => sum + (f.rooms?.length || 0), 0);
        return `
        <div class="item">
          <div>
            <div class="item-title">${escapeHtml(p.meta.name)}</div>
            <div class="item-meta">${escapeHtml(subtitle || "—")} · místností: ${roomsCount} · upraveno: ${escapeHtml(updated)}</div>
          </div>
          <div class="item-actions">
            <button class="btn-mini primary" data-act="open" data-id="${p.id}">Otevřít</button>
            <button class="btn-mini" data-act="export" data-id="${p.id}">Export</button>
            <button class="btn-mini danger" data-act="delete" data-id="${p.id}">Smazat</button>
          </div>
        </div>
      `;
      })
      .join("");
    projectsList.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        if (!id) return;
        if (act === "open") openProject(id);
        if (act === "export") exportProjectById(id);
        if (act === "delete") {
          if (!confirm("Opravdu smazat projekt?")) return;
          if (state.currentProjectId === id) state.currentProjectId = null;
          deleteProject(id);
          renderProjectsList();
          renderChecklist();
          renderProjectPill();
        }
      });
    });
  }

  function renderCollectView() {
    const p = getCurrentProject();
    if (noProjectNotice) noProjectNotice.hidden = !!p;
    if (collectContent) collectContent.hidden = !p;
    if (!p) return;

    renderFloorControls(p);

    const floor = getCurrentFloor(p);
    const rooms = floor?.rooms || [];
    const totalArea = rooms.reduce((s, r) => s + (Number(r.area) || 0), 0);

    if (kpiRooms) kpiRooms.textContent = String(rooms.length);
    if (kpiArea) kpiArea.textContent = (Math.round(totalArea * 100) / 100).toLocaleString("cs-CZ");

    if (roomsList) {
      if (!rooms.length) {
        roomsList.innerHTML = `<div class="placeholder">Zatím žádné místnosti. Přidej první vlevo.</div>`;
      } else {
        roomsList.innerHTML = rooms
          .map((r) => {
            return `
          <div class="item">
            <div>
              <div class="item-title">${escapeHtml(r.name)}</div>
              <div class="item-meta">${r.area.toLocaleString("cs-CZ")} m² · ${r.length}×${r.width} m${r.height ? ` · výška ${r.height} m` : ""} · fotek: ${(p.media?.photos || []).filter(ph => ph.roomId === r.id).length}</div>
            </div>
            <div class="item-actions">
              <button class="btn-mini danger" data-room-del="${r.id}">Smazat</button>
            </div>
          </div>
        `;
          })
          .join("");

        roomsList.querySelectorAll("[data-room-del]").forEach((b) => {
          b.addEventListener("click", () => {
            const id = b.getAttribute("data-room-del");
            if (!id) return;
            removeRoom(id);
          });
        });
      }
    }

    if (photoRoomSelect) {
      const prev = state.photoRoomId;
      if (!rooms.length) {
        photoRoomSelect.innerHTML = `<option value="">— nejdřív přidej místnost —</option>`;
        state.photoRoomId = null;
      } else {
        photoRoomSelect.innerHTML = rooms
          .map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)
          .join("");
        const exists = prev && rooms.some(r => r.id === prev);
        const selected = exists ? prev : rooms[0].id;
        photoRoomSelect.value = selected;
        state.photoRoomId = selected;
        photoRoomSelect.onchange = () => {
          state.photoRoomId = photoRoomSelect.value || null;
          renderCollectView();
        };
      }
    }

    const photos = p.media?.photos || [];
    const selectedRoomId = state.photoRoomId || photoRoomSelect?.value || (rooms[0]?.id || "");
    const roomPhotos = selectedRoomId ? photos.filter(ph => ph.roomId === selectedRoomId) : [];

    if (photosList) {
      photosList.innerHTML = roomPhotos.length
        ? roomPhotos.map(ph => `<span class="chip">${escapeHtml(ph.name)}</span>`).join("")
        : `<span class="chip">Pro vybranou místnost nejsou fotky</span>`;
    }

    renderChecklist();
  }

  function renderOutputsView() {
    const p = getCurrentProject();
    if (noProjectNoticeOutputs) noProjectNoticeOutputs.hidden = !!p;
    if (outputsContent) outputsContent.hidden = !p;
    if (!p) return;

    const allRooms = (p.floors || []).flatMap(fl => fl.rooms || []);
    const totalArea = allRooms.reduce((s, r) => s + (Number(r.area) || 0), 0);

    const address = p.meta.address ? `<div><b>Adresa:</b> ${escapeHtml(p.meta.address)}</div>` : "";
    const calc = p.calc
      ? `<div><b>Odhad:</b> ${(p.calc?.calculation?.totalPrice || 0).toLocaleString("cs-CZ")} Kč</div>`
      : "";

    if (outputsSummary) {
      outputsSummary.innerHTML = `
        <div><b>Název:</b> ${escapeHtml(p.meta.name)}</div>
        <div><b>Typ:</b> ${escapeHtml(p.meta.type || "—")}</div>
        ${address}
        <div><b>Místností:</b> ${allRooms.length}</div>
        <div><b>Celkem m²:</b> ${(Math.round(totalArea * 100) / 100).toLocaleString("cs-CZ")}</div>
        ${calc}
        <div class="divider"></div>
        <div class="small muted">Později sem doplníme PDF půdorys + fotodokumentaci.</div>
      `;
    }
  }

  function renderChecklist() {
    const p = getCurrentProject();
    const flags = {
      project: !!p,
      rooms: !!p && (p.floors || []).some(fl => (fl.rooms || []).length > 0),
      photos: !!p && (p.media?.photos || []).length > 0,
      plan2d: false,
      outputs: false,
    };

    chkEls.forEach((el) => {
      const key = el.getAttribute("data-chk");
      el.classList.toggle("is-on", !!flags[key]);
    });
  }

  // ---------- actions: create/import/export ----------
  if (projectCreateForm) {
    projectCreateForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = projName?.value?.trim() || "";
      const type = projType?.value?.trim() || "";
      const address = projAddress?.value?.trim() || "";

      if (!name || !type) return;

      const p = newProject({ name, type, address });
      upsertProject(p);

      if (projName) projName.value = "";
      if (projType) projType.value = "";
      if (projAddress) projAddress.value = "";

      renderProjectsList();
      openProject(p.id);
    });
  }

  function exportProjectById(id) {
    const p = getProjectById(id);
    if (!p) return;

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const safeName = (p.meta.name || "projekt")
      .toLowerCase()
      .replace(/[^a-z0-9á-ž\- ]/gi, "")
      .trim()
      .replace(/\s+/g, "-");

    downloadText(`akvizitor-${safeName}-${y}-${m}-${day}.json`, JSON.stringify(p, null, 2));
  }

  function exportCurrentProject() {
    const p = getCurrentProject();
    if (!p) {
      alert("Nejdřív otevři projekt.");
      return;
    }
    exportProjectById(p.id);
  }

  function exportRoomsCsv() {
    const p = getCurrentProject();
    if (!p) {
      alert("Nejdřív otevři projekt.");
      return;
    }
    const photos = p.media?.photos || [];

    const rows = [];
    (p.floors || []).forEach(fl => {
      (fl.rooms || []).forEach(r => {
        const roomPhotos = photos.filter(ph => ph.roomId === r.id);
        rows.push({
          floor_id: fl.id,
          floor_name: fl.name,
          room_id: r.id,
          name: r.name,
          length_m: r.length,
          width_m: r.width,
          height_m: r.height || "",
          area_m2: r.area,
          photo_count: roomPhotos.length,
          photo_ids: roomPhotos.map(ph => ph.id).join("|")
        });
      });
    });

    const header = [
      "floor_id","floor_name","room_id",
      "name","length_m","width_m","height_m","area_m2",
      "photo_count","photo_ids"
    ];
    const lines = rows.map(row => ([
      csvCell(row.floor_id),
      csvCell(row.floor_name),
      csvCell(row.room_id),
      csvCell(row.name),
      csvCell(row.length_m),
      csvCell(row.width_m),
      csvCell(row.height_m),
      csvCell(row.area_m2),
      csvCell(row.photo_count),
      csvCell(row.photo_ids)
    ].join(",")));

    const csv = [header.join(","), ...lines].join("\n");
    downloadText(`akvizitor-mistnosti.csv`, csv, "text/csv;charset=utf-8");
  }

  if (exportProjectBtn) exportProjectBtn.addEventListener("click", exportCurrentProject);
  if (quickExportProjectBtn) quickExportProjectBtn.addEventListener("click", exportCurrentProject);
  if (exportRoomsCsvBtn) exportRoomsCsvBtn.addEventListener("click", exportRoomsCsv);

  async function importProjectFromFile(file) {
    if (importStatus) importStatus.textContent = "";
    if (!file) return;

    try {
      const txt = await readFileAsText(file);
      const obj = JSON.parse(txt);

      if (!obj || typeof obj !== "object" || !obj.id || !obj.meta || !obj.floors) {
        throw new Error("Soubor nevypadá jako projekt AKVIZITOR.");
      }

      obj.meta.updatedAt = new Date().toISOString();

      upsertProject(obj);
      if (importStatus) importStatus.textContent = "Import hotový.";
      renderProjectsList();
      openProject(obj.id);
    } catch (err) {
      if (importStatus) importStatus.textContent = "Import selhal: " + (err?.message || String(err));
    }
  }

  if (importProjectInput) {
    importProjectInput.addEventListener("change", async () => {
      const file = importProjectInput.files?.[0];
      await importProjectFromFile(file);
      importProjectInput.value = "";
    });
  }

  if (quickImportInput) {
    quickImportInput.addEventListener("change", async () => {
      const file = quickImportInput.files?.[0];
      await importProjectFromFile(file);
      quickImportInput.value = "";
    });
  }

  // ---------- rooms ----------
  function addRoom({ name, length, width, height }) {
    const p = getCurrentProject();
    if (!p) return;

    const L = Number(length);
    const W = Number(width);
    if (!Number.isFinite(L) || !Number.isFinite(W) || L <= 0 || W <= 0) {
      alert("Zadej platnou délku a šířku (v metrech).");
      return;
    }

    const H = height ? Number(height) : null;
    if (height && (!Number.isFinite(H) || H <= 0)) {
      alert("Výška musí být kladné číslo (nebo prázdné).");
      return;
    }

    const area = Math.round(L * W * 100) / 100;

    const room = {
      id: safeId(),
      name: String(name || "").trim(),
      length: Math.round(L * 100) / 100,
      width: Math.round(W * 100) / 100,
      height: H ? Math.round(H * 100) / 100 : null,
      area,
    };

    ensureFloorSelected(p);
    const floor = getCurrentFloor(p);
    if (!floor) return;
    floor.rooms.push(room);
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    renderCollectView();
  }

  function removeRoom(roomId) {
    const p = getCurrentProject();
    if (!p) return;
    ensureFloorSelected(p);
    const floor = getCurrentFloor(p);
    if (!floor) return;

    floor.rooms = (floor.rooms || []).filter(r => r.id !== roomId);
    p.media.photos = (p.media.photos || []).filter(ph => ph.roomId !== roomId);
    if (state.photoRoomId === roomId) state.photoRoomId = null;
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    renderCollectView();
  }

  if (roomForm) {
    roomForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = getCurrentProject();
      if (!p) return;

      addRoom({
        name: roomName?.value || "",
        length: roomLen?.value || "",
        width: roomWid?.value || "",
        height: roomHeight?.value || "",
      });

      if (roomName) roomName.value = "";
      if (roomLen) roomLen.value = "";
      if (roomWid) roomWid.value = "";
      if (roomHeight) roomHeight.value = "";
    });
  }

  // ---------- photos ----------
  if (photosInput) {
    photosInput.addEventListener("change", () => {
      const p = getCurrentProject();
      if (!p) return;
      const files = Array.from(photosInput.files || []);
      if (!files.length) return;

      const now = new Date().toISOString();
      p.media.photos = p.media.photos || [];

      ensureFloorSelected(p);
      const floor = getCurrentFloor(p);
      const floorId = floor?.id || null;

      const roomId = photoRoomSelect?.value || null;
      if (!roomId) {
        alert("Vyber místnost, ke které chceš fotky přiřadit.");
        photosInput.value = "";
        return;
      }

      files.forEach((f) => {
        p.media.photos.push({
          id: safeId(),
          name: f.name,
          size: f.size,
          addedAt: now,
          roomId,
          floorId
        });
      });

      p.meta.updatedAt = now;
      upsertProject(p);

      photosInput.value = "";
      renderCollectView();
    });
  }

  // ---------- estimate module ----------
  const basePricePerM2 = { byt: 65000, dum: 52000, pozemek: 3500 };
  const localityFactor = { praha: 1.55, kraj: 1.25, okres: 1.0, venkov: 0.85 };
  const conditionFactor = { novostavba: 1.15, dobry: 1.0, pred_rekonstrukci: 0.8 };

  function formatCZK(value) {
    const rounded = Math.round(value);
    return rounded.toLocaleString("cs-CZ") + " Kč";
  }

  function typeLabel(type) {
    if (type === "byt") return "byt";
    if (type === "dum") return "rodinný dům";
    if (type === "pozemek") return "pozemek";
    return "nemovitost";
  }

  function localityLabel(locality) {
    if (locality === "praha") return "Praha";
    if (locality === "kraj") return "krajské město";
    if (locality === "okres") return "okresní město";
    if (locality === "venkov") return "venkov";
    return "lokalita";
  }

  function conditionLabel(condition) {
    if (condition === "novostavba") return "novostavba";
    if (condition === "dobry") return "dobrý stav";
    if (condition === "pred_rekonstrukci") return "před rekonstrukcí";
    return "stav";
  }

  function validateCalcInputs() {
    const type = (elType?.value || "").trim();
    const locality = (elLocality?.value || "").trim();
    const condition = (elCondition?.value || "").trim();
    const area = Number(String(elArea?.value || "").trim());

    if (!type || !locality || !condition) return { ok: false, message: "Vyplň prosím všechna pole." };
    if (!Number.isFinite(area) || area <= 0) return { ok: false, message: "Zadej prosím platnou plochu (m²)." };
    return { ok: true, data: { type, area, locality, condition } };
  }

  function calculatePrice({ type, area, locality, condition }) {
    const base = basePricePerM2[type];
    const lf = localityFactor[locality];
    const cf = conditionFactor[condition];
    if (!base || !lf || !cf) return null;

    const unit = base * lf * cf;
    const total = unit * area;

    return { unitPrice: unit, totalPrice: total };
  }

  function buildSummary(input, calc) {
    const t = typeLabel(input.type);
    const loc = localityLabel(input.locality);
    const cond = conditionLabel(input.condition);
    const unitFormatted = formatCZK(calc.unitPrice);
    const totalFormatted = formatCZK(calc.totalPrice);

    return `Orientační ocenění pro ${t} o ploše ${input.area.toLocaleString("cs-CZ")} m² v lokalitě (${loc}), stav: ${cond}.
Jednotková cena vychází na ~${unitFormatted} / m².
Odhadovaná celková cena je ${totalFormatted}.`;
  }

  function showCalcResult(priceText, summaryText) {
    if (priceOutput) priceOutput.textContent = priceText;
    if (summaryOutput) summaryOutput.textContent = summaryText;
    if (resultBox) resultBox.hidden = false;
    resultBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  if (calcForm) {
    calcForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (saveCalcStatus) saveCalcStatus.textContent = "";

      const v = validateCalcInputs();
      if (!v.ok) {
        showCalcResult("Nelze spočítat", v.message);
        return;
      }

      const calc = calculatePrice(v.data);
      if (!calc) {
        showCalcResult("Nelze spočítat", "Interní chyba modelu. Zkus změnit vstupy.");
        return;
      }

      const totalText = `≈ ${formatCZK(calc.totalPrice)}`;
      const summary = buildSummary(v.data, calc);

      state.lastCalculation = {
        meta: {
          app: "AKVIZITOR MVP",
          version: "1.1.0",
          generatedAt: new Date().toISOString(),
        },
        input: v.data,
        calculation: {
          unitPrice: Math.round(calc.unitPrice),
          totalPrice: Math.round(calc.totalPrice),
        },
        summary,
      };

      showCalcResult(totalText, summary);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      calcForm?.reset?.();
      if (resultBox) resultBox.hidden = true;
      state.lastCalculation = null;
      if (saveCalcStatus) saveCalcStatus.textContent = "";
    });
  }

  if (exportCalcBtn) {
    exportCalcBtn.addEventListener("click", () => {
      if (!state.lastCalculation) {
        alert("Nejprve proveď kalkulaci.");
        return;
      }
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const safeType = state.lastCalculation?.input?.type || "nemovitost";
      downloadText(`akvizitor-${safeType}-${y}-${m}-${day}.json`, JSON.stringify(state.lastCalculation, null, 2));
    });
  }

  if (saveCalcToProjectBtn) {
    saveCalcToProjectBtn.addEventListener("click", () => {
      const p = getCurrentProject();
      if (!p) {
        if (saveCalcStatus) saveCalcStatus.textContent = "Nejdřív otevři projekt.";
        return;
      }
      if (!state.lastCalculation) {
        if (saveCalcStatus) saveCalcStatus.textContent = "Nejdřív proveď kalkulaci.";
        return;
      }

      p.calc = state.lastCalculation;
      p.meta.updatedAt = new Date().toISOString();
      upsertProject(p);

      if (saveCalcStatus) saveCalcStatus.textContent = "Uloženo do projektu.";
    });
  }

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function csvCell(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  // ---------- boot ----------
  closeProject();
})();