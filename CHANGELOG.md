# Changelog

All notable changes to WaveSketch are documented in this file.

## [1.0.1] - 2026-08-02

### Added

- A local responsive preview tool with device presets, custom dimensions, rotation, and fit-to-window controls.

### Fixed

- Axis-setting inputs no longer clip decimal grid values.
- The footer chestnut now preloads both states and animates when the links menu opens or closes.
- The mobile waveform drawer scrolls to its final controls and respects the device bottom safe area.

## [1.0] - 2026-08-01

### Added

- Arithmetic and square-wave logic calculations with reusable results.
- Layer ordering, multi-waveform hover information, precise deletion, and undoable group reordering.
- SVG and PNG legends that preserve group order and waveform styles.
- Multiple draggable X/Y cursors with JSON persistence and optional SVG/PNG export.
- Responsive Blue Professional workspace, collapsible inspector, mobile drawer, and compact status bar.

### Changed

- Default waveform line width is 3.
- The waveform generator now exposes one linear-reset waveform as 斜坡 / Ramp.
- Branding now uses the original blue damped-oscillation mark and the undistorted chestnut artwork.
- New workspaces use `us` as the default X-axis unit; imported and saved units remain unchanged.

### Fixed

- Cursor labels stay within the canvas and export bounds.
- Deleting the final segment removes only the affected empty waveform group.
- Repeated mascot clicks no longer produce a blue browser selection highlight.
- Floating color and menu panels remain inside the viewport.
