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
    plan2dSelectedRoomId: null,
    plan2dLinkingMode: false,
    plan2dLinkingFrom: null, // { roomId, doorId }
    plan2dDraggedRoomId: null,
    plan2dPanActive: false,
    plan2dBound: false, // Flag to prevent duplicate event binding
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
      state.plan2dSelectedRoomId = null;
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
      };
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

  function getDoorWorldPos(room, door, roomPosM) {
    // door is { id, wall: "N"|"E"|"S"|"W", offsetM, widthM }
    // roomPosM is { x, y } in meters (top-left of room)
    // returns segment endpoints in meters
    if (!door || !roomPosM) return null;
    const { x, y } = roomPosM;
    const { length, width } = room;
    const { wall, offsetM, widthM } = door;

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

  function renderPlan2D() {
    const p = getCurrentProject();
    const floor = getCurrentFloor(p);

    if (noRoomsNotice2D) noRoomsNotice2D.hidden = !!p;
    if (plan2dContent) plan2dContent.hidden = !p;
    if (!p || !floor) return;

    const rooms = floor.rooms || [];
    if (!rooms.length) {
      if (noRoomsNotice2D) noRoomsNotice2D.hidden = false;
      if (plan2dContent) plan2dContent.hidden = true;
      return;
    }

    ensureFloorPlan2d(floor);
    rooms.forEach(r => ensureRoomDoors(r));

    const pd = floor.plan2d;
    const { scale, zoom, panX, panY } = pd;

    // Clear SVG
    if (plan2dSvg) {
      plan2dSvg.innerHTML = "";
      plan2dSvg.setAttribute("viewBox", "0 0 1200 800");
      plan2dSvg.setAttribute("width", "100%");
      plan2dSvg.setAttribute("height", "100%");
    }

    // Draw grid/background (optional, can skip)
    // Draw rooms
    const roomElements = {};
    rooms.forEach((room) => {
      const pos = pd.roomPos[room.id];
      if (!pos) return;

      const px0 = panX + pos.x * scale * zoom;
      const py0 = panY + pos.y * scale * zoom;
      const w = room.length * scale * zoom;
      const h = room.width * scale * zoom;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.classList.add("plan2d-room-box");
      if (state.plan2dSelectedRoomId === room.id) rect.classList.add("selected");
      rect.setAttribute("x", px0);
      rect.setAttribute("y", py0);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 4);
      rect.setAttribute("data-room-id", room.id);
      rect.style.cursor = "pointer";
      plan2dSvg.appendChild(rect);

      // Add label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("plan2d-room-text");
      text.setAttribute("x", px0 + w / 2);
      text.setAttribute("y", py0 + h / 2);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.textContent = `${room.name} (${room.area} m²)`;
      plan2dSvg.appendChild(text);

      roomElements[room.id] = rect;

      // Draw doors
      (room.doors || []).forEach((door) => {
        const doorPos = getDoorWorldPos(room, door, pos);
        if (!doorPos) return;

        const dpx0 = panX + doorPos.x1 * scale * zoom;
        const dpy0 = panY + doorPos.y1 * scale * zoom;
        const dpx1 = panX + doorPos.x2 * scale * zoom;
        const dpy1 = panY + doorPos.y2 * scale * zoom;

        const doorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        doorLine.classList.add("plan2d-door");
        doorLine.setAttribute("x1", dpx0);
        doorLine.setAttribute("y1", dpy0);
        doorLine.setAttribute("x2", dpx1);
        doorLine.setAttribute("y2", dpy1);
        doorLine.setAttribute("data-room-id", room.id);
        doorLine.setAttribute("data-door-id", door.id);
        doorLine.setAttribute("stroke-width", 4);
        plan2dSvg.appendChild(doorLine);
      });
    });

    // Draw links
    pd.links.forEach((link) => {
      const roomA = rooms.find(r => r.id === link.aRoomId);
      const roomB = rooms.find(r => r.id === link.bRoomId);
      const doorA = roomA?.doors?.find(d => d.id === link.aDoorId);
      const doorB = roomB?.doors?.find(d => d.id === link.bDoorId);

      if (!roomA || !roomB || !doorA || !doorB) return;

      const posA = pd.roomPos[roomA.id];
      const posB = pd.roomPos[roomB.id];
      if (!posA || !posB) return;

      const dawPos = getDoorWorldPos(roomA, doorA, posA);
      const dbwPos = getDoorWorldPos(roomB, doorB, posB);
      if (!dawPos || !dbwPos) return;

      const midAx = (dawPos.x1 + dawPos.x2) / 2;
      const midAy = (dawPos.y1 + dawPos.y2) / 2;
      const midBx = (dbwPos.x1 + dbwPos.x2) / 2;
      const midBy = (dbwPos.y1 + dbwPos.y2) / 2;

      const linkLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      linkLine.classList.add("plan2d-link");
      linkLine.setAttribute("x1", panX + midAx * scale * zoom);
      linkLine.setAttribute("y1", panY + midAy * scale * zoom);
      linkLine.setAttribute("x2", panX + midBx * scale * zoom);
      linkLine.setAttribute("y2", panY + midBy * scale * zoom);
      plan2dSvg.appendChild(linkLine);
    });

    // Render detail panel
    if (plan2dPanelContent) {
      const selected = rooms.find(r => r.id === state.plan2dSelectedRoomId);
      if (!selected) {
        plan2dPanelContent.innerHTML = `<p class="muted small">Klikni na místnost pro editaci.</p>`;
      } else {
        ensureRoomDoors(selected);
        const selectedPos = pd.roomPos[selected.id];
        const doorsHtml = (selected.doors || []).map((door, idx) => {
          return `
          <div style="margin: 10px 0; padding: 8px; border: 1px solid var(--stroke); border-radius: 8px;">
            <div style="font-weight: 650; margin-bottom: 6px;">Dveře ${idx + 1}</div>
            <div class="form-row" style="gap: 6px; margin-bottom: 6px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label style="margin-bottom: 3px;">Stěna</label>
                <select data-door-wall="${door.id}" style="font-size: 0.85rem;">
                  <option value="N" ${door.wall === "N" ? "selected" : ""}>Sever</option>
                  <option value="E" ${door.wall === "E" ? "selected" : ""}>Východ</option>
                  <option value="S" ${door.wall === "S" ? "selected" : ""}>Jih</option>
                  <option value="W" ${door.wall === "W" ? "selected" : ""}>Západ</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label style="margin-bottom: 3px;">Posun (m)</label>
                <input type="number" data-door-offset="${door.id}" value="${door.offsetM}" step="0.01" min="0" style="font-size: 0.85rem;">
              </div>
              <div class="form-group" style="margin-bottom: 0; flex-grow: 0;">
                <label style="margin-bottom: 3px;">Šířka (m)</label>
                <input type="number" data-door-width="${door.id}" value="${door.widthM || 0.9}" step="0.01" min="0.1" style="font-size: 0.85rem; width: 60px;">
              </div>
            </div>
            <button class="btn-mini danger" data-door-del="${door.id}" style="width: 100%; font-size: 0.85rem;">Smazat dveře</button>
          </div>`;
        }).join("");

        const linksHtml = pd.links.filter(l => l.aRoomId === selected.id || l.bRoomId === selected.id).map((link, idx) => {
          const otherRoomId = link.aRoomId === selected.id ? link.bRoomId : link.aRoomId;
          const otherRoom = rooms.find(r => r.id === otherRoomId);
          return `
          <div style="margin: 8px 0; padding: 8px; background: rgba(37,99,235,0.08); border-radius: 8px; font-size: 0.85rem;">
            <div>Připojeno na: <b>${escapeHtml(otherRoom?.name || "?")}</b></div>
            <button class="btn-mini danger" data-link-del="${link.aRoomId}|${link.aDoorId}|${link.bRoomId}|${link.bDoorId}" style="width: 100%; margin-top: 4px; font-size: 0.85rem;">Odpojit</button>
          </div>`;
        }).join("");

        plan2dPanelContent.innerHTML = `
          <h3 class="h3" style="margin-top: 0;">Místnost: ${escapeHtml(selected.name)}</h3>
          <div class="small muted"><b>${selected.length} × ${selected.width} m</b> · ${selected.area} m²</div>
          ${selected.height ? `<div class="small muted">Výška: ${selected.height} m</div>` : ""}

          <div style="margin-top: 12px;">
            <h4 style="margin: 0 0 8px; font-size: 0.95rem;">Dveře (${selected.doors?.length || 0})</h4>
            ${doorsHtml}
            <button class="btn-mini primary" data-add-door="${selected.id}" style="width: 100%; margin-top: 8px; font-size: 0.85rem;">+ Přidat dveře</button>
          </div>

          ${linksHtml ? `<div style="margin-top: 12px;"><h4 style="margin: 0 0 8px; font-size: 0.95rem;">Připojení (${linksHtml.split('data-link-del').length - 1})</h4>${linksHtml}</div>` : ""}
        `;

        // Bind door edit listeners
        plan2dPanelContent.querySelectorAll("[data-door-wall]").forEach((sel) => {
          sel.addEventListener("change", () => {
            const doorId = sel.getAttribute("data-door-wall");
            const door = selected.doors.find(d => d.id === doorId);
            if (door) door.wall = sel.value;
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });

        plan2dPanelContent.querySelectorAll("[data-door-offset]").forEach((inp) => {
          inp.addEventListener("change", () => {
            const doorId = inp.getAttribute("data-door-offset");
            const door = selected.doors.find(d => d.id === doorId);
            if (door) door.offsetM = Number(inp.value) || 0;
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });

        plan2dPanelContent.querySelectorAll("[data-door-width]").forEach((inp) => {
          inp.addEventListener("change", () => {
            const doorId = inp.getAttribute("data-door-width");
            const door = selected.doors.find(d => d.id === doorId);
            if (door) door.widthM = Number(inp.value) || 0.9;
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });

        plan2dPanelContent.querySelectorAll("[data-door-del]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const doorId = btn.getAttribute("data-door-del");
            selected.doors = (selected.doors || []).filter(d => d.id !== doorId);
            floor.plan2d.links = floor.plan2d.links.filter(l => l.aDoorId !== doorId && l.bDoorId !== doorId);
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });

        plan2dPanelContent.querySelectorAll("[data-add-door]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const newDoor = {
              id: safeId(),
              wall: "N",
              offsetM: 0.5,
              widthM: 0.9,
            };
            selected.doors.push(newDoor);
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });

        plan2dPanelContent.querySelectorAll("[data-link-del]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const [aRoomId, aDoorId, bRoomId, bDoorId] = btn.getAttribute("data-link-del").split("|");
            floor.plan2d.links = floor.plan2d.links.filter(l => !(l.aRoomId === aRoomId && l.aDoorId === aDoorId && l.bRoomId === bRoomId && l.bDoorId === bDoorId));
            const pp = getCurrentProject();
            if (pp) upsertProject(pp);
            renderPlan2D();
          });
        });
      }
    }
  }

  // === 2D EDITOR INITIALIZATION ===
  function init2D() {
    // Reset binding flag so listeners attach on this view activation
    state.plan2dBound = false;
    // Render SVG canvas
    renderPlan2D();
    // Bind interactive handlers (drag, zoom, pan, doors)
    bindPlan2dEvents();
  }

  function bindPlan2dEvents() {
    // Prevent duplicate binding
    if (state.plan2dBound) return;
    state.plan2dBound = true;

    const p = getCurrentProject();
    const floor = getCurrentFloor(p);
    if (!p || !floor || !plan2dSvg) return;

    const rooms = floor.rooms || [];
    const pd = floor.plan2d;

    // === DRAG STATE (global) ===
    let dragRoomId = null;
    let dragPointerId = null;
    let dragStartX = 0, dragStartY = 0;
    let dragStartRoomX = 0, dragStartRoomY = 0;
    let dragScale = pd.scale;
    let dragZoom = pd.zoom;

    // === POINTERDOWN on room rectangles (initiate drag) ===
    plan2dSvg.querySelectorAll(".plan2d-room-box").forEach((rect) => {
      const roomId = rect.getAttribute("data-room-id");

      rect.addEventListener("click", (e) => {
        if (e.button !== 0) return;
        state.plan2dSelectedRoomId = state.plan2dSelectedRoomId === roomId ? null : roomId;
        renderPlan2D();
      });

      rect.addEventListener("pointerdown", (e) => {
        if (!e.isPrimary) return;
        if (state.plan2dPanActive) return;
        
        e.preventDefault();
        
        // Capture pointer for smooth drag outside SVG bounds
        rect.setPointerCapture(e.pointerId);
        
        dragRoomId = roomId;
        dragPointerId = e.pointerId;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragScale = pd.scale;
        dragZoom = pd.zoom;
        
        const pos = pd.roomPos[roomId];
        if (pos) {
          dragStartRoomX = pos.x;
          dragStartRoomY = pos.y;
        }
        
        rect.classList.add("dragging", "is-selected");
      });
    });

    // === POINTERMOVE globally (update position without render) ===
    document.addEventListener("pointermove", (e) => {
      if (!dragRoomId || dragPointerId !== e.pointerId) return;
      
      const room = rooms.find(r => r.id === dragRoomId);
      if (!room) return;

      // Convert pixel delta to meter delta
      const dx = (e.clientX - dragStartX) / (dragScale * dragZoom);
      const dy = (e.clientY - dragStartY) / (dragScale * dragZoom);
      let newX = dragStartRoomX + dx;
      let newY = dragStartRoomY + dy;

      // Apply snap if toggle is on
      if (plan2dSnapToggle?.checked) {
        const snapped = findNearbyEdges(room, { x: newX, y: newY }, floor);
        if (snapped.snapX !== null) newX = snapped.snapX;
        if (snapped.snapY !== null) newY = snapped.snapY;
      }

      // Update position in data model ONLY (no render)
      pd.roomPos[dragRoomId] = { x: newX, y: newY };
    });

    // === POINTERUP globally (finish drag + render) ===
    document.addEventListener("pointerup", (e) => {
      if (!dragRoomId || dragPointerId !== e.pointerId) return;
      
      // Save and re-render only on drag end
      const pp = getCurrentProject();
      if (pp) upsertProject(pp);
      renderPlan2D();
      
      // Remove visual feedback
      plan2dSvg.querySelectorAll(".plan2d-room-box.dragging").forEach(r => {
        r.classList.remove("dragging", "is-selected");
      });
      
      dragRoomId = null;
      dragPointerId = null;
    });

    // === DOOR CLICKING (linking) ===
    plan2dSvg.querySelectorAll(".plan2d-door").forEach((line) => {
      line.addEventListener("click", () => {
        const roomId = line.getAttribute("data-room-id");
        const doorId = line.getAttribute("data-door-id");
        const doorRef = { roomId, doorId };

        if (!state.plan2dLinkingMode) {
          state.plan2dLinkingMode = true;
          state.plan2dLinkingFrom = doorRef;
          line.classList.add("selectable-link");
        } else if (state.plan2dLinkingFrom.roomId === roomId && state.plan2dLinkingFrom.doorId === doorId) {
          // deselect
          state.plan2dLinkingMode = false;
          state.plan2dLinkingFrom = null;
          renderPlan2D();
        } else {
          // create link
          createLinkAndSnap(state.plan2dLinkingFrom, doorRef);
          state.plan2dLinkingMode = false;
          state.plan2dLinkingFrom = null;
          upsertProject(p);
          renderPlan2D();
        }
      });
    });

    // === ZOOM slider ===
    if (plan2dZoomSlider) {
      plan2dZoomSlider.addEventListener("input", (e) => {
        const newZoom = Number(e.target.value);
        pd.zoom = newZoom;
        if (plan2dZoomLabel) plan2dZoomLabel.textContent = Math.round(newZoom * 100) + "%";
        renderPlan2D();
      });
    }

    // === ZOOM reset ===
    if (plan2dZoomReset) {
      plan2dZoomReset.addEventListener("click", () => {
        pd.zoom = 1;
        pd.panX = 0;
        pd.panY = 0;
        if (plan2dZoomSlider) plan2dZoomSlider.value = 1;
        if (plan2dZoomLabel) plan2dZoomLabel.textContent = "100%";
        renderPlan2D();
      });
    }

    // === PAN with space key ===
    let spacePressed = false;
    let panStartX, panStartY;

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && state.activeView === "plan2d") {
        e.preventDefault();
        spacePressed = true;
        state.plan2dPanActive = true;
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        spacePressed = false;
        state.plan2dPanActive = false;
      }
    });

    plan2dSvg?.addEventListener("mousedown", (e) => {
      if (!spacePressed || state.activeView !== "plan2d") return;
      panStartX = e.clientX;
      panStartY = e.clientY;
    });

    plan2dSvg?.addEventListener("mousemove", (e) => {
      if (!spacePressed || state.activeView !== "plan2d") return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      pd.panX += dx;
      pd.panY += dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
      renderPlan2D();
    });

    // === ZOOM with Ctrl+Scroll ===
    plan2dSvg?.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.25, Math.min(3, pd.zoom + delta));
      pd.zoom = newZoom;
      if (plan2dZoomSlider) plan2dZoomSlider.value = newZoom;
      if (plan2dZoomLabel) plan2dZoomLabel.textContent = Math.round(newZoom * 100) + "%";
      renderPlan2D();
    });

    // === EXPORT PNG ===
    if (plan2dExportPng) {
      plan2dExportPng.addEventListener("click", () => {
        exportPlan2dPng();
      });
    }
  }

  function createLinkAndSnap(fromDoor, toDoor) {
    const p = getCurrentProject();
    const floor = getCurrentFloor(p);
    if (!p || !floor) return;

    const roomA = (floor.rooms || []).find(r => r.id === fromDoor.roomId);
    const roomB = (floor.rooms || []).find(r => r.id === toDoor.roomId);
    if (!roomA || !roomB) return;

    const doorA = roomA.doors?.find(d => d.id === fromDoor.doorId);
    const doorB = roomB.doors?.find(d => d.id === toDoor.doorId);
    if (!doorA || !doorB) return;

    // Create link
    const link = {
      aRoomId: fromDoor.roomId,
      aDoorId: fromDoor.doorId,
      bRoomId: toDoor.roomId,
      bDoorId: toDoor.doorId,
    };

    // Check if link already exists
    const exists = floor.plan2d.links.some(l => l.aRoomId === link.aRoomId && l.aDoorId === link.aDoorId && l.bRoomId === link.bRoomId && l.bDoorId === link.bDoorId);
    if (exists) return;

    floor.plan2d.links.push(link);

    // Auto-snap: move room B so doors align
    const posA = floor.plan2d.roomPos[roomA.id];
    const posB = floor.plan2d.roomPos[roomB.id];
    if (posA && posB) {
      const doorAPos = getDoorWorldPos(roomA, doorA, posA);
      const doorBPos = getDoorWorldPos(roomB, doorB, posB);
      if (doorAPos && doorBPos) {
        // move room B so door centers align
        const midAx = (doorAPos.x1 + doorAPos.x2) / 2;
        const midAy = (doorAPos.y1 + doorAPos.y2) / 2;
        const midBx = (doorBPos.x1 + doorBPos.x2) / 2;
        const midBy = (doorBPos.y1 + doorBPos.y2) / 2;

        const deltaX = midAx - midBx;
        const deltaY = midAy - midBy;

        posB.x += deltaX;
        posB.y += deltaY;
      }
    }
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
    if (state.plan2dSelectedRoomId === roomId) state.plan2dSelectedRoomId = null;
    
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