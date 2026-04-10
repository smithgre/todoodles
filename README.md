# Todoodles

A lightweight, opinionated todo panel that lives in the VS Code Explorer sidebar. Built with a clean, native look — no clutter, no configuration, just a fast way to track tasks while you code.

## Features

### Quick Capture

Type a title in the input bar and press **Enter** to add a new item. Click the note icon to expand an optional notes field — press **Cmd+Enter** to add with notes.

Double-click empty space in the list to instantly create a new item in edit mode.

### Priority

Click the flame icon on any item to mark it as priority. Priority items float to the top of the list with an orange highlight. Click again to remove.

### File Attachments

Attach workspace files to any todo:

- **From the todo** — click the link icon on an item, then choose a file from the picker
- **From Explorer** — right-click any file → **Attach to Todo** → choose which item

Attached files appear as chips with coloured icons based on file type (JS, TS, PHP, HTML, CSS, images, archives, SQL, etc.). Click a chip to open the file. Hover to reveal the remove button.

### Drag to Reorder

Grab the grip handle on the left of any active item to drag and reorder. Completed items are locked in place.

### Completed Section

Checking off an item moves it to the **Completed** section at the bottom, collapsed by default. The section header shows a running count and a **Clear** button to remove all completed items at once.

### Active Count

The panel header dynamically shows the number of active items: **Todoodles (3)**. Resets to just **Todoodles** when everything is done.

### Inline Editing

Double-click any item's title to enter edit mode. Both title and notes can be edited inline. Press **Enter** to save, **Escape** to cancel, or **Tab** to jump to notes.

### Persistence

All items are stored in VS Code's `globalState` and survive across sessions, window reloads, and restarts.

## Keyboard Shortcuts

| Action | Key |
|---|---|
| Add item | **Enter** (input bar focused) |
| Add item with notes | **Cmd+Enter** (notes field focused) |
| Save inline edit | **Enter** |
| Cancel inline edit | **Escape** |
| Jump to notes in edit | **Tab** |
| Toggle notes field | Click note icon |
| Quick-add item | Double-click empty list area |

## Commands

| Command | Description |
|---|---|
| `Todoodles: Add Todo Item` | Focus the input bar |
| `Todoodles: Clear Completed` | Remove all completed items |
| `Todoodles: Attach to Todo` | Attach the selected Explorer file to a todo item |

## Installation

Install from the `.vsix` file:

```sh
code --install-extension todoodles-0.1.0.vsix
```

Or: **Cmd+Shift+P** → `Extensions: Install from VSIX…` → select the file → **Reload Window**.

## Requirements

- VS Code 1.90.0 or later

## Known Limitations

- File attachments store absolute paths. Moving or renaming files will break the link.
- Drag reorder is handle-only — you must grab the grip icon, not the item body.
- Data is stored per-machine in VS Code's global state. It does not sync across devices.

## License

MIT
