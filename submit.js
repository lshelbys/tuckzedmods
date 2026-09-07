/**
 * tuckzed mods — Community mod submission form
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  const form = document.getElementById('submit-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { Store, showToast } = window.TZ;
    const btn = document.getElementById('s-submit-btn');
    const status = document.getElementById('s-status');
    const title = (document.getElementById('s-title').value || '').trim();
    const downloadUrl = (document.getElementById('s-url').value || '').trim();
    if (!title || !downloadUrl) {
      showToast('Title and download URL are required.');
      return;
    }
    btn.disabled = true;
    if (status) status.textContent = 'Sending…';
    const result = await Store.submitModProposal({
      title,
      description: (document.getElementById('s-desc').value || '').trim(),
      version: (document.getElementById('s-version').value || '1.0.0').trim(),
      game: document.getElementById('s-game').value,
      category: document.getElementById('s-category').value,
      tags: document.getElementById('s-tags').value,
      downloadUrl,
      compatibility: (document.getElementById('s-compat').value || '').trim(),
      submitterName: (document.getElementById('s-name').value || '').trim()
    });
    btn.disabled = false;
    if (!result.ok) {
      if (status) status.textContent = '';
      showToast('Could not submit. Re-run the latest supabase_setup.sql if this is a new feature.');
      return;
    }
    form.reset();
    document.getElementById('s-version').value = '1.0.0';
    if (status) status.textContent = 'Submitted!';
    showToast('Thanks — your mod is in the review queue.');
  });
});
