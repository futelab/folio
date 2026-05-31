# Notion-Like Block Editor C1 Design

Date: 2026-05-31
Status: Draft for user review

## Goal

C1 turns the current Folio demo from a rich-text component showcase into a Notion-like block editing experience. The work should make the editor feel document-first, block-oriented, and responsive to local editing context without expanding into database views, AI workflows, comments, or collaboration.

The primary success criterion is interaction feel: a user should be able to create an empty page, type naturally, open `/` commands, navigate the command menu with the keyboard, and discover block-level controls through hover/focus behavior.

## Scope

C1 includes:

- A neutral Notion-like document surface with no large white editor-card container.
- Hover/focus block affordances with a left-side `+` button and drag handle visual.
- A richer slash command menu with icons, groups, descriptions, active item state, and keyboard support.
- A shared block command metadata model used by slash commands and the `+` menu.
- Empty-page and empty-block placeholders that feel like inline writing prompts.
- A lighter demo layout where the editor is the primary experience and preview is secondary.
- E2E coverage for the main editing interactions.

C1 excludes:

- Database/table views beyond existing table block support.
- AI commands.
- Real-time collaboration, comments, presence, or permissions.
- Full cross-block drag-and-drop sorting. C1 includes the drag handle visual and a documented follow-up boundary for C1.2 sorting.
- Mobile-first rewrite. The layout should remain usable on mobile, but C1 optimizes desktop editing first.

## Recommended Approach

Keep the existing Tiptap-based Folio editor and add a block interaction layer around it.

This is preferred because Folio already has schema, reader, serialization, tests, and package exports. Replacing the editor with another Notion-like framework would speed up surface behavior but weaken the value of `@futelab/folio` as a reusable component library. Rewriting against raw ProseMirror would provide maximum control but is too large for this milestone.

## User Experience

### Document Surface

The editor should look like a document page, not a framed widget:

- Remove the visible white editor container from the demo.
- Keep the document width constrained and centered.
- Use a quiet off-white app background with a white or transparent writing surface.
- Reduce title weight and spacing so it resembles a Notion page title rather than a hero heading.
- Keep the top bar thin and utility-focused.
- Make preview secondary and collapsed by default, with a toolbar toggle to reopen it.

### Empty Page

An empty page should present:

- A title input.
- A blank first block with placeholder text similar to `Type '/' for commands`.
- No large instructional card.
- No always-visible floating formatting toolbar.

### Block Hover And Focus

Each editable block should expose controls only when relevant:

- Hovering or focusing a block shows a left-side control rail.
- The rail contains a `+` action and a drag handle.
- The rail tracks the block vertical position.
- Controls should not shift document layout.
- The `+` action opens the same command menu model used by slash commands.
- The drag handle is visual in C1; full sorting is deferred to C1.2.

### Slash Command Menu

The slash menu should feel like a compact block insertion command palette:

- Open at the current cursor position.
- Show icon, label, optional description, and group.
- Support active item highlighting.
- Support ArrowUp, ArrowDown, Home, End, Enter, and Escape while focus remains in the editor.
- Delete the typed `/query` before applying a selected command.
- Keep query matching predictable with label, command name, and keywords.
- Reposition on scroll/resize.

Recommended initial groups:

- Basic: Text, Heading 1, Heading 2, Heading 3
- Lists: Bulleted list, Numbered list, Todo list
- Media: Image, Bookmark
- Advanced: Quote, Code block, Divider, Table, Callout, Toggle, Table of contents

### Formatting Toolbar

The bubble toolbar should be less prominent:

- Do not appear as a fixed bottom toolbar.
- It may remain available for selected text.
- It should not dominate empty pages.

## Component Architecture

### `BlockCommandRegistry`

Extend command metadata so every command can provide:

- `name`
- `label`
- `group`
- `description`
- `keywords`
- `icon`
- `action`

The existing default commands remain the action source. C1 adds display metadata rather than duplicating command behavior.

