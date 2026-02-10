/**
 * Plan2D Editor Module
 * Standalone 2D floor plan editor with robust event handling
 * 
 * Usage:
 *   const editor = createPlan2DEditor({
 *     svgEl: document.getElementById('plan2dSvg'),
 *     registryEl: document.getElementById('plan2dRoomsList'),
 *     zoomSliderEl: document.getElementById('plan2dZoomSlider'),
 *     snapToggleEl: document.getElementById('plan2dSnapToggle'),
 *     onChange: (floor) => { ... save project ... }
 *   });
 *   
 *   editor.setData({ project, floor });
 *   editor.render();
 */

function createPlan2DEditor({ svgEl, registryEl, zoomSliderEl, snapToggleEl, onChange }) {
  const SCALE_PX_PER_METER = 80;
  const SNAP_DISTANCE = 0.15;

  let data = null;
  let viewport = null;
  let eventsAttached = false;

  // Drag state
  let dragState = {
    roomId: null,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startRoomX: 0,
    startRoomY: 0,
    isDragging: false
  };

  // Pan state (Space + drag)
  let panState = {
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0
  };

  // Zoom/pan state
  let transform = {
    scale: 1,
    panX: 0,
    panY: 0
  };

  // ========== HELPERS ==========

  function getRooms() {
    return data?.floor?.rooms || [];
  }

  function getFloor() {
    return data?.floor;
  }

  function getRoomPos(roomId) {
    const floor = getFloor();
    if (!floor?.plan2d?.roomPos) return null;
    return floor.plan2d.roomPos[roomId] || null;
  }

  function setRoomPos(roomId, x, y) {
    const floor = getFloor();
    if (!floor?.plan2d) return;
    if (!floor.plan2d.roomPos) floor.plan2d.roomPos = {};
    floor.plan2d.roomPos[roomId] = { x, y };
  }

  function getSelectedRoomId() {
    const floor = getFloor();
    return floor?.plan2d?.selectedRoomId || null;
  }

  function setSelectedRoomId(roomId) {
    const floor = getFloor();
    if (floor?.plan2d) {
      floor.plan2d.selectedRoomId = roomId;
    }
  }

  function worldToScreen(wx, wy) {
    const x = (wx * SCALE_PX_PER_METER * transform.scale) + transform.panX;
    const y = (wy * SCALE_PX_PER_METER * transform.scale) + transform.panY;
    return { x, y };
  }

  function screenToWorld(sx, sy) {
    const wx = (sx - transform.panX) / (SCALE_PX_PER_METER * transform.scale);
    const wy = (sy - transform.panY) / (SCALE_PX_PER_METER * transform.scale);
    return { wx, wy };
  }

  function applySnap(room, newX, newY) {
    if (!snapToggleEl?.checked) return { x: newX, y: newY };

    const rooms = getRooms();
    let snapX = newX, snapY = newY;

    rooms.forEach(other => {
      if (other.id === room.id) return;
      const otherPos = getRoomPos(other.id);
      if (!otherPos) return;

      // Check snap to edges (right, left, top, bottom)
      const snapDist = SNAP_DISTANCE;
      
      // Right edge of other → left edge of room
      let targetX = otherPos.x + other.length;
      if (Math.abs(newX - targetX) < snapDist) snapX = targetX;
      
      // Left edge of other → right edge of room
      targetX = otherPos.x - room.length;
      if (Math.abs(newX - targetX) < snapDist) snapX = targetX;
      
      // Bottom of other → top of room
      let targetY = otherPos.y + other.width;
      if (Math.abs(newY - targetY) < snapDist) snapY = targetY;
      
      // Top of other → bottom of room
      targetY = otherPos.y - room.width;
      if (Math.abs(newY - targetY) < snapDist) snapY = targetY;
    });

    return { x: snapX, y: snapY };
  }

  // ========== RENDER ==========

  function renderSVG() {
    if (!svgEl) return;

    svgEl.innerHTML = '';
    
    const rooms = getRooms();
    const selectedId = getSelectedRoomId();

    rooms.forEach(room => {
      const pos = getRoomPos(room.id);
      if (!pos) return;

      // Room rect (in screen coords)
      const { x: sx, y: sy } = worldToScreen(pos.x, pos.y);
      const w = room.length * SCALE_PX_PER_METER * transform.scale;
      const h = room.width * SCALE_PX_PER_METER * transform.scale;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.classList.add('plan2d-room-box');
      if (selectedId === room.id) rect.classList.add('selected');
      rect.setAttribute('data-room-id', room.id);
      rect.setAttribute('x', sx);
      rect.setAttribute('y', sy);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', 4);
      svgEl.appendChild(rect);

      // Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.classList.add('plan2d-room-text');
      text.setAttribute('x', sx + w / 2);
      text.setAttribute('y', sy + h / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.textContent = `${room.name}\n${room.area}m²`;
      svgEl.appendChild(text);

      // Doors
      const openings = room.openings || { doors: [], windows: [] };
      (openings.doors || []).forEach(door => {
        const doorLinePos = getDoorLinePos(room, door, pos);
        if (!doorLinePos) return;

        const { x1, y1, x2, y2 } = doorLinePos;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('plan2d-door');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        svgEl.appendChild(line);
      });

      // Windows
      (openings.windows || []).forEach(win => {
        const winLinePos = getDoorLinePos(room, win, pos);
        if (!winLinePos) return;

        const { x1, y1, x2, y2 } = winLinePos;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('plan2d-window');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        svgEl.appendChild(line);
      });
    });
  }

  function getDoorLinePos(room, opening, roomPos) {
    if (!opening.wall) return null;

    const wall = opening.wall.toUpperCase();
    const offset = (opening.offset || 0);
    
    let x1, y1, x2, y2;
    const len = room.length;
    const wid = room.width;

    if (wall === 'N' || wall === 'A') { // North/top
      x1 = roomPos.x + offset;
      y1 = roomPos.y;
      x2 = x1 + 0.1;
      y2 = y1;
    } else if (wall === 'E' || wall === 'B') { // East/right
      x1 = roomPos.x + len;
      y1 = roomPos.y + offset;
      x2 = x1;
      y2 = y1 + 0.1;
    } else if (wall === 'S' || wall === 'C') { // South/bottom
      x1 = roomPos.x + offset;
      y1 = roomPos.y + wid;
      x2 = x1 + 0.1;
      y2 = y1;
    } else if (wall === 'W' || wall === 'D') { // West/left
      x1 = roomPos.x;
      y1 = roomPos.y + offset;
      x2 = x1;
      y2 = y1 + 0.1;
    }

    if (x1 === undefined) return null;

    const s1 = worldToScreen(x1, y1);
    const s2 = worldToScreen(x2, y2);
    return { x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y };
  }

  function renderRegistry() {
    if (!registryEl) return;

    registryEl.innerHTML = '';
    const rooms = getRooms();
    const selectedId = getSelectedRoomId();

    rooms.forEach(room => {
      const item = document.createElement('div');
      item.classList.add('plan2d-room-item');
      if (selectedId === room.id) item.classList.add('selected');
      item.setAttribute('data-room-id', room.id);
      item.innerHTML = `
        <strong>${room.name}</strong>
        <span class="muted" style="font-size: 0.85rem; margin-top: 2px; display: block;">${room.area} m²</span>
      `;
      item.style.cursor = 'pointer';
      registryEl.appendChild(item);
    });
  }

  // ========== EVENTS ==========

  function attachEvents() {
    if (eventsAttached) return;
    eventsAttached = true;

    // SVG pointerdown: select/start drag
    svgEl?.addEventListener('pointerdown', onSvgPointerDown);

    // Global pointermove/pointerup for drag
    document.addEventListener('pointermove', onGlobalPointerMove);
    document.addEventListener('pointerup', onGlobalPointerUp);

    // Zoom slider
    zoomSliderEl?.addEventListener('input', onZoomSliderChange);

    // Zoom reset button
    const resetBtn = document.getElementById('plan2dZoomReset');
    resetBtn?.addEventListener('click', () => {
      transform.scale = 1;
      transform.panX = 0;
      transform.panY = 0;
      updateZoomLabel();
      renderSVG();
    });

    // Ctrl+Wheel zoom (desktop)
    svgEl?.addEventListener('wheel', onMouseWheel, { passive: false });

    // Registry item click
    registryEl?.addEventListener('click', onRegistryItemClick);

    // Space + click = pan (simple pan on SVG)
    // We'll handle this via pointermove + state check

    // Modal backdrop: prevent pointer events after close
    const modal = document.getElementById('openingsModal');
    if (modal) {
      const backdrop = modal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.style.pointerEvents = 'none';
      }
    }
  }

  function onSvgPointerDown(e) {
    if (panState.active) return;
    if (dragState.isDragging) return;

    const roomBox = e.target.closest('[data-room-id]');
    if (!roomBox) return;

    const roomId = roomBox.getAttribute('data-room-id');
    const selectedId = getSelectedRoomId();

    // Tap = select room
    setSelectedRoomId(selectedId === roomId ? null : roomId);
    render();

    // If now selected, prepare to drag
    if (getSelectedRoomId() === roomId) {
      e.preventDefault();
      dragState.roomId = roomId;
      dragState.pointerId = e.pointerId;
      dragState.startClientX = e.clientX;
      dragState.startClientY = e.clientY;
      
      const pos = getRoomPos(roomId);
      if (pos) {
        dragState.startRoomX = pos.x;
        dragState.startRoomY = pos.y;
      }

      try {
        roomBox.setPointerCapture(e.pointerId);
      } catch (err) {}
      
      roomBox.classList.add('dragging');
      dragState.isDragging = false; // True on first move
    }
  }

  function onGlobalPointerMove(e) {
    if (!dragState.roomId || dragState.pointerId !== e.pointerId) return;

    const room = getRooms().find(r => r.id === dragState.roomId);
    if (!room) return;

    // Mark as actively dragging
    dragState.isDragging = true;

    // Calculate delta in world coords
    const clientDX = e.clientX - dragState.startClientX;
    const clientDY = e.clientY - dragState.startClientY;

    const worldDX = clientDX / (SCALE_PX_PER_METER * transform.scale);
    const worldDY = clientDY / (SCALE_PX_PER_METER * transform.scale);

    let newX = dragState.startRoomX + worldDX;
    let newY = dragState.startRoomY + worldDY;

    // Apply snap
    const snapped = applySnap(room, newX, newY);
    newX = snapped.x;
    newY = snapped.y;

    // Update data (no render during drag)
    setRoomPos(dragState.roomId, newX, newY);
  }

  function onGlobalPointerUp(e) {
    if (!dragState.roomId || dragState.pointerId !== e.pointerId) return;

    const wasDragging = dragState.isDragging;

    // Cleanup
    svgEl?.querySelectorAll('.plan2d-room-box.dragging').forEach(box => {
      box.classList.remove('dragging');
    });

    dragState = {
      roomId: null,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startRoomX: 0,
      startRoomY: 0,
      isDragging: false
    };

    // Save and re-render if actually dragged
    if (wasDragging) {
      onChange(getFloor());
      render();
    }
  }

  function onZoomSliderChange(e) {
    transform.scale = parseFloat(e.target.value);
    updateZoomLabel();
    renderSVG();
  }

  function onMouseWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transform.scale = Math.max(0.25, Math.min(3, transform.scale * delta));

    if (zoomSliderEl) {
      zoomSliderEl.value = transform.scale;
    }
    updateZoomLabel();
    renderSVG();
  }

  function updateZoomLabel() {
    const label = document.getElementById('plan2dZoomLabel');
    if (label) {
      label.textContent = Math.round(transform.scale * 100) + '%';
    }
  }

  function onRegistryItemClick(e) {
    const item = e.target.closest('[data-room-id]');
    if (!item) return;

    const roomId = item.getAttribute('data-room-id');
    setSelectedRoomId(roomId);
    render();
  }

  // ========== PUBLIC API ==========

  return {
    setData(newData) {
      data = newData;
    },

    render() {
      renderSVG();
      renderRegistry();
    },

    setSelectedRoomId(roomId) {
      setSelectedRoomId(roomId);
      render();
    },

    getSelectedRoomId() {
      return getSelectedRoomId();
    },

    attachEvents() {
      attachEvents();
    },

    // For manual transform updates (if needed)
    setZoom(scale) {
      transform.scale = Math.max(0.25, Math.min(3, scale));
      updateZoomLabel();
      renderSVG();
    },

    setPan(panX, panY) {
      transform.panX = panX;
      transform.panY = panY;
      renderSVG();
    }
  };
}
