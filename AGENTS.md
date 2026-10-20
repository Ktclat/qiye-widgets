# Qiye widget work

- For widget changes, research relevant public examples and official technical documentation first. Record sources and decisions in the widget documentation.
- Use the user’s iTab references as the visual baseline. Give each widget a layout and interactions suited to its purpose; do not reuse a generic large-card/settings-column page for unrelated functions.
- Keep desktop cards compact, preserve keyboard accessibility, and avoid initial focus outlines on settings controls unless the user is actively navigating by keyboard.
- Use a slim, single-row title bar for all new or revised widget windows (about 44–48 px at 100% scale). Avoid large title/icon banners. Put context or source switching at the left and search, settings, maximize and close controls at the right when relevant.
- Verify affected card sizes, dark/light themes, narrow layouts, data persistence and relevant date/time behavior.
- For each delivered change, rebuild the standalone preview and synchronize the authorized public web version. Verify the published artifact before claiming it is synchronized.
- Preserve unrelated work in the shared checkout; stage only the current task’s changes.
- After testing and a verified merge or publication into `main` or `gh-pages`, delete no-longer-needed task/test branches both locally and on `origin`. Apply this to both `qiye` and `qiye-widgets`. First verify commit ancestry or equivalent published content; preserve active or unmerged work, `main`, `gh-pages`, and release tags. Archive completed managed worktrees after saving any needed ignored artifacts.
