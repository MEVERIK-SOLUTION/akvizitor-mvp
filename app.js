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
    // 2D editor state
    plan2dLinkingMode: false,
    plan2dLinkingFrom: null, // { roomId, doorId }
    plan2dPanActive: false,
    plan2dBound: false, // Flag to prevent duplicate event binding
    plan2dLongPressTimer: null, // For mobile long-press drag
    plan2dTouchPoints: [], // Track touch points for gestures
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
  const floorHeight = $("#floorHeight");
  const saveFloorHeightBtn = $("#saveFloorHeightBtn");

  const photoRoomSelect = $("#photoRoomSelect");

  const noProjectNoticeOutputs = $("#noProjectNoticeOutputs");
  const outputsContent = $("#outputsContent");
  const exportProjectBtn = $("#exportProjectBtn");
  const exportRoomsCsvBtn = $("#exportRoomsCsvBtn");
  const outputsSummary = $("#outputsSummary");

  // 2D Editor elements
  const noRoomsNotice2D = $("#noRoomsNotice2D");
  const plan2dContent = $("#plan2dContent");
  const plan2dSvg = $("#plan2dSvg");
  const plan2dPanel = $("#plan2dPanel");
  const plan2dPanelContent = $("#plan2dPanelContent");
  const plan2dZoomSlider = $("#plan2dZoomSlider");
  const plan2dZoomLabel = $("#plan2dZoomLabel");
  const plan2dZoomReset = $("#plan2dZoomReset");
  const plan2dSnapToggle = $("#plan2dSnapToggle");
  const plan2dExportPng = $("#plan2dExportPng");
  const plan2dRegistry = document.querySelector(".plan2d-registry");
  const plan2dRoomsList = $("#plan2dRoomsList");
  const plan2dRegistryClose = $("#plan2dRegistryClose");
  const plan2dShowRegistry = $("#plan2dShowRegistry");
  const continueToCollect = $("#continueToCollect");
  const continueTo2D = $("#continueTo2D");

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
    if (viewKey === "plan2d") init2D();
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
      // floors: each floor now may carry an optional `height` (number or null)
      floors: [{ id: safeId(), name: "Přízemí", rooms: [], height: null }],
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
    // New floors default to `height: null` (inherit / unspecified)
    const floor = { id: safeId(), name: nm, rooms: [], height: null };
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
      const f = getCurrentFloor(getCurrentProject());
      if (f?.plan2d) f.plan2d.selectedRoomId = null;
      state.plan2dLinkingMode = false;
      state.plan2dLinkingFrom = null;
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

    // Ensure floor height input reflects current floor and provide save handler
    const f = getCurrentFloor(project);
    if (f && typeof floorHeight !== 'undefined' && floorHeight !== null) {
      // show numeric value or empty if null/undefined
      floorHeight.value = (f.height !== null && f.height !== undefined) ? String(f.height) : "";
    }
    if (saveFloorHeightBtn) {
      saveFloorHeightBtn.onclick = () => {
        const p2 = getCurrentProject();
        if (!p2) return;
        const cf = getCurrentFloor(p2);
        if (!cf) return;
        const raw = floorHeight?.value;
        // store number or null
        const v = (raw === null || raw === undefined || String(raw).trim() === "") ? null : Number(raw);
        if (v !== null && (!Number.isFinite(v) || v < 0)) {
          alert('Zadej platnou výšku patra (kladné číslo nebo prázdné).');
          return;
        }
        cf.height = v === null ? null : Math.round(v * 100) / 100;
        p2.meta.updatedAt = new Date().toISOString();
        upsertProject(p2);
        renderCollectView();
      };
    }
  }

  // ---------- 2D editor model & helpers ----------
  function ensureFloorPlan2d(floor) {
    if (!floor) return;
    if (!floor.plan2d) {
      floor.plan2d = {
        scale: 60,      // px per meter
        panX: 0,
        panY: 0,
        zoom: 1,
        roomPos: {},    // { roomId: { x, y } } in meters
        links: [],      // { aRoomId, aDoorId, bRoomId, bDoorId }
        selectedRoomId: null, // Currently selected room (UI state)
      };
    }
    // Ensure selectedRoomId exists
    if (floor.plan2d.selectedRoomId === undefined) {
      floor.plan2d.selectedRoomId = null;
    }
    // fill in missing roomPos for rooms
    (floor.rooms || []).forEach((r) => {
      if (!floor.plan2d.roomPos[r.id]) {
        // auto-position new rooms in a grid pattern
        const count = Object.keys(floor.plan2d.roomPos).length;
        const col = count % 3;
        const row = Math.floor(count / 3);
        floor.plan2d.roomPos[r.id] = { x: col * 5, y: row * 4 };
      }
    });
  }

  function ensureRoomDoors(room) {
    if (!room) return;
    if (!room.doors) room.doors = [];
  }

  function ensureRoomOpenings(room) {
    if (!room) return;
    if (!room.openings) {
      room.openings = { doors: [], windows: [] };
      // migrate legacy room.doors if present
      if (room.doors && room.doors.length) {
        room.openings.doors = room.doors.map(d => ({ ...d }));
      }
    }
  }

  function getDoorWorldPos(room, door, roomPosM) {
    // door is { id, wall: "N"|"E"|"S"|"W", offsetM, widthM }
    // roomPosM is { x, y } in meters (top-left of room)
    // returns segment endpoints in meters
    if (!door || !roomPosM) return null;
    const { x, y } = roomPosM;
    const { length, width } = room;
    let { wall, offsetM, widthM } = door;
    // accept alternate wall codes A|B|C|D (map to N,E,S,W)
    if (typeof wall === 'string') {
      const w = wall.toUpperCase();
      if (w === 'A') wall = 'N';
      if (w === 'B') wall = 'E';
      if (w === 'C') wall = 'S';
      if (w === 'D') wall = 'W';
    }

    let x1, y1, x2, y2;
    if (wall === "N") {
      x1 = x + offsetM; y1 = y;
      x2 = x1 + widthM; y2 = y;
    } else if (wall === "S") {
      x1 = x + offsetM; y1 = y + width;
      x2 = x1 + widthM; y2 = y1;
    } else if (wall === "E") {
      x1 = x + length; y1 = y + offsetM;
      x2 = x1; y2 = y1 + widthM;
    } else if (wall === "W") {
      x1 = x; y1 = y + offsetM;
      x2 = x1; y2 = y1 + widthM;
    }
    return { x1, y1, x2, y2, wall };
  }

  function shouldSnap(dist) {
    return dist < 0.15; // 15 cm snap distance
  }

  function findNearbyEdges(room, roomPos, floor) {
    // simple snap: find other rooms' edges and return alignment hints
    // returns: { snapX: number | null, snapY: number | null }
    const { x, y } = roomPos;
    const { length, width } = room;

    let snapX = null, snapY = null;

    (floor.rooms || []).forEach((other) => {
      if (other.id === room.id) return;
      const otherPos = floor.plan2d.roomPos[other.id];
      if (!otherPos) return;

      // check x alignment (left-right edges)
      if (shouldSnap(Math.abs(x - (otherPos.x + other.length)))) snapX = otherPos.x + other.length;
      if (shouldSnap(Math.abs(x - otherPos.x))) snapX = otherPos.x;
      if (shouldSnap(Math.abs((x + length) - otherPos.x))) snapX = otherPos.x - length;
      if (shouldSnap(Math.abs((x + length) - (otherPos.x + other.length)))) snapX = otherPos.x + other.length - length;

      // check y alignment (top-bottom edges)
      if (shouldSnap(Math.abs(y - (otherPos.y + other.width)))) snapY = otherPos.y + other.width;
      if (shouldSnap(Math.abs(y - otherPos.y))) snapY = otherPos.y;
      if (shouldSnap(Math.abs((y + width) - otherPos.y))) snapY = otherPos.y - width;
      if (shouldSnap(Math.abs((y + width) - (otherPos.y + other.width)))) snapY = otherPos.y + other.width - width;
    });

    return { snapX, snapY };
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
        // Show rooms, using effective height: room.height (override) or floor.height
        roomsList.innerHTML = rooms
          .map((r) => {
            const effH = (r.height !== null && r.height !== undefined) ? r.height : (floor?.height ?? null);
            return `
          <div class="item">
            <div>
              <div class="item-title">${escapeHtml(r.name)}</div>
              <div class="item-meta">${r.area.toLocaleString("cs-CZ")} m² · ${r.length}×${r.width} m${effH ? ` · výška ${effH} m` : ""} · fotek: ${(p.media?.photos || []).filter(ph => ph.roomId === r.id).length}</div>
            </div>
            <div class="item-actions">
              <button class="btn-mini" data-room-openings="${r.id}">Detaily / Otvory</button>
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
        roomsList.querySelectorAll("[data-room-openings]").forEach((b) => {
          b.addEventListener("click", () => {
            const id = b.getAttribute("data-room-openings");
            if (!id) return;
            openOpeningsModal(id);
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

  // Continue navigation buttons
  if (continueToCollect) continueToCollect.addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p) return alert('Otevři nejdřív nebo založ projekt.');
    setActiveView('collect');
  });

  if (continueTo2D) continueTo2D.addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p) return alert('Otevři nejdřív projekt.');
    setActiveView('plan2d');
  });

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

  // === 2D EDITOR (moved to plan2d.js module) ===
  // Old render/bind functions removed. See plan2d.js for new implementation.



  // === OPENINGS / ROOM DETAILS MODAL ===
  const openingsModal = $("#openingsModal");
  const openingsModalBody = $("#openingsModalBody");
  const openingsModalTitle = $("#openingsModalTitle");
  const openingsModalClose = $("#openingsModalClose");
  let openingsEditingRoomId = null;
  let openingsModalBound = false;

  function openOpeningsModal(roomId) {
    const p = getCurrentProject();
    const floor = getCurrentFloor(p);
    if (!p || !floor) return;
    const room = (floor.rooms || []).find(r => r.id === roomId);
    if (!room) return;
    ensureRoomOpenings(room);
    openingsEditingRoomId = roomId;
    if (openingsModalTitle) openingsModalTitle.textContent = `Detaily: ${room.name}`;
    renderOpeningsModal(room);
    if (openingsModal) {
      openingsModal.hidden = false;
      try { document.body.style.overflow = 'hidden'; } catch (e) {}
    }
    // Bind modal controls only once
    if (!openingsModalBound) {
      const backdrop = openingsModal?.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => { e.stopPropagation(); closeOpeningsModal(); });
      }
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !openingsModal.hidden) closeOpeningsModal();
      });
      openingsModalBound = true;
    }
  }

  function closeOpeningsModal() {
    if (openingsModal) {
      openingsModal.hidden = true;
      try { document.body.style.overflow = ''; } catch (e) {}
    }
    openingsEditingRoomId = null;
  }

  if (openingsModalClose) openingsModalClose.addEventListener("click", closeOpeningsModal);

  function renderOpeningsModal(room) {
    if (!openingsModalBody) return;
    ensureRoomOpenings(room);
    const openings = room.openings || { doors: [], windows: [] };
    const doorsHtml = (openings.doors || []).map(d => `
      <div class="openings-item">
        <div><b>${escapeHtml(d.name || 'Dveře')}</b></div>
        <div style="font-size:0.9rem">Stěna: ${d.wall} · Posun: ${d.offsetM} m · Šířka: ${d.widthM || 0.9} m</div>
        <div style="margin-top:6px">
          <button class="btn-mini" data-edit-door="${d.id}">Upravit</button>
          <button class="btn-mini danger" data-del-door="${d.id}">Smazat</button>
        </div>
      </div>
    `).join("");

    const windowsHtml = (openings.windows || []).map(w => `
      <div class="openings-item">
        <div><b>${escapeHtml(w.name || 'Okno')}</b></div>
        <div style="font-size:0.9rem">Stěna: ${w.wall} · Posun: ${w.offsetM} m · Šířka: ${w.widthM || 1.0} m</div>
        <div style="margin-top:6px">
          <button class="btn-mini" data-edit-window="${w.id}">Upravit</button>
          <button class="btn-mini danger" data-del-window="${w.id}">Smazat</button>
        </div>
      </div>
    `).join("");

    openingsModalBody.innerHTML = `
      <div>
        <div style="margin-bottom:8px;"><b>Výška místnosti (m)</b></div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
          <input id="roomHeightOverride" type="number" step="0.01" style="width:120px;" value="${room.height !== null && room.height !== undefined ? room.height : ''}">
          <label style="font-size:0.9rem;">(nechte prázdné = použít výšku patra)</label>
        </div>

        <div style="display:flex; gap:12px;">
          <div style="flex:1">
            <h4>Dveře</h4>
            <div class="openings-list">${doorsHtml || '<div class="muted small">Žádné dveře</div>'}</div>
            <div style="margin-top:8px;"><button id="addDoorBtn" class="btn-mini">+ Přidat dveře</button></div>
          </div>
          <div style="flex:1">
            <h4>Okna</h4>
            <div class="openings-list">${windowsHtml || '<div class="muted small">Žádná okna</div>'}</div>
            <div style="margin-top:8px;"><button id="addWindowBtn" class="btn-mini">+ Přidat okno</button></div>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
          <button id="saveOpeningsBtn" class="btn-primary">Uložit</button>
          <button id="closeOpeningsBtn" class="btn-secondary">Zavřít</button>
        </div>
      </div>
    `;

    // Bind add / delete / save
    const addDoorBtn = $("#addDoorBtn");
    const addWindowBtn = $("#addWindowBtn");
    const saveOpeningsBtn = $("#saveOpeningsBtn");
    const closeOpeningsBtn = $("#closeOpeningsBtn");

    if (addDoorBtn) addDoorBtn.addEventListener("click", () => {
      const newDoor = { id: safeId(), name: 'Dveře', wall: 'N', offsetM: 0.5, widthM: 0.9 };
      room.openings.doors.push(newDoor);
      renderOpeningsModal(room);
    });

    if (addWindowBtn) addWindowBtn.addEventListener("click", () => {
      const newWin = { id: safeId(), name: 'Okno', wall: 'N', offsetM: 0.5, widthM: 1.0 };
      room.openings.windows.push(newWin);
      renderOpeningsModal(room);
    });

    if (saveOpeningsBtn) saveOpeningsBtn.addEventListener("click", () => {
      const val = $("#roomHeightOverride")?.value;
      room.height = (val === null || val === undefined || String(val).trim() === "") ? null : Number(val);
      const p = getCurrentProject();
      if (p) {
        p.meta.updatedAt = new Date().toISOString();
        upsertProject(p);
      }
      closeOpeningsModal();
      renderCollectView();
      if (state.activeView === 'plan2d') init2D();
    });

    if (closeOpeningsBtn) closeOpeningsBtn.addEventListener("click", closeOpeningsModal);

    // Delete handlers
    openingsModalBody.querySelectorAll('[data-del-door]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-del-door');
        room.openings.doors = (room.openings.doors || []).filter(d => d.id !== id);
        renderOpeningsModal(room);
      });
    });
    openingsModalBody.querySelectorAll('[data-del-window]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-del-window');
        room.openings.windows = (room.openings.windows || []).filter(w => w.id !== id);
        renderOpeningsModal(room);
      });
    });
  }

  // === 2D EDITOR INITIALIZATION ===
  function init2D() {
    const p = getCurrentProject();
    const floor = getCurrentFloor(p);
    
    if (!p || !floor) {
      if (plan2dContent) plan2dContent.hidden = true;
      if (noRoomsNotice2D) noRoomsNotice2D.hidden = false;
      return;
    }

    const rooms = floor.rooms || [];
    if (!rooms.length) {
      if (plan2dContent) plan2dContent.hidden = true;
      if (noRoomsNotice2D) noRoomsNotice2D.hidden = false;
      return;
    }

    if (plan2dContent) plan2dContent.hidden = false;
    if (noRoomsNotice2D) noRoomsNotice2D.hidden = true;

    // Ensure floor data structure
    ensureFloorPlan2d(floor);
    rooms.forEach(r => { ensureRoomDoors(r); ensureRoomOpenings(r); });

    // Create editor on first use
    if (!state.plan2dEditor) {
      state.plan2dEditor = createPlan2DEditor({
        svgEl: plan2dSvg,
        registryEl: plan2dRoomsList,
        zoomSliderEl: plan2dZoomSlider,
        snapToggleEl: plan2dSnapToggle,
        onChange: (updatedFloor) => {
          const pp = getCurrentProject();
          if (pp) upsertProject(pp);
        }
      });
      state.plan2dEditor.attachEvents();
    }

    // Set data and render
    state.plan2dEditor.setData({ project: p, floor: floor });
    state.plan2dEditor.render();
  }

  function exportPlan2dPng() {
    if (!plan2dSvg) return;

    // Simple SVG-to-PNG export
    const svgString = new XMLSerializer().serializeToString(plan2dSvg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL("image/png");
      downloadText(`puzorys-${new Date().toISOString().slice(0, 10)}.png`, pngUrl.split(",")[1], "application/octet-stream");
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgString);
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
    
    // Clean up 2D plan data for removed room
    if (floor.plan2d) {
      delete floor.plan2d.roomPos[roomId];
      floor.plan2d.links = (floor.plan2d.links || []).filter(l => l.aRoomId !== roomId && l.bRoomId !== roomId);
    }
    if (floor.plan2d?.selectedRoomId === roomId) floor.plan2d.selectedRoomId = null;
    
    p.meta.updatedAt = new Date().toISOString();
    upsertProject(p);
    renderCollectView();
  }

  if (roomForm) {
    // Toggle room height input visibility based on checkbox
    const roomOverrideToggle = document.getElementById("roomHeightOverrideToggle");
    const roomHeightInput = document.getElementById("roomHeight");
    if (roomOverrideToggle && roomHeightInput) {
      roomOverrideToggle.addEventListener("change", () => {
        if (roomOverrideToggle.checked) {
          roomHeightInput.style.display = "block";
        } else {
          roomHeightInput.style.display = "none";
          roomHeightInput.value = "";
        }
      });
      // initialize state
      if (!roomOverrideToggle.checked) roomHeightInput.style.display = "none";
    }

    roomForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = getCurrentProject();
      if (!p) return;

      const overrideChecked = !!(document.getElementById("roomHeightOverrideToggle")?.checked);
      const heightVal = overrideChecked ? (roomHeightInput?.value || "") : null;

      addRoom({
        name: roomName?.value || "",
        length: roomLen?.value || "",
        width: roomWid?.value || "",
        height: heightVal,
      });

      if (roomName) roomName.value = "";
      if (roomLen) roomLen.value = "";
      if (roomWid) roomWid.value = "";
      if (roomHeightInput) {
        roomHeightInput.value = "";
        roomHeightInput.style.display = "none";
      }
      if (roomOverrideToggle) roomOverrideToggle.checked = false;
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