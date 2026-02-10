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

  // Door-linking state
  let doorLinkingState = {
    selectedDoor: null, // { roomId, doorId, wall, roomName }
    links: [] // Array of { id, a: {roomId, doorId}, b: {roomId, doorId} }
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

  function safeId() {
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

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

  let rafId = null;

  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      renderSVG();
      renderRegistry();
      rafId = null;
    });
  }

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

        // Door marker (clickable circle)
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.classList.add('plan2d-door-marker');
        if (doorLinkingState.selectedDoor?.roomId === room.id && doorLinkingState.selectedDoor?.doorId === door.id) {
          circle.classList.add('selected-door');
        }
        if (door.linkedDoor) {
          circle.classList.add('linked-door');
        }
        circle.setAttribute('cx', mx);
        circle.setAttribute('cy', my);
        circle.setAttribute('r', 6);
        circle.setAttribute('data-room-id', room.id);
        circle.setAttribute('data-opening-id', door.id);
        circle.setAttribute('data-opening-type', 'door');
        circle.style.cursor = 'pointer';
        svgEl.appendChild(circle);
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

        // Window marker (small circle)
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.classList.add('plan2d-window-marker');
        circle.setAttribute('cx', mx);
        circle.setAttribute('cy', my);
        circle.setAttribute('r', 4);
        circle.setAttribute('data-room-id', room.id);
        circle.setAttribute('data-opening-id', win.id);
        circle.setAttribute('data-opening-type', 'window');
        svgEl.appendChild(circle);
      });
    });

    // Render link lines
    renderLinkLines();
  }

  function renderLinkLines() {
    const floor = getFloor();
    const links = floor?.plan2d?.links || [];
    const rooms = getRooms();

    links.forEach(link => {
      const roomA = rooms.find(r => r.id === link.a.roomId);
      const roomB = rooms.find(r => r.id === link.b.roomId);
      if (!roomA || !roomB) return;

      const doorA = (roomA.openings?.doors || []).find(d => d.id === link.a.doorId);
      const doorB = (roomB.openings?.doors || []).find(d => d.id === link.b.doorId);
      if (!doorA || !doorB) return;

      const posA = getRoomPos(roomA.id);
      const posB = getRoomPos(roomB.id);
      if (!posA || !posB) return;

      const centerA = getDoorCenterInMeters(roomA, doorA, posA);
      const centerB = getDoorCenterInMeters(roomB, doorB, posB);
      if (!centerA || !centerB) return;

      const s1 = worldToScreen(centerA.x, centerA.y);
      const s2 = worldToScreen(centerB.x, centerB.y);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('plan2d-link-line');
      line.setAttribute('x1', s1.x);
      line.setAttribute('y1', s1.y);
      line.setAttribute('x2', s2.x);
      line.setAttribute('y2', s2.y);
      line.setAttribute('data-link-id', link.id);
      line.style.stroke = '#28a745';
      line.style.strokeWidth = '2';
      line.style.pointerEvents = 'none';
      svgEl.appendChild(line);
    });
  }

  function getDoorLinePos(room, opening, roomPos) {
    if (!opening.wall) return null;

    const wall = opening.wall.toUpperCase();
    const offset = Number(opening.offsetM || 0);
    
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

  function handleDoorMarkerClick(e, roomId, doorId, marker) {
    if (!roomId || !doorId) return;

    const room = getRooms().find(r => r.id === roomId);
    if (!room) return;

    const door = (room.openings?.doors || []).find(d => d.id === doorId);
    if (!door) return;

    // Alt+click = unlink
    if (e.altKey && door.linkedDoor) {
      unlinkDoor(room, door);
      console.log('[plan2d] Door unlinked:', roomId, doorId);
      onChange(getFloor());
      renderSVG();
      renderRegistry();
      return;
    }

    // If no selection, select this door
    if (!doorLinkingState.selectedDoor) {
      doorLinkingState.selectedDoor = { roomId, doorId, wall: door.wall, roomName: room.name };
      console.log('[plan2d] Door selected:', roomId, doorId, 'wall:', door.wall);
      renderSVG();
      renderRegistry();
      return;
    }

    const selected = doorLinkingState.selectedDoor;

    // If clicking the same door again, deselect
    if (selected.roomId === roomId && selected.doorId === doorId) {
      doorLinkingState.selectedDoor = null;
      renderSVG();
      renderRegistry();
      return;
    }

    // Try to link: check if walls are opposite
    if (!areOppositeWalls(selected.wall, door.wall)) {
      alert('Dveře musí být na protilehlých stěnách!');
      return;
    }

    // Get the room that was already selected
    const selectedRoom = getRooms().find(r => r.id === selected.roomId);
    if (!selectedRoom) return;
    const selectedDoor = (selectedRoom.openings?.doors || []).find(d => d.id === selected.doorId);
    if (!selectedDoor) return;

    // Move selectedRoom so its door aligns with current room's door
    // Then set bidirectional link
    alignRoomsViaDoorsAndLink(selectedRoom, selectedDoor, room, door);

    // Clear selection after linking
    doorLinkingState.selectedDoor = null;
    console.log('[plan2d] Doors linked:', selected.roomId, 'to', roomId);

    // Save and re-render
    onChange(getFloor());
    renderSVG();
    renderRegistry();
  }

  function areOppositeWalls(w1, w2) {
    const normalize = (w) => String(w || 'N').toUpperCase();
    w1 = normalize(w1);
    w2 = normalize(w2);
    return (w1 === 'N' && w2 === 'S') || (w1 === 'S' && w2 === 'N') ||
           (w1 === 'E' && w2 === 'W') || (w1 === 'W' && w2 === 'E') ||
           (w1 === 'A' && w2 === 'C') || (w1 === 'C' && w2 === 'A') ||
           (w1 === 'B' && w2 === 'D') || (w1 === 'D' && w2 === 'B');
  }

  function unlinkDoor(room, door) {
    const floor = getFloor();
    if (!floor?.plan2d?.links) return;

    // Get the other end of the link
    const linkedOther = door.linkedDoor;
    if (!linkedOther) return;

    // Remove the link on both sides
    floor.plan2d.links = floor.plan2d.links.filter(
      link => !(
        (link.a.roomId === room.id && link.a.doorId === door.id) ||
        (link.b.roomId === room.id && link.b.doorId === door.id)
      )
    );

    // Clear linkedDoor references
    door.linkedDoor = null;

    // Also clear on the other door
    const otherRoom = getRooms().find(r => r.id === linkedOther.roomId);
    if (otherRoom) {
      const otherDoor = (otherRoom.openings?.doors || []).find(d => d.id === linkedOther.doorId);
      if (otherDoor) {
        otherDoor.linkedDoor = null;
      }
    }
  }

  function alignRoomsViaDoorsAndLink(roomA, doorA, roomB, doorB) {
    // Compute where each door centerpoint is in world coords
    const posA = getRoomPos(roomA.id);
    const posB = getRoomPos(roomB.id);
    if (!posA || !posB) return;

    const centerA = getDoorCenterInMeters(roomA, doorA, posA);
    const centerB = getDoorCenterInMeters(roomB, doorB, posB);
    if (!centerA || !centerB) return;

    // Move roomA so its door center matches roomB's door center
    const offsetX = centerB.x - centerA.x;
    const offsetY = centerB.y - centerA.y;
    posA.x += offsetX;
    posA.y += offsetY;
    setRoomPos(roomA.id, posA.x, posA.y);

    // Create bidirectional link
    doorA.linkedDoor = { roomId: roomB.id, doorId: doorB.id };
    doorB.linkedDoor = { roomId: roomA.id, doorId: doorA.id };

    // Also store in floor.plan2d.links for persistence
    const floor = getFloor();
    if (!floor.plan2d) floor.plan2d = {};
    if (!floor.plan2d.links) floor.plan2d.links = [];

    // Remove any existing link for these doors
    floor.plan2d.links = floor.plan2d.links.filter(
      link => !(
        (link.a.roomId === roomA.id && link.a.doorId === doorA.id) ||
        (link.a.roomId === roomB.id && link.a.doorId === doorB.id) ||
        (link.b.roomId === roomA.id && link.b.doorId === doorA.id) ||
        (link.b.roomId === roomB.id && link.b.doorId === doorB.id)
      )
    );

    // Add new link
    floor.plan2d.links.push({
      id: safeId(),
      a: { roomId: roomA.id, doorId: doorA.id },
      b: { roomId: roomB.id, doorId: doorB.id }
    });
  }

  function getDoorCenterInMeters(room, door, roomPos) {
    if (!door.wall) return null;
    const wall = String(door.wall).toUpperCase();
    const offset = Number(door.offsetM || 0);
    const width = Number(door.widthM || 0.9);
    const roomLen = room.length;
    const roomWid = room.width;

    let cx, cy;
    if (wall === 'N' || wall === 'A') {
      cx = roomPos.x + offset + width / 2;
      cy = roomPos.y;
    } else if (wall === 'S' || wall === 'C') {
      cx = roomPos.x + offset + width / 2;
      cy = roomPos.y + roomWid;
    } else if (wall === 'E' || wall === 'B') {
      cx = roomPos.x + roomLen;
      cy = roomPos.y + offset + width / 2;
    } else if (wall === 'W' || wall === 'D') {
      cx = roomPos.x;
      cy = roomPos.y + offset + width / 2;
    } else {
      return null;
    }

    return { x: cx, y: cy };
  }

  function attachEvents() {
    console.log('[plan2d] attachEvents called. svgEl:', svgEl, 'eventsAttached:', eventsAttached);
    
    if (eventsAttached) return;
    eventsAttached = true;

    // SVG pointerdown: select/start drag
    if (svgEl) {
      console.log('[plan2d] Adding pointerdown listener to svgEl');
      svgEl.addEventListener('pointerdown', onSvgPointerDown);
    } else {
      console.error('[plan2d] ERROR: svgEl is null/undefined!');
    }

    // SVG pointermove/pointerup for drag (capture will route here)
    svgEl?.addEventListener('pointermove', onGlobalPointerMove);
    svgEl?.addEventListener('pointerup', onGlobalPointerUp);

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
    console.log('[plan2d] onSvgPointerDown fired. target:', e.target?.tagName, 'data-room-id:', e.target?.getAttribute?.('data-room-id'));
    
    if (panState.active) return;
    if (dragState.isDragging) return;

    const target = e.target;
    if (!target) return;

    // Check if clicking on door marker (circle)
    if (target.tagName === 'circle') {
      const roomId = target.getAttribute('data-room-id');
      const doorId = target.getAttribute('data-opening-id');
      const type = target.getAttribute('data-opening-type');
      if (roomId && doorId && type === 'door') {
        handleDoorMarkerClick(e, roomId, doorId, target);
        return;
      }
    }

    // Check if clicking on room box (rect)
    if (target.tagName === 'rect') {
      const roomId = target.getAttribute('data-room-id');
      if (!roomId) return;

      const selectedId = getSelectedRoomId();

      // Tap = select/deselect room
      setSelectedRoomId(selectedId === roomId ? null : roomId);
      renderSVG();
      renderRegistry();

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
          svgEl.setPointerCapture(e.pointerId);
        } catch (err) {
          console.error('[plan2d] setPointerCapture failed:', err);
        }
        
        target.classList.add('dragging');
        dragState.isDragging = false;
        console.log('[plan2d] Start drag:', roomId);
      }
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

    // Update data and schedule render
    setRoomPos(dragState.roomId, newX, newY);
    scheduleRender();
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
      console.log('[plan2d] End drag');
      onChange(getFloor());
      renderSVG();
      renderRegistry();
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
    renderSVG();
    renderRegistry();
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
      renderSVG();
      renderRegistry();
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
