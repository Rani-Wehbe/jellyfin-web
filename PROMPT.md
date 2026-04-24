# Frontend: Add .jellyignore Toggle to Library Settings

## Task Overview
Add a checkbox toggle in the Jellyfin Web UI that allows users to enable/disable .jellyignore file filtering per library. This toggle controls the `EnableJellyignore` setting in the backend library configuration.

## Context
- **Backend Property**: `ServerConfiguration.EnableJellyignore` (boolean, default: true)
- **Dual File System**:
  - `.jellyignore` - User-configurable, respects this toggle (when disabled, ignored files in .jellyignore are NOT filtered)
  - `.ignore` - Always applied (hard block, cannot be disabled by this toggle)
- **Files to Modify**:
  - `/Users/raniwehbe/Desktop/github/jellyfin-all/jellyfin-web/src/components/libraryoptionseditor/libraryoptionseditor.template.html` (UI)
  - `/Users/raniwehbe/Desktop/github/jellyfin-all/jellyfin-web/src/components/libraryoptionseditor/libraryoptionseditor.js` (Logic)

## UI Requirements

### Location
The checkbox must be in the **Library Settings** section, alongside other file/folder options like "Enable Realtime Monitor", "Enable Photos", etc. Based on the structure, it should go near the top with the other basic toggles (not hidden/advanced).

### Checkbox Label & Description
- **Label Text**: "Enable File Filtering with .jellyignore"
- **Description (remark)**: "Files listed in .ignore are always ignored regardless of this setting"
- **HTML Structure**: Follow the existing pattern used for other checkboxes:
  ```html
  <div class="checkboxContainer checkboxContainer-withDescription">
      <label>
          <input type="checkbox" is="emby-checkbox" class="chkEnableJellyignore" />
          <span>${LabelEnableFileFilteringWithJellyignore}</span>
      </label>
      <div class="fieldDescription checkboxFieldDescription">${LabelEnableJellyignoreHelp}</div>
  </div>
  ```

### Placement in Template
Add this checkbox in `libraryoptionseditor.template.html` after the "Enable Photos" section (around line 22), since it's a file-system-level feature.

## Backend Integration

### In `libraryoptionseditor.js`

#### 1. Add to `getLibraryOptions()` function (around line 624)
Add this line to the options object being returned:
```javascript
EnableJellyignore: parent.querySelector('.chkEnableJellyignore').checked,
```

#### 2. Add to `setLibraryOptions()` function (around line 692)
Add this line after the other checkbox assignments:
```javascript
parent.querySelector('.chkEnableJellyignore').checked = options.EnableJellyignore ?? true;
```
(Default to true if undefined, as per backend default)

## Implementation Steps

1. **Update Template** (`libraryoptionseditor.template.html`):
   - Add the checkbox HTML block after line 22 (after "Enable Photos" section)
   - Use the pattern shown above with class `chkEnableJellyignore`

2. **Update JS Logic** (`libraryoptionseditor.js`):
   - Line ~650: Add `EnableJellyignore: parent.querySelector('.chkEnableJellyignore').checked,` to the options object in `getLibraryOptions()`
   - Line ~710: Add `parent.querySelector('.chkEnableJellyignore').checked = options.EnableJellyignore ?? true;` in `setLibraryOptions()`

3. **Localization** (Optional but recommended):
   - Replace `${LabelEnableFileFilteringWithJellyignore}` and `${LabelEnableJellyignoreHelp}` with hardcoded English strings OR ensure these translation keys are added to the localization system

4. **Testing**:
   - Open a library in "Manage Library" menu
   - Verify the checkbox appears after "Enable Photos"
   - Toggle it on/off and save
   - Verify the setting is persisted when reopening the library editor
   - Check browser console for any errors

## Additional Notes

- The checkbox state is automatically persisted because the library editor already has a save/cancel flow
- No additional API calls needed; the toggle is sent as part of the library configuration update
- Files in `.ignore` will **always** be ignored, even if this toggle is disabled
- This is a per-library setting (each library can have this enabled or disabled independently)

## Translation Keys (if using localization)
- `LabelEnableFileFilteringWithJellyignore` - "Enable File Filtering with .jellyignore"
- `LabelEnableJellyignoreHelp` - "Files listed in .ignore are always ignored regardless of this setting"