### `SlashCommandMenu`

Refine the current `SlashMenu` into a richer command menu:

- Receives filtered command items.
- Receives active index and selection callbacks.
- Renders grouped sections when enough commands are visible.
- Exposes accessible `role="menu"` and `role="menuitem"` semantics.
- Uses `aria-selected` for the active item.

### `BlockInteractionLayer`

New editor-level layer responsible for block affordances:

- Tracks hovered block element.
- Tracks focused/current block from editor selection.
- Computes control rail position from block DOM rect relative to editor root.
- Renders `BlockSideControls`.
- Opens command menu from the block `+` action.

### `BlockSideControls`

Small visual control surface:

- `+` icon button opens block commands for the current block.
- Drag handle button provides Notion-like affordance.
- Both controls have accessible labels and title text.
- Visibility is driven by hover/focus state.

### `EditorSurface`

Demo-level layout wrapper:

- Makes editor the primary pane.
- Removes the card-like editor frame.
- Reduces preview visual weight.
- Preserves local page list and page creation.

## Data Flow

1. User types into Tiptap editor.
2. `FolioEditor` listens to editor updates and selection changes.
3. If current text before cursor matches `/query`, slash query state opens command menu at cursor coordinates.
4. If user hovers/focuses a block, `BlockInteractionLayer` computes side control position.
5. If user clicks `+`, the command menu opens near the block controls using the same command registry.
6. Selecting a command runs the existing command action against the editor.
7. Editor update emits the serialized Folio document to the demo state.
8. Reader preview updates from the same serialized document.

## Styling

Use a more neutral palette:

- Background: near-white / light gray instead of warm beige as the dominant color.
- Sidebar: subtle gray with Notion-like row hover.
- Text: dark neutral, lower title weight than current.
- Menus: white, soft border, moderate shadow, compact rows.
- Active menu row: light gray background, not saturated.

Avoid making the page a decorative landing page. The first viewport should be the editor, not a marketing layout.

## Accessibility

- Command menus keep `role="menu"` and `role="menuitem"`.
- Active menu item uses `aria-selected`.
- Icon-only buttons include `aria-label` and `title`.
- Keyboard handling must not trap focus after Escape.
- Enter should execute a command only when a command menu is open and an active command exists.
- Hover-only controls must also appear for keyboard/editor focus.

## Testing

E2E tests should cover:

- Empty page shows a Notion-like inline placeholder and no card-like editor frame.
- `/he` opens the menu near the cursor after multiple lines.
- Arrow keys move active slash command selection.
- Enter executes the active slash command and removes `/query`.
- Escape closes the menu without deleting typed text.
- Hovering or focusing a block reveals side controls.
- Clicking side `+` opens the command menu.
- Preview is secondary and does not obscure editing.

Unit tests should cover:

- Command filtering and grouping.
- Command metadata defaults.
- Slash query detection helper behavior if extracted.
- Menu active-index wrapping.

## Implementation Notes

- Keep edits scoped to `packages/react`, `packages/core` command metadata, `packages/styles`, `packages/folio` exports, and `apps/demo`.
- Preserve current package name and exports for `@futelab/folio`.
- Keep Storybook stories compatible, but demo is the primary visual validation target for C1.
- The current Turborepo build must continue to include cross-package source inputs for `@futelab/folio`.
- Existing uncommitted slash-command fixes are part of the baseline for this C1 design.

## Decisions

- Preview is collapsed by default on first load and can be reopened from the toolbar.
- Drag sorting is not part of C1. The drag handle is visible and accessible in C1, and actual cross-block sorting is a C1.2 follow-up.

## Acceptance Criteria

C1 is complete when:

- A fresh blank page visually reads as a Notion-like document editor.
- Block controls appear in context instead of always on the page.
- Slash and plus menus share command metadata and feel like one command system.
- Keyboard command selection works reliably.
- Existing document serialization and reader preview still work.
- E2E tests cover the core Notion-like editing flow.
