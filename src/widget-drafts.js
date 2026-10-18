// SPDX-License-Identifier: GPL-3.0-only
// Drafts stay separate from persisted desktop state, including after a failed save.
export function createWidgetDraft(item, saveData, onChange = () => {}) {
  let base = JSON.stringify(item.data);
  let revision = 0, savedRevision = 0, timer, job = null;
  const draft = {
    data: structuredClone(item.data),
    error: null,
    get dirty() { return revision !== savedRevision; },
    get saving() { return job !== null; },
    changed() {
      revision++;
      draft.error = null;
      clearTimeout(timer);
      timer = setTimeout(draft.flush, 350);
      onChange();
    },
    flush() {
      clearTimeout(timer);
      if (job) return job;
      if (!draft.dirty) return Promise.resolve(true);
      job = Promise.resolve().then(async () => {
        while (draft.dirty) {
          const version = revision, snapshot = structuredClone(draft.data);
          const saved = await saveData(item.id, snapshot, base);
          base = JSON.stringify(saved ?? snapshot);
          savedRevision = version;
          draft.error = null;
        }
        return true;
      }).catch(error => {
        draft.error = error;
        return false;
      }).finally(() => {
        job = null;
        onChange();
      });
      onChange();
      return job;
    },
  };
  return draft;
}
