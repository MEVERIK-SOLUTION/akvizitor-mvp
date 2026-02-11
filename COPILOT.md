# Copilot instructions — AKVIZITOR MVP

## Goal
Build a fast mobile-first 2D floorplan editor with room selection, drag, pan/zoom, and openings (doors/windows).

## Stack
- Web app (Vercel)
- Prefer small modules, no giant refactors

## Code style
- Keep functions small and named
- Avoid rewriting whole files; change only the necessary parts
- Prefer event delegation and a clear selection model
- Use explicit state objects, avoid hidden globals

## Current focus
- Fix drag/pan/zoom on desktop + mobile consistently
- Fix mobile layout (canvas not overlapped)
- Room registry selection -> highlight -> drag
- Door/window UI visible in Collect and 2D
- Door-linking (connect rooms through doors with offset from reference corner)

## Testing expectations
- Mouse + touch events must both work
- No regression: room selection stays stable during drag
