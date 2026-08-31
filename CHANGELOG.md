# Changelog

All notable changes to WaveSketch are documented in this file.

## [1.0.7] - 2026-08-31

### Added

- Added world-anchored text annotations with default Chinese/English text, waveform-matched colors, font family, font size, bold/italic, alignment, right-click settings, multiline editing, and live box sizing.
- Added text annotation selection, Shift multi-select, rubber-band selection, movement, deletion, internal copy/paste, JSON persistence, and editable SVG text export.
- Added a unified image export dialog with grid, axes, legend, Cursor, PNG/SVG format selection, larger responsive preview, and click-to-enlarge preview.
- Added the recommended Analog Canvas link.

### Changed

- External copy now exports only the selected waveforms and text annotations, with tight content bounds and no grid, axes, legend, or Cursor. Regular copy keeps SVG and PNG representations for compatible destination applications.
- Cross-application copy now pastes the selected waveforms and text primarily as an image, while also providing SVG data; editable-vector support depends on the target application.
- Ctrl+V now enters the same paste preview flow for selected text annotations and waveforms; pasted annotations remain independent editable objects.
- Shift+Enter inserts a new line and moves the caret to it; Enter completes text editing.
- Cursor display values are limited to three decimal places.
- Axis/grid settings normalize minor and major grid values to a minimum of 0.001.
- The delete tool's rubber-band action now removes fully-contained waveforms and text annotations in one undoable operation.
- Responsive floating controls and drawers were adjusted for desktop, Pad, and phone layouts while preserving the existing canvas interaction model.

### Fixed

- Fixed text-editing caret placement and text boxes not expanding with long or multiline text.
- Fixed unselected annotations being included in external copies.
- Fixed internal copy/paste not carrying text annotations.
- Fixed text annotations being omitted from delete-mode marquee selection.
- Fixed negative grid values becoming valid again.

## [1.0.5] - 2026-08-04

### Fixed

- Improved contrast for the canvas coordinate-difference readout.
- Mobile waveform drawers now resize to the visible viewport when the keyboard opens instead of being repositioned upward.

## [1.0.6] - 2026-08-21

### Added

- Delete mode now supports both single-segment clicks and rubber-band batch deletion on touch and desktop.
- Touch pan direction cycling, optional Cursor snapping, collapsible responsive canvas controls, and the EE toolbox recommendation link.
- The About dialog now includes an in-dialog, scrollable version history with changes compared with the previous recorded version.

### Changed

- File import/export actions are grouped under File manager; undo and redo now follow copy and paste.
- Waveform rendering and SVG/PNG export use rounded line caps and joins.
- Holding Shift while panning constrains the gesture to the first horizontal or vertical direction.

## [1.0.2] - 2026-08-02

### Fixed

- Arithmetic evaluation now rejects malformed RPN expressions instead of silently filling missing operands with zero.
- Floating-point noise near zero is normalized in arithmetic results to prevent false waveform spikes and sliver edges.

## [1.0.1] - 2026-08-02

### Added

- A local responsive preview tool with device presets, custom dimensions, rotation, and fit-to-window controls.

### Fixed

- Axis-setting inputs no longer clip decimal grid values.
- The footer chestnut now preloads both states and animates when the links menu opens or closes.
- The mobile waveform drawer scrolls to its final controls and respects the device bottom safe area.

## [1.0.0] - 2026-08-01

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
